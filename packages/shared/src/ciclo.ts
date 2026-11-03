// ---------- Ciclo menstrual ----------
// La fuente de verdad son los registros: cada día de menstruación es un registro de «Menstruación» (con el flujo como
// intensidad) y el fin confirmado de un período es un registro de «Fin de la menstruación» en su último día. Lo demás
// (ovulación, días fértiles, premenstruales, la próxima) se calcula acá y es siempre estimado.

/** El concepto con el que se anota cada día de menstruación (con la intensidad del flujo). */
export const MENSTRUACION = 'Menstruación';
/** El concepto que confirma el último día de un período ("ya se me fue", "terminó el jueves"). */
export const FIN_MENSTRUACION = 'Fin de la menstruación';
/** Cuánto flujo hubo: se guarda como intensidad. */
export const FLUJO = [
  { nombre: 'Manchado', intensidad: 2 },
  { nombre: 'Poco', intensidad: 4 },
  { nombre: 'Normal', intensidad: 6 },
  { nombre: 'Mucho', intensidad: 9 },
];
/** Síntomas típicos del ciclo, para anotar con un toque (van a «Dolores y molestias»). */
export const SINTOMAS_CICLO = ['Cólicos', 'Hinchazón', 'Sensibilidad en los pechos', 'Antojos', 'Acné', 'Cambios de humor', 'Dolor de cabeza', 'Cansancio'];

export type FaseCiclo = 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea';
export const FASES_CICLO: Record<FaseCiclo, { nombre: string; concepto: string }> = {
  menstrual: { nombre: 'menstrual', concepto: 'Fase menstrual' },
  folicular: { nombre: 'folicular', concepto: 'Fase folicular' },
  ovulatoria: { nombre: 'ovulatoria', concepto: 'Fase ovulatoria' },
  lutea: { nombre: 'lútea', concepto: 'Fase lútea' },
};
/** Los 5 días antes de que venga: aparte de la fase lútea, porque es cuando más síntomas suele haber. */
export const PREMENSTRUAL = 'Días premenstruales';

/** Los valores típicos, cuando todavía no hay ciclos propios para promediar. */
export const CICLO_TIPICO = 28;
export const PERIODO_TIPICO = 5;
/** Después de un "todavía no", cuántos días se corre la próxima (y hasta cuándo no se vuelve a preguntar). */
export const ESPERA_TODAVIA_NO = 2;

const diaMs = 86400000;
const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const deFecha = (f: string) => Date.parse(f + 'T00:00:00Z');
const entre = (a: string, b: string) => Math.round((deFecha(b) - deFecha(a)) / diaMs);
const masDias = (f: string, n: number) => aFecha(deFecha(f) + n * diaMs);
const mayor = (a: string, b: string) => (a > b ? a : b);
const promedio = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface Periodo {
  inicio: string;
  fin: string;
  dias: number;
  /** Si el último día está confirmado (con «Fin de la menstruación»). */
  terminado: boolean;
}

/**
 * Junta los días anotados de menstruación en períodos (un hueco de hasta 2 días es el mismo período). Un fin
 * confirmado (`fines`) cierra el período que empezó hasta 14 días antes, y lo estira hasta ese día si hacía falta:
 * "me vino el 3 y se me fue el 7" son 5 días aunque no se haya anotado cada uno.
 */
export function periodosDe(fechas: string[], fines: string[] = []): Periodo[] {
  const dias = [...new Set(fechas)].sort();
  const r: Periodo[] = [];
  for (const f of dias) {
    const ultimo = r.at(-1);
    if (ultimo && entre(ultimo.fin, f) <= 3) {
      ultimo.fin = f;
      ultimo.dias = entre(ultimo.inicio, f) + 1;
    } else r.push({ inicio: f, fin: f, dias: 1, terminado: false });
  }
  for (const f of [...new Set(fines)].sort()) {
    let i = r.length - 1;
    while (i >= 0 && r[i].inicio > f) i--;
    const p = r[i];
    if (!p || entre(p.inicio, f) > 14 || (r[i + 1] && f >= r[i + 1].inicio)) continue;
    if (f > p.fin) {
      p.fin = f;
      p.dias = entre(p.inicio, f) + 1;
    }
    p.terminado = true;
  }
  return r;
}

