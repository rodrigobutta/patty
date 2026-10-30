// Avisos push (Firebase): la app se registra al arrancar y le pasa su token al servidor, junto con hasta cuándo tiene
// programados sus propios recordatorios de remedios; lo que quede después lo manda el servidor aunque no se abra la app.
// Solo en la app nativa, y solo si esta compilación trae Firebase (sin eso, registrarse cierra la app).
import { registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useEffect } from 'react';
import { api, API_BASE } from '../api';
import { crearCanales, irAlDia, permisoAvisos } from './avisos';
import { esNativa, plataforma } from './nativo';

const CLAVE_TOKEN = 'push-token';
const CLAVE_HASTA = 'avisos-hasta';

const Mascota = registerPlugin<{
  hayFirebase(): Promise<{ si: boolean }>;
  sacarAvisos(o: { prefijo: string }): Promise<void>;
  guardarSesion(o: { api: string | null; token: string | null }): Promise<void>;
  guardarWidget(o: { persona_id?: number; categoria_id?: number }): Promise<void>;
  agregarWidget(): Promise<{ pedido: boolean }>;
  addListener(evento: 'avisoTocado', f: (datos: Record<string, string>) => void): Promise<{ remove(): Promise<void> }>;
}>('Mascota');

const EVENTO_ABRIR = 'patty-abrir-aviso';
/** Para que la pantalla que corresponda reaccione a un aviso tocado (por ahora, todos van al Día). */
export function alTocarAvisoPush(f: (datos: Record<string, string>) => void): () => void {
  const g = (e: Event) => f((e as CustomEvent<Record<string, string>>).detail);
  window.addEventListener(EVENTO_ABRIR, g);
  return () => window.removeEventListener(EVENTO_ABRIR, g);
}

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

/**
 * Le pasa a la parte nativa dónde está la API (y el token, si la app usa token), para que los botones de los avisos
 * ("Bien", "La tomé") anoten sin abrir la app. `null` al salir de la cuenta.
 */
export function guardarSesionNativa(activa: boolean): void {
  if (plataforma() !== 'android') return;
  const api = activa ? API_BASE || location.origin : null;
  void Mascota.guardarSesion({ api, token: activa ? leer('token') : null }).catch(() => {});
}

/** Si este teléfono recibe avisos push (ya se registró y le pasó su token al servidor). */
export const recibePush = (): boolean => Boolean(leer(CLAVE_TOKEN));

/** Saca del teléfono los avisos push de remedios (al marcar las tomas en la app: ya no hace falta que sigan ahí). */
export function sacarAvisosDeRemedios(): void {
  if (plataforma() === 'android') void Mascota.sacarAvisos({ prefijo: 'remedios|' }).catch(() => {});
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

/** Si se puede registrar para push: en iPhone siempre (va por APNs); en Android, si la compilación trae Firebase. */
async function hayFirebase(): Promise<boolean> {
  if (plataforma() === 'ios') return true;
  if (plataforma() !== 'android') return false;
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
      // Tocar un aviso push abre el Día (los recordatorios de remedios, en el día de la toma).
      quitar.push(
        Mascota.addListener('avisoTocado', (datos) => {
          irAlDia();
          // Lo del widget queda guardado por si el Día todavía no está (la app recién se abre): lo levanta al montarse.
          if (datos.tipo === 'widget' || TIPOS_DEL_DIA.includes(datos.tipo)) guardarWidgetPendiente(datos);
          window.dispatchEvent(new CustomEvent(EVENTO_ABRIR, { detail: datos }));
        }),
      );
      quitar.push(
        PushNotifications.addListener('registration', (t) => {
          // En iPhone es el token de APNs: el servidor lo reconoce por el prefijo y lo manda directo a Apple.
          guardar(CLAVE_TOKEN, plataforma() === 'ios' ? `ios:${t.value}` : t.value);
          void mandarDispositivo();
        }),
        PushNotifications.addListener('registrationError', (e) => console.warn('Push: no se pudo registrar', e.error)),
        // En iPhone el toque llega por acá (en Android, por AvisosPushService → avisoTocado).
        PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
          irAlDia();
          if (plataforma() === 'ios') window.dispatchEvent(new CustomEvent(EVENTO_ABRIR, { detail: (a.notification.data ?? {}) as Record<string, string> }));
        }),
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

/** El widget de la pantalla de inicio (Android) anota el ánimo de esta persona, con la categoría del ánimo. */
export function configurarWidget(personaId: number | null, categoriaAnimo: number | undefined): void {
  if (plataforma() !== 'android') return;
  void Mascota.guardarWidget(personaId && categoriaAnimo ? { persona_id: personaId, categoria_id: categoriaAnimo } : {}).catch(() => {});
}

const WIDGET_PENDIENTE = 'widget-pendiente';
/** Los avisos que llevan a una tarjeta del Día (si el Día todavía no está, lo levanta al montarse). */
export const TIPOS_DEL_DIA = ['paseo', 'malestar', 'actividad', 'seguimiento', 'fuera', 'preventivo', 'buen_dia'];
function guardarWidgetPendiente(d: Record<string, string>) {
  try {
    sessionStorage.setItem(WIDGET_PENDIENTE, JSON.stringify(d));
  } catch {
    /* sin almacenamiento */
  }
}
/** Lo que se tocó en el widget y todavía no se atendió (se borra al leerlo). */
export function tomarWidgetPendiente(): Record<string, string> | null {
  try {
    const d = sessionStorage.getItem(WIDGET_PENDIENTE);
    sessionStorage.removeItem(WIDGET_PENDIENTE);
    return d ? (JSON.parse(d) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** Pide agregar el widget a la pantalla de inicio. false si el lanzador no deja (hay que agregarlo a mano). */
export async function agregarWidget(): Promise<boolean> {
  if (plataforma() !== 'android') return false;
  try {
    return (await Mascota.agregarWidget()).pedido;
  } catch {
    return false;
  }
}

/** Lo pendiente del widget o de un aviso, sin sacarlo (para ver si le toca a quien mira). */
export function verPendiente(): Record<string, string> | null {
  try {
    const d = sessionStorage.getItem(WIDGET_PENDIENTE);
    return d ? (JSON.parse(d) as Record<string, string>) : null;
  } catch {
    return null;
  }
}
