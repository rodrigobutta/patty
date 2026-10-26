// La cara de la mascota según cómo viene la persona: contenta si anotó algo hoy, esperando si no anota desde ayer o
// anteayer, triste si pasaron más días. A la mañana (hasta las 10), si anotó hace poco, recién levantada: todavía no
// hay nada que esperar. Y a quien cuenta todo a la noche no lo espera durante el día. Solo cuenta lo anotado a mano.
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
/** Hasta esta hora es "recién levantado" (se supone que para las 10 ya se desayunó). */
const HASTA_MANANA = 10 * 60;

/** De noche (desde la hora en que se suele dormir hasta las 6): el búho tiene sueño. */
export function esDeNoche(dormir: number | null, ahora = new Date()): boolean {
  const m = ahora.getHours() * 60 + ahora.getMinutes();
  // Si se suele acostar después de medianoche (por ejemplo 0:30), de noche es desde esa hora hasta las 6.
  const desde = dormir ?? DORMIR_POR_DEFECTO;
  return desde >= 6 * 60 ? m >= desde || m < 6 * 60 : m >= desde && m < 6 * 60;
}

export function caraSegun(ultimaFecha: string | null, hoy: string, dormir: number | null = null, ahora = new Date(), deNoche = false): Cara {
  if (esDeNoche(dormir, ahora)) return 'dormida';
  if (ultimaFecha === hoy) return 'feliz';
  const reciente = Boolean(ultimaFecha && ultimaFecha >= sumarDias(hoy, -DIAS_ESPERANDO));
  if (reciente && ahora.getHours() * 60 + ahora.getMinutes() < HASTA_MANANA) return 'manana';
  // Cuenta todo a la noche y ayer contó: está todo bien, todavía no es su hora.
  if (deNoche && ultimaFecha && ultimaFecha >= sumarDias(hoy, -1)) return 'feliz';
  return reciente ? 'espera' : 'triste';
}

interface PluginMascota {
  /** Le dice al teléfono cuándo fue lo último anotado (AAAA-MM-DD), para que el ícono cambie de cara solo. */
  anotado(o: { ultima: string | null; dormir?: number; deNoche?: boolean }): Promise<void>;
}
const MascotaNativa = registerPlugin<PluginMascota>('Mascota');
/** La hora en que se suele acostar (null: todavía no se sabe o no hay datos). */
let dormir: number | null | undefined;
/** Si cuenta todo a la noche (lo que eligió o lo que se ve en cómo anota); se mira una vez por apertura. */
let deNoche: boolean | undefined;
/** Para cuando se cambia en Más. */
export const olvidarDeNoche = () => {
  deNoche = undefined;
};

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
      if (deNoche === undefined) deNoche = await api<{ de_noche: boolean }>('GET', '/api/usuarios/yo/preferencias').then((p) => p.de_noche).catch(() => false);
      setCara(caraSegun(ultima, hoy, dormir, new Date(), deNoche));
      if (plataforma() === 'android') void MascotaNativa.anotado({ ultima, deNoche, ...(dormir !== null ? { dormir: Math.round(dormir) } : {}) }).catch(() => {});
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
