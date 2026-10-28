// Las preguntas que la persona configuró para lo que anota ("Café" → "¿Con qué?"): se traen una vez por persona y se
// buscan por nombre (sin tildes ni mayúsculas).
import { useEffect, useState } from 'react';
import { normalizar, type Detalle, type PreguntaConcepto } from 'shared';
import { api } from '../api';

const cache = new Map<number, PreguntaConcepto[]>();
const EVENTO = 'patty-preguntas';

export async function traerPreguntas(personaId: number): Promise<PreguntaConcepto[]> {
  const l = await api<PreguntaConcepto[]>('GET', `/api/preguntas-concepto?persona=${personaId}`);
  cache.set(personaId, l);
  window.dispatchEvent(new Event(EVENTO));
  return l;
}

/** Las preguntas activas de una cosa (vacío si no tiene). */
export function usePreguntas(personaId: number, concepto: string | null | undefined): PreguntaConcepto[] {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener(EVENTO, f);
    if (!cache.has(personaId)) void traerPreguntas(personaId).catch(() => {});
    return () => window.removeEventListener(EVENTO, f);
  }, [personaId]);
  if (!concepto) return [];
  const n = normalizar(concepto);
  return (cache.get(personaId) ?? []).filter((q) => q.activa && normalizar(q.concepto) === n);
}

/** Las respuestas tocadas, como detalles para guardar (solo las preguntas con alguna respuesta). */
export const comoDetalles = (preguntas: PreguntaConcepto[], elegidas: Record<number, string[]>): Detalle[] =>
  preguntas.map((q) => ({ pregunta: q.pregunta, respuestas: elegidas[q.id] ?? [] })).filter((d) => d.respuestas.length);

/** Tocar una respuesta: si la pregunta admite varias, se suma o se saca; si no, reemplaza. */
export function tocarRespuesta(elegidas: Record<number, string[]>, q: PreguntaConcepto, o: string): Record<number, string[]> {
  const ya = elegidas[q.id] ?? [];
  const sigue = ya.includes(o) ? ya.filter((x) => x !== o) : q.varias ? [...ya, o] : [o];
  return { ...elegidas, [q.id]: sigue };
}

/** Las preguntas activas de una cosa, de lo ya traído (sin esperar). */
export const preguntasYa = (personaId: number, concepto: string): PreguntaConcepto[] =>
  (cache.get(personaId) ?? []).filter((q) => q.activa && normalizar(q.concepto) === normalizar(concepto));
