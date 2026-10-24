/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const destino = env.API_PROXY || 'http://127.0.0.1:8000';
  return {
    // Rutas relativas: el mismo build sirve desde el servidor o empaquetado con Capacitor.
    base: './',
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
        registerType: 'autoUpdate',
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
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
  };
});
