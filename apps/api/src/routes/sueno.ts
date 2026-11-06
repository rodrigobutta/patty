// Las etapas del sueño de cada noche (las manda el teléfono desde Health Connect / Salud) y lo que sale de ellas: el
// gráfico de la noche y los despertares que se repiten a la misma hora.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, sumarDias } from '../lib/fechas.js';
import { cuerpo, type Env } from '../lib/http.js';
import { resumenGuardado, resumirNoche } from '../ia/resumirNoche.js';
import { despertarRepetido, type EtapaNoche } from '../patrones/despertares.js';
import type { QuincenaSueno } from 'shared';
import { horasDeSueno } from './estadisticas.js';

const ETAPAS = ['despierto', 'ligero', 'profundo', 'rem', 'dormido'];
/** El registro que se anota al contestar por qué se despierta (y que hace que no se vuelva a preguntar por un tiempo). */
export const DESPERTAR = 'Me desperté a la noche';

export const rutasSueno = new Hono<Env>()
  .post('/etapas', async (c) => {
    // { persona_id, noches: [{ noche: 'AAAA-MM-DD', etapas: [{ inicio, fin, etapa }] }] }: cada noche se reemplaza entera.
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const noches = Array.isArray(d.noches) ? (d.noches as Array<{ noche?: unknown; etapas?: unknown }>).slice(0, 31) : [];
    let n = 0;
    await c.var.db.transaction(async (tx) => {
      for (const x of noches) {
        if (!esFecha(x.noche) || !Array.isArray(x.etapas)) continue;
        const etapas = (x.etapas as Array<{ inicio?: unknown; fin?: unknown; etapa?: unknown }>)
          .filter((e) => typeof e.inicio === 'string' && typeof e.fin === 'string' && ETAPAS.includes(String(e.etapa)))
          .filter((e) => !Number.isNaN(Date.parse(String(e.inicio))) && Date.parse(String(e.fin)) > Date.parse(String(e.inicio)))
          .slice(0, 400);
        await tx.execute(sql`DELETE FROM sueno_etapas WHERE persona_id = ${p.id} AND noche = ${x.noche}`);
        for (const e of etapas) {
          await tx.execute(
            sql`INSERT INTO sueno_etapas (persona_id, noche, inicio, fin, etapa) VALUES (${p.id}, ${x.noche}, ${String(e.inicio)}, ${String(e.fin)}, ${String(e.etapa)})`,
          );
          n++;
        }
      }
    });
    return c.json({ ok: true, etapas: n });
  })
  .get('/noche', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: los tramos de la noche que terminó ese día.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    if (!esFecha(fecha)) throw new ErrorApi('Fecha inválida.');
    return c.json(
      await filas(c.var.db, sql`SELECT inicio, fin, etapa FROM sueno_etapas WHERE persona_id = ${p.id} AND noche = ${fecha} ORDER BY inicio`),
    );
  })
  .get('/resumen', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: cómo fue la noche según la IA. Si no está y hay datos, se arma en el momento.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    if (!esFecha(fecha)) throw new ErrorApi('Fecha inválida.');
    if (p.rol === 'lector') return c.json(await resumenGuardado(c.var.db, p.id, fecha));
    try {
      return c.json(await resumirNoche(c.var.db, p, fecha, c.var.idioma));
    } catch (e) {
      console.error('Resumen de la noche:', e instanceof Error ? e.message : e);
      return c.json(await resumenGuardado(c.var.db, p.id, fecha));
    }
  })
  .get('/quincena', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: las 15 noches que terminan ese día, con las horas y la nota de cada una, y el promedio
    // contra las 15 de antes. Las noches sin dato van en null: no dormir nada no es lo mismo que no saberlo.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hasta = c.req.query('fecha');
    if (!esFecha(hasta)) throw new ErrorApi('Fecha inválida.');
    const desde = sumarDias(hasta, -14);
    const horas = new Map((await horasDeSueno(c.var.db, p.id, sumarDias(desde, -15), hasta)).map((x) => [x.fecha, x.horas]));
    const notas = new Map(
      (await filas<{ noche: string; calidad: number }>(
        c.var.db,
        sql`SELECT to_char(noche, 'YYYY-MM-DD') AS noche, calidad FROM resumen_noche WHERE persona_id = ${p.id} AND noche BETWEEN ${desde} AND ${hasta}`,
      )).map((x) => [x.noche, x.calidad]),
    );
    // A qué hora se durmió: el primer tramo dormido del reloj, o "Me acosté" si lo anotó.
    const acostadas = await filas<{ minutos: number }>(
      c.var.db,
      sql`SELECT extract(hour FROM min(inicio) AT TIME ZONE ${p.zona_horaria}) * 60 + extract(minute FROM min(inicio) AT TIME ZONE ${p.zona_horaria}) AS minutos
          FROM sueno_etapas WHERE persona_id = ${p.id} AND noche BETWEEN ${desde} AND ${hasta} AND etapa <> 'despierto' GROUP BY noche
          UNION ALL
          SELECT max(r.valor) AS minutos FROM registros r JOIN conceptos k ON k.id = r.concepto_id
          WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND k.nombre = 'Me acosté' AND r.valor IS NOT NULL
            AND r.fecha BETWEEN ${sumarDias(desde, -1)} AND ${sumarDias(hasta, -1)}
            AND NOT EXISTS (SELECT 1 FROM sueno_etapas e WHERE e.persona_id = r.persona_id AND e.noche = r.fecha + 1)
          GROUP BY r.fecha`,
    );
    const promedio = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
    const noches = Array.from({ length: 15 }, (_, i) => sumarDias(desde, i)).map((fecha) => ({ fecha, horas: horas.get(fecha) ?? null, calidad: notas.get(fecha) ?? null }));
    const antes = Array.from({ length: 15 }, (_, i) => horas.get(sumarDias(desde, i - 15))).filter((h): h is number => h !== undefined);
    // Después de medianoche cuenta como más tarde, no como temprano: las 0:30 son 24:30.
    const tarde = acostadas.map((x) => Number(x.minutos)).map((m) => (m < 12 * 60 ? m + 1440 : m));
    const redondo = (x: number | null, d = 10) => (x === null ? null : Math.round(x * d) / d);
    const r: QuincenaSueno = {
      noches,
      horas: redondo(promedio(noches.flatMap((n) => (n.horas === null ? [] : [n.horas])))),
      antes: antes.length >= 3 ? redondo(promedio(antes)) : null,
      calidad: redondo(promedio(noches.flatMap((n) => (n.calidad === null ? [] : [n.calidad])))),
      acostarse: tarde.length >= 3 ? Math.round(promedio(tarde)!) : null,
    };
    return c.json(r);
  })
  .get('/despertares', async (c) => {
    // ?persona=1: si en la última semana se despierta varias noches a la misma hora, cuál (para preguntarle por qué).
    // Si ya contó por qué en estos días, nada.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const ya = await una(
      c.var.db,
      sql`SELECT 1 AS x FROM registros r JOIN conceptos k ON k.id = r.concepto_id
          WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND k.nombre = ${DESPERTAR} AND r.fecha >= ${sumarDias(hoy, -7)}`,
    );
    if (ya) return c.json(null);
    const etapas = await filas<EtapaNoche>(
      c.var.db,
      sql`SELECT to_char(noche, 'YYYY-MM-DD') AS noche,
                 (extract(epoch FROM (inicio AT TIME ZONE ${p.zona_horaria}) - ((noche - 1)::timestamp)) / 60)::int AS desde,
                 (extract(epoch FROM fin - inicio) / 60)::int AS minutos, etapa
          FROM sueno_etapas WHERE persona_id = ${p.id} AND noche > ${sumarDias(hoy, -7)}`,
    );
    return c.json(despertarRepetido(etapas));
  });
