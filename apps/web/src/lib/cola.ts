// Anotar sin señal. Lo que se anota con un toque (registros, tomas) y no llega al servidor por falta de conexión queda
// en una cola en el teléfono y se sube solo cuando vuelve la señal (al volver a la app, al recuperar conexión y cada
// minuto). Lo contado con palabras necesita a la IA: se guarda el texto tal cual, con su hora, y cuando hay señal el Día
// avisa para revisarlo. Todo en localStorage, así sobrevive a cerrar la app.

export interface Pendiente {
  metodo: 'POST' | 'PUT' | 'DELETE';
  ruta: string;
  cuerpo?: unknown;
  creado: number;
}

export interface ContadoPendiente {
  id: number;
  persona_id: number;
  texto: string;
  fecha: string;
  /** Cuándo se contó (para que las horas salgan bien aunque se interprete después). */
  momento: string;
}

const COLA = 'patty-cola';
const CONTADOS = 'patty-contados-sin-senal';
export const EVENTO_COLA = 'patty-cola';

/** Lo que se puede guardar para después: anotar, cambiar o borrar un registro, y las tomas de remedios. */
export const sePuedeEncolar = (metodo: string, ruta: string) =>
  metodo !== 'GET' && (/^\/api\/registros(\/varios|\/\d+)?$/.test(ruta) || /^\/api\/tratamientos\/\d+\/tomas(\?|$)/.test(ruta));

function leer<T>(clave: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(clave) || '[]') as T[];
  } catch {
    return [];
  }
}
function escribir(clave: string, l: unknown[]) {
  try {
    localStorage.setItem(clave, JSON.stringify(l));
  } catch {
    /* sin almacenamiento */
  }
  window.dispatchEvent(new Event(EVENTO_COLA));
}

export const pendientes = () => leer<Pendiente>(COLA);
export const encolar = (p: Omit<Pendiente, 'creado'>) => escribir(COLA, [...pendientes(), { ...p, creado: Date.now() }]);

export const contadosPendientes = () => leer<ContadoPendiente>(CONTADOS);
export const guardarContado = (c: Omit<ContadoPendiente, 'id'>) => escribir(CONTADOS, [...contadosPendientes(), { ...c, id: Date.now() }]);
export const sacarContado = (id: number) => escribir(CONTADOS, contadosPendientes().filter((c) => c.id !== id));

/** Una respuesta "como si" se hubiera guardado, para que la pantalla siga (se ve de verdad al subirse). */
export function respuestaProvisoria(ruta: string, cuerpo: unknown): unknown {
  if (ruta === '/api/registros/varios') return ((cuerpo as { registros?: unknown[] })?.registros ?? []).map((r) => ({ ...(r as object), id: -Date.now(), pendiente: true }));
  if (ruta === '/api/registros') return { ...(cuerpo as object), id: -Date.now(), pendiente: true };
  return { ok: true, pendiente: true };
}

let subiendo = false;
/**
 * Sube lo que quedó en la cola, en orden. Se corta si sigue sin haber conexión; lo que el servidor rechaza (por ejemplo,
 * un cambio a algo que ya no existe) se descarta. `enviar` hace el pedido de verdad (lo pasa api.ts).
 */
export async function subirPendientes(enviar: (p: Pendiente) => Promise<Response>): Promise<number> {
  if (subiendo || !pendientes().length) return 0;
  subiendo = true;
  let subidos = 0;
  try {
    for (;;) {
      const [p] = pendientes();
      if (!p) break;
      let r: Response;
      try {
        r = await enviar(p);
      } catch {
        break; // sin señal todavía
      }
      if (r.status >= 500) break;
      if (r.ok) subidos++;
      else console.warn(`Cola: el servidor rechazó ${p.metodo} ${p.ruta} (${r.status}); se descarta.`);
      escribir(COLA, pendientes().slice(1));
    }
  } finally {
    subiendo = false;
  }
  return subidos;
}
