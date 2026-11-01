// Las vueltas a pie detectadas (ver patrones/paseos.ts): las pendientes de anotar, y anotarlas o descartarlas.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';
import { etiquetasDePaseos } from '../patrones/paseos.js';
import { caminataContradicha, clasificarDia, recorteDe } from '../ubicacion/movimiento.js';
import { pasosDe } from '../ubicacion/pasos.js';
import { caminoLimpio, puntoDeFila, type LugarZona } from '../ubicacion/resumen.js';
import { guardarRegistro } from './registros.js';

export const rutasPaseos = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1: las de los últimos dos días que esperan respuesta, y cómo se suelen llamar.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const pendientes = await filas<{ id: number; inicio: string; fin: string; metros: number }>(
      c.var.db,
      sql`SELECT id, inicio, fin, metros FROM paseos_detectados WHERE persona_id = ${p.id} AND estado = 'pendiente' AND inicio > now() - interval '2 days' ORDER BY inicio`,
    );
    // El recorrido de cada una, para el mapita: solo lo que fue a pie, así se ve si era lo que parece. Si la ubicación dice
    // que ese rato iba en un vehículo (una detectada antes de que Patty supiera distinguirlo), ya no se pregunta.
    const ls = await filas<LugarZona>(c.var.db, sql`SELECT id, lat, lon, radio_m FROM lugares WHERE persona_id = ${p.id}`);
    const conCamino = await Promise.all(
      pendientes.map(async (x) => {
        const inicio = Date.parse(x.inicio);
        const fin = Date.parse(x.fin);
        const margen = 3 * 3600000;
        const l = await filas<{ instante: string; lat: number; lon: number; precision_m: number | null }>(
          c.var.db,
          sql`SELECT instante, lat, lon, precision_m FROM puntos WHERE persona_id = ${p.id} AND instante BETWEEN ${new Date(inicio - margen).toISOString()} AND ${new Date(fin + margen).toISOString()} ORDER BY instante`,
        );
        const tramos = clasificarDia(l.map(puntoDeFila), ls, await pasosDe(c.var.db, p.id, inicio - margen, fin + margen));
        if (caminataContradicha({ inicio, fin }, tramos)) return null;
        return { ...x, camino: caminoLimpio(recorteDe(tramos, 'a_pie', inicio, fin).puntos) };
      }),
    );
    return c.json({ pendientes: conCamino.filter((x) => x !== null), ...(await etiquetasDePaseos(c.var.db, p.id)) });
  })
  .post('/:id', async (c) => {
    // { concepto } la anota como esa actividad (con su hora y sus minutos); { descartar: true } la saca.
    const id = idParam(c);
    const d = await cuerpo(c);
    const r = await c.var.db.transaction(async (tx) => {
      const v = await una<{ persona_id: number; inicio: string; fin: string; estado: string }>(tx, sql`SELECT persona_id, inicio, fin, estado FROM paseos_detectados WHERE id = ${id} FOR UPDATE`);
      if (!v) throw new ErrorApi('No existe.', 404);
      await persona(tx, c.var.usuario, v.persona_id, true);
      if (v.estado !== 'pendiente') return { ok: true, ya: v.estado };
      if (d.descartar) {
        await tx.execute(sql`UPDATE paseos_detectados SET estado = 'descartado' WHERE id = ${id}`);
        return { ok: true };
      }
      const nombre = texto(d.concepto).slice(0, 60);
      if (!nombre) throw new ErrorApi('¿Qué fue?');
      const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'actividad'`);
      const minutos = Math.max(1, Math.round((Date.parse(v.fin) - Date.parse(v.inicio)) / 60000));
      const reg = await guardarRegistro(tx, c.var.usuario, {
        persona_id: v.persona_id,
        concepto_nombre: nombre,
        categoria_id: cat!.id,
        inicio: new Date(v.inicio).toISOString(),
        fin: new Date(v.fin).toISOString(),
        valor: minutos,
        unidad: 'min',
      });
      await tx.execute(sql`UPDATE paseos_detectados SET estado = 'anotado', registro_id = ${reg.id} WHERE id = ${id}`);
      return { ok: true, registro: reg };
    });
    return c.json(r);
  });
