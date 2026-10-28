// Los errores de la app (el navegador o el teléfono): se guardan para verlos en el admin (Salud). Sin sesión también
// (puede fallar antes de entrar), con un límite por dirección para que nadie llene la tabla.
import { Hono } from 'hono';
import { usuarioDeToken } from '../auth/sesion.js';
import { cuerpo, texto, type Env } from '../lib/http.js';
import { registrarError } from '../lib/salud.js';

const POR_HORA = 30;
const cuenta = new Map<string, { n: number; desde: number }>();

export const rutasErrores = new Hono<Env>().post('/errores', async (c) => {
  const quien = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const ahora = Date.now();
  const k = cuenta.get(quien);
  if (k && ahora - k.desde < 3600000 && k.n >= POR_HORA) return c.json({ ok: false }, 429);
  cuenta.set(quien, k && ahora - k.desde < 3600000 ? { n: k.n + 1, desde: k.desde } : { n: 1, desde: ahora });
  const d = await cuerpo(c);
  const mensaje = texto(d.mensaje);
  if (!mensaje) return c.json({ ok: false }, 400);
  const u = await usuarioDeToken(c.var.db, c.var.token).catch(() => null);
  await registrarError(c.var.db, { origen: 'app', mensaje, detalle: texto(d.detalle) || null, donde: texto(d.donde) || null, usuario_id: u?.id ?? null, version: texto(d.version) || null });
  return c.json({ ok: true });
});
