// La encuesta de la noche: "¿Cómo te sentiste hoy?". En la app nativa llega como aviso del teléfono todos los días a la
// hora elegida (por defecto 22:00); en la web, y también en la app si no se contestó, el Día la muestra desde esa hora.
// Se configura por dispositivo en Más.
import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect } from 'react';
import { avisoExacto, permisoAvisos } from './avisos';
import { t } from './idioma';
import { esNativa, plataforma } from './nativo';
import { api } from '../api';
import { recibePush } from './push';
import { apodoGuardado } from './apodo';

const CLAVE = 'encuesta';
const ID_AVISO = 2210;
export const HORA_POR_DEFECTO = '22:00';
const EVENTO = 'patty-encuesta';

interface Config { activa: boolean; hora: string }

export function configEncuesta(): Config {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Config | null;
    if (c && /^\d{2}:\d{2}$/.test(c.hora)) return c;
  } catch {
    /* lo de siempre */
  }
  return { activa: true, hora: HORA_POR_DEFECTO };
}

export async function ponerEncuesta(c: Config): Promise<boolean> {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(c));
  } catch {
    /* sin almacenamiento */
  }
  contarleAlServidor(c);
  return programarAviso(c);
}

/** El servidor manda la encuesta a los Android (con botones para contestar sin abrir la app): necesita saber la hora. */
function contarleAlServidor(c: Config): void {
  void api('PUT', '/api/usuarios/yo/preferencias', { encuesta_hora: c.activa ? c.hora : null }).catch(() => {});
}

/** Programa (o saca) el aviso diario del teléfono. Devuelve false si no hay permiso para avisar. */
export async function programarAviso(c: Config = configEncuesta()): Promise<boolean> {
  if (!esNativa()) return true;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_AVISO }] });
    if (!c.activa) return true;
    // En Android con push la manda el servidor, con los botones para contestar desde el aviso.
    if (plataforma() === 'android' && recibePush()) {
      contarleAlServidor(c);
      return permisoAvisos();
    }
    if (!(await permisoAvisos())) return false;
    const [hour, minute] = c.hora.split(':').map(Number);
    const exacta = await avisoExacto();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_AVISO,
          title: 'Patty',
          body: apodoGuardado() ? t('{apodo}, ¿cómo te sentiste hoy?', { apodo: apodoGuardado() }) : t('¿Cómo te sentiste hoy?'),
          schedule: { on: { hour, minute }, allowWhileIdle: true },
          extra: { encuesta: 'dia' },
          isExactNotification: exacta,
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/** ¿Ya es hora de la encuesta? (para mostrarla en el Día si todavía no se contestó). */
export function esHoraDeEncuesta(ahora = new Date(), c: Config = configEncuesta()): boolean {
  if (!c.activa) return false;
  const [h, m] = c.hora.split(':').map(Number);
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  // Hasta las 5 de la mañana sigue siendo "la noche" del día de Patty.
  return minutos >= h * 60 + m || ahora.getHours() < 5;
}

// Si el aviso se toca con la app cerrada, llega antes de que esté el Día: queda pendiente hasta que lo esté.
let pendiente = false;

/** Pedir que se abra la encuesta (al tocar el aviso). */
export function abrirEncuesta(): void {
  pendiente = true;
  window.dispatchEvent(new Event(EVENTO));
}

/** Para ir al Día cuando se toca el aviso (sin consumirlo: lo abre el Día). */
export function useIrAlDiaConElAviso(ir: () => void): void {
  useEffect(() => {
    if (pendiente) ir();
    window.addEventListener(EVENTO, ir);
    return () => window.removeEventListener(EVENTO, ir);
  }, [ir]);
}

/** Llama a `abrir` cuando se tocó el aviso (también si se tocó antes de que esto existiera). */
export function useAlTocarAviso(abrir: () => void): void {
  useEffect(() => {
    const f = () => {
      if (!pendiente) return;
      pendiente = false;
      abrir();
    };
    f();
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, [abrir]);
}

/** Al arrancar la app: programar el aviso y escuchar cuando se toca. */
export function useEncuesta(listo = true): void {
  // Recién con la sesión iniciada: así el permiso de avisos se pide después de entrar, no en la pantalla de entrar.
  useEffect(() => {
    if (!esNativa() || !listo) return;
    void programarAviso();
    const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      if (a.notification.extra?.encuesta) abrirEncuesta();
    });
    return () => void h.then((x) => x.remove());
  }, [listo]);
}
