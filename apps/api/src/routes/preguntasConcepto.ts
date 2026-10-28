// Las preguntas que la persona configura para lo que anota ("Café" → "¿Con qué?"). Ver preguntas_concepto.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { normalizar, type PreguntaConcepto } from 'shared';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';

const COLUMNAS = sql`id, persona_id, concepto, pregunta, opciones, varias, activa`;
/** Una lista de textos como text[] de Postgres. */
const arreglo = (l: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(l)}::jsonb))`;

/** Las preguntas activas de una persona (para la IA y para anotar). */
export function preguntasDe(db: Db | Tx, personaId: number, soloActivas = true): Promise<PreguntaConcepto[]> {
  return filas<PreguntaConcepto>(
    db,
    sql`SELECT ${COLUMNAS} FROM preguntas_concepto WHERE persona_id = ${personaId} ${soloActivas ? sql`AND activa` : sql``} ORDER BY concepto, id`,
  );
}

function validar(d: Record<string, unknown>) {
  const concepto = texto(d.concepto).slice(0, 60);
  const pregunta = texto(d.pregunta).slice(0, 120);
  const opciones = (Array.isArray(d.opciones) ? d.opciones : []).map((o) => texto(o).slice(0, 40)).filter(Boolean).slice(0, 8);
  if (!concepto || !pregunta) throw new ErrorApi('Falta qué cosa y qué preguntar.');
  if (opciones.length < 2) throw new ErrorApi('Poné al menos dos respuestas posibles.');
  return { concepto, pregunta, opciones, varias: Boolean(d.varias), activa: d.activa === undefined ? true : Boolean(d.activa) };
}

export const rutasPreguntasConcepto = new Hono<Env>()
  .get('/', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await preguntasDe(c.var.db, p.id, false));
  })
  .post('/', async (c) => {
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const v = validar(d);
    const r = await una<PreguntaConcepto>(
      c.var.db,
      sql`INSERT INTO preguntas_concepto (persona_id, concepto, concepto_norm, pregunta, opciones, varias, activa)
          VALUES (${p.id}, ${v.concepto}, ${normalizar(v.concepto)}, ${v.pregunta}, ${arreglo(v.opciones)}, ${v.varias}, ${v.activa}) RETURNING ${COLUMNAS}`,
    );
    return c.json(r, 201);
  })
  .put('/:id', async (c) => {
    const id = idParam(c);
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM preguntas_concepto WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, true);
    const v = validar(await cuerpo(c));
    const r = await una<PreguntaConcepto>(
      c.var.db,
      sql`UPDATE preguntas_concepto SET concepto = ${v.concepto}, concepto_norm = ${normalizar(v.concepto)}, pregunta = ${v.pregunta},
          opciones = ${arreglo(v.opciones)}, varias = ${v.varias}, activa = ${v.activa} WHERE id = ${id} RETURNING ${COLUMNAS}`,
    );
    return c.json(r);
  })
  .delete('/:id', async (c) => {
    const id = idParam(c);
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM preguntas_concepto WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, true);
    await c.var.db.execute(sql`DELETE FROM preguntas_concepto WHERE id = ${id}`);
    return c.json({ ok: true });
  });
