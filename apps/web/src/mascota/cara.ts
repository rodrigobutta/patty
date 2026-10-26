// La cara de la mascota según cómo viene la persona: contenta si anotó algo hoy, esperando si no anota desde ayer o
// anteayer, triste si pasaron más días. Solo cuenta lo anotado a mano (lo automático llega solo).
// En la app de Android, además, el ícono del teléfono cambia a la misma cara (ver movil/ y MascotaPlugin.java).
import { registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import type { Persona, Registro } from 'shared';
import { api } from '../api';
import { hoyEn, sumarDias } from '../lib/fechas';
import { plataforma } from '../lib/nativo';
import type { Cara } from './dibujo';

export const EVENTO_ANOTADO = 'patty-anotado';
/** Hasta cuántos días sin anotar la mascota espera; después se pone triste. */
const DIAS_ESPERANDO = 2;

/** A qué hora se suele acostar si no hay datos (minutos desde las 0). */
const DORMIR_POR_DEFECTO = 23 * 60;

/** De noche (desde la hora en que se suele dormir hasta las 6): el búho tiene sueño. */
export function esDeNoche(dormir: number | null, ahora = new Date()): boolean {
  const m = ahora.getHours() * 60 + ahora.getMinutes();
  // Si se suele acostar después de medianoche (por ejemplo 0:30), de noche es desde esa hora hasta las 6.
  const desde = dormir ?? DORMIR_POR_DEFECTO;
  return desde >= 6 * 60 ? m >= desde || m < 6 * 60 : m >= desde && m < 6 * 60;
}

export function caraSegun(ultimaFecha: string | null, hoy: string, dormir: number | null = null, ahora = new Date()): Cara {
  if (esDeNoche(dormir, ahora)) return 'dormida';
  if (ultimaFecha === hoy) return 'feliz';
  if (ultimaFecha && ultimaFecha >= sumarDias(hoy, -DIAS_ESPERANDO)) return 'espera';
  return 'triste';
}

interface PluginMascota {
  /** Le dice al teléfono cuándo fue lo último anotado (AAAA-MM-DD), para que el ícono cambie de cara solo. */
  anotado(o: { ultima: string | null; dormir?: number }): Promise<void>;
}
const MascotaNativa = registerPlugin<PluginMascota>('Mascota');
/** La hora en que se suele acostar (null: todavía no se sabe o no hay datos). */
let dormir: number | null | undefined;

/** Avisar que se anotó o borró algo, para que la mascota se actualice. */
export const avisarAnotado = () => window.dispatchEvent(new Event(EVENTO_ANOTADO));

export function useCara(persona: Persona | null | undefined): Cara | null {
  const [cara, setCara] = useState<Cara | null>(null);
  const mirar = useCallback(async () => {
    if (!persona) return;
    const hoy = hoyEn(persona.zona_horaria);
    try {
      const r = await api<Registro[]>('GET', `/api/registros?persona=${persona.id}&desde=${sumarDias(hoy, -7)}&hasta=${hoy}`);
      const ultima = r.reduce<string | null>((m, x) => (!m || x.fecha > m ? x.fecha : m), null);
      // A qué hora se suele acostar (de lo anotado o del reloj), una vez por apertura.
      if (dormir === undefined) dormir = await api<{ sueno: { acoste: number | null } }>('GET', `/api/estadisticas?persona=${persona.id}&dias=30`)
        .then((e) => e.sueno.acoste)
        .catch(() => null);
      setCara(caraSegun(ultima, hoy, dormir));
      if (plataforma() === 'android') void MascotaNativa.anotado({ ultima, ...(dormir !== null ? { dormir: Math.round(dormir) } : {}) }).catch(() => {});
    } catch {
      /* sin conexión: queda la cara que estaba */
    }
  }, [persona]);
  useEffect(() => {
    void mirar();
    // Cada 10 minutos, por si se hizo de noche con la app abierta.
    const iv = setInterval(() => void mirar(), 10 * 60000);
    const alVolver = () => document.visibilityState === 'visible' && void mirar();
    const alAnotar = () => void mirar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener(EVENTO_ANOTADO, alAnotar);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener(EVENTO_ANOTADO, alAnotar);
    };
  }, [mirar]);
  return cara;
}
