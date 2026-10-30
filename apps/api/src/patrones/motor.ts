// Motor de patrones: busca "cuando pasa A, k días después pasa B más seguido que cuando no pasa A".
//
// Trabaja sobre la serie diaria de una persona (una fila por día y concepto) y no sabe nada de la base: así se puede
// probar con datos armados a mano. Para cada concepto arma "rasgos" de un día:
//   - presente: ese día se anotó (comió tomate, le dolió la cabeza)
//   - alto / bajo: el valor de ese día estuvo por encima / por debajo de su mediana. Para medidas y horas (temperatura,
//     pasos, hora de acostarse) y para las intensidades que se anotan casi todos los días (energía, ánimo), donde
//     "se anotó" no dice nada. Solo se comparan días en que hubo valor.
// Y para cada par causa → efecto y cada desfase de 0 a DESFASE_MAX días arma la tabla de 2x2 y calcula:
//   prob_con = P(efecto en d+k | causa en d), prob_sin = P(efecto en d+k | sin causa en d), lift = prob_con / prob_sin
//   p_valor = test exacto de Fisher de una cola (que la causa sube la probabilidad del efecto)
//   q_valor = corrección de Benjamini-Hochberg por la cantidad de pares probados (hay muchos: algunos salen por azar).
// Con desfase 0 (mismo día) solo cuenta si la causa se anotó antes que el efecto.
//
// Además, combinaciones: dos o tres causas el mismo día ("comida frita + fase menstrual + calor → dolor de panza al día
// siguiente"). Solo se combinan las causas que ya muestran algo de relación con ese efecto, y una combinación queda si
// explica bastante más que cada una de sus partes sola (si no, alcanza con la simple).
//
// Y tres búsquedas más finas, que la persona puede apagar en Más (`Opciones.umbrales`, `proteccion`, `desfasesLargos`):
//   - Umbrales ("a partir de 3 cafés"): para lo que tiene cantidad o medida, prueba unos pocos cortes y se queda con el
//     que mejor separa. Cada corte cuenta como una prueba más (para el q), al corte elegido se le pide un p dividido por
//     la cantidad de cortes probados (Bonferroni), y la dosis tiene que importar: entre los días con la causa, los que
//     llegan al corte dan el efecto bastante más que los que no.
//   - Lo que protege ("los días que caminás, menos dolor de cabeza"): la otra cola del test, solo para malestares, y
//     solo si con la causa se esperaba ver el malestar varias veces y casi no apareció.
//   - Desfases de 2 y 3 días ("a los dos días"): se prueban con todo lo demás; apagados, solo el mismo día y el siguiente.
import { traducir, type Idioma, type Modo, type RolCategoria, type TipoValor } from 'shared';
import { diasEntre } from '../lib/fechas.js';

export interface FilaDiaria {
  fecha: string;
  concepto_id: number;
  veces: number;
  suma: number | null;
  promedio: number | null;
  /** la intensidad más alta del día (dolores, ánimo) */
  intensidad: number | null;
  /** primera vez que se anotó ese día (ms); null para las mediciones resumidas */
  primera: number | null;
  /**
   * Vino solo, sin que la persona anote nada (la llegada a un lugar, por ejemplo): tiene hora, pero ese día no cuenta
   * como "día anotado". Si contara, un día en que solo hubo ubicación parecería un día sin dolores.
   */
  automatica?: boolean;
}

const anotada = (f: FilaDiaria) => f.primera !== null && !f.automatica;

export interface ConceptoInfo {
  id: number;
  nombre: string;
  tipo_valor: TipoValor;
  rol: RolCategoria;
  /** La clave de su categoría ("sintoma"): lo que protege se busca solo contra malestares. */
  categoria?: string;
}

/** Una causa más de una combinación (la primera va en causa_id / causa_modo). */
export interface CausaExtra {
  id: number;
  modo: Modo;
}

export interface Candidato {
  causa_id: number;
  causa_modo: Modo;
  /** Las otras causas que tienen que estar el mismo día (vacío: un patrón simple). */
  causas_extra: CausaExtra[];
  efecto_id: number;
  efecto_modo: Modo;
  desfase_dias: number;
  soporte: number;
  dias_causa: number;
  dias_evaluados: number;
  prob_con: number;
  prob_sin: number;
  lift: number;
  p_valor: number;
  q_valor: number;
  puntaje: number;
  /** En una combinación: cuántas veces más fuerte es que la mejor de sus partes sola. */
  mejora?: number;
  /** En un umbral (causa_modo desde / hasta): el valor de corte. */
  umbral?: number | null;
  /** La causa protege: con ella el efecto aparece menos (lift < 1). */
  protege?: boolean;
  /** Pasaba antes, pero en los últimos meses ya no se ve (ver `yaNoSeVe`). */
  ya_no?: boolean;
}

export interface Opciones {
  desfaseMax: number;
  /** mínimo de veces que se vio causa y efecto juntos */
  soporteMin: number;
  /** mínimo de días con la causa */
  diasCausaMin: number;
  liftMin: number;
  /** p de corte para quedarse con un candidato (antes de la corrección) */
  pMax: number;
  limite: number;
  /** Buscar umbrales ("a partir de 3 cafés"). */
  umbrales: boolean;
  /** Buscar lo que protege (con la causa, un malestar aparece menos). */
  proteccion: boolean;
  /** Probar efectos de 2 y 3 días después (si no, solo el mismo día y el siguiente). */
  desfasesLargos: boolean;
}

export const OPCIONES: Opciones = {
  desfaseMax: 3,
  soporteMin: 3,
  diasCausaMin: 3,
  liftMin: 1.3,
  pMax: 0.1,
  limite: 40,
  umbrales: true,
  proteccion: true,
  desfasesLargos: true,
};

/** Cuántas causas (las más relacionadas con cada efecto) se prueban de a dos y de a tres. */
const PARA_COMBINAR = 16;
/** El p que tiene que tener una combinación (se prueban cientos por efecto). */
const P_COMBINADA = 0.001;
/** Con menos veces que esto, una combinación de varias cosas es fácil que sea casualidad. */
const SOPORTE_COMBINADA = 5;
/** Cuántas combinaciones quedan como mucho en un análisis. */
const COMBINADAS_MAX = 8;
/** Una combinación tiene que superar a la mejor de sus partes por esto (en lift) para quedar. */
const MEJORA_COMBINADA = 1.25;

