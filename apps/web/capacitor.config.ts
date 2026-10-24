// La app nativa (Android y iPhone) es una cáscara que abre la web de Patty: así cada cambio de la web llega solo,
// sin reinstalar. Por defecto abre la de Railway; con `pnpm movil:dev:android` (o ios) abre el Vite de la Mac con
// recarga en vivo. Solo hay que volver a instalar cuando cambia algo nativo (plugins, permisos, este archivo).
import type { CapacitorConfig } from '@capacitor/cli';

const URL_PRODUCCION = 'https://patty.today';

const config: CapacitorConfig = {
  appId: 'ar.patty.app',
  appName: 'Patty',
  // Lo empaquetado es solo la pantalla de "sin conexión": la app de verdad se carga desde server.url.
  webDir: 'movil/local',
  server: {
    url: process.env.PATTY_URL || URL_PRODUCCION,
    cleartext: Boolean(process.env.PATTY_URL?.startsWith('http:')),
    errorPath: 'index.html',
  },
  android: { backgroundColor: '#f6f4fb' },
  ios: { backgroundColor: '#f6f4fb', contentInset: 'never' },
};

export default config;
