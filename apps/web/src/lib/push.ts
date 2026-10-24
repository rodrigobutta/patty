// Avisos push (Firebase): la app se registra al arrancar y le pasa su token al servidor, junto con hasta cuándo tiene
// programados sus propios recordatorios de remedios; lo que quede después lo manda el servidor aunque no se abra la app.
// Solo en la app nativa, y solo si esta compilación trae Firebase (sin eso, registrarse cierra la app).
import { registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useEffect } from 'react';
import { api } from '../api';
import { crearCanales, irAlDia, permisoAvisos } from './avisos';
import { esNativa, plataforma } from './nativo';

const CLAVE_TOKEN = 'push-token';
const CLAVE_HASTA = 'avisos-hasta';

const Mascota = registerPlugin<{ hayFirebase(): Promise<{ si: boolean }> }>('Mascota');

const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const guardar = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
};

/** Le cuenta al servidor este teléfono (y hasta cuándo tiene sus recordatorios). */
export async function mandarDispositivo(): Promise<void> {
  const token = leer(CLAVE_TOKEN);
  if (!token) return;
  await api('POST', '/api/dispositivos', { token, plataforma: plataforma(), avisos_hasta: leer(CLAVE_HASTA) }).catch(() => {});
}

/** Hasta cuándo este teléfono ya tiene programados los recordatorios (lo llama lib/remedios al programarlos). */
export function avisosProgramadosHasta(hasta: Date): void {
  guardar(CLAVE_HASTA, hasta.toISOString());
  void mandarDispositivo();
}

/** Al salir de la cuenta, este teléfono deja de recibir avisos de ella. */
export async function olvidarDispositivo(): Promise<void> {
  const token = leer(CLAVE_TOKEN);
  if (token) await api('DELETE', `/api/dispositivos?token=${encodeURIComponent(token)}`).catch(() => {});
}

async function hayFirebase(): Promise<boolean> {
  if (plataforma() !== 'android') return false; // en iPhone falta configurar APNs
  return Mascota.hayFirebase()
    .then((r) => r.si)
    .catch(() => false);
}

/** Al arrancar la app (con sesión): registrarse para avisos push y abrir el Día al tocar uno. */
export function usePush(listo: boolean, servidorManda: boolean): void {
  useEffect(() => {
    if (!esNativa() || !listo || !servidorManda) return;
    let vivo = true;
    const quitar: Array<Promise<{ remove(): Promise<void> }>> = [];
    void (async () => {
      if (!(await hayFirebase()) || !vivo) return;
      quitar.push(
        PushNotifications.addListener('registration', (t) => {
          guardar(CLAVE_TOKEN, t.value);
          void mandarDispositivo();
        }),
        PushNotifications.addListener('registrationError', (e) => console.warn('Push: no se pudo registrar', e.error)),
        PushNotifications.addListener('pushNotificationActionPerformed', () => irAlDia()),
      );
      await crearCanales();
      if (await permisoAvisos()) await PushNotifications.register();
    })();
    return () => {
      vivo = false;
      for (const q of quitar) void q.then((x) => x.remove());
    };
  }, [listo, servidorManda]);
}
