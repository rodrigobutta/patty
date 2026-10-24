// Clima automático: después de anotar algo, y también al abrir Patty (como mucho una vez por hora), se pide la
// ubicación del teléfono y la API guarda el clima de esas horas (Open-Meteo). Al abrir se piden todas las horas de las
// últimas 48 (más atrás la API no acepta: la ubicación de ahora ya no dice dónde estaba); las que ya están no se
// vuelven a pedir. Va aparte y en silencio: si no hay permiso, señal o servicio, no pasa nada.
// Se puede apagar en este dispositivo (Más → Reloj, teléfono y clima).
import { useEffect } from 'react';
import { api } from '../api';

const CLAVE = 'clima';
const ULTIMO = 'clima-completado';
const CADA_MS = 60 * 60000;
const HORAS_ATRAS = 47;

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

/** El comienzo de cada hora desde hace 47 horas hasta la actual (lo que se pide al abrir). */
export function horasRecientes(ahora = Date.now()): string[] {
  const actual = Math.floor(ahora / 3600000) * 3600000;
  return Array.from({ length: HORAS_ATRAS + 1 }, (_, i) => new Date(actual - (HORAS_ATRAS - i) * 3600000).toISOString());
}

/** Con el clima prendido, al abrir o volver a Patty completa el clima de las últimas horas (como mucho cada hora). */
export function useClimaDeLasUltimasHoras(personaId: number | undefined): void {
  useEffect(() => {
    if (!personaId) return;
    const quizas = () => {
      if (document.visibilityState !== 'visible' || !climaActivado()) return;
      try {
        if (Date.now() - Number(localStorage.getItem(ULTIMO) ?? 0) < CADA_MS) return;
        localStorage.setItem(ULTIMO, String(Date.now()));
      } catch {
        return;
      }
      void anotarClima(personaId, horasRecientes());
    };
    quizas();
    document.addEventListener('visibilitychange', quizas);
    return () => document.removeEventListener('visibilitychange', quizas);
  }, [personaId]);
}
