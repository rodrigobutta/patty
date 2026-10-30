// El motor verifica lo que sospechó la IA. Pura, sin base de datos ni IA: recibe hipótesis ya leídas y las mide con las mismas
// cuentas que la búsqueda de siempre (tabla de 2x2, Fisher, lift, soporte). Tiene que pasar por sus propios números:
//   - relacion: causa → efecto k días después, en toda la historia o en un período.
//   - cambio: antes y después de una fecha, la causa cambió y el efecto también. Se comparan hasta 180 días a cada lado, por
//     día y también por semana: los días de una misma racha se parecen, y por día solo un cambio saldría firme de más.
// La corrección tiene en cuenta que la IA vio los datos antes de proponer:
//   - Benjamini-Hochberg sobre lo que se probó esta vez, contando al menos 10 (aunque proponga menos), y q ≤ 0,05.
//   - Las fechas las eligió mirando (el perfil lista los cambios bruscos): un cambio o un período paga p × la cantidad de semanas
//     de la historia, como si hubiera probado cada una.
import { nombreRasgo, normalizar, traducir, type Idioma, type Modo, type TipoValor } from 'shared';
import { diasEntre, esFecha } from '../lib/fechas.js';
import {
  armarRasgos,
  benjaminiHochberg,
  contar,
  describir,
  destinoDe,
  DIAS_RECIENTES,
  fisherMayor,
  fisherMenor,
  fuenteDe,
  liftDe,
  mascaraDias,
  yaNoSeVe,
  type Candidato,
  type ConceptoInfo,
  type Destino,
  type FilaDiaria,
  type Fuente,
  type Rasgo,
  type Tabla,
} from './motor.js';

export const HIPOTESIS_MAX = 10;
export const DESFASE_HIPOTESIS_MAX = 14;
const Q_MAX = 0.05;
const LIFT_MIN = 1.3;
const SOPORTE_MIN = 5;
const DIAS_CAUSA_MIN = 10;
const PERIODO_MIN = 30;
const VENTANA_CAMBIO = 180;
const LADO_MIN = 28;
const M_MIN = 10;
const RAZON_MAX = 300;

export type Sentido = 'sube' | 'baja';

/** Lo que devuelve la IA, tal cual. */
export interface HipotesisCruda {
  tipo: string;
  causa: string;
  causa_modo: string;
  efecto: string;
  efecto_modo: string;
  sentido: string;
  causa_despues: string;
  desfase_dias: number;
  fecha_desde: string;
  fecha_hasta: string;
  razon: string;
}

export interface Hipotesis {
  tipo: 'relacion' | 'cambio';
  causa_id: number;
  causa_modo: Modo;
  efecto_id: number;
  efecto_modo: Modo;
  sentido: Sentido;
  causa_despues: Sentido;
  desfase_dias: number;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  razon: string;
}

export const claveHipotesis = (h: Omit<Hipotesis, 'razon'>) =>
  [h.tipo, h.causa_id, h.causa_modo, h.efecto_id, h.efecto_modo, h.sentido, h.tipo === 'cambio' ? h.causa_despues : '', h.desfase_dias, h.fecha_desde ?? '', h.fecha_hasta ?? ''].join('|');

export interface Descartada {
  causa: string;
  efecto: string;
  motivo: string;
}

const MODOS_CAUSA = ['presente', 'alto', 'bajo', 'alto_semana', 'bajo_semana'];
const MODOS_EFECTO = ['presente', 'alto', 'bajo'];

/**
 * Lo que devolvió la IA, contra lo que existe: conceptos de la lista, modos que el motor sabe medir, fechas dentro de la historia,
 * lo que la persona dejó prendido. Lo demás se descarta (no se le cree nada que no se pueda medir).
 */
