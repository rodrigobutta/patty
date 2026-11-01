// Los objetivos de la persona (ver shared/metas.ts): crearlos, pausarlos, cumplirlos, borrarlos, su plan, y el consejo o la
// pregunta del día. El plan de base queda al crear, así siempre hay uno; pedir el plan lo arma con IA si se puede.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { emojiDeMeta, ESTADOS_META, normalizar, planBase, SUGERENCIAS_META, type EstadoMeta, type RespuestaConsejo } from 'shared';
import { filas, una } from '../db/client.js';
import { hayIa } from '../ia/cliente.js';
import { consejoDelDia, pedirPlan } from '../ia/metas.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty } from '../lib/fechas.js';
import { cuerpo, idParam, texto, type C, type Env } from '../lib/http.js';
import { COLUMNAS_META, conDetalle, type FilaMeta } from '../lib/metas.js';
import { conUso, controlarLimite } from '../lib/usoIa.js';

const ACTIVAS_MAX = 10;
const RESPUESTAS: RespuestaConsejo[] = ['si', 'mas_o_menos', 'no'];

/** El objetivo, si existe y se puede tocar. */
async function metaDe(c: C, id: number, escribir: boolean) {
  const m = await una<FilaMeta>(c.var.db, sql`SELECT ${COLUMNAS_META} FROM metas WHERE id = ${id}`);
  if (!m) throw new ErrorApi('No existe.', 404);
  return { m, p: await persona(c.var.db, c.var.usuario, m.persona_id, escribir) };
}

export const rutasMetas = new Hono<Env>()
  .get('/', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const l = await filas<FilaMeta>(c.var.db, sql`SELECT ${COLUMNAS_META} FROM metas WHERE persona_id = ${p.id} ORDER BY id`);
    return c.json(await Promise.all(l.map((m) => conDetalle(c.var.db, m, hoy))));
  })
  .post('/', async (c) => {
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const t = texto(d.texto).replace(/\s+/g, ' ');
    if (t.length < 3 || t.length > 120) throw new ErrorApi('Escribí tu objetivo (de 3 a 120 letras).');
    const clave = SUGERENCIAS_META.find((s) => s.clave === d.clave)?.clave ?? null;
    const actuales = await filas<{ texto: string; estado: EstadoMeta }>(c.var.db, sql`SELECT texto, estado FROM metas WHERE persona_id = ${p.id} AND estado <> 'cumplida'`);
    if (actuales.some((x) => normalizar(x.texto) === normalizar(t))) throw new ErrorApi('Ese objetivo ya está en tu lista.', 409);
    if (actuales.filter((x) => x.estado === 'activa').length >= ACTIVAS_MAX) throw new ErrorApi('Ya tenés {n} objetivos activos: cumplí o pausá alguno antes de sumar otro.', 400, { n: ACTIVAS_MAX });
    const plan = planBase(t, clave, c.var.idioma);
    const m = await una<FilaMeta>(
      c.var.db,
      sql`INSERT INTO metas (persona_id, texto, emoji, clave, plan) VALUES (${p.id}, ${t}, ${emojiDeMeta(t, clave)}, ${clave}, ${JSON.stringify(plan)}::jsonb) RETURNING ${COLUMNAS_META}`,
    );
    return c.json(await conDetalle(c.var.db, m!, diaDePatty(new Date(), p.zona_horaria)));
  })
  // El seguimiento del Día. Quien solo puede mirar no gasta: ve lo que haya.
  .get('/dia', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const u = c.var.usuario;
    return c.json(await conUso({ usuarioId: u.id, tipo: 'objetivos' }, () => consejoDelDia(c.var.db, p, c.var.idioma, { crear: p.rol !== 'lector' && u.rol !== 'lector' })));
  })
  .put('/dia/:id', async (c) => {
    const id = idParam(c);
    const d = await cuerpo(c);
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM metas_dia WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, true);
    if (d.respuesta !== undefined) {
      if (!RESPUESTAS.includes(d.respuesta as RespuestaConsejo)) throw new ErrorApi('Respuesta inválida.');
      await c.var.db.execute(sql`UPDATE metas_dia SET estado = 'respondido', respuesta = ${d.respuesta as string} WHERE id = ${id}`);
    } else {
      if (!['visto', 'gusta'].includes(d.estado as string)) throw new ErrorApi('Estado inválido.');
      await c.var.db.execute(sql`UPDATE metas_dia SET estado = ${d.estado as string} WHERE id = ${id}`);
    }
    return c.json({ ok: true });
  })
  .put('/:id', async (c) => {
    const { m, p } = await metaDe(c, idParam(c), true);
    const estado = (await cuerpo(c)).estado as EstadoMeta;
    if (!ESTADOS_META.includes(estado)) throw new ErrorApi('Estado inválido.');
    if (estado === 'activa' && m.estado !== 'activa') {
      const n = await una<{ n: number }>(c.var.db, sql`SELECT count(*)::int AS n FROM metas WHERE persona_id = ${p.id} AND estado = 'activa'`);
      if ((n?.n ?? 0) >= ACTIVAS_MAX) throw new ErrorApi('Ya tenés {n} objetivos activos: cumplí o pausá alguno antes de sumar otro.', 400, { n: ACTIVAS_MAX });
    }
    const x = await una<FilaMeta>(c.var.db, sql`UPDATE metas SET estado = ${estado} WHERE id = ${m.id} RETURNING ${COLUMNAS_META}`);
    return c.json(await conDetalle(c.var.db, x!, diaDePatty(new Date(), p.zona_horaria)));
  })
  .delete('/:id', async (c) => {
    const { m } = await metaDe(c, idParam(c), true);
    await c.var.db.execute(sql`DELETE FROM metas WHERE id = ${m.id}`);
    return c.json({ ok: true });
  })
  // El plan con IA. Si ya está no se vuelve a pedir, salvo que quiera rehacerlo. Si no se puede, queda el que había y se avisa por qué.
  .post('/:id/plan', async (c) => {
    const db = c.var.db;
    const { m, p } = await metaDe(c, idParam(c), true);
    const rehacer = (await cuerpo(c)).rehacer === true;
    const responder = async (x: FilaMeta, aviso?: 'sin_ia' | 'limite' | 'fallo') => c.json({ ...(await conDetalle(db, x, diaDePatty(new Date(), p.zona_horaria))), aviso });
    if (m.plan.origen === 'ia' && !rehacer) return responder(m);
    if (!hayIa()) return responder(m, 'sin_ia');
    try {
      await controlarLimite(db, c.var.usuario, 'preguntar');
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 429) return responder(m, 'limite');
      throw e;
    }
    try {
      const plan = await pedirPlan(db, p, m, c.var.idioma);
      if (!plan) return responder(m, 'fallo');
      const x = await una<FilaMeta>(db, sql`UPDATE metas SET plan = ${JSON.stringify(plan)}::jsonb WHERE id = ${m.id} RETURNING ${COLUMNAS_META}`);
      return responder(x!);
    } catch (e) {
      console.error(`Objetivos: la IA no pudo armar el plan del objetivo ${m.id}:`, e instanceof Error ? e.message : e);
      return responder(m, 'fallo');
    }
  });