/** Cuántos cortes se prueban como mucho para cada umbral (más cortes, más casualidades). */
const CORTES_MAX = 4;
/** El p con que la dosis tiene que importar: los días que llegan al corte contra los que tienen la causa pero menos. */
const P_DOSIS = 0.05;
/** Para decir que algo protege hacen falta más días con la causa: que algo no pase dice menos que que pase. */
const DIAS_PROTECCION = 5;

/**
 * Topes para que la cantidad de pruebas no crezca sin límite con años de historia y cientos de conceptos: se prueban las
 * causas y los efectos que más días tienen (quedan afuera los que casi nunca aparecen, que tampoco podrían dar nada firme).
 * Se eligen sin mirar la relación entre ellos, así que la corrección por pruebas múltiples sigue valiendo: cuenta lo que
 * de verdad se probó. Como mucho, unas 1,1 millones de pruebas; lo normal son cien mil.
 */
export const CAUSAS_MAX = 250;
export const EFECTOS_MAX = 150;
/** A cuántas de esas causas (las de más días) se les buscan umbrales: cada una suma hasta 8 cortes por efecto y desfase. */
export const UMBRALES_MAX = 80;

/** "Últimamente": con más historia que el doble de esto, se mira si el patrón se sigue viendo en estos últimos días. */
export const DIAS_RECIENTES = 180;
/** Con menos días con la causa que esto en los últimos meses, no se puede decir que dejó de pasar. */
const RECIENTES_MIN = 8;

/** Con menos días que esto no se analiza: cualquier coincidencia parecería un patrón. */
export const DIAS_MINIMOS = 14;

export interface Rasgo {
  concepto: ConceptoInfo;
  modo: Modo;
  /** por índice de día: 1 si el rasgo está ese día */
  esta: Uint8Array;
  /** por índice de día: 1 si ese día cuenta para comparar (se anotó algo, o hubo medición) */
  universo: Uint8Array;
  /** por índice de día: ms de la primera vez (para el orden dentro del mismo día) */
  primera: Float64Array;
  /** Solo puede ser causa (las tendencias de la semana). */
  soloCausa?: boolean;
  /**
   * Por índice de día, el valor (NaN si no hay): para buscar umbrales. Va en un solo rasgo de cada concepto con
   * cantidad o medida (el `presente` de lo que se cuenta, el `alto` de lo que se mide).
   */
  valor?: Float64Array;
  /** Cómo se buscan sus umbrales: `dosis` (0 los días sin la causa, "a partir de 3") o `medida` (por encima o debajo). */
  escala?: 'dosis' | 'medida';
}

/** Si algo tardó más que esto en aparecer, o no aparece hace más que esto, es que no se anotaba (no que son días sin eso). */
const DIAS_SIN_APARECER = 60;

/** Las intensidades anotadas al menos en esta proporción de los días activos se tratan como un puntaje diario. */
const PUNTAJE_DIARIO = 0.6;

/**
 * Las horas dan la vuelta a la medianoche: acostarse a la 1:00 es "más tarde" que a las 23:00. Si los valores están
 * más juntos contando el día desde el mediodía, se usan así.
 */
export function horasContinuas(v: number[]): number[] {
  const corrida = v.map((x) => (x + 720) % 1440);
  const dispersion = (l: number[]) => {
    const m = l.reduce((a, b) => a + b, 0) / l.length;
    return l.reduce((a, b) => a + (b - m) ** 2, 0);
  };
  return dispersion(corrida) < dispersion(v) ? corrida : v;
}

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- Estadística ----------

const cacheLogFact: number[] = [0];
function logFact(n: number): number {
  for (let i = cacheLogFact.length; i <= n; i++) cacheLogFact[i] = cacheLogFact[i - 1] + Math.log(i);
  return cacheLogFact[n];
}

const logComb = (n: number, k: number) => logFact(n) - logFact(k) - logFact(n - k);

/**
 * Test exacto de Fisher, la otra cola: probabilidad de ver `a` o menos coincidencias por azar (que la causa baje la
 * probabilidad del efecto).
 */
export function fisherMenor(a: number, n1: number, k: number, n: number): number {
  const den = logComb(n, k);
  let p = 0;
  for (let x = Math.max(0, k - (n - n1)); x <= Math.min(a, n1, k); x++) p += Math.exp(logComb(n1, x) + logComb(n - n1, k - x) - den);
  return Math.min(1, p);
}

/**
 * Test exacto de Fisher, una cola: probabilidad de ver `a` o más coincidencias por azar, si de `n` días `n1` tienen la
 * causa y `k` tienen el efecto.
 */
export function fisherMayor(a: number, n1: number, k: number, n: number): number {
  const max = Math.min(n1, k);
  const den = logComb(n, k);
  let p = 0;
  for (let x = a; x <= max; x++) {
    if (k - x > n - n1) continue;
    p += Math.exp(logComb(n1, x) + logComb(n - n1, k - x) - den);
  }
  return Math.min(1, p);
}

/** Benjamini-Hochberg: q de cada p, sabiendo que en total se probaron `m` hipótesis. */
export function benjaminiHochberg(ps: number[], m: number): number[] {
  const orden = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(ps.length);
  let min = 1;
  for (let j = orden.length - 1; j >= 0; j--) {
    const [p, i] = orden[j];
    min = Math.min(min, (p * m) / (j + 1));
    q[i] = min;
  }
  return q;
}

// ---------- Días como bits ----------
// Con toda la historia hay miles de días y cientos de miles de pruebas: cada tabla de 2x2 se cuenta de a 32 días por vez.

export type Bits = Uint32Array;

const palabras = (n: number) => (n + 31) >>> 5;

function aBits(v: Uint8Array): Bits {
  const b = new Uint32Array(palabras(v.length));
  for (let d = 0; d < v.length; d++) if (v[d]) b[d >>> 5] |= 1 << (d & 31);
  return b;
}

/** Bit d del resultado = bit d + k del original: "el efecto, k días después" alineado con el día de la causa. */
function corrido(b: Bits, k: number): Bits {
  const r = new Uint32Array(b.length);
  const salto = k >>> 5;
  const resto = k & 31;
  for (let w = 0; w + salto < b.length; w++) {
    r[w] = b[w + salto] >>> resto;
    if (resto && w + salto + 1 < b.length) r[w] |= b[w + salto + 1] << (32 - resto);
  }
  return r;
}

