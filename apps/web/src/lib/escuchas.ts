// "Qué estoy escuchando o mirando", solo en la app de Android: con el acceso a las notificaciones, EscuchaService ve lo
// que suena en Spotify, YouTube Music, Netflix… (título, artista, app y cuánto) sin conectar cada servicio. La app lo
// guarda en tramos y, al abrir Patty (como mucho cada 20 minutos), los manda a /api/ingesta/escuchas y los borra del
// teléfono. Se prende y se apaga en Más → Permisos; apagado, el teléfono no anota nada.
import { registerPlugin } from '@capacitor/core';
import { useEffect } from 'react';
import type { TramoEscucha } from 'shared';
import { api } from '../api';
import { ingesta } from './fuenteApp';
import { t } from './idioma';
import { plataforma } from './nativo';

interface PluginEscucha {
  permiso(): Promise<{ acceso: 'granted' | 'denied' }>;
  pedirPermiso(): Promise<void>;
  activar(o: { activo: boolean }): Promise<{ activo: boolean }>;
  escuchas(): Promise<{ escuchas: Array<TramoEscucha & { duracion: number }>; ahora: (TramoEscucha & { duracion: number }) | null; activo: boolean }>;
  borrar(o: { hasta: number }): Promise<{ quedan: number }>;
  borrarTodo(): Promise<void>;
}

export const Escucha = registerPlugin<PluginEscucha>('Escucha');

const CLAVE = 'escuchas-activas';
const ULTIMA = 'escuchas-ultima';
const CADA_MS = 20 * 60000;

/** Solo Android deja ver qué suena en otras apps. */
export const hayEscuchas = () => plataforma() === 'android';

export function escuchasActivadas(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return false;
  }
}

/** El permiso de acceso a las notificaciones (una app instalada antes no tiene el plugin: cuenta como que no). */
export async function permisoEscuchas(): Promise<boolean> {
  if (!hayEscuchas()) return false;
  return Escucha.permiso()
    .then((p) => p.acceso === 'granted')
    .catch(() => false);
}

/**
 * Prende o apaga lo que suena. Al prenderlo, si falta el permiso, abre los ajustes del teléfono y devuelve una nota
 * para la persona. Si la app es vieja y no lo tiene, también lo dice.
 */
export async function ponerEscuchas(activo: boolean): Promise<string | void> {
  try {
    if (activo) localStorage.setItem(CLAVE, 'si');
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
  try {
    await Escucha.activar({ activo });
  } catch {
    return activo ? t('Para esto hace falta la última versión de la app.') : undefined;
  }
  if (activo && !(await permisoEscuchas())) {
    await Escucha.pedirPermiso().catch(() => {});
    return t('En la lista que se abre, buscá Patty y activá el acceso a las notificaciones. Después volvé acá.');
  }
}

/** Manda lo que sonó y lo borra del teléfono. Devuelve cuántos tramos mandó. */
export async function sincronizarEscuchas(personaId: number): Promise<number> {
  if (!escuchasActivadas() || !(await permisoEscuchas())) return 0;
  const { escuchas } = await Escucha.escuchas();
  try {
    localStorage.setItem(ULTIMA, String(Date.now()));
  } catch {
    /* se mandará de nuevo */
  }
  if (!escuchas.length) return 0;
  const hasta = Math.max(...escuchas.map((x) => x.fin));
  await ingesta(personaId, '/escuchas', { escuchas: escuchas.map(({ duracion: _, ...x }) => x) });
  await Escucha.borrar({ hasta });
  return escuchas.length;
}

/** Borra todo lo escuchado: lo del teléfono y lo que ya llegó a Patty. */
export async function borrarEscuchas(personaId: number): Promise<void> {
  if (hayEscuchas()) await Escucha.borrarTodo().catch(() => {});
  await api('DELETE', `/api/medios/escuchas?persona=${personaId}`);
}

/** Al abrir o volver a Patty, con lo que suena prendido: manda lo nuevo (como mucho cada 20 minutos). */
export function useEscuchas(personaId: number | undefined): void {
  useEffect(() => {
    if (!hayEscuchas() || !personaId) return;
    const quizas = () => {
      if (document.visibilityState !== 'visible' || !escuchasActivadas()) return;
      let ultima = 0;
      try {
        ultima = Number(localStorage.getItem(ULTIMA) ?? 0);
      } catch {
        /* sin almacenamiento */
      }
      if (Date.now() - ultima > CADA_MS) void sincronizarEscuchas(personaId).catch(() => {});
    };
    quizas();
    document.addEventListener('visibilitychange', quizas);
    return () => document.removeEventListener('visibilitychange', quizas);
  }, [personaId]);
}
