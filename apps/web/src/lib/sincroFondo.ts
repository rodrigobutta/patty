// Lo que junta el teléfono llega aunque Patty no se abra (solo en la app de Android): un trabajo nativo periódico
// (SincroFondo.java) manda el reloj, el uso de apps y llamadas, el calendario, lo que sonó y los avisos de las apps, a
// los mismos lugares que la web. Los interruptores viven acá (localStorage): cada vez que cambian, y al abrir Patty,
// se le copian al teléfono junto con los tokens de las fuentes. Al abrir Patty, la web sigue mandando lo suyo igual.
import { registerPlugin } from '@capacitor/core';
import { useEffect } from 'react';
import { calendarioActivado } from './calendario';
import { escuchasActivadas, permisoEscuchas } from './escuchas';
import { tokenDeLaApp } from './fuenteApp';
import { plataforma } from './nativo';
import { saludActivada } from './salud';
import { datosActivados } from './telefono';

interface PluginSincroFondo {
  configurar(o: { persona: number | null; tokenApp?: string | null; tokenSalud?: string | null; salud?: boolean; telefono?: boolean; calendario?: boolean }): Promise<{ ultima: number }>;
  permisoSalud(): Promise<{ disponible: boolean; dado: boolean }>;
  pedirPermisoSalud(): Promise<{ disponible: boolean; dado: boolean }>;
}

const SincroFondo = registerPlugin<PluginSincroFondo>('SincroFondo');

const EVENTO = 'patty-fondo';

/** Cambió un interruptor: que el teléfono lo sepa. */
export function avisarAlFondo(): void {
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * Le pasa al teléfono qué está prendido y los tokens que hacen falta (solo los de lo prendido: así no se crea una
 * fuente que no se usa). La app instalada antes no tiene el plugin: no pasa nada.
 */
export async function configurarFondo(personaId: number | null): Promise<void> {
  if (plataforma() !== 'android') return;
  if (!personaId) {
    await SincroFondo.configurar({ persona: null }).catch(() => {});
    return;
  }
  const salud = saludActivada();
  const telefono = datosActivados();
  const calendario = calendarioActivado();
  const app = telefono || calendario || escuchasActivadas() || (await permisoEscuchas());
  const token = (cual: 'app' | 'salud', si: boolean) => (si ? tokenDeLaApp(personaId, cual).catch(() => undefined) : Promise.resolve(null));
  const [tokenApp, tokenSalud] = await Promise.all([token('app', app), token('salud', salud)]);
  await SincroFondo.configurar({
    persona: personaId,
    ...(tokenApp !== undefined ? { tokenApp } : {}),
    ...(tokenSalud !== undefined ? { tokenSalud } : {}),
    salud,
    telefono,
    calendario,
  }).catch(() => {});
}

/** Pide leer Health Connect con la app cerrada (si el teléfono lo tiene). Sin eso, el reloj llega al abrir Patty. */
export async function pedirSaludEnSegundoPlano(): Promise<boolean> {
  if (plataforma() !== 'android') return false;
  return SincroFondo.pedirPermisoSalud()
    .then((r) => r.dado)
    .catch(() => false);
}

/** Al abrir Patty y cada vez que cambia un interruptor. */
export function useSincroFondo(personaId: number | undefined): void {
  useEffect(() => {
    if (plataforma() !== 'android' || !personaId) return;
    const f = () => void configurarFondo(personaId).catch(() => {});
    f();
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, [personaId]);
}