function cuentaBits(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

function yBits(partes: Bits[]): Bits {
  const r = partes[0].slice();
  for (const p of partes.slice(1)) for (let w = 0; w < r.length; w++) r[w] &= p[w];
  return r;
}

/** Los días de `desdeDia` a `hastaDia` (índices, incluidos), para contar solo una parte de la historia. */
export function mascaraDias(n: number, desdeDia: number, hastaDia: number): Bits {
  const b = new Uint32Array(palabras(n));
  for (let d = Math.max(0, desdeDia); d <= Math.min(n - 1, hastaDia); d++) b[d >>> 5] |= 1 << (d & 31);
  return b;
}

/** Lo que hace falta de una causa (simple, un corte o una combinación) para contar: en qué días está y a qué hora. */
export interface Fuente {
  universo: Bits;
  /** Los días en que está y cuenta. */
  con: Bits;
  hora: (d: number) => number;
}

/** Lo que hace falta de un efecto: por desfase, en qué días cuenta y en cuáles está, alineados con el día de la causa. */
export interface Destino {
  primera: Float64Array;
  /** Los días en que está, sin correr (para sacar los días en que ya estaba). */
  hoy: Bits;
  porDesfase: Map<number, { universo: Bits; esta: Bits }>;
  crudos: { universo: Bits; esta: Bits };
}

export const fuenteDe = (x: Pick<Rasgo, 'esta' | 'universo' | 'primera'>): Fuente => {
  const universo = aBits(x.universo);
  const con = aBits(x.esta);
  for (let w = 0; w < con.length; w++) con[w] &= universo[w];
  return { universo, con, hora: (d) => x.primera[d] };
};

export const destinoDe = (x: Rasgo): Destino => {
  const universo = aBits(x.universo);
  const hoy = aBits(x.esta);
  const esta = hoy.slice();
  for (let w = 0; w < esta.length; w++) esta[w] &= universo[w];
  return { primera: x.primera, hoy, porDesfase: new Map(), crudos: { universo, esta } };
};

export interface Tabla {
  n1: number;
  a: number;
  n0: number;
  c: number;
}

/**
 * La tabla de 2x2: de los días que cuentan para los dos, cuántos tienen la causa (n1), cuántos de esos tienen el efecto
 * k días después (a), y lo mismo sin la causa (n0, c). Con desfase 0, el efecto tiene que venir después de la causa (si
 * se sabe la hora de los dos). `limpio`: sin los días en que el efecto ya estaba el día de la causa. `mascara`: solo esos días.
 */
export function contar(A: Fuente, B: Destino, k: number, limpio = false, mascara?: Bits): Tabla {
  let en = B.porDesfase.get(k);
  if (!en) {
    en = k ? { universo: corrido(B.crudos.universo, k), esta: corrido(B.crudos.esta, k) } : B.crudos;
    B.porDesfase.set(k, en);
  }
  const { universo: ub, esta: eb } = en;
  let total = 0, n1 = 0, a = 0, conEfecto = 0, tarde = 0;
  for (let w = 0; w < ub.length; w++) {
    let u = A.universo[w] & ub[w];
    if (limpio) u &= ~B.hoy[w];
    if (mascara) u &= mascara[w];
    if (!u) continue;
    const conA = A.con[w] & u;
    const e = eb[w] & u;
    const juntos = conA & e;
    total += cuentaBits(u);
    n1 += cuentaBits(conA);
    conEfecto += cuentaBits(e);
    a += cuentaBits(juntos);
    if (k === 0 && juntos) {
      for (let x = juntos; x; x &= x - 1) {
        const d = (w << 5) + (31 - Math.clz32(x & -x));
        if (A.hora(d) > B.primera[d]) tarde++;
      }
    }
  }
  return { n1, a: a - tarde, n0: total - n1, c: conEfecto - a };
}

/** El lift, con un poco de suavizado para que un 0 no lo rompa. */
export const liftDe = (t: Tabla) => (t.a + 0.5) / (t.n1 + 1) / ((t.c + 0.5) / (t.n0 + 1));

// ---------- Rasgos ----------

export function armarRasgos(filas: FilaDiaria[], conceptos: Map<number, ConceptoInfo>, desde: string, n: number): Rasgo[] {
  const activo = new Uint8Array(n); // días en que se anotó algo a mano: los demás no cuentan como "no pasó"
  const porConcepto = new Map<number, FilaDiaria[]>();
  for (const f of filas) {
    const i = diasEntre(desde, f.fecha);
    if (i < 0 || i >= n || !conceptos.has(f.concepto_id)) continue;
    if (anotada(f)) activo[i] = 1;
    let l = porConcepto.get(f.concepto_id);
    if (!l) porConcepto.set(f.concepto_id, (l = []));
    l.push(f);
  }
  const rasgos: Rasgo[] = [];
  const totalActivos = activo.reduce((a, b) => a + b, 0);
  for (const [id, lista] of porConcepto) {
    const concepto = conceptos.get(id)!;
    const t = concepto.tipo_valor;
    const puntaje = t === 'intensidad' && lista.length >= PUNTAJE_DIARIO * totalActivos;
    if (t === 'medida' || t === 'hora' || puntaje) {
      const conValor = lista.filter((f) => (puntaje ? f.intensidad : f.promedio) !== null);
      if (conValor.length < 6) continue;
      let valores = conValor.map((f) => (puntaje ? f.intensidad! : f.promedio!));
      if (t === 'hora') valores = horasContinuas(valores);
      const med = mediana(valores);
      const universo = new Uint8Array(n);
      const alto = new Uint8Array(n);
      const bajo = new Uint8Array(n);
      for (const [j, f] of conValor.entries()) {
        const i = diasEntre(desde, f.fecha);
        universo[i] = 1;
        if (valores[j] > med) alto[i] = 1;
        else if (valores[j] < med) bajo[i] = 1;
      }
      const sinHora = new Float64Array(n).fill(Number.NaN);
      // Los umbrales de lo que se mide (no de las horas ni de los puntajes, que son de otra escala).
      let valor: Float64Array | undefined;
      if (t === 'medida' && concepto.rol !== 'efecto') {
        valor = new Float64Array(n).fill(Number.NaN);
        for (const [j, f] of conValor.entries()) valor[diasEntre(desde, f.fecha)] = valores[j];
      }
      rasgos.push({ concepto, modo: 'alto', esta: alto, universo, primera: sinHora, ...(valor ? { valor, escala: 'medida' as const } : {}) });
      rasgos.push({ concepto, modo: 'bajo', esta: bajo, universo, primera: sinHora });
      // La semana: el promedio de los últimos 7 días (con al menos 4 con valor), por encima o por debajo de lo habitual.
      // Solo como causa ("una semana durmiendo menos → dolor de cabeza"): como efecto, una semana se parece demasiado a
      // la anterior y saldría todo relacionado con todo.
      if (concepto.rol !== 'efecto' && conValor.length >= 14) {
        const porDia = new Map(conValor.map((f, j) => [diasEntre(desde, f.fecha), valores[j]]));
        const semana = new Float64Array(n).fill(Number.NaN);
        for (let d = 0; d < n; d++) {
          const l: number[] = [];
          for (let x = Math.max(0, d - 6); x <= d; x++) if (porDia.has(x)) l.push(porDia.get(x)!);
          if (l.length >= 4) semana[d] = l.reduce((a, b) => a + b, 0) / l.length;
        }
        const conSemana = [...semana].filter((v) => !Number.isNaN(v));
        if (conSemana.length >= 10) {
          const medSem = mediana(conSemana);
          const uSem = new Uint8Array(n);
          const altoSem = new Uint8Array(n);
          const bajoSem = new Uint8Array(n);
          for (let d = 0; d < n; d++) {
            if (Number.isNaN(semana[d])) continue;
            uSem[d] = 1;
            if (semana[d] > medSem) altoSem[d] = 1;
            else if (semana[d] < medSem) bajoSem[d] = 1;
          }
          rasgos.push({ concepto, modo: 'alto_semana', esta: altoSem, universo: uSem, primera: sinHora, soloCausa: true });
          rasgos.push({ concepto, modo: 'bajo_semana', esta: bajoSem, universo: uSem, primera: sinHora, soloCausa: true });
        }
      }
    } else {
      const esta = new Uint8Array(n);
      const primera = new Float64Array(n).fill(Number.NaN);
      // Los días antes de la primera vez y bastante después de la última no son "días sin esto": la persona todavía no lo
      // anotaba o ya no. Si contaran, con años de historia todo lo que empezó a anotar en la misma época saldría relacionado.
      const universo = new Uint8Array(n);
      let primerDia = n, ultimoDia = -1;
      for (const f of lista) {
        const i = diasEntre(desde, f.fecha);
        if (i < primerDia) primerDia = i;
        if (i > ultimoDia) ultimoDia = i;
      }
      if (primerDia < DIAS_SIN_APARECER) primerDia = 0;
      if (n - 1 - ultimoDia < DIAS_SIN_APARECER) ultimoDia = n - 1;
      for (let d = primerDia; d <= ultimoDia; d++) universo[d] = activo[d];
      // Lo que se cuenta (cafés, vasos, minutos de caminata): cuánto hubo cada día, para los umbrales. Un evento cuenta
      // las veces que se anotó; una cantidad, lo anotado (o las veces, si no se puso número).
      const conDosis = concepto.rol !== 'efecto' && (t === 'cantidad' || t === 'evento' || t === 'duracion');
      const valor = conDosis ? new Float64Array(n).fill(Number.NaN) : undefined;
      for (const f of lista) {
        const i = diasEntre(desde, f.fecha);
        esta[i] = 1;
        if (f.primera !== null) primera[i] = f.primera;
        if (valor) {
          const v = t === 'evento' ? f.veces : t === 'cantidad' ? (f.suma ?? f.veces) : f.suma;
          if (v !== null && v > 0) valor[i] = v;
        }
      }
      rasgos.push({ concepto, modo: 'presente', esta, universo, primera, ...(valor ? { valor, escala: 'dosis' as const } : {}) });
    }
  }
  return rasgos;
}

/**
 * Los rasgos que se dan el último día (`hasta`), armados igual que para buscar patrones ("12|presente", "40|alto"): así
 * se sabe si hoy se juntaron las causas de un patrón (patrones/preventivo.ts). Lo "alto" y lo "bajo" se miden contra lo
 * habitual de todo el período.
 */
export function rasgosDelDia(filas: FilaDiaria[], conceptosLista: ConceptoInfo[], desde: string, hasta: string): Set<string> {
  const n = diasEntre(desde, hasta) + 1;
  const conceptos = new Map(conceptosLista.map((c) => [c.id, c]));
  const r = new Set<string>();
  for (const x of armarRasgos(filas, conceptos, desde, n)) if (x.esta[n - 1]) r.add(`${x.concepto.id}|${x.modo}`);
  return r;
}

// ---------- Búsqueda ----------

export interface Resultado {
  candidatos: Candidato[];
  pares_evaluados: number;
  dias: number;
  dias_activos: number;
}

export function buscarPatrones(
  filas: FilaDiaria[],
  conceptosLista: ConceptoInfo[],
  desde: string,
  hasta: string,
  opciones: Partial<Opciones> = {},
): Resultado {
  const o = { ...OPCIONES, ...opciones };
  // Sin los desfases largos: el mismo día y el siguiente.
  const desfaseMax = o.desfasesLargos ? o.desfaseMax : Math.min(o.desfaseMax, 1);
  const n = diasEntre(desde, hasta) + 1;
  const conceptos = new Map(conceptosLista.map((c) => [c.id, c]));
  const rasgos = armarRasgos(filas, conceptos, desde, n);
  const diasActivos = new Set(filas.filter(anotada).map((f) => f.fecha)).size;
  if (diasActivos < DIAS_MINIMOS) return { candidatos: [], pares_evaluados: 0, dias: n, dias_activos: diasActivos };

  const causas = losQueMas(rasgos.filter((r) => r.concepto.rol !== 'efecto'), CAUSAS_MAX);
  const efectos = losQueMas(rasgos.filter((r) => r.concepto.rol !== 'causa' && !r.soloCausa), EFECTOS_MAX);
  const conCortes = new Set(losQueMas(causas.filter((r) => r.valor), UMBRALES_MAX));
  const crudos: Array<Omit<Candidato, 'q_valor' | 'puntaje'>> = [];
  let pares = 0;
  let paresCombinadas = 0;
  /** Por efecto y desfase, las causas que muestran algo de relación (para probar combinaciones). */
  const relacionadas = new Map<string, Array<{ A: Rasgo; lift: number; probCon: number; p: number }>>();

  /**
   * La tabla de 2x2 de una causa (simple o combinada) con un efecto, y si sirve como candidato. `limpio`: sin los días
   * en que el efecto ya estaba el día de la causa (para lo que protege: el día que duele la cabeza no se sale a caminar,
   * y como un dolor sigue al otro, caminar parecería proteger del de mañana).
   */
  const fuentes = new Map<object, Fuente>();
  const destinos = new Map<Rasgo, Destino>();
  const fuente = (x: Pick<Rasgo, 'esta' | 'universo' | 'primera'>) => {
    let f = fuentes.get(x);
    if (!f) fuentes.set(x, (f = fuenteDe(x)));
    return f;
  };
  const destino = (x: Rasgo) => {
    let f = destinos.get(x);
    if (!f) destinos.set(x, (f = destinoDe(x)));
    return f;
  };
  const probar = (A: Fuente, B: Rasgo, k: number, limpio = false) => {
    const t = contar(A, destino(B), k, limpio);
    if (t.n1 < o.diasCausaMin || t.n0 < 3) return null;
    return { ...t, lift: liftDe(t), probCon: t.a / t.n1, probSin: t.c / t.n0 };
  };
  const guardar = (
    A: Pick<Rasgo, 'concepto' | 'modo'>,
    extra: CausaExtra[],
    B: Rasgo,
    k: number,
    t: NonNullable<ReturnType<typeof probar>>,
    mas: { mejora?: number; umbral?: number; pTope?: number } = {},
  ) => {
    if (t.a < o.soporteMin || t.lift < o.liftMin) return false;
    const p = fisherMayor(t.a, t.n1, t.a + t.c, t.n1 + t.n0);
    // Las combinaciones se prueban muchas más veces: se les pide mucho más. Y a un umbral, según cuántos cortes se probaron.
    if (p > (mas.pTope ?? (extra.length ? P_COMBINADA : o.pMax))) return false;
    const { mejora, umbral } = mas;
    crudos.push({
      causa_id: A.concepto.id,
      causa_modo: A.modo,
      causas_extra: extra,
      efecto_id: B.concepto.id,
      efecto_modo: B.modo,
      desfase_dias: k,
      soporte: t.a,
      dias_causa: t.n1,
      dias_evaluados: t.n1 + t.n0,
      prob_con: t.probCon,
      prob_sin: t.probSin,
      lift: t.lift,
      p_valor: p,
      ...(mejora ? { mejora } : {}),
      ...(umbral !== undefined ? { umbral } : {}),
    });
    return true;
  };
  /**
   * Lo que protege: con la causa, el malestar aparece bastante menos. Solo desde el día siguiente (el mismo día se mezcla
   * con lo contrario: con dolor no se sale a caminar) y sin los días en que el malestar ya estaba (ver `probar`).
   */
  const protege = (A: Rasgo, B: Rasgo, k: number) => {
    if (k < 1) return;
    const t = probar(fuente(A), B, k, true);
    if (!t) return;
    pares++;
    // Que no aparezca algo que de todos modos casi nunca aparece no dice nada: con la causa se esperaba verlo varias veces.
    const esperado = (t.n1 * (t.a + t.c)) / (t.n1 + t.n0);
    if (t.n1 < DIAS_PROTECCION || t.c < o.soporteMin || esperado < o.soporteMin || t.lift > 1 / o.liftMin) return;
    const p = fisherMenor(t.a, t.n1, t.a + t.c, t.n1 + t.n0);
    if (p > o.pMax) return;
    crudos.push({
      causa_id: A.concepto.id,
      causa_modo: A.modo,
      causas_extra: [],
      efecto_id: B.concepto.id,
      efecto_modo: B.modo,
      desfase_dias: k,
      soporte: t.a,
      dias_causa: t.n1,
      dias_evaluados: t.n1 + t.n0,
      prob_con: t.probCon,
      prob_sin: t.probSin,
      lift: t.lift,
      p_valor: p,
      protege: true,
    });
  };
  // Un malestar: algo de "Dolores y molestias" que se anota cuando pasa.
  const malestar = (B: Rasgo) => B.modo === 'presente' && B.concepto.rol === 'efecto' && B.concepto.categoria === 'sintoma';

  for (const A of causas) {
    for (const B of efectos) {
      if (A.concepto.id === B.concepto.id) continue;
      for (let k = 0; k <= desfaseMax; k++) {
        // Lo que protege, de lo que se hace o pasa (los rasgos alto / bajo ya lo dicen al revés: "menos pasos → dolor").
        if (o.proteccion && A.modo === 'presente' && !A.soloCausa && malestar(B)) protege(A, B, k);
        const t = probar(fuente(A), B, k);
        if (!t) continue;
        pares++;
        // Se combinan causas solo para síntomas y ánimo: lo que la persona siente, que es lo que quiere entender.
        // Las tendencias de la semana no se combinan: se parecen mucho entre sí y sumarían casualidades.
        if (t.a >= 2 && t.lift > 1.05 && !A.soloCausa && (B.concepto.rol === 'efecto' || B.concepto.tipo_valor === 'intensidad')) {
          const clave = `${efectos.indexOf(B)}|${k}`;
          let l = relacionadas.get(clave);
          if (!l) relacionadas.set(clave, (l = []));
          l.push({ A, lift: t.lift, probCon: t.probCon, p: fisherMayor(t.a, t.n1, t.a + t.c, t.n1 + t.n0) });
        }
        guardar(A, [], B, k, t);
      }
    }
  }

  // Umbrales: para lo que tiene cantidad o medida, unos pocos cortes. Cada corte es una prueba más (cuenta para el q), el
  // elegido tiene que pasar un p dividido por la cantidad de cortes, y la dosis tiene que importar: entre los días con la
  // causa, los que llegan al corte dan el efecto bastante más que los que se quedan cerca (si no, alcanza con el simple).
  const cortes = new Map<string, Corte>();
  if (o.umbrales) {
    for (const A of causas) {
      if (!conCortes.has(A)) continue;
      const lista = cortesDe(A, n);
      for (const c of lista) cortes.set(`${A.concepto.id}|${c.modo}|${c.umbral}`, c);
      if (!lista.length) continue;
      const pTope = o.pMax / lista.length;
      for (const B of efectos) {
        if (A.concepto.id === B.concepto.id) continue;
        for (let k = 0; k <= desfaseMax; k++) {
          for (const corte of lista) {
            const t = probar(fuente(corte), B, k);
            if (!t) continue;
            pares++;
            if (t.a < o.soporteMin || t.lift < o.liftMin) continue;
            // Los días que tienen la causa pero no llegan al corte.
            let nm = 0, am = 0;
            for (let d = 0; d + k < n; d++) {
              if (!corte.menos[d] || !B.universo[d + k]) continue;
              nm++;
              if (B.esta[d + k] && !(k === 0 && A.primera[d] > B.primera[d])) am++;
            }
            if (nm < 3 || fisherMayor(t.a, t.n1, t.a + am, t.n1 + nm) > P_DOSIS) continue;
            guardar({ concepto: A.concepto, modo: corte.modo }, [], B, k, t, { umbral: corte.umbral, pTope });
          }
        }
      }
    }
  }

  // Combinaciones: de las causas más relacionadas con cada efecto, de a dos y de a tres (de conceptos distintos).
  const juntar = (partes: Rasgo[]): Fuente => {
    const f = partes.map(fuente);
    return {
      universo: yBits(f.map((x) => x.universo)),
      con: yBits(f.map((x) => x.con)),
      // La combinación "pasó" cuando pasó la última de sus partes.
      hora: (d) => {
        let h = Number.NaN;
        for (const x of partes) if (!Number.isNaN(x.primera[d]) && !(x.primera[d] <= h)) h = x.primera[d];
        return h;
      },
    };
  };
  const parecidosVistos = new Map<string, boolean>();
  const yaParecidos = (x: Rasgo, y: Rasgo) => {
    const clave = `${x.concepto.id}${x.modo}|${y.concepto.id}${y.modo}`;
    let r = parecidosVistos.get(clave);
    if (r === undefined) parecidosVistos.set(clave, (r = parecidos(x, y)));
    return r;
  };
  for (const [clave, lista] of relacionadas) {
    const [bi, ks] = clave.split('|');
    const B = efectos[Number(bi)];
    const k = Number(ks);
    // Las más sostenidas por los números (no las de lift alto con dos días, que suelen ser casualidad).
    const top = lista.sort((x, y) => x.p - y.p).slice(0, PARA_COMBINAR);
    const grupos: Array<typeof top> = [];
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        grupos.push([top[i], top[j]]);
        for (let m = j + 1; m < top.length; m++) grupos.push([top[i], top[j], top[m]]);
      }
    }
    for (const g of grupos) {
      if (new Set(g.map((x) => x.A.concepto.id)).size < g.length) continue;
      // Dos partes que casi siempre van juntas (pasos y km caminados) son la misma cosa: no es una combinación.
      if (g.some((x, i) => g.some((y, j) => j > i && yaParecidos(x.A, y.A)))) continue;
      const t = probar(juntar(g.map((x) => x.A)), B, k);
      if (!t) continue;
      pares++;
      paresCombinadas++;
      // Tiene que decir bastante más que cada parte sola: si no, es la simple con un agregado de casualidad. Y eso se
      // prueba también: entre los días con la mejor parte, los que además tienen las otras dan el efecto bastante más.
      const mejor = g.reduce((x, y) => (y.lift > x.lift ? y : x));
      const mejorProb = Math.max(...g.map((x) => x.probCon));
      if (t.lift < mejor.lift * MEJORA_COMBINADA || t.probCon < mejorProb + 0.1) continue;
      const solo = probar(fuente(mejor.A), B, k);
      if (!solo) continue;
      // Días con la mejor parte: t.n1 con todo (t.a con efecto) y el resto sin las otras partes.
      const pAporte = fisherMayor(t.a, t.n1, solo.a, solo.n1);
      if (pAporte > 0.05) continue;
      const [primero, ...resto] = g.map((x) => x.A);
      guardar(primero, resto.map((x) => ({ id: x.concepto.id, modo: x.modo })), B, k, t, { mejora: t.lift / mejor.lift });
    }
  }

  // Las simples, por su lado: las combinaciones salen de causas ya elegidas por parecer relacionadas y dan p tan chicos que,
  // mezcladas, hacen parecer firmes a las simples que vienen atrás (con cientos de conceptos, decenas de falsas).
  // Las combinaciones se siguen midiendo contra todo.
  const simplesCrudos = crudos.filter((x) => !x.causas_extra.length);
  const qSimples = benjaminiHochberg(simplesCrudos.map((x) => x.p_valor), Math.max(pares - paresCombinadas, 1));
  const qTodos = benjaminiHochberg(crudos.map((x) => x.p_valor), Math.max(pares, 1));
  const qDe = new Map<(typeof crudos)[number], number>();
  crudos.forEach((x, i) => qDe.set(x, qTodos[i]));
  simplesCrudos.forEach((x, i) => qDe.set(x, qSimples[i]));
  const todos: Candidato[] = crudos.map((x) => ({
    ...x,
    q_valor: qDe.get(x)!,
    // Más arriba lo que es fuerte (lift), poco probable por azar (p) y visto muchas veces (soporte). Lo que protege, al
    // revés: cuánto baja, y cuántas veces se esperaba verlo con la causa.
    puntaje: x.protege
      ? Math.log2(1 / x.lift) * -Math.log10(x.p_valor) * Math.sqrt(x.dias_causa * x.prob_sin)
      : Math.log2(x.lift) * -Math.log10(x.p_valor) * Math.sqrt(x.soporte),
  }));

  // De cada par causa → efecto queda el mejor desfase (si no, "tomate → dolor" aparecería con 1, 2 y 3 días).
  // Y "acostarse tarde → energía baja" es lo mismo que "acostarse temprano → energía alta": queda uno solo.
  const espejo = (m: Modo): Modo =>
    m === 'alto' ? 'bajo' : m === 'bajo' ? 'alto' : m === 'alto_semana' ? 'bajo_semana' : m === 'bajo_semana' ? 'alto_semana' : m;
  const mejor = new Map<string, Candidato>();
  for (const x of todos) {
    const [cm, em] = (x.causa_modo === 'bajo' || x.causa_modo === 'bajo_semana') && !x.causas_extra.length ? [espejo(x.causa_modo), espejo(x.efecto_modo)] : [x.causa_modo, x.efecto_modo];
    const clave = `${claveCausas(x)}|${cm}>${x.efecto_id}${em}${x.protege ? '|protege' : ''}`;
    const y = mejor.get(clave);
    if (!y || x.puntaje > y.puntaje) mejor.set(clave, x);
  }
  // Una combinación sobra si una de sus partes sola (con cualquier desfase) ya explica lo mismo, o si es de tres y no
  // supera a una de dos con las mismas partes.
  // Y el simple sobra si quedó un umbral de la misma causa con el mismo efecto: "café → dolor" dice menos que "a partir
  // de 3 cafés → dolor" (que ya probó que la dosis importa).
  const conUmbral = new Set(
    [...mejor.values()]
      .filter((x) => x.umbral != null)
      .flatMap((x) => (x.causa_modo === 'hasta' ? ['bajo'] : ['presente', 'alto']).map((m) => `${x.causa_id}|${m}|${x.efecto_id}|${x.efecto_modo}`)),
  );
  const todosMejores = [...mejor.values()].filter(
    (x) => x.protege || x.causas_extra.length || !conUmbral.has(`${x.causa_id}|${x.causa_modo}|${x.efecto_id}|${x.efecto_modo}`),
  );
  const semanal = (m: Modo) => m === 'alto_semana' || m === 'bajo_semana';
  const elegidos = todosMejores.filter((x) => {
    // La tendencia de la semana sobra si el mismo rasgo del día ya lo explica casi igual (dormir poco anoche y dormir
    // poco esta semana suelen ir juntos): queda solo cuando la semana dice bastante más.
    if (semanal(x.causa_modo) && !x.causas_extra.length) {
      const diaria = todosMejores.find((y) => !y.causas_extra.length && !y.protege && y.causa_id === x.causa_id && !semanal(y.causa_modo) && y.efecto_id === x.efecto_id && y.efecto_modo === x.efecto_modo);
      return !diaria || x.lift > diaria.lift * MEJORA_COMBINADA;
    }
    if (!x.causas_extra.length) return true;
    const mias = partes(x);
    return !todosMejores.some(
      (y) =>
        y !== x &&
        y.efecto_id === x.efecto_id &&
        y.efecto_modo === x.efecto_modo &&
        y.causas_extra.length < x.causas_extra.length &&
        partes(y).every((c) => mias.includes(c)) &&
        // Una de sus partes sola que ya la explica igual, o una combinación más chica que casi la iguala.
        y.lift >= x.lift / (y.causas_extra.length ? MEJORA_COMBINADA : 1),
    );
  });
  // Combinaciones con los mismos números para el mismo efecto son la misma (cambia una parte por otra equivalente).
  const vistos = new Set<string>();
  const sinRepetir = elegidos
    .sort((a, b) => b.puntaje - a.puntaje)
    .filter((x) => {
      if (!x.causas_extra.length) return true;
      const k = `${x.efecto_id}|${x.efecto_modo}|${x.desfase_dias}|${x.soporte}|${x.dias_causa}|${x.lift.toFixed(4)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  // Con años de historia, un patrón que ya no pasa no tiene que parecer de hoy: se avisa y va más abajo.
  if (n >= DIAS_RECIENTES * 2) {
    const ultimos = mascaraDias(n, n - DIAS_RECIENTES, n - 1);
    const ultimoAnio = mascaraDias(n, n - 365, n - 1);
    const rasgo = (id: number, modo: Modo) => rasgos.find((r) => r.concepto.id === id && r.modo === modo);
    for (const x of sinRepetir) {
      const B = rasgo(x.efecto_id, x.efecto_modo);
      const partesX = [{ id: x.causa_id, modo: x.causa_modo }, ...x.causas_extra].map((c) => rasgo(c.id, c.modo));
      const corte = x.umbral != null ? cortes.get(`${x.causa_id}|${x.causa_modo}|${x.umbral}`) : undefined;
      if (!B || (corte ? false : partesX.some((r) => !r))) continue;
      const A = corte ? fuente(corte) : partesX.length > 1 ? juntar(partesX as Rasgo[]) : fuente(partesX[0]!);
      x.ya_no = yaNoSeVe(x, contar(A, destino(B), x.desfase_dias, Boolean(x.protege), ultimos), contar(A, destino(B), x.desfase_dias, Boolean(x.protege), ultimoAnio));
      if (x.ya_no) x.puntaje *= 0.25;
    }
    sinRepetir.sort((a, b) => b.puntaje - a.puntaje);
  }
  // Las combinaciones se prueban de a cientos: solo quedan las muy firmes (p muy chico, ver `guardar`), y como mucho
  // unas pocas, así no tapan a las simples.
  // Primero las mejor sostenidas por los números, y como mucho una por efecto (si no, el mismo "dormir poco + …"
  // aparece con cada cosa que va con dormir poco).
  const porEfecto = new Set<string>();
  const combinadas = sinRepetir
    .filter((x) => x.causas_extra.length && x.soporte >= SOPORTE_COMBINADA)
    .sort((a, b) => a.p_valor - b.p_valor)
    .filter((x) => {
      const k = `${x.efecto_id}|${x.efecto_modo}`;
      if (porEfecto.has(k)) return false;
      porEfecto.add(k);
      return true;
    })
    .slice(0, COMBINADAS_MAX);
  const simples = sinRepetir.filter((x) => !x.causas_extra.length).slice(0, o.limite - combinadas.length);
  const candidatos = [...simples, ...combinadas].sort((a, b) => b.puntaje - a.puntaje);
  return { candidatos, pares_evaluados: pares, dias: n, dias_activos: diasActivos };
}

/**
 * Si un patrón de toda la historia dejó de verse: en los últimos meses la causa siguió pasando, pero el efecto ya no va
 * con ella (bastante menos que en toda la historia, y en esos meses ya no se distingue de los días sin la causa). O, si la
 * causa casi no pasó últimamente, hace más de un año que no se ven juntos.
 */
export function yaNoSeVe(x: Pick<Candidato, 'soporte' | 'dias_causa' | 'protege'>, ultimos: Tabla, ultimoAnio: Tabla): boolean {
  if (ultimos.n1 < RECIENTES_MIN) return !x.protege && ultimoAnio.a === 0;
  const total = ultimos.a + ultimos.c;
  const dias = ultimos.n1 + ultimos.n0;
  if (x.protege) return fisherMenor(ultimos.a, ultimos.n1, total, dias) > 0.05 && fisherMayor(ultimos.a, ultimos.n1, x.soporte, x.dias_causa) <= 0.1;
  return fisherMayor(ultimos.a, ultimos.n1, total, dias) > 0.05 && fisherMenor(ultimos.a, ultimos.n1, x.soporte, x.dias_causa) <= 0.1;
}

/** Los rasgos con más días (si son más que `tope`), en el orden en que estaban. */
function losQueMas(l: Rasgo[], tope: number): Rasgo[] {
  if (l.length <= tope) return l;
  const dias = new Map(l.map((r) => [r, r.esta.reduce((a, b) => a + b, 0)]));
  const quedan = new Set([...l].sort((a, b) => dias.get(b)! - dias.get(a)!).slice(0, tope));
  return l.filter((r) => quedan.has(r));
}

/** Un corte de un umbral: los días que llegan (`esta`), los que cuentan, y los que tienen la causa pero no llegan. */
interface Corte extends Pick<Rasgo, 'esta' | 'universo' | 'primera'> {
  modo: 'desde' | 'hasta';
  umbral: number;
  menos: Uint8Array;
}

/** El valor en la posición `q` (0 a 1) de una lista ordenada. */
const cuantil = (orden: number[], q: number) => orden[Math.min(orden.length - 1, Math.max(0, Math.round(q * (orden.length - 1))))];

/**
 * Los cortes que se prueban para un rasgo con valores. De lo que se cuenta, "a partir de" cada cantidad (sin la más chica,
 * que es lo mismo que "hubo"), contra los días con menos; de lo que se mide, por encima de lo habitual ("desde 30 °C",
 * contra los días altos que no llegan) y por debajo ("hasta 6 horas", contra los bajos que no bajan tanto).
 */
function cortesDe(A: Rasgo, n: number): Corte[] {
  const v = A.valor!;
  const res: Corte[] = [];
  const armar = (modo: Corte['modo'], umbral: number, universo: Uint8Array, llega: (x: number) => boolean, cerca: (x: number) => boolean) => {
    const esta = new Uint8Array(n);
    const menos = new Uint8Array(n);
    let enEsta = 0, enMenos = 0;
    for (let d = 0; d < n; d++) {
      if (!universo[d] || Number.isNaN(v[d])) continue;
      if (llega(v[d])) {
        esta[d] = 1;
        enEsta++;
      } else if (cerca(v[d])) {
        menos[d] = 1;
        enMenos++;
      }
    }
    if (enEsta >= 3 && enMenos >= 3) res.push({ modo, umbral, esta, universo, primera: A.primera, menos });
  };
  const elegir = (l: number[], qs: number[]) => [...new Set(qs.map((q) => cuantil(l, q)))];
  if (A.escala === 'dosis') {
    // Los días con la causa pero sin saber cuánto no cuentan; los días sin la causa, sí (son 0).
    const universo = new Uint8Array(n);
    const valores: number[] = [];
    for (let d = 0; d < n; d++) {
      if (!A.universo[d] || (A.esta[d] && Number.isNaN(v[d]))) continue;
      universo[d] = 1;
      if (A.esta[d]) valores.push(v[d]);
    }
    const distintos = [...new Set(valores)].sort((a, b) => a - b);
    const posibles = distintos.length - 1 > CORTES_MAX ? elegir(valores.sort((a, b) => a - b), [0.25, 0.5, 0.75, 0.9]).filter((x) => x > distintos[0]) : distintos.slice(1);
    // Los días sin la causa (sin valor) quedan en el universo pero nunca en `esta` ni en `menos`: son el "sin".
    for (const c of posibles) armar('desde', c, universo, (x) => x >= c, (x) => x < c);
    return res;
  }
  const valores: number[] = [];
  for (let d = 0; d < n; d++) if (A.universo[d] && !Number.isNaN(v[d])) valores.push(v[d]);
  if (valores.length < 10) return res;
  const orden = valores.sort((a, b) => a - b);
  const med = mediana(orden);
  for (const c of elegir(orden, [0.6, 0.7, 0.8, 0.9]).filter((x) => x > med)) armar('desde', c, A.universo, (x) => x >= c, (x) => x > med);
  for (const c of elegir(orden, [0.4, 0.3, 0.2, 0.1]).filter((x) => x < med)) armar('hasta', c, A.universo, (x) => x <= c, (x) => x < med);
  return res;
}

/**
 * Si dos rasgos dicen casi lo mismo: están juntos en más del 75 % de los días en que está alguno, o uno está casi
 * siempre dentro del otro ("Milanesa con papas fritas" y "Comida frita").
 */
function parecidos(a: Rasgo, b: Rasgo): boolean {
  let juntos = 0;
  let alguno = 0;
  let enA = 0;
  let enB = 0;
  for (let d = 0; d < a.esta.length; d++) {
    if (a.esta[d] || b.esta[d]) alguno++;
    if (a.esta[d] && b.esta[d]) juntos++;
    enA += a.esta[d];
    enB += b.esta[d];
  }
  if (!alguno) return false;
  return juntos / alguno > 0.75 || juntos / Math.max(1, Math.min(enA, enB)) > 0.9;
}

const partes = (x: Pick<Candidato, 'causa_id' | 'causa_modo' | 'causas_extra'>) => [`${x.causa_id}:${x.causa_modo}`, ...x.causas_extra.map((c) => `${c.id}:${c.modo}`)];

/** Las causas de un hallazgo, en un orden fijo (así la misma combinación da siempre la misma clave). */
export function claveCausas(x: Pick<Candidato, 'causa_id' | 'causa_modo' | 'causas_extra'>): string {
  return partes(x).sort().join('+');
}

/** Cuándo llega el efecto, dicho como se dice: "al día siguiente", "a los dos días". */
export function cuandoTexto(desfase: number, idioma: Idioma = 'es'): string {
  const t = (texto: string, vars?: Record<string, string | number>) => traducir(idioma, texto, vars);
  if (desfase === 0) return t('ese mismo día, más tarde');
  if (desfase === 1) return t('al día siguiente');
  if (desfase === 2) return t('a los dos días');
  if (desfase === 3) return t('a los tres días');
  return t('{n} días después', { n: desfase });
}

/** Texto simple de un hallazgo, para cuando no hay IA. `causa` y `efecto` ya vienen nombrados ("Energía baja"). */
export function describir(x: Candidato, causa: string, efecto: string, idioma: Idioma = 'es'): string {
  const t = (texto: string, vars?: Record<string, string | number>) => traducir(idioma, texto, vars);
  const cuando = cuandoTexto(x.desfase_dias, idioma);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (x.protege) {
    return t('Los días con «{causa}», {cuando} hubo «{efecto}» solo el {con} de las veces ({soporte} de {dias}); el resto de los días, el {sin}. Parece que te protege.', {
      causa,
      cuando,
      efecto,
      con: pct(x.prob_con),
      soporte: x.soporte,
      dias: x.dias_causa,
      sin: pct(x.prob_sin),
    });
  }
  return t('Los días con «{causa}», {cuando} hubo «{efecto}» el {con} de las veces ({soporte} de {dias}); el resto de los días, el {sin}.', {
    causa,
    cuando,
    efecto,
    con: pct(x.prob_con),
    soporte: x.soporte,
    dias: x.dias_causa,
    sin: pct(x.prob_sin),
  });
}
