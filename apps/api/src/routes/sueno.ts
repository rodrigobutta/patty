// Las etapas del sueño de cada noche (las manda el teléfono desde Health Connect / Salud) y lo que sale de ellas: el
// gráfico de la noche y los despertares que se repiten a la misma hora.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, sumarDias } from '../lib/fechas.js';
import { cuerpo, type Env } from '../lib/http.js';
import { despertarRepetido, type EtapaNoche } from '../patrones/despertares.js';

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
