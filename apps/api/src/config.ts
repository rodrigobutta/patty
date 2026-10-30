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
  /**
   * Qué sirve este servidor: `completo` (todo, como siempre), `app` (la app y su API, sin la administración) o `admin`
   * (solo la administración y su API, sin los procesos que corren solos: eso lo hace el de la app).
   */
  get modo(): 'completo' | 'app' | 'admin' {
    const m = env('MODO');
    return m === 'app' || m === 'admin' ? m : 'completo';
  },
  /** Dónde está la administración cuando corre aparte (para mandar ahí a quien entra a /admin en la app). */
  get urlAdmin() {
    return env('URL_ADMIN') ?? 'https://admin.patty.today';
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
  /** Opcional: para pasar a texto lo que se dicta (transcripción de OpenAI). Sin esto, el teléfono usa su reconocedor. */
  get openaiApiKey() {
    return env('OPENAI_API_KEY');
  },
  /** Opcional: la cuenta de servicio de Firebase (el JSON entero), para mandar avisos push a los teléfonos. */
  get firebaseServiceAccount() {
    return env('FIREBASE_SERVICE_ACCOUNT');
  },
  /** Opcional: para avisos push al iPhone (clave .p8 de Apple Developer, su id y el id del equipo). */
  get apnsKeyId() {
    return env('APNS_KEY_ID');
  },
  get apnsTeamId() {
    return env('APNS_TEAM_ID');
  },
  get apnsKey() {
    return env('APNS_KEY');
  },
  /** Las apps instaladas desde Xcode usan el APNs de prueba (sandbox); las de TestFlight y la App Store, el normal. */
  get apnsSandbox() {
    return env('APNS_SANDBOX') === '1';
  },
  /** El cliente de Google para la app de iPhone (no es secreto: también está en la app). */
  get googleIosClientId() {
    return env('GOOGLE_IOS_CLIENT_ID') ?? '1021740679928-h6lqqb6ndqa4cqva06556aki2kq2fklc.apps.googleusercontent.com';
  },
  get googleClientId() {
    return env('GOOGLE_CLIENT_ID');
  },
  /**
   * Para estimar en el admin cuánto cuesta la IA de cada uno: dólares por millón de tokens de entrada y de salida.
   * Configurables (IA_PRECIO_ENTRADA, IA_PRECIO_SALIDA) porque dependen del modelo y del acuerdo con Anthropic.
   */
  get iaPrecios() {
    return { entrada: Number(env('IA_PRECIO_ENTRADA') ?? 5), salida: Number(env('IA_PRECIO_SALIDA') ?? 25) };
  },
  /** El ID de medición de Google Analytics (G-…), para la página de presentación. Sin él, no se mide nada. */
  get analytics() {
    return env('GA_MEASUREMENT_ID');
  },
};
