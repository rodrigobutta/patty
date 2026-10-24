// Seguimiento de la ubicación para contar viajes y saber en qué lugares con nombre estuvo la persona.
// Viene apagado: se prende por dispositivo en Más. Mientras Patty está abierta se sigue el movimiento y se manda un
// punto solo cuando hace falta (primero del día, más de 1 km, o entrar o salir de un lugar); la API vuelve a filtrar.
// Una web no puede seguir la ubicación con la app cerrada o la pantalla apagada: para eso está el atajo del teléfono
// (POST /api/ingesta/ubicacion) y, más adelante, la app nativa.
import { useEffect, useState } from 'react';
import { puntoNuevo, type Coordenadas, type Lugar } from 'shared';
import { api } from '../api';

const CLAVE = 'ubicacion';
const ULTIMO = 'ubicacion-ultimo';
const EVENTO = 'patty-ubicacion';

export function seguimientoActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return false;
  }
}

export function ponerSeguimiento(activo: boolean): void {
  try {
    if (activo) localStorage.setItem(CLAVE, 'si');
    else {
      localStorage.removeItem(CLAVE);
      localStorage.removeItem(ULTIMO);
    }
  } catch {
    /* sin almacenamiento */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** El día de Patty en este teléfono (de 5 a 5), para no mandar dos veces el mismo lugar en el día. */
export function diaLocal(t: number): string {
  const d = new Date(t - 5 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Ultimo = Coordenadas & { dia: string; persona: number };

function leerUltimo(personaId: number): Ultimo | null {
  try {
    const u = JSON.parse(localStorage.getItem(ULTIMO) ?? 'null') as Ultimo | null;
    return u?.persona === personaId ? u : null;
  } catch {
    return null;
  }
}

let lugares: Lugar[] = [];
/** Los lugares de la persona, para saber acá mismo si entró o salió de uno (se actualizan al editarlos). */
export const ponerLugares = (l: Lugar[]) => {
  lugares = l;
};

/** Manda el punto si vale la pena. No falla nunca: la ubicación es un extra. */
export async function mandarPunto(personaId: number, c: { latitude: number; longitude: number; accuracy?: number }, instante = Date.now()): Promise<boolean> {
  const p = { lat: c.latitude, lon: c.longitude, dia: diaLocal(instante) };
  if (!puntoNuevo(leerUltimo(personaId), p, lugares)) return false;
  try {
    await api('POST', '/api/ubicacion', {
      persona_id: personaId,
      puntos: [{ lat: p.lat, lon: p.lon, precision: c.accuracy, instante: new Date(instante).toISOString() }],
    });
    localStorage.setItem(ULTIMO, JSON.stringify({ ...p, persona: personaId }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Sigue la ubicación mientras la app está a la vista (el navegador la corta igual al ocultarse). Devuelve cómo parar.
 */
export function seguir(personaId: number): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};
  let id: number | null = null;
  const empezar = () => {
    if (id !== null || document.visibilityState !== 'visible') return;
    api<Lugar[]>('GET', `/api/ubicacion/lugares?persona=${personaId}`).then(ponerLugares).catch(() => {});
    id = navigator.geolocation.watchPosition(
      (pos) => void mandarPunto(personaId, pos.coords, pos.timestamp),
      () => {},
      { enableHighAccuracy: false, maximumAge: 2 * 60000, timeout: 30000 },
    );
  };
  const parar = () => {
    if (id !== null) navigator.geolocation.clearWatch(id);
    id = null;
  };
  const alCambiar = () => (document.visibilityState === 'visible' ? empezar() : parar());
  document.addEventListener('visibilitychange', alCambiar);
  empezar();
  return () => {
    document.removeEventListener('visibilitychange', alCambiar);
    parar();
  };
}

/** Mientras el seguimiento esté prendido en este dispositivo, sigue la ubicación de la persona elegida. */
export function useSeguirUbicacion(personaId: number | undefined): void {
  const [activo, setActivo] = useState(seguimientoActivado);
  useEffect(() => {
    const f = () => setActivo(seguimientoActivado());
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, []);
  useEffect(() => (activo && personaId ? seguir(personaId) : undefined), [activo, personaId]);
}
