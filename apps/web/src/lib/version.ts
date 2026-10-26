// La versión de la app: la de la web (se publica sola en cada cambio) y la de la app instalada en el teléfono (cambia
// solo al reinstalar). Se muestra abajo de todo en Más y se le cuenta al servidor, para ver en la administración qué
// versión tiene cada uno.
import { registerPlugin } from '@capacitor/core';
import { esNativa } from './nativo';

declare const __VERSION__: string;
declare const __COMMIT__: string;

export const VERSION = typeof __VERSION__ === 'undefined' ? 'dev' : __VERSION__;
export const COMMIT = typeof __COMMIT__ === 'undefined' ? '' : __COMMIT__;

const Mascota = registerPlugin<{ telefono(): Promise<{ app?: string }> }>('Mascota');
let nativa: Promise<string | null> | null = null;
/** La versión de la app instalada (Android); null en la web o si la app es anterior a esto. */
export function versionNativa(): Promise<string | null> {
  if (!esNativa()) return Promise.resolve(null);
  return (nativa ??= Mascota.telefono()
    .then((r) => r.app ?? null)
    .catch(() => null));
}