export function validarHipotesis(
  crudas: HipotesisCruda[],
  o: {
    nombres: Map<string, number>;
    conceptos: ConceptoInfo[];
    /** Los rasgos que existen ("12|presente"). */
    rasgos: Set<string>;
    desde: string;
    hasta: string;
    desfasesLargos: boolean;
    proteccion: boolean;
  },
): { validas: Hipotesis[]; descartadas: Descartada[] } {
  const validas: Hipotesis[] = [];
  const descartadas: Descartada[] = [];
  const claves = new Set<string>();
  const porId = new Map(o.conceptos.map((c) => [c.id, c]));
  for (const h of crudas.slice(0, HIPOTESIS_MAX)) {
    const no = (motivo: string) => descartadas.push({ causa: String(h.causa), efecto: String(h.efecto), motivo });
    const causa = o.nombres.get(normalizar(String(h.causa ?? '')));
    const efecto = o.nombres.get(normalizar(String(h.efecto ?? '')));
    if (causa === undefined || efecto === undefined) {
      no('concepto_desconocido');
      continue;
    }
    if (causa === efecto) {
      no('misma_cosa');
      continue;
    }
    if (porId.get(efecto)?.rol === 'causa') {
      no('no_puede_ser_efecto');
      continue;
    }
    if (h.tipo !== 'relacion' && h.tipo !== 'cambio') {
      no('tipo_invalido');
      continue;
    }
    if (!MODOS_CAUSA.includes(h.causa_modo) || !MODOS_EFECTO.includes(h.efecto_modo) || !o.rasgos.has(`${causa}|${h.causa_modo}`) || !o.rasgos.has(`${efecto}|${h.efecto_modo}`)) {
      no('modo_invalido');
      continue;
    }
    if ((h.sentido !== 'sube' && h.sentido !== 'baja') || (h.tipo === 'cambio' && h.causa_despues !== 'sube' && h.causa_despues !== 'baja')) {
      no('sentido_invalido');
      continue;
    }
    const k = h.tipo === 'cambio' ? 0 : h.desfase_dias;
    if (!Number.isInteger(k) || k < 0 || k > DESFASE_HIPOTESIS_MAX) {
      no('desfase_invalido');
      continue;
    }
    if (k >= 2 && !o.desfasesLargos) {
      no('apagado_desfases_largos');
      continue;
    }
    if (h.tipo === 'relacion' && h.sentido === 'baja' && !o.proteccion) {
      no('apagado_proteccion');
      continue;
    }
    const f1 = String(h.fecha_desde ?? '').trim();
    const f2 = String(h.fecha_hasta ?? '').trim();
    const adentro = (f: string) => esFecha(f) && f >= o.desde && f <= o.hasta;
    let fechaDesde: string | null = null;
    let fechaHasta: string | null = null;
    if (h.tipo === 'cambio') {
      if (!adentro(f1) || f1 === o.desde) {
        no('fecha_invalida');
        continue;
      }
      fechaDesde = f1;
    } else if (f1 || f2) {
      const a = f1 || o.desde;
      const b = f2 || o.hasta;
      if (!adentro(a) || !adentro(b) || diasEntre(a, b) + 1 < PERIODO_MIN) {
        no('fecha_invalida');
        continue;
      }
      // Toda la historia es lo mismo que no decir período.
      if (a !== o.desde || b !== o.hasta) {
        fechaDesde = a;
        fechaHasta = b;
      }
    }
    const razon = String(h.razon ?? '').replace(/\s+/g, ' ').trim().slice(0, RAZON_MAX);
    if (!razon) {
      no('sin_razon');
      continue;
    }
    const lista: Hipotesis = {
      tipo: h.tipo,
      causa_id: causa,
      causa_modo: h.causa_modo as Modo,
      efecto_id: efecto,
      efecto_modo: h.efecto_modo as Modo,
      sentido: h.sentido,
      causa_despues: h.tipo === 'cambio' ? (h.causa_despues as Sentido) : 'sube',
      desfase_dias: k,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      razon,
    };
    const clave = claveHipotesis(lista);
    if (claves.has(clave)) {
      no('repetida_en_la_respuesta');
      continue;
    }
    claves.add(clave);
    validas.push(lista);
  }
  return { validas, descartadas };
}

