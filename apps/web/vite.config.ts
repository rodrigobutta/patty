/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** La versión de la app (package.json de la web) y el commit, para mostrarla en Más y contársela al servidor. */
const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
const commit = () => {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const destino = env.API_PROXY || 'http://127.0.0.1:8000';
  return {
    // Rutas relativas: el mismo build sirve desde el servidor o empaquetado con Capacitor.
    base: './',
    define: { __VERSION__: JSON.stringify(VERSION), __COMMIT__: JSON.stringify(commit()) },
    // "shared" se usa desde el código fuente (sin compilarlo antes).
    resolve: { conditions: ['source'] },
    server: {
      port: 5173,
      proxy: { '/api': { target: destino, changeOrigin: true } },
      // Los proyectos nativos no son parte de la web: que tocarlos no recargue la página.
      watch: { ignored: ['**/android/**', '**/ios/**'] },
    },
    plugins: [
      react(),
      VitePWA({
        // La versión nueva no se aplica sola en medio del uso (la página se recargaba de golpe): la app avisa y se
        // actualiza al tocar, al pasar a segundo plano o recién abierta (ver lib/actualizar.ts).
        registerType: 'prompt',
        injectRegister: false, // se registra en main.tsx, que además busca versiones nuevas
        includeAssets: ['iconos/favicon-32.png', 'iconos/apple-touch-icon.png'],
        manifest: {
          name: 'Patty',
          short_name: 'Patty',
          description: 'Anotá tu día y descubrí qué cosas se relacionan',
          lang: 'es-AR',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f6f4fb',
          theme_color: '#6b4fbb',
          icons: [
            { src: 'iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'iconos/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          skipWaiting: false,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Sin señal, la app abre con lo último que se vio (los pedidos de datos van a la red y, si no hay, a lo guardado).
          runtimeCaching: [
            {
              urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: { cacheName: 'patty-api', expiration: { maxEntries: 400, maxAgeSeconds: 14 * 86400 }, cacheableResponse: { statuses: [200] } },
            },
          ],
        },
      }),
    ],
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
  };
});
