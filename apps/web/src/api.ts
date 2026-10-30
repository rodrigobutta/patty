// Cliente de la API. En la web la sesión va en una cookie; en la app empaquetada (VITE_API_URL apunta a otro dominio)
// se guarda el token y se manda como "Authorization: Bearer". Cada pedido dice el idioma (X-Idioma): el servidor
// contesta los errores y los textos que arma (resúmenes, avisos) en ese idioma.
import { encolar, respuestaProvisoria, sePuedeEncolar, subirPendientes } from './lib/cola';
import { guardar } from './lib/guardado';
import { idioma, t } from './lib/idioma';
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');
const CON_TOKEN = API_BASE !== '';

let alPerderSesion = () => {};
export const cuandoSePierdaLaSesion = (f: () => void) => {
  alPerderSesion = f;
};

const leerToken = () => {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
};

export function guardarToken(t: string | null): void {
  if (!CON_TOKEN) return;
  try {
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
  } catch {
    /* sin almacenamiento: habrá que volver a entrar */
  }
}

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
  ) {
    super(mensaje);
  }
}

function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'X-Idioma': idioma() };
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  const token = CON_TOKEN ? leerToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(API_BASE + ruta, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    credentials: CON_TOKEN ? 'omit' : 'same-origin',
  });
}

/** Sube lo que se anotó sin señal (ver lib/cola.ts). Devuelve cuántas cosas subió. */
export const subirLoPendiente = () => subirPendientes((p) => pedir(p.metodo, p.ruta, p.cuerpo));

export async function api<T = unknown>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await pedir(metodo, ruta, cuerpo);
  } catch {
    // Sin señal: lo que se anota con un toque queda guardado en el teléfono y se sube después.
    if (sePuedeEncolar(metodo, ruta)) {
      encolar({ metodo: metodo as Exclude<typeof metodo, 'GET'>, ruta, cuerpo });
      return respuestaProvisoria(ruta, cuerpo) as T;
    }
    throw new ErrorApi(t('No hay conexión con el servidor.'), 0);
  }
  const datos = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !ruta.startsWith('/api/entrar')) alPerderSesion();
    throw new ErrorApi((datos as { error?: string } | null)?.error || `Error ${r.status}`, r.status);
  }
  // Las lecturas quedan guardadas para mostrarlas enseguida la próxima vez (ver lib/guardado).
  if (metodo === 'GET' && !ruta.startsWith('/api/sesion')) guardar(ruta, datos);
  return datos as T;
}