/** Lo que contestó a las preguntas del ciclo: "todavía no me vino", "todavía sigo", o que no le pregunte más esta vez. */
export type TipoRespuestaCiclo = 'todavia_no' | 'sigue' | 'descartar_inicio' | 'descartar_fin';
export const TIPOS_RESPUESTA_CICLO: TipoRespuestaCiclo[] = ['todavia_no', 'sigue', 'descartar_inicio', 'descartar_fin'];
export interface RespuestaCiclo {
  tipo: TipoRespuestaCiclo;
  /** El primer día del último período cuando contestó: la respuesta vale para ese ciclo. */
  referencia: string;
  /** El día (de Patty) en que contestó. */
  fecha: string;
}

/** Lo que conviene preguntarle hoy: si le vino (llegó la fecha estimada) o si ya terminó el período. */
export type PreguntaCiclo = { tipo: 'inicio'; estimada: string } | { tipo: 'fin'; inicio: string; ultimo: string };

/** Lo que, si pasa, conviene comentarle a su médica o médico (sin alarmar). */
export type ConsultaCiclo = 'irregular' | 'cortos' | 'largos' | 'atraso' | 'periodo_largo';

export interface ResumenCiclo {
  /** El día de Patty (de 5 a 5) con el que se calculó. */
  hoy: string;
  periodos: Periodo[];
  /** Duración promedio del ciclo (de un inicio al siguiente) y del sangrado, en días. */
  duracion_ciclo: number;
  duracion_periodo: number;
  /** Cuántos ciclos completos se usaron para el promedio (sin ninguno, se usa 28 de referencia). */
  ciclos: number;
  /** Si las duraciones son las típicas (28 y 5) porque todavía no hay datos propios. */
  tipico_ciclo: boolean;
  tipico_periodo: boolean;
  /** El más corto y el más largo de los últimos ciclos. */
  ciclo_min: number | null;
  ciclo_max: number | null;
  /** Si los ciclos varían poco (menos de 7 días entre el más corto y el más largo). */
  regular: boolean | null;
  /** Hoy: día del ciclo (1 = primer día de menstruación), fase y si está menstruando. */
  dia: number | null;
  fase: FaseCiclo | null;
  en_periodo: boolean;
  /** Lo estimado: próxima menstruación (corrida si dijo "todavía no"), ovulación y ventana fértil del ciclo actual. */
  proxima: string | null;
  /** La próxima según el promedio, sin correrla. */
  proxima_calculada: string | null;
  ovulacion: string | null;
  fertil_desde: string | null;
  fertil_hasta: string | null;
  /** Días que faltan para la próxima (negativo: viene con atraso). */
  faltan: number | null;
  /** Días después de la fecha calculada sin que haya venido (0 si no está atrasada). */
  atraso: number | null;
  pregunta: PreguntaCiclo | null;
  consultar: ConsultaCiclo[];
  /** Los últimos períodos: cuánto duró el ciclo que empezó ahí (null si es el actual) y el sangrado (null si no se sabe). */
  historial: Array<{ inicio: string; ciclo: number | null; periodo: number | null }>;
}

/** La fase de un día dentro de un ciclo de `largo` días (la ovulación, ~14 días antes del próximo). */
export function faseDe(dia: number, largo: number, diasPeriodo: number): FaseCiclo {
  const ovulacion = largo - 14;
  if (dia <= diasPeriodo) return 'menstrual';
  if (Math.abs(dia - ovulacion) <= 1) return 'ovulatoria';
  return dia < ovulacion ? 'folicular' : 'lutea';
}

const cicloValido = (n: number) => n >= 15 && n <= 60;

/**
 * Lo que se puede calcular del ciclo con los días de menstruación anotados, hasta `hoy` (el día de Patty, de 5 a 5):
 * los fines confirmados cierran períodos y las respuestas ("todavía no") corren la próxima y evitan volver a preguntar.
 */
