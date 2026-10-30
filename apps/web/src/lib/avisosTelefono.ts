// Lo que avisan las apps del teléfono (solo en la app de Android, con el mismo «acceso a las notificaciones» de lo que
// suena; ver AvisosTelefono.java): cuántos avisos llegan y cuándo, cuántos mensajes, y los pedidos de comida, los viajes
// en Uber/Cabify/DiDi y el ejercicio que avisan sus apps. Cada cosa tiene su interruptor (Más → Permisos), prendido
// mientras haya acceso; el teléfono guarda los interruptores y junta. Al abrir Patty (como mucho cada 20 minutos, o al
// toque si hay un pedido, un viaje o un entrenamiento nuevo) se manda a /api/ingesta/avisos y se borra del teléfono.
import { useEffect } from 'react';
import { FUNCIONES_AVISOS, type ConteoAvisos, type EventoAviso, type FuncionAvisos, type FuncionesAvisos } from 'shared';
import { api } from '../api';
import { Escucha, hayEscuchas, permisoEscuchas } from './escuchas';
import { ingesta } from './fuenteApp';

export interface PluginAvisos {
  configurarAvisos(o: Partial<FuncionesAvisos>): Promise<{ funciones: FuncionesAvisos; acceso: boolean }>;
  avisos(): Promise<{ conteos: ConteoAvisos[]; eventos: EventoAviso[]; hasta: number; funciones: FuncionesAvisos }>;
  borrarAvisos(o: { hasta: number }): Promise<void>;
  borrarTodoAvisos(): Promise<void>;
}

/** El mismo plugin que lo que suena (es el mismo permiso y el mismo servicio). */
const Avisos = Escucha as unknown as PluginAvisos;

const ULTIMA = 'avisos-telefono-ultima';
const CADA_MS = 20 * 60000;

export const hayAvisosTelefono = hayEscuchas;

const TODAS: FuncionesAvisos = Object.fromEntries(FUNCIONES_AVISOS.map((f) => [f, true])) as FuncionesAvisos;

/** Cómo están los interruptores en el teléfono (null si la app instalada es vieja y no los tiene). */
export async function funcionesAvisos(): Promise<FuncionesAvisos | null> {
  if (!hayAvisosTelefono()) return null;
  return Avisos.configurarAvisos({})
    .then((r) => ({ ...TODAS, ...r.funciones }))
    .catch(() => null);
}

/** Prende o apaga una. Devuelve cómo quedaron todas. */
export async function ponerFuncionAvisos(f: FuncionAvisos, prendida: boolean): Promise<FuncionesAvisos | null> {
  return Avisos.configurarAvisos({ [f]: prendida })
    .then((r) => ({ ...TODAS, ...r.funciones }))
    .catch(() => null);
}

/** Manda lo juntado y lo borra del teléfono. Devuelve cuántos conteos y eventos mandó. */
export async function sincronizarAvisos(personaId: number): Promise<number> {
  if (!(await permisoEscuchas())) return 0;
  const { conteos, eventos, hasta } = await Avisos.avisos();
  try {
    localStorage.setItem(ULTIMA, String(Date.now()));
  } catch {
    /* se mandará de nuevo */
  }
  if (!conteos.length && !eventos.length) return 0;
  await ingesta(personaId, '/avisos', { conteos, eventos });
  await Avisos.borrarAvisos({ hasta });
  window.dispatchEvent(new Event(EVENTO_LLEGARON));
  return conteos.length + eventos.length;
}

/** Cuando llegó algo nuevo de los avisos (el Día vuelve a mirar si hay algo para preguntar). */
export const EVENTO_LLEGARON = 'patty-avisos-telefono';

/** Borra todo: lo del teléfono y lo que ya llegó a Patty (lo anotado queda). */
export async function borrarAvisosTelefono(personaId: number): Promise<void> {
  if (hayAvisosTelefono()) await Avisos.borrarTodoAvisos().catch(() => {});
  await api('DELETE', `/api/avisos?persona=${personaId}`);
}

/** Al abrir o volver a Patty: manda lo nuevo, como mucho cada 20 minutos, o enseguida si hay un evento esperando. */
export function useAvisosTelefono(personaId: number | undefined): void {
  useEffect(() => {
    if (!hayAvisosTelefono() || !personaId) return;
    const quizas = async () => {
      if (document.visibilityState !== 'visible') return;
      let ultima = 0;
      try {
        ultima = Number(localStorage.getItem(ULTIMA) ?? 0);
      } catch {
        /* sin almacenamiento */
      }
      if (Date.now() - ultima > CADA_MS) return sincronizarAvisos(personaId);
      // Un pedido que llegó recién (o un viaje, o un entrenamiento) se manda ya, para preguntarlo en el Día.
      const { eventos } = await Avisos.avisos();
      if (eventos.length) await sincronizarAvisos(personaId);
    };
    const correr = () => void quizas().catch(() => {});
    correr();
    document.addEventListener('visibilitychange', correr);
    return () => document.removeEventListener('visibilitychange', correr);
  }, [personaId]);
}
