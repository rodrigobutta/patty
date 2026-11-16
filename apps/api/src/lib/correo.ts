// Mails de aviso (con la API HTTP de Resend, sin dependencias; la misma idea que en la app de Quincho). Si no está
// configurado, no se manda nada y la app sigue igual.
// Variables: RESEND_API_KEY; SIGNUP_NOTIFY_TO (a quién avisar de los usuarios nuevos, varios separados por coma; si no
// está, a Rodrigo) y EMAIL_FROM (por defecto el remitente de prueba de Resend, que solo entrega al dueño de la cuenta).
import { config } from '../config.js';

export interface Correo {
  para: string[];
  asunto: string;
  texto: string;
  html: string;
}

type Enviador = (c: Correo) => Promise<void>;

let enviadorPrueba: Enviador | undefined;
/** Para las pruebas: reemplaza el envío (undefined = el de verdad). */
export function usarEnviador(e: Enviador | undefined): void {
  enviadorPrueba = e;
}

async function enviarResend(c: Correo): Promise<void> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to: c.para, subject: c.asunto, text: c.texto, html: c.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
}

let avisadoSinConfig = false;

/** Manda un mail sin frenar a nadie: si falla, queda en el log (sin la clave) y listo. */
export async function enviar(c: Correo): Promise<boolean> {
  if (!c.para.length) return false;
  const enviador = enviadorPrueba ?? (config.resendApiKey ? enviarResend : undefined);
  if (!enviador) {
    if (!avisadoSinConfig) console.log('Mails: sin RESEND_API_KEY, no se mandan avisos.');
    avisadoSinConfig = true;
    return false;
  }
  try {
    await enviador(c);
    return true;
  } catch (e) {
    console.log('Mails: no se pudo mandar «' + c.asunto + '»:', (e as Error).message);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** "16/11/2026 09:46" en hora de Buenos Aires. */
export const fechaHoraAR = (d: Date): string =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d)
    .replace(',', '');

export interface NuevoUsuario {
  nombre: string;
  email: string;
  metodo: 'google' | 'clave';
  totalUsuarios: number;
  cuando?: Date;
}

/** El aviso de un usuario nuevo (asunto, texto y HTML). */
export function correoNuevoUsuario(u: NuevoUsuario, para: string[]): Correo {
  const quien = u.nombre || u.email;
  const metodo = u.metodo === 'google' ? 'Google' : 'usuario y clave';
  const cuando = fechaHoraAR(u.cuando ?? new Date());
  const link = `${config.urlAdmin.replace(/\/$/, '')}/`;
  const filas: Array<[string, string]> = [['Nombre', u.nombre || '—'], ['Email', u.email || '—'], ['Cómo se registró', metodo], ['Cuándo', `${cuando} (hora de Buenos Aires)`], ['Usuarios en total', String(u.totalUsuarios)]];
  return {
    para,
    asunto: `Nuevo usuario en Patty: ${quien}`,
    texto: `Se registró un usuario nuevo en Patty.\n\n${filas.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nAdministración: ${link}\n`,
    html:
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#2a2440">` +
      `<p>Se registró un usuario nuevo en <b>Patty</b>.</p><table style="border-collapse:collapse">` +
      filas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#8a83a3">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('') +
      `</table><p><a href="${esc(link)}" style="color:#6b4fbb">Abrir la administración</a></p></div>`,
  };
}

/** A quién avisar de los usuarios nuevos (SIGNUP_NOTIFY_TO, separados por coma). */
export const destinatariosAviso = (): string[] =>
  config.signupNotifyTo
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
