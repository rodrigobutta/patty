// El perfil de una persona: toda su historia comprimida en un texto corto, para que la IA pueda mirarla entera y sospechar
// cosas (patrones/hipotesis.ts). Por concepto: cuánto y cada cuánto aparece, si viene subiendo o bajando, cambios bruscos
// (desde cuándo empezó, paró o se movió), semanas y días raros, y series por mes, por semana y por año.
//
// Es una función pura, sin base de datos. Tiene un tope duro de tamaño: cada sección tiene su parte del total y lo que no
// entra se deja afuera, de lo menos relevante a lo más. La IA solo puede proponer sobre los conceptos que quedaron listados
// (`nombres`). No lleva el nombre de la persona: solo los nombres de los conceptos.
import { normalizar, type RolCategoria, type TipoValor } from 'shared';
import { diasEntre, sumarDias } from '../lib/fechas.js';
import { armarRasgos, horasContinuas, type ConceptoInfo, type FilaDiaria } from './motor.js';

/** El tope, en caracteres: entra de sobra en un pedido (unos 10 a 12 mil tokens). */
export const PERFIL_MAX = 30000;
const NOMBRE_MAX = 40;
const MESES_MAX = 60;
const SEMANAS_ULTIMAS = 12;
/** Cuántas semanas se comparan a cada lado de un posible cambio, y cuántas con datos hacen falta como mínimo. */
const VENTANA_SEMANAS = 12;
const VENTANA_MIN = 4;
/** Qué tan raro tiene que ser un salto para contarlo (ya se miran cientos de cortes). */
const Z_CAMBIO = 4;
const Z_RARO = 4;
const Z_DIA_RARO = 5;
const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** La parte del tope de cada sección (suman 1). */
const PARTES = { encabezado: 0.05, repite: 0.03, conceptos: 0.35, cambios: 0.13, raros: 0.08, meses: 0.25, anios: 0.04, semanas: 0.07 };

export interface Perfil {
  texto: string;
  /** Los conceptos listados (nombre normalizado → id): lo único sobre lo que la IA puede proponer. */
  nombres: Map<string, number>;
  listados: number;
  total: number;
}

const limpiarNombre = (s: string) => {
  const x = s.replace(/[\s|]+/g, ' ').trim();
  return x.length > NOMBRE_MAX ? x.slice(0, NOMBRE_MAX).trimEnd() : x;
};