export interface Veredicto {
  hipotesis: Hipotesis;
  pasa: boolean;
  /** Por qué no pasó. */
  motivo: string | null;
  soporte: number;
  dias_causa: number;
  dias_evaluados: number;
  prob_con: number;
  prob_sin: number;
  lift: number;
  /** Ya con lo que paga una fecha elegida mirando. */
  p_valor: number;
  q_valor: number;
  puntaje: number;
  ya_no: boolean;
  /** En un cambio: cómo aparecía la causa antes y después. */
  causa_antes?: number;
  causa_luego?: number;
}

type Medida = Omit<Veredicto, 'hipotesis' | 'pasa' | 'q_valor' | 'puntaje'>;


export function evaluarHipotesis(filas: FilaDiaria[], conceptosLista: ConceptoInfo[], desde: string, hasta: string, lista: Hipotesis[]): Veredicto[] {
  if (!lista.length) return [];
  const n = diasEntre(desde, hasta) + 1;
  const conceptos = new Map(conceptosLista.map((c) => [c.id, c]));
  const rasgos = armarRasgos(filas, conceptos, desde, n);
  const buscar = (id: number, modo: Modo) => rasgos.find((r) => r.concepto.id === id && r.modo === modo);
  const activo = new Uint8Array(n);
  for (const f of filas) {
    if (f.primera === null || f.automatica) continue;
    const i = diasEntre(desde, f.fecha);
    if (i >= 0 && i < n) activo[i] = 1;
  }
  const semanas = Math.max(1, Math.ceil(n / 7));

  const medidas = lista.map((h): Medida => {
    const A = buscar(h.causa_id, h.causa_modo);
    const B = buscar(h.efecto_id, h.efecto_modo);
    if (!A || !B) return sinDatos('ya_no_existe');
    return h.tipo === 'cambio' ? medirCambio(h, A, B, activo, n, desde, semanas) : medirRelacion(h, A, B, n, desde, semanas);
  });

  // Los que no se pudieron medir también cuentan como prueba: la IA los propuso.
  const q = benjaminiHochberg(medidas.map((m) => m.p_valor), Math.max(M_MIN, lista.length));
  return lista.map((hipotesis, i) => {
    const m = medidas[i];
    const pasa = !m.motivo && q[i] <= Q_MAX;
    const fuerza = hipotesis.sentido === 'baja' ? 1 / Math.max(m.lift, 1e-6) : Math.max(m.lift, 1e-6);
    return {
      ...m,
      hipotesis,
      pasa,
      motivo: m.motivo ?? (pasa ? null : 'no_alcanza'),
      q_valor: q[i],
      puntaje: (m.ya_no ? 0.25 : 1) * Math.max(0, Math.log2(fuerza)) * -Math.log10(Math.max(m.p_valor, 1e-300)) * Math.sqrt(Math.max(m.soporte, 1)),
    };
  });
}

const sinDatos = (motivo: string): Medida => ({ motivo, soporte: 0, dias_causa: 0, dias_evaluados: 0, prob_con: 0, prob_sin: 0, lift: 1, p_valor: 1, ya_no: false });

function aMedida(t: Tabla, p: number, motivo: string | null): Medida {
  return {
    motivo,
    soporte: t.a,
    dias_causa: t.n1,
    dias_evaluados: t.n1 + t.n0,
    prob_con: t.n1 ? t.a / t.n1 : 0,
    prob_sin: t.n0 ? t.c / t.n0 : 0,
    lift: liftDe(t),
    p_valor: Math.min(1, p),
    ya_no: false,
  };
}

