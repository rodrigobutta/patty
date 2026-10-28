// Los objetivos de la semana (ver lib/objetivos.ts): los propuestos por el resumen del domingo y los aceptados, con
// cuántos días van cumplidos.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una } from '../db/client.js';
import { lunesDe } from '../ia/resumirSemana.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, sumarDias } from '../lib/fechas.js';
import { cuerpo, idParam, type Env } from '../lib/http.js';
import { progreso, type Objetivo } from '../lib/objetivos.js';

export const rutasObjetivos = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1: los de esta semana y los ya propuestos para la que viene, propuestos o aceptados.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const lunes = lunesDe(hoy);
    const l = await filas<Objetivo>(
      c.var.db,
      sql`SELECT id, persona_id, to_char(semana, 'YYYY-MM-DD') AS semana, texto, emoji, tipo, concepto, valor, meta_dias, estado, logrados
          FROM objetivos WHERE persona_id = ${p.id} AND semana IN (${lunes}, ${sumarDias(lunes, 7)}) AND estado IN ('propuesto', 'aceptado')
          ORDER BY semana, id`,
    );
    return c.json(await Promise.all(l.map((o) => progreso(c.var.db, o, hoy))));
  })
  .put('/:id', async (c) => {
    const id = idParam(c);
    const estado = (await cuerpo(c)).estado;
    if (!['propuesto', 'aceptado', 'descartado'].includes(estado as string)) throw new ErrorApi('Estado inválido.');
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM objetivos WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, true);
    await c.var.db.execute(sql`UPDATE objetivos SET estado = ${estado as string} WHERE id = ${id}`);
    return c.json({ ok: true });
  });
