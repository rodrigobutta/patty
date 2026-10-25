// Los recordatorios de remedios en el teléfono: un aviso a la hora de cada toma y, si a la media hora no se marcó,
// otro preguntando si se tomó. Desde el aviso se contesta sin abrir nada: "La tomé", "En 15 min" o "No la tomo".
// Se programan para la próxima semana cada vez que se abre la app o cambia algo (Android aguanta unos 500 avisos
// pendientes; con esto alcanza y sobra).
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { useEffect } from 'react';
import { dosisTexto, type Toma } from 'shared';
import { api } from '../api';
import { avisoExacto, crearCanales, idDeAviso, irAlDia, permisoAvisos } from './avisos';
import { idioma, locale, t } from './idioma';
import { esNativa } from './nativo';
import { avisosProgramadosHasta } from './push';

const CLAVE_ACTIVOS = 'recordatorios-remedios';
const CLAVE_PROGRAMADOS = 'avisos-remedios';
const TIPO = 'TOMA';
/** A la media hora sin marcar, se vuelve a preguntar. */
const INSISTIR_MIN = 30;
const POSPONER_MIN = 15;
/** Cuánto para adelante se programan los avisos en el teléfono (después, los manda el servidor por push). */
const HORAS = 168;
const EVENTO = 'patty-tomas';

export const recordatoriosActivos = (): boolean => {
  try {
    return localStorage.getItem(CLAVE_ACTIVOS) !== 'no';
  } catch {
    return true;
  }
};

export async function ponerRecordatorios(activos: boolean): Promise<boolean> {
  try {
    localStorage.setItem(CLAVE_ACTIVOS, activos ? 'si' : 'no');
  } catch {
    /* sin almacenamiento */
  }
  return programarRecordatorios();
}

/** Avisar que cambiaron las tomas (se marcó una, se creó un tratamiento): el Día se actualiza y se reprograma. */
export function tomasCambiaron(): void {
  window.dispatchEvent(new Event(EVENTO));
  void programarRecordatorios();
}

export function useAlCambiarTomas(f: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, [f]);
}

interface Extra {
  toma: { tratamiento_id: number; programada: string; remedio: string };
}

const idsDe = (t: Pick<Toma, 'tratamiento_id' | 'programada'>) => ({
  aviso: idDeAviso(`toma|${t.tratamiento_id}|${t.programada}`),
  insistir: idDeAviso(`toma|${t.tratamiento_id}|${t.programada}|2`),
});

const hhmm = (iso: string) => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

function leerProgramados(): number[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PROGRAMADOS) ?? '[]') as number[];
  } catch {
    return [];
  }
}

let tiposRegistrados = false;
async function registrarTipos(): Promise<void> {
  if (tiposRegistrados) return;
  tiposRegistrados = true;
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: TIPO,
        actions: [
          { id: 'tomada', title: t('La tomé') },
          { id: 'posponer', title: t('En {n} min', { n: POSPONER_MIN }) },
          { id: 'salteada', title: t('No la tomo'), destructive: true },
        ],
      },
    ],
  });
}

function aviso(id: number, at: Date, toma: Toma, titulo: string, cuerpo: string, exacta: boolean): LocalNotificationSchema {
  return {
    id,
    title: titulo,
    body: cuerpo,
    schedule: { at, allowWhileIdle: true },
    channelId: 'remedios',
    actionTypeId: TIPO,
    extra: { toma: { tratamiento_id: toma.tratamiento_id, programada: toma.programada, remedio: toma.remedio } } satisfies Extra,
    isExactNotification: exacta,
  };
}

let enCurso: Promise<boolean> | null = null;

