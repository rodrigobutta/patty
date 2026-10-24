// La app nativa manda datos aunque Patty esté cerrada (ubicación en segundo plano) o en lote (uso de apps, llamadas):
// para eso usa la ingesta con el token de una fuente propia «App de Android» o «App de iPhone», que se crea sola la
// primera vez y queda guardada en este teléfono (una por persona). Lo que viene del reloj (Health Connect o Salud) va
// en otra fuente, «Reloj y salud», para que en el Día y en los patrones no se mezcle con el uso del teléfono.
import { api } from '../api';
import { plataforma } from './nativo';

export type FuenteDeLaApp = 'app' | 'salud';

const FUENTES: Record<FuenteDeLaApp, { clave: string; tipo: string; nombre: () => string }> = {
  app: { clave: 'fuente-app', tipo: 'telefono', nombre: () => (plataforma() === 'ios' ? 'App de iPhone' : 'App de Android') },
  salud: { clave: 'fuente-salud', tipo: 'reloj', nombre: () => 'Reloj y salud' },
};

interface Guardada { persona: number; token: string }

const pidiendo: Partial<Record<FuenteDeLaApp, { persona: number; token: Promise<string> }>> = {};

/** El token de la fuente; si hay que crearla, dos pedidos al mismo tiempo comparten la misma creación. */
export function tokenDeLaApp(personaId: number, cual: FuenteDeLaApp = 'app'): Promise<string> {
  const ya = pidiendo[cual];
  if (ya?.persona === personaId) return ya.token;
  const token = buscarOCrear(personaId, cual);
  pidiendo[cual] = { persona: personaId, token };
  token.catch(() => delete pidiendo[cual]);
  return token;
}

async function buscarOCrear(personaId: number, cual: FuenteDeLaApp): Promise<string> {
  const f = FUENTES[cual];
  try {
    const g = JSON.parse(localStorage.getItem(f.clave) ?? 'null') as Guardada | null;
    if (g?.persona === personaId) return g.token;
  } catch {
    /* se crea de nuevo */
  }
  const nueva = await api<{ token: string }>('POST', `/api/personas/${personaId}/fuentes`, { tipo: f.tipo, nombre: f.nombre() });
  try {
    localStorage.setItem(f.clave, JSON.stringify({ persona: personaId, token: nueva.token } satisfies Guardada));
  } catch {
    /* sin almacenamiento: se creará otra la próxima vez */
  }
  return nueva.token;
}

export const ingestaUrl = (ruta: string) => `${location.origin}/api/ingesta${ruta}`;

/** Manda a la ingesta con el token de la app (la sesión no sirve cuando el teléfono lo hace solo). */
export async function ingesta(personaId: number, ruta: string, cuerpo: unknown, cual: FuenteDeLaApp = 'app'): Promise<void> {
  const token = await tokenDeLaApp(personaId, cual);
  const r = await fetch(ingestaUrl(ruta), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  });
  if (r.status === 401) {
    // La fuente se borró o desactivó: la próxima vez se crea otra.
    localStorage.removeItem(FUENTES[cual].clave);
    delete pidiendo[cual];
  }
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error || `Error ${r.status}`);
}
