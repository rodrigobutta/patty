// Datos automáticos: un reloj, un atajo del teléfono o un servicio de clima mandan mediciones con el token de su fuente.
//   POST /api/ingesta   Authorization: Bearer patty_...
//   { "mediciones": [ { "concepto": "Pasos", "inicio": "2026-10-24T00:00:00-03:00", "fin": "...", "valor": 8123 } ] }
// Mandar lo mismo dos veces no duplica: se actualiza el valor (misma fuente, concepto e inicio).
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { normalizar } from 'shared';
import { una, type Tx } from '../db/client.js';
import { mediciones } from '../db/schema.js';
import { ErrorApi } from '../lib/errores.js';
import { fechaLocal, leerInstante } from '../lib/fechas.js';
import { cuerpo, numeroONulo, texto, type Env } from '../lib/http.js';
import { obtenerOCrearConcepto } from './conceptos.js';

const CATEGORIA_POR_FUENTE: Record<string, string> = { reloj: 'actividad', telefono: 'pantalla', clima: 'clima', otro: 'otro' };

interface Fuente {
  id: number;
  persona_id: number;
  tipo: string;
  zona_horaria: string;
}

async function conceptoMedido(tx: Tx, f: Fuente, nombre: string, categoria: string, unidad: string | null, cache: Map<string, number>) {
  const clave = `${normalizar(nombre)}|${categoria}`;
  const ya = cache.get(clave);
  if (ya) return ya;
  // Primero, uno que ya exista con ese nombre en cualquier categoría (Pasos, Temperatura...).
  let id = (
    await una<{ id: number }>(
      tx,
      sql`SELECT id FROM conceptos WHERE nombre_norm = ${normalizar(nombre)} AND unido_a IS NULL ORDER BY usos DESC, id LIMIT 1`,
    )
  )?.id;
  if (!id) {
    const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = ${categoria || CATEGORIA_POR_FUENTE[f.tipo]}`);
    if (!cat) throw new ErrorApi(`Categoría desconocida: ${categoria}`);
    id = (await obtenerOCrearConcepto(tx, { nombre, categoriaId: cat.id, tipoValor: 'medida', unidad })).concepto.id;
  }
  cache.set(clave, id);
  return id;
}

export const rutasIngesta = new Hono<Env>().post('/', async (c) => {
  const token = /^Bearer\s+(patty_\S+)$/i.exec(c.req.header('Authorization') ?? '')?.[1];
  if (!token) throw new ErrorApi('Falta el token de la fuente.', 401);
  const hash = createHash('sha256').update(token).digest('hex');
  const f = await una<Fuente>(
    c.var.db,
    sql`SELECT f.id, f.persona_id, f.tipo, p.zona_horaria FROM fuentes f JOIN personas p ON p.id = f.persona_id
        WHERE f.token_hash = ${hash} AND f.activo`,
  );
  if (!f) throw new ErrorApi('Token de fuente inválido.', 401);
  const lista = (await cuerpo(c)).mediciones;
  if (!Array.isArray(lista) || lista.length > 5000) throw new ErrorApi('Mandá una lista "mediciones" (hasta 5000 por vez).');
  const n = await c.var.db.transaction(async (tx) => {
    const cache = new Map<string, number>();
    // Por clave (concepto + inicio): si en el mismo lote viene dos veces, vale la última.
    const porClave = new Map<string, typeof mediciones.$inferInsert>();
    for (const [i, m] of (lista as Array<Record<string, unknown>>).entries()) {
      const nombre = texto(m?.concepto);
      const valor = numeroONulo(m?.valor, `mediciones[${i}].valor`);
      if (!nombre || valor === null) throw new ErrorApi(`mediciones[${i}]: falta "concepto" o "valor".`);
      const inicio = leerInstante(m.inicio, `mediciones[${i}].inicio`);
      const unidad = texto(m.unidad) || null;
      const conceptoId = await conceptoMedido(tx, f, nombre, texto(m.categoria), unidad, cache);
      porClave.set(`${conceptoId}|${inicio.getTime()}`, {
        persona_id: f.persona_id,
        fuente_id: f.id,
        concepto_id: conceptoId,
        inicio: inicio.toISOString(),
        fin: m.fin ? leerInstante(m.fin, `mediciones[${i}].fin`).toISOString() : null,
        // Día calendario (no el de 5 a 5): los resúmenes diarios de los dispositivos vienen con inicio a las 0:00.
        fecha: fechaLocal(inicio, f.zona_horaria),
        valor,
        unidad,
      });
    }
    const filas = [...porClave.values()];
    for (let i = 0; i < filas.length; i += 500) {
      await tx
        .insert(mediciones)
        .values(filas.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [mediciones.persona_id, mediciones.concepto_id, mediciones.inicio, mediciones.fuente_id],
          set: { valor: sql`excluded.valor`, fin: sql`excluded.fin`, unidad: sql`excluded.unidad` },
        });
    }
    await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${f.id}`);
    return lista.length;
  });
  return c.json({ ok: true, recibidas: n });
});
