// El informe para el médico en PDF. La app pide un enlace (POST /enlace) y lo abre: en la app de Android el PDF no se
// puede mostrar ni bajar adentro de la app, así que se abre afuera, en el navegador del teléfono, que no tiene la
// sesión. Por eso el enlace lleva un token al azar que sirve solo para ese informe y por unos minutos. Con la sesión
// también se puede pedir directo (GET /?persona=1&dias=30).
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { normalizar, traducir, type Idioma } from 'shared';
import { datosInforme, PERIODOS_INFORME } from '../informe/datos.js';
import { pdfInforme } from '../informe/pdf.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { cuerpo, type C, type Env } from '../lib/http.js';

/** Cuánto dura un enlace al informe. */
export const DURACION_ENLACE_MS = 15 * 60 * 1000;

/**
 * Los enlaces vigentes, en memoria: duran minutos, así que no vale la pena guardarlos en la base (si la API se
 * reinicia en el medio, se vuelve a tocar el botón).
 */
const enlaces = new Map<string, { persona: PersonaAcceso; dias: number; idioma: Idioma; vence: number }>();

const diasDe = (v: unknown): number => {
  const n = Number(v) || 30;
  return (PERIODOS_INFORME as readonly number[]).includes(n) ? n : 30;
};

async function responderPdf(c: C, p: PersonaAcceso, dias: number, idioma: Idioma): Promise<Response> {
  const datos = await datosInforme(c.var.db, p, dias, idioma);
  const pdf = await pdfInforme(datos);
  const nombre = `patty-${normalizar(p.nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'informe'}-${datos.hasta}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombre}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    },
  });
}

/** Lo que no necesita sesión: el PDF de un enlace. */
export const rutasInformePublico = new Hono<Env>().get('/pdf/:token', async (c) => {
  const token = c.req.param('token').replace(/\.pdf$/, '');
  const e = enlaces.get(token);
  if (!e || e.vence < Date.now()) {
    enlaces.delete(token);
    // Se abre en el navegador: un texto simple, no un JSON.
    return c.text(traducir(c.var.idioma, 'El enlace al informe venció. Volvé a pedirlo desde Patty.'), 410);
  }
  return responderPdf(c, e.persona, e.dias, e.idioma);
});

export const rutasInforme = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1&dias=30: el PDF directo, con la sesión.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return responderPdf(c, p, diasDe(c.req.query('dias')), c.var.idioma);
  })
  .post('/enlace', async (c) => {
    // { persona_id, dias }: un enlace al PDF que anda sin la sesión, por unos minutos.
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), false);
    const ahora = Date.now();
    for (const [k, v] of enlaces) if (v.vence < ahora) enlaces.delete(k);
    const token = randomBytes(24).toString('base64url');
    enlaces.set(token, { persona: p, dias: diasDe(d.dias), idioma: c.var.idioma, vence: ahora + DURACION_ENLACE_MS });
    return c.json({ url: `/api/informe/pdf/${token}.pdf`, vence: new Date(ahora + DURACION_ENLACE_MS).toISOString() });
  });
