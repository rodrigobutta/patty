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

export function caraSegun(ultimaFecha: string | null, hoy: string): Cara {
  if (ultimaFecha === hoy) return 'feliz';
  if (ultimaFecha && ultimaFecha >= sumarDias(hoy, -DIAS_ESPERANDO)) return 'espera';
  return 'triste';
}

interface PluginMascota {
  /** Le dice al teléfono cuándo fue lo último anotado (AAAA-MM-DD), para que el ícono cambie de cara solo. */
  anotado(o: { ultima: string | null }): Promise<void>;
}
const MascotaNativa = registerPlugin<PluginMascota>('Mascota');

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
      setCara(caraSegun(ultima, hoy));
      if (plataforma() === 'android') void MascotaNativa.anotado({ ultima }).catch(() => {});
    } catch {
      /* sin conexión: queda la cara que estaba */
    }
  }, [persona]);
  useEffect(() => {
    void mirar();
    const alVolver = () => document.visibilityState === 'visible' && void mirar();
    const alAnotar = () => void mirar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener(EVENTO_ANOTADO, alAnotar);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener(EVENTO_ANOTADO, alAnotar);
    };
  }, [mirar]);
  return cara;
}
