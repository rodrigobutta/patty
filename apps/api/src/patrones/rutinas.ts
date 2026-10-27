// Rutinas: lo que se viene anotando seguido, para ofrecer anotarlo con un toque ("¿Hoy también café a la mañana?").
// Diarias: la misma cosa en 2 de los últimos 3 días. Semanales: el mismo día de la semana en 2 de las últimas 3 semanas
// ("fútbol los martes"). Lógica pura, para probarla sola; la consulta está en routes/registros.ts.
import { sumarDias } from '../lib/fechas.js';

export interface AnotadoRutina {
  fecha: string;
  concepto_id: number;
  nombre: string;
  categoria_id: number;
  /** Minutos desde las 0 (hora local). */
  minutos: number;
  valor: number | null;
  unidad: string | null;
}

export interface Rutina {
  concepto_id: number;
  nombre: string;
  categoria_id: number;
  tipo: 'diaria' | 'semanal';
  /** La hora de siempre (HH:MM): la mediana de las veces que se anotó. */
  hora: string;
  valor: number | null;
  unidad: string | null;
  /** En cuántos de los días mirados apareció. */
  veces: number;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const mediana = (l: number[]) => {
  const o = [...l].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

/** Las rutinas para `hoy`, sin las que ya se anotaron hoy. */
export function rutinasDe(anotado: AnotadoRutina[], hoy: string): Rutina[] {
  const porConcepto = new Map<number, AnotadoRutina[]>();
  for (const a of anotado) porConcepto.set(a.concepto_id, [...(porConcepto.get(a.concepto_id) ?? []), a]);
  const diarios = [1, 2, 3].map((n) => sumarDias(hoy, -n));
  const semanales = [7, 14, 21].map((n) => sumarDias(hoy, -n));
  const r: Rutina[] = [];
  for (const [id, l] of porConcepto) {
    if (l.some((a) => a.fecha === hoy)) continue;
    const ultimo = [...l].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const armar = (tipo: Rutina['tipo'], dias: string[]): Rutina | null => {
      const de = l.filter((a) => dias.includes(a.fecha));
      const veces = new Set(de.map((a) => a.fecha)).size;
      if (veces < 2) return null;
      return { concepto_id: id, nombre: ultimo.nombre, categoria_id: ultimo.categoria_id, tipo, hora: hhmm(mediana(de.map((a) => a.minutos))), valor: ultimo.valor, unidad: ultimo.unidad, veces };
    };
    // Si es diaria, no hace falta decir que además es semanal.
    const x = armar('diaria', diarios) ?? armar('semanal', semanales);
    if (x) r.push(x);
  }
  return r.sort((a, b) => a.hora.localeCompare(b.hora));
}
