// Las competencias entre personas: qué se puede medir y cómo se cuenta. Solo hábitos, y con un tope por día: nunca peso,
// comer menos ni ayuno, y dormir o caminar de más no da ventaja. Lo que ven los demás es un número y el apodo: lo que
// dice `queVen` es exactamente lo que se muestra antes de aceptar. Acá no se importa de index.ts (lo exporta él: sería
// circular).

export const METRICAS_COMPETENCIA = ['pasos', 'racha', 'dias', 'sueno', 'km'] as const;
export type MetricaCompetencia = (typeof METRICAS_COMPETENCIA)[number];
export const esMetricaCompetencia = (x: unknown): x is MetricaCompetencia => METRICAS_COMPETENCIA.includes(x as MetricaCompetencia);

export const DURACIONES_COMPETENCIA = { semana: 7, mes: 30 } as const;
export type DuracionCompetencia = keyof typeof DURACIONES_COMPETENCIA;
export const esDuracionCompetencia = (x: unknown): x is DuracionCompetencia => x === 'semana' || x === 'mes';

export interface DefinicionMetrica {
  nombre: string;
  icono: string;
  /** Lo que va al lado del número ("pasos", "h"). */
  unidad: string;
  /** Lo máximo que cuenta un día (pasar de esto no suma); null si la métrica ya no puede pasarse. */
  tope: number | null;
  decimales: number;
  /** El concepto de `mediciones` del que sale, si sale de ahí. */
  concepto?: string;
  /** Lo único que ven los demás, en palabras: se muestra tal cual antes de aceptar. */
  queVen: string;
  /** Cómo se cuenta, en la pantalla de crearla y en la tabla. */
  comoCuenta: string;
}

export const METRICAS: Record<MetricaCompetencia, DefinicionMetrica> = {
  pasos: {
    nombre: 'Pasos',
    icono: '👟',
    unidad: 'pasos',
    tope: 15000,
    decimales: 0,
    concepto: 'Pasos',
    queVen: 'cuántos pasos sumaste durante la competencia',
    comoCuenta: 'Cuenta hasta 15.000 pasos por día: más que eso no da ventaja.',
  },
  racha: {
    nombre: 'Racha',
    icono: '🔥',
    unidad: 'días',
    tope: null,
    decimales: 0,
    queVen: 'tu mejor racha de días seguidos durante la competencia (solo la cantidad de días)',
    comoCuenta: 'Tu mejor racha de días seguidos anotando, mientras dura la competencia.',
  },
  dias: {
    nombre: 'Días anotados',
    icono: '📝',
    unidad: 'días',
    tope: null,
    decimales: 0,
    queVen: 'cuántos días anotaste algo durante la competencia (la cantidad, no qué anotaste)',
    comoCuenta: 'Cada día con algo anotado cuenta uno, anotes lo que anotes.',
  },
  sueno: {
    nombre: 'Horas de sueño',
    icono: '😴',
    unidad: 'h',
    tope: 8,
    decimales: 1,
    queVen: 'cuántas horas dormiste en total durante la competencia',
    comoCuenta: 'Cuenta hasta 8 horas por noche: dormir de más no da ventaja.',
  },
  km: {
    nombre: 'Km a pie',
    icono: '🚶',
    unidad: 'km',
    tope: 12,
    decimales: 1,
    concepto: 'Km a pie',
    queVen: 'cuántos km hiciste a pie en total durante la competencia (sin mapas ni por dónde fuiste)',
    comoCuenta: 'Cuenta hasta 12 km por día: más que eso no da ventaja.',
  },
};

/** Lo que los demás nunca ven: se muestra antes de aceptar. */
export const NUNCA_SE_COMPARTE = 'Nunca ven tu ánimo, dolores, síntomas, remedios, comidas, peso, ubicación ni mapas.';

/** El nombre es libre, pero no puede convertirla en otra cosa: nada de peso, comer menos ni ayuno. */
const NOMBRE_PROHIBIDO = /\b(peso\w*|kilos?|adelgaz\w*|dietas?|ayun\w*|calorias?|comer|weight|diets?|fasting|calories?)\b/;
export function nombreCompetenciaPermitido(nombre: string): boolean {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return !NOMBRE_PROHIBIDO.test(limpio);
}

const redondear = (n: number, decimales: number) => {
  const k = 10 ** decimales;
  return Math.round(n * k) / k;
};

/** El total de los días con dato, cada uno hasta el tope. Sin ningún dato es null ("sin dato"), no cero. */
export function totalConTope(metrica: MetricaCompetencia, valores: number[]): number | null {
  if (!valores.length) return null;
  const { tope, decimales } = METRICAS[metrica];
  return redondear(valores.reduce((a, v) => a + (tope === null ? v : Math.min(v, tope)), 0), decimales);
}

/** La mejor racha del período: días seguidos con al menos `minimo` puntos. Sin nada anotado en todo el período, null. */
export function mejorRacha(puntos: number[], minimo: number): number | null {
  if (!puntos.some((p) => p > 0)) return null;
  let mejor = 0;
  let actual = 0;
  for (const p of puntos) {
    actual = p >= minimo ? actual + 1 : 0;
    mejor = Math.max(mejor, actual);
  }
  return mejor;
}

/** Ordena de mayor a menor: los empatados comparten puesto, y quien no tiene dato va al final, sin puesto. */
export function conPosiciones<T extends { valor: number | null; apodo: string }>(filas: T[]): Array<T & { posicion: number | null }> {
  const orden = [...filas].sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1) || a.apodo.localeCompare(b.apodo));
  let puesto = 0;
  return orden.map((f, i) => {
    if (f.valor === null) return { ...f, posicion: null };
    if (i === 0 || orden[i - 1].valor !== f.valor) puesto = i + 1;
    return { ...f, posicion: puesto };
  });
}
