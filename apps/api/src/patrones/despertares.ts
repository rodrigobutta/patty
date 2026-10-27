// Despertares que se repiten: si varias noches uno se despierta a la misma hora (cerca de las 4, por ejemplo), Patty
// pregunta por qué (un tren que pasa, el perro, el baño…). Lógica pura, para probarla; la consulta está en routes/sueno.ts.

export interface EtapaNoche {
  noche: string;
  /** Minutos desde las 0 (hora local) del comienzo del tramo; los de la madrugada siguen después de las 24. */
  desde: number;
  minutos: number;
  etapa: string;
}

export interface DespertarRepetido {
  /** La hora de siempre (HH:MM). */
  hora: string;
  /** En cuántas de las noches miradas pasó. */
  noches: number;
  miradas: number;
}

/** Un despertar cuenta si dura al menos esto y hay sueño antes y después (no es acostarse ni levantarse). */
const MIN_DESPIERTO = 5;
/** Dos despertares son "a la misma hora" si están a menos de esto. */
const VENTANA = 30;
/** Cuántas noches tienen que repetirlo. */
const MIN_NOCHES = 3;

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

export function despertarRepetido(etapas: EtapaNoche[]): DespertarRepetido | null {
  const porNoche = new Map<string, EtapaNoche[]>();
  for (const e of etapas) porNoche.set(e.noche, [...(porNoche.get(e.noche) ?? []), e]);
  // Los despertares de cada noche (la hora de comienzo).
  const despertares: Array<{ noche: string; m: number }> = [];
  for (const [noche, l] of porNoche) {
    const orden = [...l].sort((a, b) => a.desde - b.desde);
    const dormido = (e: EtapaNoche) => e.etapa !== 'despierto';
    for (const [i, e] of orden.entries()) {
      if (e.etapa !== 'despierto' || e.minutos < MIN_DESPIERTO) continue;
      if (orden.slice(0, i).some(dormido) && orden.slice(i + 1).some(dormido)) despertares.push({ noche, m: e.desde });
    }
  }
  let mejor: { m: number; noches: Set<string> } | null = null;
  for (const d of despertares) {
    const cerca = despertares.filter((x) => Math.abs(x.m - d.m) <= VENTANA);
    const noches = new Set(cerca.map((x) => x.noche));
    if (!mejor || noches.size > mejor.noches.size) {
      const ms = cerca.map((x) => x.m).sort((a, b) => a - b);
      mejor = { m: ms[Math.floor(ms.length / 2)], noches };
    }
  }
  if (!mejor || mejor.noches.size < MIN_NOCHES) return null;
  return { hora: hhmm(mejor.m), noches: mejor.noches.size, miradas: porNoche.size };
}