function medirRelacion(h: Hipotesis, A: Rasgo, B: Rasgo, n: number, desde: string, semanas: number): Medida {
  const fA = fuenteDe(A);
  const fB = destinoDe(B);
  const baja = h.sentido === 'baja';
  // Como en lo que protege: sin los días en que el efecto ya estaba (con dolor no se sale a caminar).
  const limpio = baja && h.desfase_dias >= 1;
  const mascara = h.fecha_desde ? mascaraDias(n, diasEntre(desde, h.fecha_desde), diasEntre(desde, h.fecha_hasta!)) : undefined;
  const t = contar(fA, fB, h.desfase_dias, limpio, mascara);
  if (t.n1 < DIAS_CAUSA_MIN || t.n0 < DIAS_CAUSA_MIN) return aMedida(t, 1, 'pocos_datos');
  const total = t.a + t.c;
  const p = (baja ? fisherMenor(t.a, t.n1, total, t.n1 + t.n0) : fisherMayor(t.a, t.n1, total, t.n1 + t.n0)) * (mascara ? semanas : 1);
  const m = aMedida(t, p, null);
  if (baja ? (t.n1 * total) / (t.n1 + t.n0) < SOPORTE_MIN || m.lift > 1 / LIFT_MIN : t.a < SOPORTE_MIN || m.lift < LIFT_MIN) m.motivo = 'no_alcanza';
  if (!mascara && n >= DIAS_RECIENTES * 2) {
    m.ya_no = yaNoSeVe(
      { soporte: t.a, dias_causa: t.n1, protege: baja },
      contar(fA, fB, h.desfase_dias, limpio, mascaraDias(n, n - DIAS_RECIENTES, n - 1)),
      contar(fA, fB, h.desfase_dias, limpio, mascaraDias(n, n - 365, n - 1)),
    );
  }
  return m;
}

/** Los días de un lado y del otro de la fecha, como si "después" fuera la causa. */
function antesYDespues(n: number, corte: number): Fuente {
  return {
    universo: mascaraDias(n, corte - VENTANA_CAMBIO, corte + VENTANA_CAMBIO - 1),
    con: mascaraDias(n, corte, corte + VENTANA_CAMBIO - 1),
    hora: () => Number.NaN,
  };
}

function medirCambio(h: Hipotesis, A: Rasgo, B: Rasgo, activo: Uint8Array, n: number, desde: string, semanas: number): Medida {
  const corte = diasEntre(desde, h.fecha_desde!);
  const tiempo = antesYDespues(n, corte);
  // Acá sí cuentan los días antes de la primera vez: que algo empiece a aparecer es justo lo que se está midiendo.
  const destino = (r: Rasgo): Destino => destinoDe(r.modo === 'presente' ? { ...r, universo: activo } : r);
  const direccion = (t: Tabla, s: Sentido) => (s === 'sube' ? fisherMayor(t.a, t.n1, t.a + t.c, t.n1 + t.n0) : fisherMenor(t.a, t.n1, t.a + t.c, t.n1 + t.n0));

  const tE = contar(tiempo, destino(B), 0);
  if (tE.n1 < LADO_MIN || tE.n0 < LADO_MIN) return aMedida(tE, 1, 'pocos_datos');
  const m = aMedida(tE, direccion(tE, h.sentido) * semanas, null);
  const liftOk = h.sentido === 'sube' ? m.lift >= LIFT_MIN : m.lift <= 1 / LIFT_MIN;
  const soporte = h.sentido === 'sube' ? tE.a : tE.c;
  if (!liftOk || soporte < SOPORTE_MIN) m.motivo = 'no_alcanza';

  // La causa tiene que haber cambiado de verdad, para el lado que dijo la IA.
  const tC = contar(tiempo, destino(A), 0);
  m.causa_antes = tC.n0 ? tC.c / tC.n0 : 0;
  m.causa_luego = tC.n1 ? tC.a / tC.n1 : 0;
  if (!m.motivo) {
    if (tC.n1 < LADO_MIN || tC.n0 < LADO_MIN) m.motivo = 'pocos_datos';
    else if (direccion(tC, h.causa_despues) > 0.05) m.motivo = 'la_causa_no_cambio';
  }
  // Y el efecto se tiene que ver también por semana, no solo en una racha de días.
  if (!m.motivo && pSemanas(B.modo === 'presente' ? activo : B.universo, B.esta, corte, n, h.sentido) > 0.1) m.motivo = 'no_se_sostiene';
  return m;
}

