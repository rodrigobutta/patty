// Las caminatas que el teléfono detecta en los pasos del reloj (ver caminatasDe en la app): cada una se guarda como una
// medición "Caminata" (los minutos, con su hora), de la fuente "Caminatas". Cada día se reemplaza entero al sincronizar.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una, type Tx } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { esFecha } from '../lib/fechas.js';
import { cuerpo, type Env } from '../lib/http.js';
import { obtenerOCrearConcepto } from './conceptos.js';

export const CAMINATA = 'Caminata';
const FUENTE = 'Caminatas';

async function fuenteCaminatas(tx: Tx, personaId: number): Promise<number> {
  const f = await una<{ id: number }>(tx, sql`SELECT id FROM fuentes WHERE persona_id = ${personaId} AND tipo = 'reloj' AND nombre = ${FUENTE}`);
  if (f) return f.id;
  const n = await una<{ id: number }>(
    tx,
    sql`INSERT INTO fuentes (persona_id, tipo, nombre, token_hash) VALUES (${personaId}, 'reloj', ${FUENTE}, ${createHash('sha256').update(randomBytes(32)).digest('hex')}) RETURNING id`,
  );
  return n!.id;
}

export const rutasActividad = new Hono<Env>()
  .post('/caminatas', async (c) => {
    // { persona_id, dias: [{ fecha, caminatas: [{ inicio, fin, pasos }] }] }
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const dias = Array.isArray(d.dias) ? (d.dias as Array<{ fecha?: unknown; caminatas?: unknown }>).slice(0, 31) : [];
    let n = 0;
    await c.var.db.transaction(async (tx) => {
      const fuente = await fuenteCaminatas(tx, p.id);
      const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'actividad'`);
      const { concepto } = await obtenerOCrearConcepto(tx, { nombre: CAMINATA, categoriaId: cat!.id, tipoValor: 'duracion', unidad: 'min' });
      for (const x of dias) {
        if (!esFecha(x.fecha) || !Array.isArray(x.caminatas)) continue;
        await tx.execute(sql`DELETE FROM mediciones WHERE persona_id = ${p.id} AND fuente_id = ${fuente} AND fecha = ${x.fecha}`);
        for (const k of (x.caminatas as Array<{ inicio?: unknown; fin?: unknown }>).slice(0, 30)) {
          const a = Date.parse(String(k.inicio));
          const b = Date.parse(String(k.fin));
          if (Number.isNaN(a) || Number.isNaN(b) || b <= a) continue;
          await tx.execute(
            sql`INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fin, fecha, valor, unidad)
                VALUES (${p.id}, ${concepto.id}, ${fuente}, ${new Date(a).toISOString()}, ${new Date(b).toISOString()}, ${x.fecha}, ${Math.round((b - a) / 60000)}, 'min')
                ON CONFLICT DO NOTHING`,
          );
          n++;
        }
      }
    });
    return c.json({ ok: true, caminatas: n });
  })
  .get('/caminatas', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: las caminatas de ese día con su hora (para la hoja del widget de pasos).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    if (!esFecha(fecha)) return c.json([]);
    return c.json(
      await filas(
        c.var.db,
        sql`SELECT m.inicio, m.fin, m.valor::int AS minutos FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id
            WHERE m.persona_id = ${p.id} AND f.nombre = ${FUENTE} AND f.tipo = 'reloj' AND m.fecha = ${fecha} ORDER BY m.inicio`,
      ),
    );
  });