export function resumenCiclo(fechas: string[], hoy: string, opciones: { fines?: string[]; respuestas?: RespuestaCiclo[] } = {}): ResumenCiclo {
  const periodos = periodosDe(
    fechas.filter((f) => f <= hoy),
    (opciones.fines ?? []).filter((f) => f <= hoy),
  );
  const respuestas = opciones.respuestas ?? [];
  const todos = periodos.slice(1).map((p, i) => entre(periodos[i].inicio, p.inicio));
  const largos = todos.filter(cicloValido).slice(-6);
  const duracion_ciclo = largos.length ? Math.round(promedio(largos)) : CICLO_TIPICO;
  // Un período se sabe cuánto duró si se confirmó el fin, o si tiene más de un día anotado y ya pasó.
  const conocido = (p: Periodo, i: number) => p.terminado || (p.dias > 1 && (i < periodos.length - 1 || entre(p.fin, hoy) >= 2));
  const duraciones = periodos.filter(conocido).slice(-6).map((p) => p.dias);
  const duracion_periodo = duraciones.length ? Math.max(1, Math.round(promedio(duraciones))) : PERIODO_TIPICO;
  const historial = periodos.slice(-12).map((p) => {
    const i = periodos.indexOf(p);
    return { inicio: p.inicio, ciclo: i < todos.length ? todos[i] : null, periodo: conocido(p, i) ? p.dias : null };
  });
  const ultimo = periodos.at(-1);
  const base: ResumenCiclo = {
    hoy,
    periodos,
    duracion_ciclo,
    duracion_periodo,
    ciclos: largos.length,
    tipico_ciclo: !largos.length,
    tipico_periodo: !duraciones.length,
    ciclo_min: largos.length ? Math.min(...largos) : null,
    ciclo_max: largos.length ? Math.max(...largos) : null,
    regular: largos.length >= 2 ? Math.max(...largos) - Math.min(...largos) < 7 : null,
    dia: null,
    fase: null,
    en_periodo: false,
    proxima: null,
    proxima_calculada: null,
    ovulacion: null,
    fertil_desde: null,
    fertil_hasta: null,
    faltan: null,
    atraso: null,
    pregunta: null,
    consultar: [],
    historial,
  };
  if (!ultimo) return base;
  const dia = entre(ultimo.inicio, hoy) + 1;
  const en_periodo = ultimo.terminado ? hoy <= ultimo.fin : dia <= 10 && (entre(ultimo.fin, hoy) <= 1 || dia <= duracion_periodo);
  const proxima_calculada = masDias(ultimo.inicio, duracion_ciclo);
  const deEste = respuestas.filter((r) => r.referencia === ultimo.inicio);
  const ultima = (tipo: TipoRespuestaCiclo) => deEste.filter((r) => r.tipo === tipo).map((r) => r.fecha).sort().at(-1) ?? null;
  const todaviaNo = ultima('todavia_no');
  const proxima = todaviaNo ? mayor(proxima_calculada, masDias(todaviaNo, ESPERA_TODAVIA_NO)) : proxima_calculada;
  const ovulacion = masDias(proxima_calculada, -14);
  const atraso = Math.max(0, entre(proxima_calculada, hoy));

  let pregunta: PreguntaCiclo | null = null;
  const sigue = ultima('sigue');
  if (
    !ultimo.terminado &&
    !ultima('descartar_fin') &&
    dia >= 3 &&
    dia <= 15 &&
    ultimo.fin < hoy &&
    (dia >= duracion_periodo || entre(ultimo.fin, hoy) >= 2) &&
    !(sigue && entre(sigue, hoy) < ESPERA_TODAVIA_NO)
  ) {
    pregunta = { tipo: 'fin', inicio: ultimo.inicio, ultimo: ultimo.fin };
  } else if (!en_periodo && hoy >= proxima && atraso <= 45 && !ultima('descartar_inicio')) {
    pregunta = { tipo: 'inicio', estimada: proxima_calculada };
  }

  const recientes = todos.slice(-6);
  const consultar: ConsultaCiclo[] = [];
  if (largos.length >= 3 && Math.max(...largos) - Math.min(...largos) >= 10) consultar.push('irregular');
  if (recientes.filter((n) => n < 21).length >= 2) consultar.push('cortos');
  if (recientes.filter((n) => n > 35).length >= 2) consultar.push('largos');
  if (!en_periodo && atraso >= 14) consultar.push('atraso');
  if (duraciones.length >= 2 && duracion_periodo >= 8) consultar.push('periodo_largo');

  return {
    ...base,
    dia,
    fase: en_periodo ? 'menstrual' : faseDe(dia, duracion_ciclo, ultimo.dias),
    en_periodo,
    proxima,
    proxima_calculada,
    ovulacion,
    fertil_desde: masDias(ovulacion, -5),
    fertil_hasta: masDias(ovulacion, 1),
    faltan: entre(hoy, proxima),
    atraso: en_periodo ? 0 : atraso,
    pregunta,
    consultar,
  };
}

/** Cómo se ve un día en el calendario del ciclo. Lo único confirmado es el período anotado; lo demás es estimado. */
export interface DiaCiclo {
  fecha: string;
  /** confirmado: anotado (o dentro de un período con fin confirmado); estimado: lo que se espera. */
  periodo: 'confirmado' | 'estimado' | null;
  /** Primer día de un período anotado. */
  inicio: boolean;
  /** Último día confirmado de un período. */
  fin: boolean;
  /** Primer día estimado de una próxima menstruación. */
  proxima: boolean;
  fertil: boolean;
  ovulacion: boolean;
  premenstrual: boolean;
}

