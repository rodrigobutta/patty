// Avisos push al iPhone directo por APNs (el servicio de Apple), sin Firebase: el iPhone le da a la app un token de
// APNs y el servidor le manda el aviso firmando un JWT con la clave .p8 de la cuenta de Apple Developer
// (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY y, para las versiones de prueba instaladas desde Xcode, APNS_SANDBOX=1).
import { createSign } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';
import { config } from '../config.js';
import type { Aviso } from './firebase.js';

const TEMA = 'ar.patty.app';

export const appleDisponible = (): boolean => Boolean(config.apnsKeyId && config.apnsTeamId && config.apnsKey);

const b64 = (x: string | Buffer) => Buffer.from(x).toString('base64url');

let jwt: { token: string; creado: number } | null = null;
function token(): string {
  // Apple pide renovarlo entre 20 y 60 minutos.
  if (jwt && Date.now() - jwt.creado < 40 * 60000) return jwt.token;
  const cabeza = b64(JSON.stringify({ alg: 'ES256', kid: config.apnsKeyId }));
  const datos = b64(JSON.stringify({ iss: config.apnsTeamId, iat: Math.floor(Date.now() / 1000) }));
  const clave = config.apnsKey!.includes('BEGIN') ? config.apnsKey! : `-----BEGIN PRIVATE KEY-----\n${config.apnsKey}\n-----END PRIVATE KEY-----`;
  const firma = createSign('SHA256').update(`${cabeza}.${datos}`).sign({ key: clave.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' }, 'base64url');
  jwt = { token: `${cabeza}.${datos}.${firma}`, creado: Date.now() };
  return jwt.token;
}

let sesion: ClientHttp2Session | null = null;
function conexion(): ClientHttp2Session {
  if (sesion && !sesion.closed && !sesion.destroyed) return sesion;
  sesion = connect(config.apnsSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
  sesion.on('error', () => (sesion = null));
  sesion.on('goaway', () => (sesion = null));
  sesion.unref();
  return sesion;
}

export function enviarAvisoApple(dispositivo: string, a: Aviso): Promise<'ok' | 'invalido' | 'error'> {
  if (!appleDisponible()) return Promise.resolve('error');
  return new Promise((resolver) => {
    try {
      const pedido = conexion().request({
        ':method': 'POST',
        ':path': `/3/device/${dispositivo}`,
        authorization: `bearer ${token()}`,
        'apns-topic': TEMA,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let estado = 0;
      let cuerpo = '';
      pedido.on('response', (h) => (estado = Number(h[':status'])));
      pedido.on('data', (d: Buffer) => (cuerpo += d.toString()));
      pedido.on('end', () => {
        if (estado === 200) return resolver('ok');
        if (estado === 410 || cuerpo.includes('BadDeviceToken') || cuerpo.includes('Unregistered')) return resolver('invalido');
        console.error(`APNs respondió ${estado}: ${cuerpo.slice(0, 200)}`);
        resolver('error');
      });
      pedido.on('error', (e) => {
        console.error('No se pudo mandar el aviso al iPhone:', e);
        resolver('error');
      });
      pedido.setTimeout(10000, () => {
        pedido.close();
        resolver('error');
      });
      pedido.end(JSON.stringify({ aps: { alert: { title: a.titulo, body: a.cuerpo }, sound: 'default', 'thread-id': a.canal ?? 'avisos' }, ...(a.datos ?? {}) }));
    } catch (e) {
      console.error('No se pudo mandar el aviso al iPhone:', e);
      resolver('error');
    }
  });
}
