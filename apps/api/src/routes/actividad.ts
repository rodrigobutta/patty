// Las caminatas que el teléfono detecta en los pasos del reloj (ver caminatasDe en la app): cada una se guarda como una
// medición "Caminata" (los minutos, con su hora), de la fuente "Caminatas". Cada día se reemplaza entero al sincronizar.
// Si la ubicación dice que ese rato iba en un vehículo no cuenta (ver ubicacion/pasos.ts): no se muestra ni entra a los
// patrones.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { esFecha } from '../lib/fechas.js';
import { cuerpo, type Env } from '../lib/http.js';
import { clasificarDia, type Tramo } from '../ubicacion/movimiento.js';
import { CAMINATA, FUENTE_CAMINATAS as FUENTE, fuenteCaminatas, pasosDe, revisarCaminatas } from '../ubicacion/pasos.js';
import { puntoDeFila, type LugarZona } from '../ubicacion/resumen.js';
import { obtenerOCrearConcepto } from './conceptos.js';

export { CAMINATA };

export const rutasActividad = new Hono<Env>()
  .post('/caminatas', async (c) => {
    // { persona_id, dias: [{ fecha, caminatas: [{ inicio, fin, pasos }] }] }
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const dias = Array.isArray(d.dias) ? (d.dias as Array<{ fecha?: unknown; caminatas?: unknown }>).slice(0, 31) : [];
    let n = 0;
    let primera = Infinity;
    let ultima = 0;
    await c.var.db.transaction(async (tx) => {
      const fuente = await fuenteCaminatas(tx, p.id);
      const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'actividad'`);
      const { concepto } = await obtenerOCrearConcepto(tx, { nombre: CAMINATA, categoriaId: cat!.id, tipoValor: 'duracion', unidad: 'min' });
      for (const x of dias) {
        if (!esFecha(x.fecha) || !Array.isArray(x.caminatas)) continue;
        await tx.execute(sql`DELETE FROM mediciones WHERE persona_id = ${p.id} AND fuente_id = ${fuente} AND fecha = ${x.fecha}`);
        await tx.execute(sql`DELETE FROM caminatas_descartadas WHERE persona_id = ${p.id} AND fecha = ${x.fecha}`);
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
          primera = Math.min(primera, a);
          ultima = Math.max(ultima, a);
        }
      }
      // Las que recién llegaron, contra lo que dicen los puntos de ese rato (y lo que hubo alrededor).
      if (n) {
        const margen = 3 * 3600000;
        const ps = await filas<{ instante: string; lat: number; lon: number; precision_m: number | null }>(
          tx,
          sql`SELECT instante, lat, lon, precision_m FROM puntos WHERE persona_id = ${p.id} AND instante BETWEEN ${new Date(primera - margen).toISOString()} AND ${new Date(ultima + 24 * 3600000).toISOString()} ORDER BY instante`,
        );
        const ls = await filas<LugarZona>(tx, sql`SELECT id, lat, lon, radio_m FROM lugares WHERE persona_id = ${p.id}`);
        const tramos: Tramo[] = ps.length ? clasificarDia(ps.map(puntoDeFila), ls, await pasosDe(tx, p.id, primera - margen, ultima + 24 * 3600000)) : [];
        await revisarCaminatas(tx, p.id, tramos, primera, ultima);
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
