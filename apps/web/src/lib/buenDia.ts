// El buen día con el reporte de sueño: el aviso de la mañana (lo manda el servidor, push/buenDia.ts) y la tarjeta del
// Día abren la hoja del sueño. Lo visto se guarda en este teléfono: una vez abierta la noche, la tarjeta no vuelve.
import { useEffect } from 'react';

const EVENTO = 'patty-abrir-sueno';
const VISTO = 'patty-noche-vista';
/** Hasta qué hora (de este teléfono) se ofrece la tarjeta. */
export const BUEN_DIA_HASTA = 13;

const clave = (personaId: number, fecha: string) => `buen-dia-visto|${personaId}|${fecha}`;

export function nocheVista(personaId: number, fecha: string): boolean {
  try {
    return localStorage.getItem(clave(personaId, fecha)) === 'si';
  } catch {
    return false;
  }
}

/** Se abrió la noche (o se cerró la tarjeta): la tarjeta de ese día ya no se muestra. */
export function marcarNocheVista(personaId: number, fecha: string): void {
  try {
    localStorage.setItem(clave(personaId, fecha), 'si');
  } catch {
    /* sin almacenamiento: la tarjeta vuelve hasta el mediodía */
  }
  window.dispatchEvent(new Event(VISTO));
}

/** Para que la tarjeta se vaya cuando la noche se abre desde el widget del sueño. */
export function useAlVerNoche(f: () => void): void {
  useEffect(() => {
    window.addEventListener(VISTO, f);
    return () => window.removeEventListener(VISTO, f);
  }, [f]);
}

// Si el aviso se toca con la app cerrada, llega antes de que esté el Día: queda pendiente hasta que lo esté.
let pendiente = false;

/** Pedir que el Día abra la hoja del sueño (la tarjeta del buen día o el aviso tocado). */
export function abrirNoche(): void {
  pendiente = true;
  window.dispatchEvent(new Event(EVENTO));
}

/** La hoja del sueño se abre cuando se pide (también si se pidió antes de que el Día estuviera). */
export function useAlPedirNoche(abrir: () => void): void {
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
