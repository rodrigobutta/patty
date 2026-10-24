// Clima automático: después de anotar algo, se pide la ubicación del teléfono y la API guarda el clima de esa hora
// (Open-Meteo). Va aparte y en silencio: si no hay permiso, señal o servicio, lo anotado queda igual.
// Se puede apagar en este dispositivo (Más → Reloj, teléfono y clima).
import { api } from '../api';

const CLAVE = 'clima';

export function climaActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== 'no';
  } catch {
    return true;
  }
}

export function ponerClima(activo: boolean): void {
  try {
    if (activo) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, 'no');
  } catch {
    /* sin almacenamiento */
  }
}

/** La ubicación actual (sirve una de hasta media hora atrás: para el clima alcanza y no gasta batería). */
export function ubicacion(): Promise<GeolocationCoordinates | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((ok) =>
    navigator.geolocation.getCurrentPosition(
      (p) => ok(p.coords),
      () => ok(null),
      { maximumAge: 30 * 60000, timeout: 15000, enableHighAccuracy: false },
    ),
  );
}

/** Pide que se guarde el clima de las horas en que pasó lo anotado. No falla nunca. */
export async function anotarClima(personaId: number, inicios: string[]): Promise<void> {
  if (!climaActivado()) return;
  try {
    const u = await ubicacion();
    if (!u) return;
    await api('POST', '/api/clima', { persona_id: personaId, lat: u.latitude, lon: u.longitude, inicios });
  } catch {
    /* el clima es un extra: si falla, no se avisa */
  }
}
