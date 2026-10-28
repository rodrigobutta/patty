// Los errores de la app que no se esperaban (un fallo de código, no "no hay conexión"): se mandan al servidor para
// verlos en el admin (Salud). Como mucho 10 por sesión, y sin repetir el mismo.
import { API_BASE } from '../api';
import { VERSION } from './version';

const vistos = new Set<string>();
let mandados = 0;
/** Ruido conocido del navegador, o lo que ya se avisa en pantalla (sin conexión). */
const IGNORAR = [/ResizeObserver loop/i, /No hay conexión/i, /Failed to fetch/i, /Load failed/i, /NetworkError/i, /AbortError/i];

export function reportarError(mensaje: string, detalle?: string, donde?: string): void {
  if (!mensaje || IGNORAR.some((r) => r.test(mensaje)) || vistos.has(mensaje) || mandados >= 10) return;
  vistos.add(mensaje);
  mandados++;
  void fetch(API_BASE + '/api/errores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: API_BASE ? 'omit' : 'same-origin',
    body: JSON.stringify({ mensaje: mensaje.slice(0, 500), detalle: detalle?.slice(0, 4000), donde: donde ?? location.hash ?? '', version: VERSION }),
  }).catch(() => {});
}

export function escucharErrores(): void {
  window.addEventListener('error', (e) => reportarError(e.message, e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    reportarError(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
  });
}
