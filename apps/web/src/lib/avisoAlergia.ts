// Lo que el servidor avisa cuando lo anotado choca con una alergia declarada (`avisos_alergia` en la respuesta): lo mira
// api.ts en todo lo que se anota, así vale para cualquier pantalla, y lo muestra ui/AvisoAlergia.tsx.
import type { AvisoAlergia } from 'shared';

const EVENTO = 'patty-aviso-alergia';

/** Los avisos que trae una respuesta: un registro o remedio solo, o una lista de registros. */
export function avisosEn(datos: unknown): AvisoAlergia[] {
  const lista: unknown[] = Array.isArray(datos) ? datos : [datos];
  return lista.flatMap((x) => (x as { avisos_alergia?: AvisoAlergia[] } | null)?.avisos_alergia ?? []);
}

export function notarAvisosDeAlergia(datos: unknown): void {
  const avisos = avisosEn(datos);
  if (avisos.length) window.dispatchEvent(new CustomEvent<AvisoAlergia[]>(EVENTO, { detail: avisos }));
}

export function escucharAvisosDeAlergia(f: (avisos: AvisoAlergia[]) => void): () => void {
  const oir = (e: Event) => f((e as CustomEvent<AvisoAlergia[]>).detail);
  window.addEventListener(EVENTO, oir);
  return () => window.removeEventListener(EVENTO, oir);
}
