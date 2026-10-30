// La gente de cada persona: la lista para anotar "con quién estuve" con un toque, y para darla de alta, cambiarle el
// nombre o sacarla. Cada nombre es un concepto de la categoría "Con gente" (así entra en los patrones).
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { esRelacion, normalizar, type Relacion } from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';
import { obtenerOCrearConcepto } from './conceptos.js';

export interface Alguien {
  id: number;
  nombre: string;
  /** Cuántas veces se anotó que estuvo con esa persona (los más frecuentes primero). */
  veces: number;
  /** Qué es para la persona (familia, trabajo…), si lo dijo. */
  relacion: Relacion | null;
}

async function categoriaGente(tx: Tx): Promise<number> {
  const c = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'gente'`);
  if (!c) throw new ErrorApi('Falta la categoría de gente.', 500);
  return c.id;
}

/** La gente de una persona (la que dio de alta y con la que anotó que estuvo). */
export function genteDe(tx: Tx, personaId: number): Promise<Alguien[]> {
  return filas<Alguien>(
    tx,
    sql`SELECT c.id, c.nombre, count(r.id)::int AS veces,
               (SELECT g.relacion FROM gente g WHERE g.persona_id = ${personaId} AND g.concepto_id = c.id) AS relacion
        FROM conceptos c
        LEFT JOIN registros r ON r.concepto_id = c.id AND r.persona_id = ${personaId} AND r.borrado IS NULL
        WHERE (c.id IN (SELECT concepto_id FROM gente WHERE persona_id = ${personaId} AND NOT oculta)
           OR c.id IN (SELECT r2.concepto_id FROM registros r2 JOIN conceptos c2 ON c2.id = r2.concepto_id JOIN categorias k ON k.id = c2.categoria_id
                       WHERE r2.persona_id = ${personaId} AND r2.borrado IS NULL AND k.clave = 'gente'))
          AND c.id NOT IN (SELECT concepto_id FROM gente WHERE persona_id = ${personaId} AND oculta)
        GROUP BY c.id ORDER BY 3 DESC, c.nombre`,
  );
}

export const rutasGente = new Hono<Env>()
  .get('/', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await genteDe(c.var.db, p.id));
  })
  .post('/', async (c) => {
    // {persona_id, nombre, relacion?}: dar de alta a alguien ("Juan", "mi mamá"), y qué es (familia, trabajo…).
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const nombre = texto(d.nombre);
    if (!nombre) throw new ErrorApi('Escribí el nombre.');
    const r = await c.var.db.transaction(async (tx) => {
      const { concepto } = await obtenerOCrearConcepto(tx, { nombre, categoriaId: await categoriaGente(tx), tipoValor: 'evento', unidad: null, usuarioId: c.var.usuario.id });
      const relacion = esRelacion(d.relacion) ? d.relacion : null;
      await tx.execute(sql`INSERT INTO gente (persona_id, concepto_id, relacion) VALUES (${p.id}, ${concepto.id}, ${relacion})
        ON CONFLICT (persona_id, concepto_id) DO UPDATE SET oculta = false, relacion = coalesce(EXCLUDED.relacion, gente.relacion)`);
      return { id: concepto.id, nombre: concepto.nombre, veces: 0, relacion };
    });
    return c.json(r, 201);
  })
  .put('/:id/relacion', async (c) => {
    // {persona_id, relacion}: qué es esa persona (familia, pareja, amistad, trabajo, estudio, salud, otro; null la saca).
    const id = idParam(c);
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    if (d.relacion !== null && !esRelacion(d.relacion)) throw new ErrorApi('Esa relación no existe.');
    const relacion = d.relacion as Relacion | null;
    await c.var.db.execute(sql`INSERT INTO gente (persona_id, concepto_id, relacion) VALUES (${p.id}, ${id}, ${relacion})
      ON CONFLICT (persona_id, concepto_id) DO UPDATE SET relacion = EXCLUDED.relacion`);
    return c.json({ id, relacion });
  })
  .put('/:id', async (c) => {
    // {persona_id, nombre}: cambiarle el nombre. Como el nombre es de todos, se pasa a otro concepto (y lo anotado de
    // esta persona con el nombre viejo se mueve al nuevo).
    const id = idParam(c);
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const nombre = texto(d.nombre);
    if (!nombre) throw new ErrorApi('Escribí el nombre.');
    const r = await c.var.db.transaction(async (tx) => {
      const { concepto } = await obtenerOCrearConcepto(tx, { nombre, categoriaId: await categoriaGente(tx), tipoValor: 'evento', unidad: null, usuarioId: c.var.usuario.id });
      if (concepto.id !== id) {
        await tx.execute(sql`UPDATE registros SET concepto_id = ${concepto.id} WHERE persona_id = ${p.id} AND concepto_id = ${id}`);
        // La relación pasa al nombre nuevo.
        const antes = await una<{ relacion: string | null }>(tx, sql`SELECT relacion FROM gente WHERE persona_id = ${p.id} AND concepto_id = ${id}`);
        await tx.execute(sql`DELETE FROM gente WHERE persona_id = ${p.id} AND concepto_id = ${id}`);
        await tx.execute(sql`INSERT INTO gente (persona_id, concepto_id, relacion) VALUES (${p.id}, ${concepto.id}, ${antes?.relacion ?? null})
          ON CONFLICT (persona_id, concepto_id) DO UPDATE SET oculta = false, relacion = coalesce(EXCLUDED.relacion, gente.relacion)`);
      }
      return { id: concepto.id, nombre: concepto.nombre };
    });
    return c.json(r);
  })
  .delete('/:id', async (c) => {
    // ?persona=1: sacarlo de la lista (lo ya anotado queda, pero ya no se ofrece).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), true);
    await c.var.db.execute(sql`INSERT INTO gente (persona_id, concepto_id, oculta) VALUES (${p.id}, ${idParam(c)}, true)
      ON CONFLICT (persona_id, concepto_id) DO UPDATE SET oculta = true`);
    return c.json({ ok: true });
  });

/** Para la IA: los nombres de la gente de la persona, así usa el mismo nombre ("Juan", no "mi amigo Juan"). */
export async function nombresDeGente(tx: Tx, personaId: number): Promise<string[]> {
  return (await genteDe(tx, personaId)).map((x) => x.nombre).filter((n) => normalizar(n)).slice(0, 40);
}
