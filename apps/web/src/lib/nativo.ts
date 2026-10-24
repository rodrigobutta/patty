// Si Patty corre dentro de la app nativa (Android o iPhone) o en un navegador. La app nativa abre la misma web, así
// que el código es uno solo: lo que necesita el teléfono (ubicación con la app cerrada, uso de apps, llamadas) se
// prende solo cuando está.
import { Capacitor } from '@capacitor/core';

export const esNativa = (): boolean => Capacitor.isNativePlatform();
export const plataforma = (): 'android' | 'ios' | 'web' => Capacitor.getPlatform() as 'android' | 'ios' | 'web';
