// El clima automático: cuando alguien anota algo, el teléfono manda dónde está y acá se guarda el clima de esa hora
// (temperatura, sensación, humedad, lluvia, presión, viento, nubes, UV, sol y calidad del aire, de Open-Meteo) como mediciones de la fuente "Clima automático" de la persona.
//   POST /api/clima   { "persona_id": 1, "lat": -34.6, "lon": -58.4, "inicios": ["2026-10-24T14:20:00-03:00"] }
// Como mucho una lectura por hora y por persona: si ya está completa, no se vuelve a pedir. La ubicación no se guarda.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { fuentes, mediciones } from '../db/schema.js';
import { horasDeLuz, lunaIluminada } from '../clima/cielo.js';
import { climaPorHora, comienzoDeHora, MINIMO_POR_HORA, type LecturaClima } from '../clima/openMeteo.js';
import { resumirClimaDelDia } from '../clima/resumenDiario.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, leerInstante, sumarDias } from '../lib/fechas.js';
import { listarHallazgos } from '../patrones/analizar.js';
import { cuerpo, numeroONulo, type Env } from '../lib/http.js';
import { conceptoMedido } from './ingesta.js';

export const NOMBRE_FUENTE = 'Clima automático';
/** Los resúmenes de cada día (máxima, horas de sol, horas con lluvia…) van en otra fuente, para no mezclarlos con las horas. */
export const NOMBRE_FUENTE_DIA = 'Clima del día';
/** Lo anotado hace más de esto no lleva clima: la ubicación de ahora ya no dice dónde estaba la persona. */
const MAXIMO_ATRAS_MS = 48 * 3600000;
/** Las horas de luz y la luna: no dependen del clima ni de que esté prendido, y van en su propia fuente. */
export const NOMBRE_FUENTE_CIELO = 'Sol y luna';

type PersonaZona = Pick<PersonaAcceso, 'id' | 'zona_horaria'>;

/** La fuente de clima automático de la persona (se crea la primera vez; no tiene token porque no manda nada por ingesta). */
async function fuenteClima(tx: Tx, p: PersonaZona, nombre = NOMBRE_FUENTE) {
  const ya = await una<{ id: number }>(tx, sql`SELECT id FROM fuentes WHERE persona_id = ${p.id} AND tipo = 'clima' AND nombre = ${nombre}`);
  if (ya) return ya.id;
  const [f] = await tx
    .insert(fuentes)
    .values({ persona_id: p.id, tipo: 'clima', nombre, token_hash: createHash('sha256').update(randomBytes(32)).digest('hex') })
    .returning({ id: fuentes.id });
  return f.id;
}

/** Vuelve a calcular el resumen del clima de esos días con las horas que hay. */
export async function resumirDias(tx: Tx, p: PersonaZona, fuenteHoras: number, fechas: string[]) {
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
  if (n === null || Math.abs(n) > limite) throw new ErrorApi('{campo}: ubicación inválida.', 400, { campo });
  return n;
}

export const rutasClima = new Hono<Env>()
  .get('/contexto', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: con qué comparar el clima del día en su detalle (la máxima de los 7 días anteriores)
    // y los patrones de la persona en los que el clima es una de las causas (lo que el clima le hace a ella).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const pedida = c.req.query('fecha') ?? '';
    const fecha = esFecha(pedida) ? pedida : diaDePatty(new Date(), p.zona_horaria);
    const semana = await filas<{ fecha: string; maxima: number }>(
      c.var.db,
      sql`SELECT to_char(s.fecha, 'YYYY-MM-DD') AS fecha, max(s.suma)::float AS maxima FROM serie_diaria s JOIN conceptos k ON k.id = s.concepto_id
          WHERE s.persona_id = ${p.id} AND k.nombre = 'Temperatura máxima' AND s.fecha BETWEEN ${sumarDias(fecha, -7)} AND ${sumarDias(fecha, -1)}
          GROUP BY s.fecha ORDER BY s.fecha`,
    );
    const ids = await filas<{ id: number }>(
      c.var.db,
      sql`SELECT h.id FROM hallazgos h
          WHERE h.persona_id = ${p.id} AND h.estado NOT IN ('descartado', 'obvio') AND h.fecha_desde IS NULL AND NOT h.ya_no AND (h.estado = 'confirmado' OR h.q_valor <= 0.1)
            AND EXISTS (SELECT 1 FROM conceptos k JOIN categorias g ON g.id = k.categoria_id WHERE g.clave = 'clima'
              AND (k.id = h.causa_id OR k.id IN (SELECT (e->>'id')::int FROM jsonb_array_elements(h.causas_extra) e)))
          ORDER BY h.puntaje DESC LIMIT 3`,
    );
    return c.json({
      maxima_semana: semana.length >= 3 ? Math.round((semana.reduce((n, x) => n + x.maxima, 0) / semana.length) * 10) / 10 : null,
      maxima_ayer: semana.find((x) => x.fecha === sumarDias(fecha, -1))?.maxima ?? null,
      patrones: ids.length ? await listarHallazgos(c.var.db, p.id, ids.map((x) => x.id)) : [],
    });
  })
  .post('/', async (c) => {
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

  const r = await guardarClima(c.var.db, p, lat, lon, [...horas.values()]);
  const fechas = [...horas.values()].map((h) => diaDePatty(h, p.zona_horaria)).sort();
  await c.var.db.transaction((tx) => completarSolYLuna(tx, p, fechas[0], fechas[fechas.length - 1], lat));
  return c.json({ ok: true, ...r });
});

