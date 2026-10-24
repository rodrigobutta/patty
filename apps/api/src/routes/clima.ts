// El clima automático: cuando alguien anota algo, el teléfono manda dónde está y acá se guarda el clima de esa hora
// (temperatura, sensación, humedad, lluvia, presión, viento, nubes, UV, sol y calidad del aire, de Open-Meteo) como mediciones de la fuente "Clima automático" de la persona.
//   POST /api/clima   { "persona_id": 1, "lat": -34.6, "lon": -58.4, "inicios": ["2026-10-24T14:20:00-03:00"] }
// Como mucho una lectura por hora y por persona: si ya está completa, no se vuelve a pedir. La ubicación no se guarda.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una, type Tx } from '../db/client.js';
import { fuentes, mediciones } from '../db/schema.js';
import { climaPorHora, comienzoDeHora, MINIMO_POR_HORA } from '../clima/openMeteo.js';
import { resumirClimaDelDia } from '../clima/resumenDiario.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, leerInstante } from '../lib/fechas.js';
import { cuerpo, numeroONulo, type Env } from '../lib/http.js';
import { conceptoMedido } from './ingesta.js';

export const NOMBRE_FUENTE = 'Clima automático';
/** Los resúmenes de cada día (máxima, horas de sol, horas con lluvia…) van en otra fuente, para no mezclarlos con las horas. */
export const NOMBRE_FUENTE_DIA = 'Clima del día';
/** Lo anotado hace más de esto no lleva clima: la ubicación de ahora ya no dice dónde estaba la persona. */
const MAXIMO_ATRAS_MS = 48 * 3600000;

/** La fuente de clima automático de la persona (se crea la primera vez; no tiene token porque no manda nada por ingesta). */
async function fuenteClima(tx: Tx, p: PersonaAcceso, nombre = NOMBRE_FUENTE) {
  const ya = await una<{ id: number }>(tx, sql`SELECT id FROM fuentes WHERE persona_id = ${p.id} AND tipo = 'clima' AND nombre = ${nombre}`);
  if (ya) return ya.id;
  const [f] = await tx
    .insert(fuentes)
    .values({ persona_id: p.id, tipo: 'clima', nombre, token_hash: createHash('sha256').update(randomBytes(32)).digest('hex') })
    .returning({ id: fuentes.id });
  return f.id;
}

/** Vuelve a calcular el resumen del clima de esos días con las horas que hay. */
export async function resumirDias(tx: Tx, p: PersonaAcceso, fuenteHoras: number, fechas: string[]) {
  if (!fechas.length) return;
  const fuenteDia = await fuenteClima(tx, p, NOMBRE_FUENTE_DIA);
  const horas = await filas<{ fecha: string; hora: string; concepto: string; valor: number }>(
    tx,
    sql`SELECT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.inicio AS hora, c.nombre AS concepto, m.valor
        FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
        WHERE m.fuente_id = ${fuenteHoras} AND m.fecha IN ${fechas}`,
  );
  const f = { id: fuenteDia, persona_id: p.id, tipo: 'clima', zona_horaria: p.zona_horaria };
  const cache = new Map<string, number>();
  const valores: Array<typeof mediciones.$inferInsert> = [];
  for (const fecha of fechas) {
    const delDia = horas.filter((h) => h.fecha === fecha).map((h) => ({ hora: new Date(h.hora).getTime(), concepto: h.concepto, valor: Number(h.valor) }));
    for (const v of resumirClimaDelDia(delDia)) {
      valores.push({
        persona_id: p.id,
        fuente_id: fuenteDia,
        concepto_id: await conceptoMedido(tx, f, v.concepto, 'clima', v.unidad, cache),
        // Un valor por día: el inicio fijo (mediodía UTC de esa fecha) hace que recalcular lo actualice.
        inicio: `${fecha}T12:00:00.000Z`,
        fecha,
        valor: v.valor,
        unidad: v.unidad,
      });
    }
  }
  if (valores.length) {
    await tx
      .insert(mediciones)
      .values(valores)
      .onConflictDoUpdate({
        target: [mediciones.persona_id, mediciones.concepto_id, mediciones.inicio, mediciones.fuente_id],
        set: { valor: sql`excluded.valor`, unidad: sql`excluded.unidad` },
      });
  }
}

function coordenada(v: unknown, campo: string, limite: number): number {
  const n = numeroONulo(v, campo);
  if (n === null || Math.abs(n) > limite) throw new ErrorApi(`${campo}: ubicación inválida.`);
  return n;
}

