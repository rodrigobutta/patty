// Los comentarios de Patty sobre lo que se viene anotando (ver ia/comentar.ts): los del día se arman de madrugada, o al
// pedirlos si todavía no están.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una } from '../db/client.js';
import { comentarDia, type Comentario } from '../ia/comentar.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, sumarDias } from '../lib/fechas.js';
import { cuerpo, idParam, type Env } from '../lib/http.js';

export const rutasComentarios = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1&dias=14 (los últimos días). Con &hoy=1, si los de hoy todavía no están, se arman en el momento.
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(c.req.query('persona')), false);
    if (c.req.query('hoy') === '1' && p.rol !== 'lector') {
      try {
        await comentarDia(db, p, c.var.idioma);
      } catch (e) {
        console.error('Comentarios: no se pudieron armar:', e instanceof Error ? e.message : e);
      }
    }
    const dias = Math.min(60, Math.max(1, Number(c.req.query('dias')) || 14));
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    return c.json(
      await filas<Comentario>(
        db,
        sql`SELECT id, persona_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, emoji, texto, estado FROM comentarios
            WHERE persona_id = ${p.id} AND fecha > ${sumarDias(hoy, -dias)} ORDER BY fecha DESC, id`,
      ),
    );
  })
  .put('/:id', async (c) => {
    const id = idParam(c);
    const estado = (await cuerpo(c)).estado;
    if (!['nuevo', 'visto', 'gusta'].includes(estado as string)) throw new ErrorApi('Estado inválido.');
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM comentarios WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, false);
    await c.var.db.execute(sql`UPDATE comentarios SET estado = ${estado as string} WHERE id = ${id}`);
    return c.json({ ok: true });
  });
