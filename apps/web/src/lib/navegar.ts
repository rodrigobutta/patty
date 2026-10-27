// Ir a una sección de Más desde otra pantalla (por ejemplo, de la tarjeta de remedios del Día a configurarlos). Queda
// pendiente hasta que Más la toma, por si todavía no está abierta.
const EVENTO = 'patty-ir-a-mas';
let pendiente: string | null = null;

export function irAMas(seccion: string): void {
  pendiente = seccion;
  window.dispatchEvent(new Event(EVENTO));
}
/** La sección pedida, sin olvidarla (para el estado inicial: React puede armarlo dos veces). */
export const verSeccionPedida = (): string | null => pendiente;
/** Para Más: la sección pedida (una sola vez). */
export function tomarSeccionPedida(): string | null {
  const s = pendiente;
  pendiente = null;
  return s;
}
export function alPedirIrAMas(f: () => void): () => void {
  window.addEventListener(EVENTO, f);
  return () => window.removeEventListener(EVENTO, f);
}