export const rutasClima = new Hono<Env>().post('/', async (c) => {
  const d = await cuerpo(c);
  const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
  const lat = coordenada(d.lat, 'lat', 90);
  const lon = coordenada(d.lon, 'lon', 180);
  const lista = Array.isArray(d.inicios) && d.inicios.length ? d.inicios.slice(0, 50) : [undefined];
  const ahora = Date.now();
  const horas = new Map<number, Date>();
  for (const [i, v] of lista.entries()) {
    const t = leerInstante(v, `inicios[${i}]`);
    if (t.getTime() < ahora - MAXIMO_ATRAS_MS || t.getTime() > ahora + 3600000) continue;
    const h = comienzoDeHora(t);
    horas.set(h.getTime(), h);
  }
  if (!horas.size) return c.json({ ok: true, nuevas: 0 });

  const fuenteId = await c.var.db.transaction((tx) => fuenteClima(tx, p));
  const orden = [...horas.values()].sort((a, b) => a.getTime() - b.getTime());
  const fechas = [...new Set(orden.map((h) => diaDePatty(h, p.zona_horaria)))];
  const ya = await filas<{ inicio: string }>(
    c.var.db,
    sql`SELECT inicio FROM mediciones WHERE fuente_id = ${fuenteId}
        AND inicio BETWEEN ${orden[0].toISOString()} AND ${orden[orden.length - 1].toISOString()}
        GROUP BY inicio HAVING count(*) >= ${MINIMO_POR_HORA}`,
  );
  for (const r of ya) horas.delete(new Date(r.inicio).getTime());
  if (!horas.size) {
    await c.var.db.transaction((tx) => resumirDias(tx, p, fuenteId, fechas));
    return c.json({ ok: true, nuevas: 0 });
  }

  let lecturas;
  try {
    lecturas = await climaPorHora(lat, lon, [...horas.values()]);
  } catch (e) {
    console.error('Clima:', e);
    throw new ErrorApi('No se pudo consultar el clima.', 502);
  }
  const nuevas = await c.var.db.transaction(async (tx) => {
    const f = { id: fuenteId, persona_id: p.id, tipo: 'clima', zona_horaria: p.zona_horaria };
    const cache = new Map<string, number>();
    const valores: Array<typeof mediciones.$inferInsert> = [];
    for (const l of lecturas) {
      for (const v of l.valores) {
        valores.push({
          persona_id: p.id,
          fuente_id: fuenteId,
          concepto_id: await conceptoMedido(tx, f, v.concepto, 'clima', v.unidad, cache),
          inicio: l.hora.toISOString(),
          fin: new Date(l.hora.getTime() + 3600000).toISOString(),
          fecha: diaDePatty(l.hora, p.zona_horaria),
          valor: v.valor,
          unidad: v.unidad,
        });
      }
    }
    if (valores.length) await tx.insert(mediciones).values(valores).onConflictDoNothing();
    await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${fuenteId}`);
    await resumirDias(tx, p, fuenteId, fechas);
    return valores.length;
  });
  return c.json({ ok: true, nuevas, lecturas });
});

/**
 * Los conceptos que solo vienen hora por hora del clima: para los patrones se usan los del resumen del día (el promedio
 * de cada hora mezcla la noche con el día). Antes, completa el resumen de los días con horas que todavía no lo tienen.
 */
export async function climaPorHoraParaPatrones(tx: Tx, p: PersonaAcceso, desde: string, hasta: string): Promise<Set<number>> {
  const fuente = await una<{ id: number }>(tx, sql`SELECT id FROM fuentes WHERE persona_id = ${p.id} AND tipo = 'clima' AND nombre = ${NOMBRE_FUENTE}`);
  if (!fuente) return new Set();
  const sinResumen = await filas<{ fecha: string }>(
    tx,
    sql`SELECT DISTINCT to_char(m.fecha, 'YYYY-MM-DD') AS fecha FROM mediciones m
        WHERE m.fuente_id = ${fuente.id} AND m.fecha BETWEEN ${desde} AND ${hasta}
          AND NOT EXISTS (SELECT 1 FROM mediciones d JOIN fuentes fd ON fd.id = d.fuente_id
                          WHERE fd.persona_id = ${p.id} AND fd.nombre = ${NOMBRE_FUENTE_DIA} AND d.fecha = m.fecha)`,
  );
  if (sinResumen.length) await resumirDias(tx, p, fuente.id, sinResumen.map((f) => f.fecha));
  const ids = await filas<{ concepto_id: number }>(tx, sql`SELECT DISTINCT concepto_id FROM mediciones WHERE fuente_id = ${fuente.id}`);
  return new Set(ids.map((x) => Number(x.concepto_id)));
}