/** Trae de Open-Meteo el clima de esas horas en ese lugar (las que falten) y lo guarda con el resumen del día. */
export async function guardarClima(db: Db, p: PersonaZona, lat: number, lon: number, lista: Date[]): Promise<{ nuevas: number; lecturas?: LecturaClima[] }> {
  const horas = new Map(lista.map((h) => [h.getTime(), h]));
  const fuenteId = await db.transaction((tx) => fuenteClima(tx, p));
  const orden = [...horas.values()].sort((a, b) => a.getTime() - b.getTime());
  const fechas = [...new Set(orden.map((h) => diaDePatty(h, p.zona_horaria)))];
  const ya = await filas<{ inicio: string }>(
    db,
    sql`SELECT inicio FROM mediciones WHERE fuente_id = ${fuenteId}
        AND inicio BETWEEN ${orden[0].toISOString()} AND ${orden[orden.length - 1].toISOString()}
        GROUP BY inicio HAVING count(*) >= ${MINIMO_POR_HORA}`,
  );
  for (const r of ya) horas.delete(new Date(r.inicio).getTime());
  if (!horas.size) {
    await db.transaction((tx) => resumirDias(tx, p, fuenteId, fechas));
    return { nuevas: 0 };
  }

  let lecturas;
  try {
    lecturas = await climaPorHora(lat, lon, [...horas.values()]);
  } catch (e) {
    console.error('Clima:', e);
    throw new ErrorApi('No se pudo consultar el clima.', 502);
  }
  const nuevas = await db.transaction(async (tx) => {
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
  return { nuevas, lecturas };
}

let enCurso: Promise<unknown> = Promise.resolve();

/**
 * Lo dispara la ubicación que manda el teléfono con Patty cerrada: guarda el clima y el aire de esa hora donde está de
 * verdad, sin hacer esperar la respuesta. Más de una lectura por hora no pide. Si falla, ya lo completará otro punto.
 */
export function climaDespues(db: Db, p: PersonaZona, punto: { lat: number; lon: number; instante: Date }): void {
  if (process.env.CLIMA_DE_FONDO === 'no') return;
  if (punto.instante.getTime() < Date.now() - MAXIMO_ATRAS_MS) return;
  const hecho = guardarClima(db, p, punto.lat, punto.lon, [comienzoDeHora(punto.instante)]).catch((e) => console.error('Clima de fondo:', e instanceof Error ? e.message : e));
  enCurso = Promise.all([enCurso, hecho]);
}

/** Para las pruebas: espera a que termine el clima disparado por la ubicación. */
export const esperarClima = (): Promise<unknown> => enCurso;

/**
 * Las horas de luz y la luna de los días que tienen algo anotado o medido y todavía no las tienen. La latitud es la
 * que se pase (POST /api/clima) o la última conocida de la persona; sin ninguna, solo la luna.
 */
export async function completarSolYLuna(tx: Tx, p: PersonaZona, desde: string, hasta: string, latConocida: number | null = null): Promise<void> {
  const lat =
    latConocida ??
    (await una<{ lat: number }>(
      tx,
      sql`SELECT lat FROM (SELECT lat, instante AS orden FROM puntos WHERE persona_id = ${p.id}
                           UNION ALL SELECT lat, creado AS orden FROM lugares WHERE persona_id = ${p.id}) x ORDER BY orden DESC LIMIT 1`,
    ))?.lat ?? null;
  const dias = await filas<{ fecha: string }>(
    tx,
    sql`SELECT DISTINCT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM serie_diaria WHERE persona_id = ${p.id} AND fecha BETWEEN ${desde} AND ${hasta}`,
  );
  if (!dias.length) return;
  const fuenteId = await fuenteClima(tx, p, NOMBRE_FUENTE_CIELO);
  const ya = await filas<{ fecha: string }>(
    tx,
    sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM mediciones WHERE fuente_id = ${fuenteId} AND fecha BETWEEN ${desde} AND ${hasta}
        GROUP BY fecha HAVING count(*) >= ${lat === null ? 1 : 2}`,
  );
  const completos = new Set(ya.map((x) => x.fecha));
  const f = { id: fuenteId, persona_id: p.id, tipo: 'clima', zona_horaria: p.zona_horaria };
  const cache = new Map<string, number>();
  const valores: Array<typeof mediciones.$inferInsert> = [];
  for (const { fecha } of dias) {
    if (completos.has(fecha)) continue;
    const base = { persona_id: p.id, fuente_id: fuenteId, fecha, inicio: `${fecha}T12:00:00.000Z` };
    valores.push({ ...base, concepto_id: await conceptoMedido(tx, f, 'Luna iluminada', 'clima', '%', cache), valor: lunaIluminada(fecha), unidad: '%' });
    if (lat !== null) valores.push({ ...base, concepto_id: await conceptoMedido(tx, f, 'Horas de luz', 'clima', 'h', cache), valor: horasDeLuz(lat, fecha), unidad: 'h' });
  }
  if (valores.length) await tx.insert(mediciones).values(valores).onConflictDoNothing();
}

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
