// Análisis de patrones de una persona y los hallazgos que se van acumulando.
import { controlarLimite } from '../lib/usoIa.js';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Hallazgo, Progreso } from 'shared';
import { una } from '../db/client.js';
import { hallazgos } from '../db/schema.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, sumarDias } from '../lib/fechas.js';
import { cuerpo, idParam, type Env } from '../lib/http.js';
import { analizarPersona, listarHallazgos } from '../patrones/analizar.js';
import { DIAS_MINIMOS } from '../patrones/motor.js';
import { preventivosDeHoy, textoPreventivo } from '../patrones/preventivo.js';

export const rutasPatrones = new Hono<Env>()
  .post('/analisis', async (c) => {
    const d = await cuerpo(c);
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(d.persona_id), true);
    const hasta = esFecha(d.hasta) ? d.hasta : diaDePatty(new Date(), p.zona_horaria);
    const desde = esFecha(d.desde) ? d.desde : sumarDias(hasta, -364);
    if (desde > hasta || desde < sumarDias(hasta, -730)) throw new ErrorApi('El período tiene que ser de hasta dos años.');

    if (d.ia !== false) await controlarLimite(db, c.var.usuario, 'analisis');
    const res = await analizarPersona(db, p, { desde, hasta, idioma: c.var.idioma, ia: d.ia !== false, origen: 'manual' });
    return c.json(res);
  })
  .get('/progreso', async (c) => {
    // ?persona=1: cuántos días anotados hay (y con cómo se sintió), para la rueda que se llena hasta poder buscar.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hasta = diaDePatty(new Date(), p.zona_horaria);
    const r = await una<{ dias: number; dias_efecto: number }>(
      c.var.db,
      sql`SELECT count(DISTINCT r.fecha)::int AS dias,
                 count(DISTINCT r.fecha) FILTER (WHERE k.rol = 'efecto')::int AS dias_efecto
          FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${sumarDias(hasta, -364)} AND ${hasta}`,
    );
    const res: Progreso = { dias: r?.dias ?? 0, dias_efecto: r?.dias_efecto ?? 0, minimo: DIAS_MINIMOS, minimo_efecto: 7 };
    return c.json(res);
  })
  .get('/analisis/ultimo', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await una(c.var.db, sql`SELECT * FROM analisis WHERE persona_id = ${p.id} ORDER BY creado DESC LIMIT 1`));
  })
  .get('/preventivo', async (c) => {
    // ?persona=1: los patrones cuyas causas se juntaron hoy (la tarjeta del Día). Nada si quien mira apagó el aviso.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const u = await una<{ avisar_preventivo: boolean }>(c.var.db, sql`SELECT avisar_preventivo FROM usuarios WHERE id = ${c.var.usuario.id}`);
    if (!u?.avisar_preventivo) return c.json([]);
    const lista = await preventivosDeHoy(c.var.db, p);
    return c.json(lista.map((x) => ({ hallazgo_id: x.hallazgo_id, ...textoPreventivo(x, c.var.idioma) })));
  })
  .get('/hallazgos', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await listarHallazgos(c.var.db, p.id));
  })
  .put('/hallazgos/:id', async (c) => {
    const id = idParam(c);
    const estado = (await cuerpo(c)).estado;
    if (!['nuevo', 'confirmado', 'obvio', 'descartado'].includes(estado as string)) throw new ErrorApi('Estado inválido.');
    const h = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM hallazgos WHERE id = ${id}`);
    if (!h) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, h.persona_id, true);
    await c.var.db.update(hallazgos).set({ estado: estado as Hallazgo['estado'], actualizado: sql`now()` }).where(sql`id = ${id}`);
    return c.json({ ok: true });
  });
