// Avisos push a los teléfonos con Firebase Cloud Messaging (API HTTP v1). La cuenta de servicio (FIREBASE_SERVICE_ACCOUNT)
// firma un JWT con el que Google da un token de acceso por una hora; con eso se manda cada aviso. Sin dependencias:
// solo crypto de Node y fetch.
import { createSign } from 'node:crypto';
import { config } from '../config.js';
import { appleDisponible, enviarAvisoApple } from './apple.js';

interface Cuenta {
  project_id: string;
  client_email: string;
  private_key: string;
}

function cuenta(): Cuenta | null {
  const crudo = config.firebaseServiceAccount;
  if (!crudo) return null;
  try {
    const c = JSON.parse(crudo) as Cuenta;
    return c.project_id && c.client_email && c.private_key ? c : null;
  } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT no es un JSON válido.');
    return null;
  }
}

/** Si el servidor puede mandar avisos push a algún teléfono (Android con Firebase, iPhone con APNs). */
export const pushDisponible = (): boolean => cuenta() !== null || appleDisponible();

const b64 = (x: string | Buffer) => Buffer.from(x).toString('base64url');

let acceso: { token: string; vence: number } | null = null;

async function tokenDeAcceso(c: Cuenta): Promise<string> {
  if (acceso && acceso.vence > Date.now() + 60000) return acceso.token;
  const ahora = Math.floor(Date.now() / 1000);
  const cabeza = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const datos = b64(
    JSON.stringify({
      iss: c.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: ahora,
      exp: ahora + 3600,
    }),
  );
  const firma = createSign('RSA-SHA256').update(`${cabeza}.${datos}`).sign(c.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabeza}.${datos}.${firma}` }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Firebase no dio acceso: ${j.error_description ?? r.status}`);
  acceso = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return acceso.token;
}

export interface Aviso {
  titulo: string;
  cuerpo: string;
  /** Datos para la app al tocarlo (todos texto). */
  datos?: Record<string, string>;
  /** Canal de Android (los mismos que crea la app: "remedios"). */
  canal?: string;
  /** Avisos con la misma etiqueta se reemplazan en el teléfono en vez de apilarse (los de remedios de una persona). */
  etiqueta?: string;
  /**
   * Botones que se contestan sin abrir la app (Android, máximo 3): el teléfono hace los pedidos a la API con su sesión
   * y cambia el aviso por `listo`. Si con eso quiere seguir (contar qué pasó), `luego` es el aviso que queda.
   */
  acciones?: Array<{ titulo: string; pedidos: Array<{ ruta: string; cuerpo: Record<string, unknown> }>; listo: string; luego?: string }>;
  /** Que el texto arranque con el apodo de quien lo recibe ("Rodri, hoy se juntaron…"), para que suene a Patty. */
  conApodo?: boolean;
}

/** Para las pruebas: reemplaza el envío real. */
let enviarPrueba: ((token: string, a: Aviso) => Promise<'ok' | 'invalido'>) | null = null;
export const usarEnvioPrueba = (f: typeof enviarPrueba) => {
  enviarPrueba = f;
};
/** Si se pueden mandar avisos (Firebase o APNs configurados, o el envío de las pruebas). */
export const hayEnvio = (): boolean => enviarPrueba !== null || pushDisponible();

/**
 * Manda un aviso a un teléfono. "invalido": el token ya no sirve (se desinstaló la app) y hay que olvidarlo. Los
 * iPhone (tokens "ios:…") van directo por APNs; los Android, por Firebase.
 */
export async function enviarAviso(token: string, a: Aviso): Promise<'ok' | 'invalido' | 'error'> {
  if (enviarPrueba) return enviarPrueba(token, a);
  if (token.startsWith('ios:')) return enviarAvisoApple(token.slice(4), a);
  const c = cuenta();
  if (!c) return 'error';
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenDeAcceso(c)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: a.titulo, body: a.cuerpo },
          data: { ...(a.datos ?? {}), ...(a.etiqueta ? { etiqueta: a.etiqueta } : {}), ...(a.acciones?.length ? { acciones: JSON.stringify(a.acciones) } : {}) },
          android: { priority: 'high', notification: { channel_id: a.canal ?? 'avisos', visibility: 'PRIVATE', ...(a.etiqueta ? { tag: a.etiqueta } : {}) } },
        },
      }),
    });
    if (r.ok) return 'ok';
    const texto = await r.text();
    if (r.status === 404 || texto.includes('UNREGISTERED')) return 'invalido';
    console.error(`Firebase respondió ${r.status}: ${texto.slice(0, 300)}`);
    return 'error';
  } catch (e) {
    console.error('No se pudo mandar el aviso push:', e);
    return 'error';
  }
}