/**
 * El ciclo pintado día por día entre `desde` y `hasta`: los períodos anotados, lo que falta del actual, las próximas
 * (con el promedio, la primera corrida si dijo "todavía no", y nunca antes de hoy), y, para cada ciclo (también los
 * pasados), la ovulación, la ventana fértil y los días premenstruales estimados.
 */
export function diasDelCiclo(r: ResumenCiclo, desde: string, hasta: string): DiaCiclo[] {
  const mapa = new Map<string, DiaCiclo>();
  const dia = (f: string) => {
    let d = mapa.get(f);
    if (!d) {
      d = { fecha: f, periodo: null, inicio: false, fin: false, proxima: false, fertil: false, ovulacion: false, premenstrual: false };
      mapa.set(f, d);
    }
    return d;
  };
  const enRango = (f: string) => f >= desde && f <= hasta;
  const ultimo = r.periodos.at(-1);
  if (!ultimo) return [];
  for (const p of r.periodos) {
    for (let f = p.inicio; f <= p.fin; f = masDias(f, 1)) if (enRango(f)) dia(f).periodo = 'confirmado';
    if (enRango(p.inicio)) dia(p.inicio).inicio = true;
    if (p.terminado && enRango(p.fin)) dia(p.fin).fin = true;
  }
  const estimar = (f: string) => {
    if (enRango(f) && dia(f).periodo !== 'confirmado') dia(f).periodo = 'estimado';
  };
  // Lo que falta del período actual, si no se confirmó el fin.
  if (!ultimo.terminado) for (let k = ultimo.dias; k < r.duracion_periodo; k++) estimar(masDias(ultimo.inicio, k));
  // Las próximas: si está atrasada, la estimada no queda en el pasado.
  const inicios = r.periodos.map((p) => p.inicio);
  const futuros: string[] = [];
  if (r.proxima) {
    let f = r.en_periodo ? r.proxima : mayor(r.proxima, r.hoy);
    for (let k = 0; k < 24 && f <= masDias(hasta, r.duracion_ciclo); k++, f = masDias(f, r.duracion_ciclo)) futuros.push(f);
  }
  for (const f of futuros) {
    if (enRango(f)) dia(f).proxima = true;
    for (let k = 0; k < r.duracion_periodo; k++) estimar(masDias(f, k));
  }
  // Cada ciclo (de un inicio al siguiente): ovulación ~14 días antes del siguiente, los 5 anteriores y el posterior
  // fértiles, y los 5 antes de que venga, premenstruales.
  const todos = [...inicios, ...futuros];
  for (let i = 0; i + 1 < todos.length; i++) {
    const siguiente = todos[i + 1];
    if (!cicloValido(entre(todos[i], siguiente))) continue;
    const ovulacion = masDias(siguiente, -14);
    if (enRango(ovulacion)) dia(ovulacion).ovulacion = true;
    for (let k = -5; k <= 1; k++) if (enRango(masDias(ovulacion, k))) dia(masDias(ovulacion, k)).fertil = true;
    for (let k = 1; k <= 5; k++) if (enRango(masDias(siguiente, -k))) dia(masDias(siguiente, -k)).premenstrual = true;
  }
  return [...mapa.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/**
 * Para los patrones: la fase de cada día del pasado según los períodos anotados (y si es premenstrual). Solo entre dos
 * menstruaciones conocidas, o después de la última hasta su largo promedio.
 */
export function fasesPorDia(fechas: string[], desde: string, hasta: string, fines: string[] = []): Map<string, { fase: FaseCiclo; premenstrual: boolean }> {
  const r = new Map<string, { fase: FaseCiclo; premenstrual: boolean }>();
  const periodos = periodosDe(fechas, fines);
  if (periodos.length < 2) return r;
  const { duracion_ciclo } = resumenCiclo(fechas, hasta, { fines });
  periodos.forEach((p, i) => {
    const siguiente = periodos[i + 1]?.inicio ?? masDias(p.inicio, duracion_ciclo);
    const largo = entre(p.inicio, siguiente);
    if (largo < 15 || largo > 60) return;
    for (let k = 0; k < largo; k++) {
      const f = masDias(p.inicio, k);
      if (f < desde || f > hasta) continue;
      r.set(f, { fase: faseDe(k + 1, largo, p.dias), premenstrual: largo - k <= 5 });
    }
  });
  return r;
}
