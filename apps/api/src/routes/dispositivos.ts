// Los teléfonos de cada usuario para los avisos push: la app manda su token de Firebase al arrancar (y hasta cuándo
// tiene programados sus propios recordatorios), y se puede pedir un aviso de prueba.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, texto, type Env } from '../lib/http.js';
import { enviarAviso, pushDisponible } from '../push/firebase.js';

export const rutasDispositivos = new Hono<Env>()
  .post('/', async (c) => {
    // {token, plataforma, avisos_hasta?}: si el token era de otro usuario (se cambió de cuenta en el teléfono), pasa a este.
    const d = await cuerpo(c);
    const token = texto(d.token);
    if (!token || token.length > 4096) throw new ErrorApi('Falta el token del teléfono.');
    const plataforma = ['android', 'ios'].includes(texto(d.plataforma)) ? texto(d.plataforma) : 'android';
    const hasta = d.avisos_hasta ? new Date(String(d.avisos_hasta)) : null;
    const avisosHasta = hasta && !Number.isNaN(hasta.getTime()) ? hasta.toISOString() : null;
    await c.var.db.execute(sql`INSERT INTO dispositivos (usuario_id, token, plataforma, avisos_hasta)
      VALUES (${c.var.usuario.id}, ${token}, ${plataforma}, ${avisosHasta})
      ON CONFLICT (token) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, plataforma = EXCLUDED.plataforma,
        avisos_hasta = EXCLUDED.avisos_hasta, actualizado = now()`);
    return c.json({ ok: true });
  })
  .delete('/', async (c) => {
    // ?token=: al salir de la cuenta, ese teléfono deja de recibir avisos.
    await c.var.db.execute(sql`DELETE FROM dispositivos WHERE token = ${texto(c.req.query('token'))} AND usuario_id = ${c.var.usuario.id}`);
    return c.json({ ok: true });
  })
  .post('/probar', async (c) => {
    // Un aviso de prueba a todos los teléfonos del usuario.
    if (!pushDisponible()) throw new ErrorApi('El servidor todavía no tiene Firebase configurado.');
    const lista = await filas<{ id: number; token: string }>(c.var.db, sql`SELECT id, token FROM dispositivos WHERE usuario_id = ${c.var.usuario.id}`);
    if (!lista.length) throw new ErrorApi('Este usuario no tiene ningún teléfono registrado para avisos.');
    let ok = 0;
    for (const d of lista) {
      const r = await enviarAviso(d.token, { titulo: 'Patty', cuerpo: '¡Hola! Así te van a llegar los avisos 🦉', datos: { tipo: 'prueba' } });
      if (r === 'ok') ok++;
      if (r === 'invalido') await c.var.db.execute(sql`DELETE FROM dispositivos WHERE id = ${d.id}`);
    }
    return c.json({ enviados: ok, dispositivos: lista.length });
  });
