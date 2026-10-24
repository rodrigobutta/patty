// Configuración por variables de entorno (ver .env.example). Se lee en cada acceso para que las pruebas puedan cambiarla.
import path from 'node:path';

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v === undefined || v === '' ? undefined : v;
};

export const config = {
  get databaseUrl() {
    return env('DATABASE_URL') ?? 'postgres://localhost/patty';
  },
  get port() {
    return Number(env('PORT') ?? 8000);
  },
  get host() {
    return env('HOST') ?? '0.0.0.0';
  },
  get staticDir() {
    return path.resolve(env('STATIC_DIR') ?? 'static');
  },
  get anthropicApiKey() {
    return env('ANTHROPIC_API_KEY');
  },
  get anthropicWorkspaceId() {
    return env('ANTHROPIC_WORKSPACE_ID');
  },
  get googleClientId() {
    return env('GOOGLE_CLIENT_ID');
  },
};
