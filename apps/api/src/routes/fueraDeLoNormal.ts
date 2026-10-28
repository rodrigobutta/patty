// Lo que se salió de lo normal de la persona (ver patrones/fueraDeLoNormal.ts): el Día muestra lo nuevo de la semana.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, sumarDias } from '../lib/fechas.js';
import { cuerpo, idParam, type Env } from '../lib/http.js';

export const rutasFueraDeLoNormal = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1&dias=7
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const dias = Math.min(60, Math.max(1, Number(c.req.query('dias')) || 7));
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    return c.json(
      await filas(
        c.var.db,
        sql`SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, clave, emoji, texto, estado, creado FROM fuera_de_lo_normal
            WHERE persona_id = ${p.id} AND fecha > ${sumarDias(hoy, -dias)} ORDER BY fecha DESC, id`,
      ),
    );
  })
  .put('/:id', async (c) => {
    const id = idParam(c);
    const estado = (await cuerpo(c)).estado;
    if (!['nuevo', 'visto'].includes(estado as string)) throw new ErrorApi('Estado inválido.');
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM fuera_de_lo_normal WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, false);
    await c.var.db.execute(sql`UPDATE fuera_de_lo_normal SET estado = ${estado as string} WHERE id = ${id}`);
    return c.json({ ok: true });
  });
