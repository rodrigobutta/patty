// La línea de abajo del búho en el widget de Android (WidgetPatty la pide al dibujarse y después de anotar): lo más útil
// de ahora, en este orden: un malestar abierto, lo que falta de un seguimiento, cómo va un objetivo de la semana, o
// cuántas cosas lleva anotadas hoy. Sin nada que mostrar, null (el widget vuelve a la pregunta).
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { ITEMS_SEGUIMIENTO, traducir } from 'shared';
import { filas, una } from '../db/client.js';
import { lunesDe } from '../ia/resumirSemana.js';
import { persona } from '../lib/acceso.js';
import { diaDePatty } from '../lib/fechas.js';
import type { Env } from '../lib/http.js';
import { progreso, type Objetivo } from '../lib/objetivos.js';
import { faltanHoy } from '../patrones/seguimientos.js';

export const rutasWidget = new Hono<Env>().get('/', async (c) => {
  const db = c.var.db;
  const i = c.var.idioma;
  const p = await persona(db, c.var.usuario, Number(c.req.query('persona')), false);
  const ahora = new Date();
  const hoy = diaDePatty(ahora, p.zona_horaria);

  const malestar = await una<{ concepto: string; inicio: string }>(
    db,
    sql`SELECT c.nombre AS concepto, r.inicio FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND k.clave = 'sintoma' AND r.datos->>'abierto' = 'true' ORDER BY r.inicio DESC LIMIT 1`,
  );
  if (malestar) {
    const hora = new Intl.DateTimeFormat('es-AR', { timeZone: p.zona_horaria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(malestar.inicio));
    return c.json({ linea: traducir(i, '🤕 {que} desde las {hora}', { que: traducir(i, malestar.concepto), hora }) });
  }

  const seguimientos = await filas<{ emoji: string; items: string[]; horarios: string[] }>(
    db,
    sql`SELECT emoji, items, horarios FROM seguimientos WHERE persona_id = ${p.id} AND desde <= ${ahora.toISOString()} AND hasta > ${ahora.toISOString()} ORDER BY id`,
  );
  for (const s of seguimientos) {
    const faltan = await faltanHoy(db, p.id, p.zona_horaria, s.items, s.horarios, ahora);
    if (!faltan.length) continue;
    const nombres = faltan.map((k) => traducir(i, ITEMS_SEGUIMIENTO.find((x) => x.clave === k)!.nombre).toLowerCase());
    return c.json({ linea: traducir(i, '{emoji} Te falta: {lista}', { emoji: s.emoji, lista: nombres.join(', ') }) });
  }

  const objetivos = await filas<Objetivo>(
    db,
    sql`SELECT id, persona_id, to_char(semana, 'YYYY-MM-DD') AS semana, texto, emoji, tipo, concepto, valor, meta_dias, estado, logrados
        FROM objetivos WHERE persona_id = ${p.id} AND semana = ${lunesDe(hoy)} AND estado = 'aceptado' ORDER BY id`,
  );
  for (const o of objetivos) {
    const x = await progreso(db, o, hoy);
    if (x.cumplidos >= o.meta_dias) continue;
    return c.json({ linea: traducir(i, '{emoji} {texto}: {n} de {meta}', { emoji: o.emoji, texto: o.texto, n: x.cumplidos, meta: o.meta_dias }) });
  }

  const n = (await una<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM registros WHERE persona_id = ${p.id} AND borrado IS NULL AND fecha = ${hoy}`))?.n ?? 0;
  if (n > 0) return c.json({ linea: n === 1 ? traducir(i, 'Hoy anotaste 1 cosa') : traducir(i, 'Hoy anotaste {n} cosas', { n }) });
  return c.json({ linea: null });
});
