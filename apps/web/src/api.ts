// Cliente de la API. En la web la sesión va en una cookie; en la app empaquetada (VITE_API_URL apunta a otro dominio)
// se guarda el token y se manda como "Authorization: Bearer".
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

export async function api<T = unknown>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', ruta: string, cuerpo?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  const token = CON_TOKEN ? leerToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await fetch(API_BASE + ruta, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: CON_TOKEN ? 'omit' : 'same-origin',
    });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor.', 0);
  }
  const datos = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !ruta.startsWith('/api/entrar')) alPerderSesion();
    throw new ErrorApi((datos as { error?: string } | null)?.error || `Error ${r.status}`, r.status);
  }
  return datos as T;
}