const num = (x: number) => {
  const r = Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
  return String(r);
};
const promedio = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;
function mediana(l: number[]): number {
  const s = [...l].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Serie {
  c: ConceptoInfo;
  nombre: string;
  modos: string[];
  /** Se mira el valor (medidas, horas, puntajes de todos los días) y no cuántos días apareció. */
  continua: boolean;
  /** Índices de día, en orden. */
  dias: number[];
  /** El valor de cada uno de esos días (NaN si no tiene). */
  valores: number[];
  texto: (v: number) => string;
  relevancia: number;
  /** Por semana: días, suma de valores y cuántos valores. */
  semDias: Int32Array;
  semSuma: Float64Array;
  semN: Int32Array;
}

export function armarPerfil(filas: FilaDiaria[], conceptos: ConceptoInfo[], desde: string, hasta: string, maxCaracteres = PERFIL_MAX): Perfil {
  const n = diasEntre(desde, hasta) + 1;
  const porId = new Map(conceptos.map((c) => [c.id, c]));
  const indice = new Map<string, number>();
  const diaDe = (f: string) => {
    let i = indice.get(f);
    if (i === undefined) indice.set(f, (i = diasEntre(desde, f)));
    return i;
  };
  const activo = new Uint8Array(n);
  const porConcepto = new Map<number, Map<number, FilaDiaria>>();
  for (const f of filas) {
    const i = diaDe(f.fecha);
    if (i < 0 || i >= n || !porId.has(f.concepto_id)) continue;
    if (f.primera !== null && !f.automatica) activo[i] = 1;
    let m = porConcepto.get(f.concepto_id);
    if (!m) porConcepto.set(f.concepto_id, (m = new Map()));
    m.set(i, f);
  }
  const diaSemanaInicio = (new Date(`${desde}T12:00:00Z`).getUTCDay() + 6) % 7;
  const semanaDe = (i: number) => Math.floor((i + diaSemanaInicio) / 7);
  const semanas = semanaDe(n - 1) + 1;
  const lunes = (w: number) => sumarDias(desde, w * 7 - diaSemanaInicio);
  const activosSem = new Int32Array(semanas);
  for (let d = 0; d < n; d++) if (activo[d]) activosSem[semanaDe(d)]++;
  const totalActivos = activo.reduce((a, b) => a + b, 0);

  // Los rasgos del motor dicen qué modos se pueden proponer de cada concepto.
  const modos = new Map<number, string[]>();
  for (const r of armarRasgos(filas, porId, desde, n)) {
    const l = modos.get(r.concepto.id) ?? [];
    l.push(r.modo);
    modos.set(r.concepto.id, l);
  }

  const series: Serie[] = [];
  const vistos = new Set<string>();
  for (const [id, m] of porConcepto) {
    const c = porId.get(id)!;
    const ms = modos.get(id);
    if (!ms) continue;
    const nombre = limpiarNombre(c.nombre);
    const norm = normalizar(nombre);
    if (!norm || vistos.has(norm)) continue;
    vistos.add(norm);
    const continua = ms.includes('alto');
    const dias = [...m.keys()].sort((a, b) => a - b);
    let valores = dias.map((d) => valorDe(m.get(d)!, c.tipo_valor));
    let texto = num;
    if (c.tipo_valor === 'hora') {
      const conValor = valores.filter((v) => !Number.isNaN(v));
      const seguidas = horasContinuas(conValor);
      const corre = conValor.length > 0 && seguidas[0] !== conValor[0] ? 720 : 0;
      valores = valores.map((v) => (Number.isNaN(v) ? v : (v + corre) % 1440));
      texto = (v) => {
        const min = Math.round((v - corre + 1440) % 1440);
        return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      };
    }
    const semDias = new Int32Array(semanas);
    const semSuma = new Float64Array(semanas);
    const semN = new Int32Array(semanas);
    dias.forEach((d, j) => {
      const w = semanaDe(d);
      semDias[w]++;
      if (!Number.isNaN(valores[j])) {
        semSuma[w] += valores[j];
        semN[w]++;
      }
    });
    const sigue = dias[dias.length - 1] >= n - 90;
    // Los componentes son pocos y resumen muchas comidas: que entren aunque haya cientos de conceptos.
    const extra = c.componente ? 2 : 0;
    series.push({ c, nombre, modos: ms, continua, dias, valores, texto, semDias, semSuma, semN, relevancia: relevanciaBase(dias.length, c.rol, sigue) + extra });
  }

  // Lo que más dice va primero: lo que se siente, lo que sigue pasando, lo que cambió.
  const cambiosPor = new Map<Serie, Cambio[]>();
  for (const s of series) {
    if (delCalendario(s.c)) continue;
    const l = cambiosDe(s, n, semanas, activosSem, lunes, sumarDiasDesde(desde));
    cambiosPor.set(s, l);
    s.relevancia += l.length * 2;
  }
  series.sort((a, b) => b.relevancia - a.relevancia);

  const secciones: string[] = [];
  /** Suma líneas hasta llenar su parte del tope. Devuelve cuántas entraron. */
  const agregar = (parte: number, titulo: string, lineas: string[]): number => {
    const cupo = Math.floor(maxCaracteres * parte);
    if (!lineas.length || titulo.length + 1 > cupo) return 0;
    const out = [titulo];
    let usado = titulo.length + 1;
    let entraron = 0;
    for (const l of lineas) {
      if (usado + l.length + 1 > cupo) break;
      out.push(l);
      usado += l.length + 1;
      entraron++;
    }
    secciones.push(out.join('\n'));
    return entraron;
  };

  // --- Encabezado y calendario ---
  const porDiaSem = new Array<number>(7).fill(0);
  const porMesAnio = new Array<number>(12).fill(0);
  for (let d = 0; d < n; d++) {
    if (!activo[d]) continue;
    porDiaSem[(d + diaSemanaInicio) % 7]++;
    porMesAnio[Number(sumarDias(desde, d).slice(5, 7)) - 1]++;
  }
  const mesesLista = mesesEntre(desde, hasta);
  const mesesVisibles = mesesLista.slice(-MESES_MAX);
  const activosMes = new Map<string, number>();
  for (let d = 0; d < n; d++) if (activo[d]) activosMes.set(sumarDias(desde, d).slice(0, 7), (activosMes.get(sumarDias(desde, d).slice(0, 7)) ?? 0) + 1);

  // --- Conceptos (se arman primero: lo demás habla solo de los que quedaron) ---
  const lineasConceptos = series.map((s) => lineaConcepto(s, n, totalActivos, activo, diaSemanaInicio, desde));
  const seccionesAntes: string[] = [];
  const cupoEncabezado = [
    `PERÍODO: ${desde} a ${hasta}. ${n} días, ${totalActivos} con anotaciones.`,
    `DÍAS ANOTADOS POR DÍA DE SEMANA: ${DIAS_SEMANA.map((x, i) => `${x} ${porDiaSem[i]}`).join(', ')}.`,
    `DÍAS ANOTADOS POR MES DEL AÑO: ${MESES.map((x, i) => `${x} ${porMesAnio[i]}`).join(', ')}.`,
    `DÍAS ANOTADOS POR MES (desde ${mesesVisibles[0]}): ${mesesVisibles.map((m) => activosMes.get(m) ?? 0).join(' ')}.`,
  ];
  const huecos: string[] = [];
  let anterior = -1;
  for (let d = 0; d < n; d++) {
    if (!activo[d]) continue;
    if (anterior >= 0 && d - anterior > 14) huecos.push(`${sumarDias(desde, anterior + 1)} a ${sumarDias(desde, d - 1)}`);
    anterior = d;
  }
  if (huecos.length) cupoEncabezado.push(`SIN ANOTAR: ${huecos.slice(-12).join('; ')}.`);
  agregar(PARTES.encabezado, 'RESUMEN', cupoEncabezado);
  seccionesAntes.push(...secciones.splice(0));

  const listados = agregar(
    PARTES.conceptos,
    'CONCEPTOS, de más a menos relevante. nombre | tipo | rol | modos que se pueden proponer | días | frecuencia o valor habitual | de cuándo a cuándo | tendencia y ritmo',
    lineasConceptos,
  );
  const quedan = series.slice(0, listados);
  const conceptosTexto = secciones.splice(0);

  // --- Lo que más se repite ---
  agregar(
    PARTES.repite,
    'LO QUE MÁS SE REPITE (días)',
    [...quedan].sort((a, b) => b.dias.length - a.dias.length).slice(0, 25).map((s) => `${s.nombre} ${s.dias.length}`),
  );
  const repiteTexto = secciones.splice(0);

  // --- Cambios bruscos ---
  const cambios = quedan
    .flatMap((s) => cambiosPor.get(s) ?? [])
    .sort((a, b) => b.z - a.z)
    .map((x) => x.texto);
  agregar(PARTES.cambios, 'CAMBIOS BRUSCOS (fecha, de cuánto a cuánto, comparando hasta 12 semanas a cada lado)', cambios);

  // --- Semanas y días raros ---
  const raros = quedan
    .filter((s) => !delCalendario(s.c))
    .flatMap((s) => rarosDe(s, activosSem, lunes, sumarDiasDesde(desde)))
    .sort((a, b) => b.z - a.z)
    .map((x) => x.texto);
  agregar(PARTES.raros, 'SEMANAS Y DÍAS RAROS (contra lo habitual de ese concepto)', raros);

  // --- Series ---
  const posMes = new Map(mesesVisibles.map((m, i) => [m, i]));
  agregar(
    PARTES.meses,
    `POR MES desde ${mesesVisibles[0]}, un número por mes: los días que apareció, o el promedio si es una medida o un puntaje (- sin datos)`,
    quedan.map((s) => `${s.nombre}: ${serieMensual(s, posMes, mesesVisibles.length, desde).join(' ')}`),
  );
  const anios = [...new Set(mesesLista.map((m) => m.slice(0, 4)))];
  if (anios.length >= 2) {
    agregar(
      PARTES.anios,
      `POR AÑO (${anios.join(', ')}): días que apareció, o promedio`,
      quedan.slice(0, 40).map((s) => `${s.nombre}: ${serieAnual(s, anios, desde).join(' ')}`),
    );
  }
  const desdeSem = Math.max(0, semanas - SEMANAS_ULTIMAS);
  agregar(
    PARTES.semanas,
    `POR SEMANA, las últimas ${semanas - desdeSem} (desde el lunes ${lunes(desdeSem)}): días o promedio`,
    quedan.slice(0, 40).map((s) => {
      const l: string[] = [];
      for (let w = desdeSem; w < semanas; w++) l.push(s.continua ? (s.semN[w] ? s.texto(s.semSuma[w] / s.semN[w]) : '-') : activosSem[w] ? String(s.semDias[w]) : '-');
      return `${s.nombre}: ${l.join(' ')}`;
    }),
  );

  const texto = [...seccionesAntes, ...conceptosTexto, ...repiteTexto, ...secciones].join('\n\n');
  return {
    texto,
    nombres: new Map(quedan.map((s) => [normalizar(s.nombre), s.c.id])),
    listados,
    total: series.length,
  };
}

const sumarDiasDesde = (desde: string) => (d: number) => sumarDias(desde, d);

/** La estación, la fase del ciclo y el día de la semana vienen solos: no "cambian", y como efecto no tienen sentido. */
const delCalendario = (c: ConceptoInfo) => c.rol === 'causa' && !c.categoria;

function relevanciaBase(dias: number, rol: RolCategoria, sigue: boolean): number {
  return Math.log(1 + dias) * (rol === 'causa' ? 1 : 1.5) * (sigue ? 1.2 : 1);
}

function valorDe(f: FilaDiaria, t: TipoValor): number {
  const v =
    t === 'medida' || t === 'hora' ? f.promedio
    : t === 'intensidad' ? f.intensidad
    : t === 'cantidad' ? (f.suma ?? f.veces)
    : t === 'duracion' ? f.suma
    : f.veces;
  return v === null || v === undefined ? Number.NaN : v;
}

function mesesEntre(desde: string, hasta: string): string[] {
  const r: string[] = [];
  let a = Number(desde.slice(0, 4));
  let m = Number(desde.slice(5, 7));
  const fin = hasta.slice(0, 7);
  for (;;) {
    const k = `${a}-${String(m).padStart(2, '0')}`;
    r.push(k);
    if (k >= fin) return r;
    if (++m > 12) {
      m = 1;
      a++;
    }
  }
}

function lineaConcepto(s: Serie, n: number, totalActivos: number, activo: Uint8Array, inicioSemana: number, desde: string): string {
  const partes = [s.nombre, s.c.tipo_valor, s.c.rol, s.modos.join(','), `${s.dias.length} d`];
  const conValor = s.valores.filter((v) => !Number.isNaN(v));
  if (s.continua && conValor.length) {
    partes.push(`habitual ${s.texto(mediana(conValor))}`);
  } else {
    const frecuencia = totalActivos ? (s.dias.length / totalActivos) * 7 : 0;
    partes.push(`${num(frecuencia)}/sem${conValor.length && s.c.tipo_valor !== 'evento' ? `, ${num(promedio(conValor))} por vez` : ''}`);
  }
  partes.push(`${sumarDias(desde, s.dias[0]).slice(0, 7)}→${sumarDias(desde, s.dias[s.dias.length - 1]).slice(0, 7)}`);
  const extra: string[] = [];
  // Si viene subiendo o bajando: los últimos 90 días contra lo anterior.
  if (n >= 180) {
    const corte = n - 90;
    if (s.continua) {
      const antes = s.valores.filter((v, j) => s.dias[j] < corte && !Number.isNaN(v));
      const despues = s.valores.filter((v, j) => s.dias[j] >= corte && !Number.isNaN(v));
      if (antes.length >= 10 && despues.length >= 10) {
        const [a, d] = [promedio(antes), promedio(despues)];
        const m = promedio(antes);
        const sd = Math.sqrt(antes.reduce((x, v) => x + (v - m) ** 2, 0) / antes.length);
        if (Math.abs(d - a) > 0.5 * sd) extra.push(`últ. 90 d ${s.texto(d)} (antes ${s.texto(a)})`);
      }
    } else {
      const activosAntes = activo.slice(0, corte).reduce((a, b) => a + b, 0);
      const activosDespues = activo.slice(corte).reduce((a, b) => a + b, 0);
      if (activosAntes >= 30 && activosDespues >= 20) {
        const a = s.dias.filter((d) => d < corte).length / activosAntes;
        const d = s.dias.filter((x) => x >= corte).length / activosDespues;
        if ((a > 0 || d > 0) && (d >= a * 1.5 || d <= a / 1.5) && s.dias.length >= 10) extra.push(`últ. 90 d ${num(d * 7)}/sem (antes ${num(a * 7)})`);
      }
    }
    // Día de la semana y época del año, si se nota mucho.
    if (!s.continua && s.dias.length >= 20) {
      const sem = new Array<number>(7).fill(0);
      for (const d of s.dias) sem[(d + inicioSemana) % 7]++;
      const max = Math.max(...sem);
      if (max >= (s.dias.length / 7) * 1.6) extra.push(`más los ${DIAS_SEMANA[sem.indexOf(max)]}`);
    }
    if (n >= 540 && s.dias.length >= 30) {
      const mes = new Array<number>(12).fill(0);
      for (const d of s.dias) mes[Number(sumarDias(desde, d).slice(5, 7)) - 1]++;
      const max = Math.max(...mes);
      if (max >= (s.dias.length / 12) * 1.6) extra.push(`pico en ${MESES[mes.indexOf(max)]}`);
    }
  }
  if (extra.length) partes.push(extra.join(', '));
  return partes.join(' | ');
}

interface Cambio {
  z: number;
  texto: string;
}

/** Cuándo empezó, paró o se movió de golpe: se comparan unas semanas a cada lado de cada lunes. */
function cambiosDe(s: Serie, n: number, semanas: number, activosSem: Int32Array, lunes: (w: number) => string, fecha: (d: number) => string): Cambio[] {
  const r: Cambio[] = [];
  const primero = s.dias[0];
  const ultimo = s.dias[s.dias.length - 1];
  if (s.dias.length >= 5 && primero > 30) r.push({ z: 8, texto: `${fecha(primero)} ${s.nombre}: empieza a aparecer (antes nunca)` });
  if (s.dias.length >= 8 && ultimo < n - 45) r.push({ z: 8, texto: `${fecha(ultimo)} ${s.nombre}: última vez (${s.dias.length} días antes de eso)` });
  if (s.dias.length < 8) return r;
  const cortes: Array<{ w: number; z: number; antes: number; despues: number }> = [];
  for (let w = VENTANA_MIN; w <= semanas - VENTANA_MIN; w++) {
    let n1 = 0, x1 = 0, n2 = 0, x2 = 0;
    const m1: number[] = [];
    const m2: number[] = [];
    for (let j = Math.max(0, w - VENTANA_SEMANAS); j < w; j++) {
      if (s.continua) {
        if (s.semN[j]) m1.push(s.semSuma[j] / s.semN[j]);
      } else if (activosSem[j]) {
        n1 += activosSem[j];
        x1 += s.semDias[j];
        m1.push(1);
      }
    }
    for (let j = w; j < Math.min(semanas, w + VENTANA_SEMANAS); j++) {
      if (s.continua) {
        if (s.semN[j]) m2.push(s.semSuma[j] / s.semN[j]);
      } else if (activosSem[j]) {
        n2 += activosSem[j];
        x2 += s.semDias[j];
        m2.push(1);
      }
    }
    if (m1.length < VENTANA_MIN || m2.length < VENTANA_MIN) continue;
    if (s.continua) {
      const [a, d] = [promedio(m1), promedio(m2)];
      const varianza = (m1.reduce((x, v) => x + (v - a) ** 2, 0) + m2.reduce((x, v) => x + (v - d) ** 2, 0)) / Math.max(1, m1.length + m2.length - 2);
      const sd = Math.max(Math.sqrt(varianza), 1e-6);
      cortes.push({ w, z: Math.abs(d - a) / (sd * Math.sqrt(1 / m1.length + 1 / m2.length)), antes: a, despues: d });
    } else {
      const p = (x1 + x2) / (n1 + n2);
      if (p <= 0 || p >= 1) continue;
      const [a, d] = [x1 / n1, x2 / n2];
      cortes.push({ w, z: Math.abs(d - a) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)), antes: a * 7, despues: d * 7 });
    }
  }
  const elegidos: typeof cortes = [];
  for (const c of cortes.filter((x) => x.z >= Z_CAMBIO).sort((a, b) => b.z - a.z)) {
    if (elegidos.length >= 3) break;
    if (elegidos.some((e) => Math.abs(e.w - c.w) < 16)) continue;
    elegidos.push(c);
  }
  for (const c of elegidos) {
    r.push({
      z: c.z,
      texto: s.continua
        ? `${lunes(c.w)} ${s.nombre}: de ${s.texto(c.antes)} a ${s.texto(c.despues)}`
        : `${lunes(c.w)} ${s.nombre}: de ${num(c.antes)} a ${num(c.despues)} días por semana`,
    });
  }
  return r;
}

