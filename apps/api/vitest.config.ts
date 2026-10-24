import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['test/**/*.test.ts'],
    // Todos los archivos comparten la misma base de pruebas: uno por vez.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost/patty_test',
      ANTHROPIC_API_KEY: '',
      GOOGLE_CLIENT_ID: '',
    },
  },
});