/** Vuelve a programar todos los avisos de remedios. Devuelve false si el teléfono no deja mandar avisos. */
export function programarRecordatorios(): Promise<boolean> {
  if (!esNativa()) return Promise.resolve(true);
  // Si ya se está programando, se espera a que termine y se vuelve a hacer (puede haber cambiado algo en el medio).
  const anterior = enCurso;
  enCurso = (async () => {
    await anterior?.catch(() => {});
    try {
      const viejos = leerProgramados();
      if (viejos.length) await LocalNotifications.cancel({ notifications: viejos.map((id) => ({ id })) });
      localStorage.setItem(CLAVE_PROGRAMADOS, '[]');
      // Con los recordatorios apagados en este teléfono, el servidor tampoco le manda.
      if (!recordatoriosActivos()) {
        avisosProgramadosHasta(new Date('9999-12-31T00:00:00Z'));
        return true;
      }
      const tomas = await api<Toma[]>('GET', `/api/tratamientos/proximas?horas=${HORAS}`);
      const hasta = new Date(Date.now() + HORAS * 3600000);
      if (!tomas.length) {
        avisosProgramadosHasta(hasta);
        return true;
      }
      if (!(await permisoAvisos())) return false;
      await Promise.all([crearCanales(), registrarTipos()]);
      const exacta = await avisoExacto();
      const ahora = Date.now();
      const lista: LocalNotificationSchema[] = [];
      for (const x of tomas.slice(0, 200)) {
        const ids = idsDe(x);
        const cuando = Date.parse(x.programada);
        const que = `${x.remedio}${x.dosis !== null || x.unidad ? ' ' + dosisTexto(x.dosis, x.unidad, idioma()) : ''}`;
        if (cuando > ahora + 5000) lista.push(aviso(ids.aviso, new Date(cuando), x, `💊 ${que}`, t('Es la hora de la toma de las {hora}.', { hora: hhmm(x.programada) }), exacta));
        const otra = cuando + INSISTIR_MIN * 60000;
        if (otra > ahora + 5000) lista.push(aviso(ids.insistir, new Date(otra), x, t('¿Tomaste {remedio}?', { remedio: x.remedio }), t('La de las {hora} todavía no está marcada.', { hora: hhmm(x.programada) }), exacta));
      }
      if (lista.length) await LocalNotifications.schedule({ notifications: lista });
      localStorage.setItem(CLAVE_PROGRAMADOS, JSON.stringify(lista.map((n) => n.id)));
      // Si se cortó en 200, el servidor se ocupa de lo que siga.
      avisosProgramadosHasta(tomas.length > 200 ? new Date(tomas[199].programada) : hasta);
      return true;
    } catch {
      return false;
    }
  })();
  return enCurso;
}

/** Marca una toma (desde el Día o desde el aviso) y saca sus avisos pendientes. */
export async function marcarToma(t: Pick<Toma, 'tratamiento_id' | 'programada'>, estado: 'tomada' | 'salteada', inicio?: string): Promise<void> {
  await api('POST', `/api/tratamientos/${t.tratamiento_id}/tomas`, { programada: t.programada, estado, inicio });
  if (esNativa()) {
    const ids = idsDe(t);
    await LocalNotifications.cancel({ notifications: [{ id: ids.aviso }, { id: ids.insistir }] }).catch(() => {});
  }
  tomasCambiaron();
}

export async function desmarcarToma(t: Pick<Toma, 'tratamiento_id' | 'programada'>): Promise<void> {
  await api('DELETE', `/api/tratamientos/${t.tratamiento_id}/tomas?programada=${encodeURIComponent(t.programada)}`);
  tomasCambiaron();
}

async function posponer(n: LocalNotificationSchema, toma: Extra['toma']): Promise<void> {
  await LocalNotifications.schedule({
    notifications: [
      {
        ...n,
        id: idDeAviso(`toma|${toma.tratamiento_id}|${toma.programada}|${Date.now()}`),
        title: `💊 ${toma.remedio}`,
        body: t('Te lo recuerdo de nuevo: la toma de las {hora}.', { hora: hhmm(toma.programada) }),
        schedule: { at: new Date(Date.now() + POSPONER_MIN * 60000), allowWhileIdle: true },
        channelId: 'remedios',
        actionTypeId: TIPO,
        extra: { toma },
        isExactNotification: await avisoExacto(),
      },
    ],
  });
}

/** Al arrancar la app: programar los recordatorios y contestar lo que se toque en los avisos. */
export function useRecordatorios(listo: boolean): void {
  useEffect(() => {
    if (!esNativa() || !listo) return;
    void programarRecordatorios();
    const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const toma = (a.notification.extra as Extra | undefined)?.toma;
      if (!toma) return;
      if (a.actionId === 'tomada' || a.actionId === 'salteada') void marcarToma(toma, a.actionId).catch(() => {});
      else if (a.actionId === 'posponer') void posponer(a.notification, toma).catch(() => {});
      else irAlDia();
    });
    // Al volver a la app (después de días sin abrirla, o de marcar desde otro teléfono) se reprograma.
    let ultima = Date.now();
    const volver = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultima < 10 * 60000) return;
      ultima = Date.now();
      void programarRecordatorios();
    };
    document.addEventListener('visibilitychange', volver);
    return () => {
      void h.then((x) => x.remove());
      document.removeEventListener('visibilitychange', volver);
    };
  }, [listo]);
}