/** Lo que se salió de lo habitual: hasta tres cosas por concepto. */
function rarosDe(s: Serie, activosSem: Int32Array, lunes: (w: number) => string, fecha: (d: number) => string): Cambio[] {
  if (s.dias.length < 20) return [];
  const r: Cambio[] = [];
  const lista: Array<{ w: number; v: number }> = [];
  for (let w = 0; w < activosSem.length; w++) {
    if (s.continua) {
      if (s.semN[w]) lista.push({ w, v: s.semSuma[w] / s.semN[w] });
    } else if (activosSem[w] >= 3) lista.push({ w, v: s.semDias[w] });
  }
  if (lista.length < 8) return [];
  const med = mediana(lista.map((x) => x.v));
  const mad = mediana(lista.map((x) => Math.abs(x.v - med))) * 1.48;
  const escala = s.continua ? Math.max(mad, 1e-6) : Math.max(mad, 1);
  for (const x of lista) {
    const z = Math.abs(x.v - med) / escala;
    if (z < Z_RARO) continue;
    r.push({ z, texto: s.continua ? `semana del ${lunes(x.w)} ${s.nombre}: ${s.texto(x.v)} (habitual ${s.texto(med)})` : `semana del ${lunes(x.w)} ${s.nombre}: ${x.v} días (habitual ${num(med)})` });
  }
  if (s.continua) {
    const vals = s.dias.map((d, j) => ({ d, v: s.valores[j] })).filter((x) => !Number.isNaN(x.v));
    const medD = mediana(vals.map((x) => x.v));
    const madD = Math.max(mediana(vals.map((x) => Math.abs(x.v - medD))) * 1.48, 1e-6);
    for (const x of vals) {
      const z = Math.abs(x.v - medD) / madD;
      if (z >= Z_DIA_RARO) r.push({ z, texto: `día ${fecha(x.d)} ${s.nombre}: ${s.texto(x.v)} (habitual ${s.texto(medD)})` });
    }
  }
  return r.sort((a, b) => b.z - a.z).slice(0, 3);
}

