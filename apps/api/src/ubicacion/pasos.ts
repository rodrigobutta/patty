// Los pasos como dato para saber qué fue cada rato, y al revés: la ubicación como dato para saber si una caminata de los
// pasos fue de verdad. Los pasos solo llegan al servidor como caminatas (10 minutos o más a ritmo de caminata: ver
// caminatasDe en la app), con su hora: una caminata corta no deja rastro acá.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { obtenerOCrearConcepto } from '../routes/conceptos.js';
import { caminataContradicha, type Pasos, type Tramo } from './movimiento.js';

export const CAMINATA = 'Caminata';
export const FUENTE_CAMINATAS = 'Caminatas';

export async function fuenteCaminatas(tx: Tx, personaId: number): Promise<number> {
  const f = await una<{ id: number }>(tx, sql`SELECT id FROM fuentes WHERE persona_id = ${personaId} AND tipo = 'reloj' AND nombre = ${FUENTE_CAMINATAS}`);
  if (f) return f.id;
  const n = await una<{ id: number }>(
    tx,
    sql`INSERT INTO fuentes (persona_id, tipo, nombre, token_hash) VALUES (${personaId}, 'reloj', ${FUENTE_CAMINATAS}, ${createHash('sha256').update(randomBytes(32)).digest('hex')}) RETURNING id`,
  );
  return n!.id;
}

/**
 * Lo que se sabe de los pasos en un rato: las caminatas (también las descartadas: decidir si son falsas es justamente lo
 * que se está por hacer con ellas) y de cuándo a cuándo hay datos de pasos: desde el primer día con pasos del rato hasta la
 * última vez que sincronizó el reloj. Más tarde que eso, no ver pasos no dice nada.
 */
export async function pasosDe(db: Db | Tx, personaId: number, desde: number, hasta: number): Promise<Pasos> {
  const d = new Date(desde).toISOString();
  const h = new Date(hasta).toISOString();
  const ratos = await filas<{ inicio: string; fin: string; pasos: number | null }>(
    db,
    sql`SELECT u.inicio, u.fin, cp.pasos FROM (
          SELECT m.inicio, m.fin FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id
          WHERE m.persona_id = ${personaId} AND f.tipo = 'reloj' AND f.nombre = ${FUENTE_CAMINATAS} AND m.fin >= ${d} AND m.inicio <= ${h}
          UNION ALL
          SELECT inicio, fin FROM caminatas_descartadas WHERE persona_id = ${personaId} AND fin >= ${d} AND inicio <= ${h}
        ) u LEFT JOIN caminatas_pasos cp ON cp.persona_id = ${personaId} AND cp.inicio = u.inicio`,
  );
  const datos = await una<{ desde: string | null; hasta: string | null }>(
    db,
    sql`SELECT (SELECT min(m.inicio) FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id JOIN fuentes f ON f.id = m.fuente_id
                WHERE m.persona_id = ${personaId} AND f.tipo = 'reloj' AND c.nombre = 'Pasos' AND m.valor > 0
                  AND m.inicio >= ${new Date(desde - 86400000).toISOString()} AND m.inicio <= ${h}) AS desde,
               (SELECT max(ultimo_uso) FROM fuentes WHERE persona_id = ${personaId} AND tipo = 'reloj') AS hasta`,
  );
  return {
    ratos: ratos.map((r) => ({ inicio: new Date(r.inicio).getTime(), fin: new Date(r.fin).getTime(), pasos: r.pasos })),
    desde: datos?.desde ? new Date(datos.desde).getTime() : null,
    hasta: datos?.hasta ? new Date(datos.hasta).getTime() : null,
  };
}

/**
 * Pone cada caminata que empezó en ese rato donde corresponde según estos tramos: las que pasaron en un vehículo salen de
 * `mediciones` (así no las cuenta nada: ni el Día, ni los patrones, ni la IA) y quedan en `caminatas_descartadas`; las
 * descartadas que ya no se contradicen, vuelven. No se pierde nada, y si cambia cómo se clasifica se corrige solo.
 */
export async function revisarCaminatas(tx: Tx, personaId: number, tramos: Tramo[], desde: number, hasta: number): Promise<void> {
  const d = new Date(desde).toISOString();
  const h = new Date(hasta).toISOString();
  const activas = await filas<{ id: number; inicio: string; fin: string; fecha: string; valor: number }>(
    tx,
    sql`SELECT m.id, m.inicio, m.fin, to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.valor FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id
        WHERE m.persona_id = ${personaId} AND f.tipo = 'reloj' AND f.nombre = ${FUENTE_CAMINATAS} AND m.fin IS NOT NULL AND m.inicio BETWEEN ${d} AND ${h}`,
  );
  const rato = (x: { inicio: string; fin: string }) => ({ inicio: new Date(x.inicio).getTime(), fin: new Date(x.fin).getTime() });
  for (const m of activas.filter((x) => caminataContradicha(rato(x), tramos))) {
    await tx.execute(
      sql`INSERT INTO caminatas_descartadas (persona_id, inicio, fin, fecha, valor) VALUES (${personaId}, ${m.inicio}, ${m.fin}, ${m.fecha}, ${m.valor})
          ON CONFLICT (persona_id, inicio) DO UPDATE SET fin = excluded.fin, fecha = excluded.fecha, valor = excluded.valor`,
    );
    await tx.execute(sql`DELETE FROM mediciones WHERE id = ${m.id}`);
  }
  const fuera = await filas<{ id: number; inicio: string; fin: string; fecha: string; valor: number }>(
    tx,
    sql`SELECT id, inicio, fin, to_char(fecha, 'YYYY-MM-DD') AS fecha, valor FROM caminatas_descartadas WHERE persona_id = ${personaId} AND inicio BETWEEN ${d} AND ${h}`,
  );
  const vuelven = fuera.filter((x) => !caminataContradicha(rato(x), tramos));
  if (!vuelven.length) return;
  const fuente = await fuenteCaminatas(tx, personaId);
  const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'actividad'`);
  const { concepto } = await obtenerOCrearConcepto(tx, { nombre: CAMINATA, categoriaId: cat!.id, tipoValor: 'duracion', unidad: 'min' });
  for (const m of vuelven) {
    await tx.execute(
      sql`INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fin, fecha, valor, unidad)
          VALUES (${personaId}, ${concepto.id}, ${fuente}, ${m.inicio}, ${m.fin}, ${m.fecha}, ${m.valor}, 'min') ON CONFLICT DO NOTHING`,
    );
    await tx.execute(sql`DELETE FROM caminatas_descartadas WHERE id = ${m.id}`);
  }
}
