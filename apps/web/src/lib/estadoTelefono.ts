// Qué permisos dio la persona en este teléfono (o navegador) y qué tiene prendido: avisos, ubicación, uso del teléfono,
// llamadas, salud. Lo usa el paso de permisos de la bienvenida y se le cuenta al servidor para la administración (así,
// mientras se prueba, se ve si cada uno pudo configurar todo).
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect } from 'react';
import { api } from '../api';
import { climaActivado } from './clima';
import { configEncuesta } from './encuesta';
import { esNativa, plataforma } from './nativo';
import { recordatoriosActivos } from './remedios';
import { permisosSalud, saludActivada } from './salud';
import { datosActivados, hayDatosDelTelefono, Telefono } from './telefono';
import { seguimientoActivado } from './ubicacion';

export type SiNo = 'si' | 'no' | 'no_aplica';
export type PermisoUbicacion = 'siempre' | 'en_uso' | 'no';

export interface EstadoTelefono {
  plataforma: 'android' | 'ios' | 'web';
  permisos: {
    avisos: SiNo;
    ubicacion: PermisoUbicacion;
    uso_apps: SiNo;
    llamadas: SiNo;
    /** Cuántos tipos de datos de salud dejó leer (0: ninguno). */
    salud: number | 'no_aplica';
  };
  /** Lo que tiene prendido en Patty (en este dispositivo). */
  activos: { ubicacion: boolean; clima: boolean; telefono: boolean; salud: boolean; recordatorios: boolean; encuesta: boolean; push: boolean };
  /** Cuándo mandó por última vez los datos del teléfono y de salud. */
  ultimos: { telefono: string | null; salud: string | null };
}

const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const fecha = (k: string) => {
  const n = Number(leer(k) ?? 0);
  return n ? new Date(n).toISOString() : null;
};

async function permisoAvisos(): Promise<SiNo> {
  if (esNativa()) {
    return LocalNotifications.checkPermissions()
      .then((p) => (p.display === 'granted' ? 'si' : 'no'))
      .catch(() => 'no');
  }
  return typeof Notification === 'undefined' ? 'no_aplica' : Notification.permission === 'granted' ? 'si' : 'no';
}

export async function permisoUbicacion(): Promise<PermisoUbicacion> {
  if (esNativa()) {
    try {
      const p = await BackgroundGeolocation.checkPermissions();
      if (p.backgroundLocation === 'granted' || (p.backgroundLocation as string) === 'always') return 'siempre';
      if (p.location === 'granted' || (p.backgroundLocation as string) === 'when_in_use') return 'en_uso';
      return 'no';
    } catch {
      return 'no';
    }
  }
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return p.state === 'granted' ? 'en_uso' : 'no';
  } catch {
    return 'no';
  }
}

export async function leerEstado(): Promise<EstadoTelefono> {
  const tel = hayDatosDelTelefono() ? await Telefono.permisos().catch(() => null) : null;
  const salud = esNativa() ? (await permisosSalud()).length : 'no_aplica';
  return {
    plataforma: plataforma(),
    permisos: {
      avisos: await permisoAvisos(),
      ubicacion: await permisoUbicacion(),
      uso_apps: tel ? (tel.uso === 'granted' ? 'si' : 'no') : 'no_aplica',
      llamadas: tel ? (tel.llamadas === 'granted' ? 'si' : 'no') : 'no_aplica',
      salud,
    },
    activos: {
      ubicacion: seguimientoActivado(),
      clima: climaActivado(),
      telefono: datosActivados(),
      salud: saludActivada(),
      recordatorios: recordatoriosActivos(),
      encuesta: configEncuesta().activa,
      push: Boolean(leer('push-token')),
    },
    ultimos: { telefono: fecha('datos-telefono-ultima'), salud: fecha('salud-ultima') },
  };
}

/** Un id de este dispositivo (al azar, guardado), para que el servidor sepa que es el mismo teléfono. */
function instalacion(): string {
  let id = leer('instalacion');
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      localStorage.setItem('instalacion', id);
    } catch {
      /* sin almacenamiento: se manda uno nuevo cada vez */
    }
  }
  return id;
}

let ultimoEnvio = 0;
/** Le cuenta al servidor cómo está este dispositivo (como mucho cada 10 minutos, salvo `ya`). */
export async function reportarEstado(ya = false): Promise<void> {
  if (!ya && Date.now() - ultimoEnvio < 10 * 60000) return;
  ultimoEnvio = Date.now();
  try {
    await api('POST', '/api/dispositivos/estado', { instalacion: instalacion(), ...(await leerEstado()) });
  } catch {
    /* no importa: se manda la próxima vez */
  }
}

/** Al abrir la app y al volver a ella. */
export function useReportarEstado(listo: boolean): void {
  useEffect(() => {
    if (!listo) return;
    // Un ratito después de abrir, cuando ya se programaron avisos y se registró el teléfono.
    const t = setTimeout(() => void reportarEstado(true), 8000);
    const volver = () => document.visibilityState === 'visible' && void reportarEstado();
    document.addEventListener('visibilitychange', volver);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', volver);
    };
  }, [listo]);
}