function serieMensual(s: Serie, pos: Map<string, number>, largo: number, desde: string): string[] {
  const dias = new Array<number>(largo).fill(0);
  const suma = new Array<number>(largo).fill(0);
  const cuantos = new Array<number>(largo).fill(0);
  s.dias.forEach((d, j) => {
    const i = pos.get(sumarDias(desde, d).slice(0, 7));
    if (i === undefined) return;
    dias[i]++;
    if (!Number.isNaN(s.valores[j])) {
      suma[i] += s.valores[j];
      cuantos[i]++;
    }
  });
  return dias.map((x, i) => (s.continua ? (cuantos[i] ? s.texto(suma[i] / cuantos[i]) : '-') : String(x)));
}

function serieAnual(s: Serie, anios: string[], desde: string): string[] {
  const pos = new Map(anios.map((a, i) => [a, i]));
  const dias = new Array<number>(anios.length).fill(0);
  const suma = new Array<number>(anios.length).fill(0);
  const cuantos = new Array<number>(anios.length).fill(0);
  s.dias.forEach((d, j) => {
    const i = pos.get(sumarDias(desde, d).slice(0, 4))!;
    dias[i]++;
    if (!Number.isNaN(s.valores[j])) {
      suma[i] += s.valores[j];
      cuantos[i]++;
    }
  });
  return dias.map((x, i) => (s.continua ? (cuantos[i] ? s.texto(suma[i] / cuantos[i]) : '-') : String(x)));
}