/** Por semana: las semanas con el efecto por encima de lo habitual, antes y después de la fecha. */
function pSemanas(universo: Uint8Array, esta: Uint8Array, corte: number, n: number, s: Sentido): number {
  const tasas = (inicio: number, paso: number) => {
    const r: number[] = [];
    for (let w = 0; w < Math.floor(VENTANA_CAMBIO / 7); w++) {
      let dias = 0, con = 0;
      for (let i = 0; i < 7; i++) {
        const d = inicio + paso * (w * 7 + i);
        if (d < 0 || d >= n || !universo[d]) continue;
        dias++;
        con += esta[d];
      }
      if (dias >= 3) r.push(con / dias);
    }
    return r;
  };
  const antes = tasas(corte - 1, -1);
  const despues = tasas(corte, 1);
  const todas = [...antes, ...despues].sort((a, b) => a - b);
  if (!todas.length) return 1;
  const med = todas[todas.length >> 1];
  const a = despues.filter((x) => (s === 'sube' ? x > med : x < med)).length;
  const c = antes.filter((x) => (s === 'sube' ? x > med : x < med)).length;
  return fisherMayor(a, despues.length, a + c, antes.length + despues.length);
}

// ---------- Textos ----------

/** "3 de marzo de 2025": una fecha dicha como se dice. */
export function fechaLarga(f: string, idioma: Idioma = 'es'): string {
  return new Date(`${f}T12:00:00Z`).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** La explicación de lo que pasó: la razón de la IA y los números del motor. */
export function explicarVeredicto(v: Veredicto, nombres: { causa: string; efecto: string; causaTipo: TipoValor; efectoTipo: TipoValor }, idioma: Idioma = 'es'): string {
  const t = (texto: string, vars?: Record<string, string | number>) => traducir(idioma, texto, vars);
  const h = v.hipotesis;
  const causa = nombreRasgo(nombres.causa, nombres.causaTipo, h.causa_modo, idioma);
  const efecto = nombreRasgo(nombres.efecto, nombres.efectoTipo, h.efecto_modo, idioma);
  if (h.tipo === 'cambio') {
    return `${h.razon} ${t('Desde el {fecha}, «{causa}» aparece {sentido_causa} ({antes} → {despues} de los días) y «{efecto}» pasó del {antes_efecto} al {despues_efecto} de los días. Coinciden en el tiempo: no prueba que una cosa cause la otra.', {
      fecha: fechaLarga(h.fecha_desde!, idioma),
      causa,
      sentido_causa: t(h.causa_despues === 'sube' ? 'más seguido' : 'menos seguido'),
      antes: pct(v.causa_antes ?? 0),
      despues: pct(v.causa_luego ?? 0),
      efecto,
      antes_efecto: pct(v.prob_sin),
      despues_efecto: pct(v.prob_con),
    })}`;
  }
  const numeros = describir(
    { desfase_dias: h.desfase_dias, soporte: v.soporte, dias_causa: v.dias_causa, prob_con: v.prob_con, prob_sin: v.prob_sin, protege: h.sentido === 'baja' } as Candidato,
    causa,
    efecto,
    idioma,
  );
  return h.fecha_desde
    ? `${h.razon} ${t('Del {desde} al {hasta}:', { desde: fechaLarga(h.fecha_desde, idioma), hasta: fechaLarga(h.fecha_hasta!, idioma) })} ${numeros}`
    : `${h.razon} ${numeros}`;
}
