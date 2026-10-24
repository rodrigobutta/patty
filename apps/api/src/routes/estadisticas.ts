// Números para mirar (en Patrones): lo que más se anotó, ánimo, dolores, sueño, clima, movimiento y remedios de los
// últimos días; y, para una cosa puntual ("dolor de cabeza", "huevos"), los días en que pasó, para el calendario.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { COMO_ME_SENTI, COMO_ME_SIENTO, type Estadisticas, type SerieConcepto } from 'shared';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, localAInstante, sumarDias } from '../lib/fechas.js';
import { type Env } from '../lib/http.js';
import { COLUMNAS, DESDE, tomasDe, type Fila } from './tratamientos.js';

/** Promedio de horas (en minutos del día); las de la madrugada cuentan como "tarde" (la 1:00 es 25:00). */
function horaPromedio(lista: number[], madrugadaTarde: boolean): number | null {
  if (!lista.length) return null;
  const v = lista.map((m) => (madrugadaTarde && m < 300 ? m + 1440 : m));
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length) % 1440;
}

export const rutasEstadisticas = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1&dias=30
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(c.req.query('persona')), false);
    const dias = Math.min(Math.max(Number(c.req.query('dias')) || 30, 7), 365);
    const hasta = diaDePatty(new Date(), p.zona_horaria);
    const desde = sumarDias(hasta, -(dias - 1));
    const enRango = sql`r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hasta}`;

    const actividad = await filas<{ fecha: string; n: number }>(
      db,
      sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, count(*)::int AS n FROM registros r WHERE ${enRango} GROUP BY r.fecha ORDER BY r.fecha`,
    );
    const top = await filas<Estadisticas['top'][number]>(
      db,
      sql`SELECT c.id AS concepto_id, c.nombre AS concepto, c.categoria_id, k.clave AS categoria, count(DISTINCT r.fecha)::int AS dias,
                 count(*)::int AS veces, sum(r.valor)::float AS suma, max(r.unidad) AS unidad
          FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE ${enRango} AND c.nombre NOT IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI})
          GROUP BY c.id, c.nombre, c.categoria_id, k.clave ORDER BY count(DISTINCT r.fecha) DESC, count(*) DESC LIMIT 40`,
    );
    const animo = await filas<{ intensidad: number }>(
      db,
      sql`SELECT r.intensidad FROM registros r JOIN conceptos c ON c.id = r.concepto_id
          WHERE ${enRango} AND c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI}) AND r.intensidad IS NOT NULL`,
    );
    const sueno = await filas<{ nombre: string; valor: number }>(
      db,
      sql`SELECT c.nombre, r.valor FROM registros r JOIN conceptos c ON c.id = r.concepto_id
          WHERE ${enRango} AND c.nombre IN ('Me acosté', 'Me levanté') AND r.valor IS NOT NULL`,
    );
    // De lo automático: el resumen del día del clima y lo que mide el teléfono.
    const auto = await filas<{ nombre: string; fecha: string; suma: number; promedio: number }>(
      db,
      sql`SELECT c.nombre, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.suma::float AS suma, s.promedio::float AS promedio
          FROM serie_diaria s JOIN conceptos c ON c.id = s.concepto_id
          WHERE s.persona_id = ${p.id} AND s.fecha BETWEEN ${desde} AND ${hasta}
            AND c.nombre IN ('Lluvia del día', 'Horas de sol', 'Temperatura media', 'Temperatura máxima', 'Pasos', 'Km recorridos', 'Tiempo de pantalla', 'Llamadas')`,
    );
    const de = (n: string) => auto.filter((a) => a.nombre === n);
    const prom = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
    const lluvia = de('Lluvia del día');

    // Remedios: tomas programadas del período y cuántas se tomaron.
    const desdeI = localAInstante(desde, '05:00', p.zona_horaria);
    const hastaI = new Date(Math.min(Date.now(), localAInstante(sumarDias(hasta, 1), '05:00', p.zona_horaria).getTime()));
    const trat = await filas<Fila>(db, sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.persona_id = ${p.id} AND t.borrado IS NULL`);
    const tomas = await tomasDe(db, trat, desdeI, hastaI);

    const r: Estadisticas = {
      desde,
      hasta,
      dias,
      dias_anotados: actividad.length,
      actividad,
      top,
      animo: animo.map((a) => a.intensidad),
      dolores: top.filter((t) => t.categoria === 'sintoma'),
      sueno: {
        acoste: horaPromedio(sueno.filter((s) => s.nombre === 'Me acosté').map((s) => s.valor), true),
        levante: horaPromedio(sueno.filter((s) => s.nombre === 'Me levanté').map((s) => s.valor), false),
      },
      clima: {
        dias_con_datos: lluvia.length,
        dias_lluvia: lluvia.filter((l) => l.suma >= 0.5).length,
        mm: lluvia.reduce((a, l) => a + (l.suma ?? 0), 0),
        sol_promedio: prom(de('Horas de sol').map((l) => l.suma)),
        temp_media: prom(de('Temperatura media').map((l) => l.promedio)),
        temp_max: de('Temperatura máxima').reduce<number | null>((a, l) => (a === null || l.suma > a ? l.suma : a), null),
      },
      movimiento: {
        pasos_promedio: prom(de('Pasos').map((l) => l.suma)),
        km: de('Km recorridos').reduce((a, l) => a + (l.suma ?? 0), 0),
        pantalla_promedio: prom(de('Tiempo de pantalla').map((l) => l.suma)),
        llamadas: de('Llamadas').reduce((a, l) => a + (l.suma ?? 0), 0),
      },
      remedios: { programadas: tomas.length, tomadas: tomas.filter((t) => t.estado === 'tomada').length },
    };
    return c.json(r);
  })
  .get('/concepto', async (c) => {
    // ?persona=1&concepto=ID&dias=180: los días en que pasó (con cuántas veces, cuánto o qué intensidad).
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(c.req.query('persona')), false);
    const dias = Math.min(Math.max(Number(c.req.query('dias')) || 180, 7), 730);
    const hasta = diaDePatty(new Date(), p.zona_horaria);
    const desde = sumarDias(hasta, -(dias - 1));
    const concepto = await una<SerieConcepto['concepto']>(
      db,
      sql`SELECT c.id, c.nombre, c.tipo_valor, c.unidad, c.categoria_id FROM conceptos c WHERE c.id = ${Number(c.req.query('concepto')) || 0}`,
    );
    if (!concepto) throw new ErrorApi('No existe.', 404);
    const serie = await filas<SerieConcepto['dias'][number]>(
      db,
      sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, sum(veces)::int AS veces, sum(suma)::float AS suma, max(intensidad_max)::int AS intensidad
          FROM serie_diaria WHERE persona_id = ${p.id} AND concepto_id = ${concepto.id} AND fecha BETWEEN ${desde} AND ${hasta}
          GROUP BY fecha ORDER BY fecha`,
    );
    const r: SerieConcepto = { concepto, desde, hasta, dias: serie };
    return c.json(r);
  });
