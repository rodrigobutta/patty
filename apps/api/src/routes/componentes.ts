// Lo que muestra el widget Comida del Día. Las cuentas están en componentes/delDia.ts.
//   GET /api/componentes/dia?persona=1&fecha=AAAA-MM-DD
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { consumoDeElementos, DIAS_HISTORIA_CONSUMO, lecturaSinIa } from '../componentes/consumo.js';
import { resumenDelDia } from '../componentes/delDia.js';
import { filas } from '../db/client.js';
import { lecturaGuardada } from '../ia/leerComidas.js';
import { persona } from '../lib/acceso.js';
import { diaDePatty, esFecha, sumarDias } from '../lib/fechas.js';
import type { Env } from '../lib/http.js';
import { listarHallazgos } from '../patrones/analizar.js';
import { registrosConIngredientes, registrosDeComidas } from '../patrones/componentes.js';

/** Lo habitual se mira en toda la historia, como los patrones. Es un período largo para no tener que preguntar cuál es el primer día. */
const HISTORIA_DESDE = '2000-01-01';

export const rutasComponentes = new Hono<Env>().get('/dia', async (c) => {
  const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
  const hoy = diaDePatty(new Date(), p.zona_horaria);
  const pedida = c.req.query('fecha') ?? '';
  const fecha = esFecha(pedida) ? pedida : hoy;
  const registros = await registrosDeComidas(c.var.db, p.id, HISTORIA_DESDE, fecha > hoy ? fecha : hoy);
  // Los patrones firmes con un componente como causa, igual que los del clima en su hoja. Si los apagó, listarHallazgos no los trae.
  const ids = await filas<{ id: number }>(
    c.var.db,
    sql`SELECT h.id FROM hallazgos h
        WHERE h.persona_id = ${p.id} AND h.componente IS NOT NULL AND h.estado NOT IN ('descartado', 'obvio') AND h.fecha_desde IS NULL AND NOT h.ya_no AND (h.estado = 'confirmado' OR h.q_valor <= 0.1)
        ORDER BY h.puntaje DESC LIMIT 3`,
  );
  // Lo que más se viene comiendo, y cómo viene según el proceso de la mañana. Si ese día no corrió, lo mismo en cuentas: la lectura mira
  // los días terminados, sin el día que se está mirando.
  const conIngredientes = await registrosConIngredientes(c.var.db, p.id, sumarDias(fecha, -DIAS_HISTORIA_CONSUMO - 1), fecha);
  const guardada = await lecturaGuardada(c.var.db, p.id, fecha);
  const calculada = guardada ? null : lecturaSinIa(consumoDeElementos(conIngredientes, sumarDias(fecha, -1)), c.var.idioma);
  return c.json({
    ...resumenDelDia(registros, fecha, hoy),
    patrones: ids.length ? await listarHallazgos(c.var.db, p.id, ids.map((x) => x.id)) : [],
    consumo: consumoDeElementos(conIngredientes, fecha),
    lectura: guardada ?? (calculada ? { fecha, texto: calculada, origen: 'calculada' } : null),
  });
});
