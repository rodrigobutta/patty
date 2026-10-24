// La app nativa manda datos aunque Patty esté cerrada (ubicación en segundo plano) o en lote (uso de apps, llamadas):
// para eso usa la ingesta con el token de una fuente propia «App de Android» o «App de iPhone», que se crea sola la
// primera vez y queda guardada en este teléfono (una por persona).
import { api } from '../api';
import { plataforma } from './nativo';

const CLAVE = 'fuente-app';

interface Guardada { persona: number; token: string }

let pidiendo: { persona: number; token: Promise<string> } | null = null;

/** El token de la fuente de la app; si hay que crearla, dos pedidos al mismo tiempo comparten la misma creación. */
export function tokenDeLaApp(personaId: number): Promise<string> {
  if (pidiendo?.persona !== personaId) {
    const token = buscarOCrear(personaId);
    pidiendo = { persona: personaId, token };
    token.catch(() => (pidiendo = null));
  }
  return pidiendo.token;
}

async function buscarOCrear(personaId: number): Promise<string> {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Guardada | null;
    if (g?.persona === personaId) return g.token;
  } catch {
    /* se crea de nuevo */
  }
  const nombre = plataforma() === 'ios' ? 'App de iPhone' : 'App de Android';
  const f = await api<{ token: string }>('POST', `/api/personas/${personaId}/fuentes`, { tipo: 'telefono', nombre });
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ persona: personaId, token: f.token } satisfies Guardada));
  } catch {
    /* sin almacenamiento: se creará otra la próxima vez */
  }
  return f.token;
}

export const ingestaUrl = (ruta: string) => `${location.origin}/api/ingesta${ruta}`;

/** Manda a la ingesta con el token de la app (la sesión no sirve cuando el teléfono lo hace solo). */
export async function ingesta(personaId: number, ruta: string, cuerpo: unknown): Promise<void> {
  const token = await tokenDeLaApp(personaId);
  const r = await fetch(ingestaUrl(ruta), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  });
  if (r.status === 401) {
    // La fuente se borró o desactivó: la próxima vez se crea otra.
    localStorage.removeItem(CLAVE);
    pidiendo = null;
  }
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error || `Error ${r.status}`);
}
