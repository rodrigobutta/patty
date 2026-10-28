// Preguntas libres sobre los propios datos ("¿cuándo comí huevos?") y el tiempo de uso de la app que manda cada teléfono.
import { controlarLimite } from '../lib/usoIa.js';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas } from '../db/client.js';
import { preguntarDatos } from '../ia/preguntar.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { esFecha } from '../lib/fechas.js';
import { cuerpo, texto, type Env } from '../lib/http.js';

/** Las pestañas que se cuentan en el uso (lo demás va como "otra"). */
const PANTALLAS = ['hoy', 'patrones', 'mas', 'admin'];

export const rutasPreguntar = new Hono<Env>()
  .post('/preguntar', async (c) => {
    const d = await cuerpo(c);
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(d.persona_id), false);
    const pregunta = texto(d.pregunta);
    await controlarLimite(db, c.var.usuario, 'preguntar');
    const r = await preguntarDatos(db, p, pregunta, c.var.idioma);
    await db.execute(
      sql`INSERT INTO preguntas (usuario_id, persona_id, pregunta, respuesta, fechas)
          VALUES (${c.var.usuario.id}, ${p.id}, ${pregunta}, ${r.respuesta}, ${JSON.stringify(r.fechas)}::jsonb)`,
    );
    return c.json(r);
  })
  .get('/preguntar/ultimas', async (c) => {
    // Lo último que preguntó (para volver a tocarlo).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const l = await filas<{ pregunta: string }>(
      c.var.db,
      sql`SELECT pregunta FROM preguntas WHERE usuario_id = ${c.var.usuario.id} AND persona_id = ${p.id}
          GROUP BY pregunta ORDER BY max(creado) DESC LIMIT 5`,
    );
    return c.json(l.map((x) => x.pregunta));
  })
  .post('/uso', async (c) => {
    // { fecha: día del teléfono, segundos: a la vista desde el último envío, pantalla, abrio: si se acaba de abrir }
    const d = await cuerpo(c);
    if (!esFecha(d.fecha)) throw new ErrorApi('Fecha inválida.');
    const segundos = Math.max(0, Math.min(600, Math.round(Number(d.segundos) || 0)));
    const pantalla = PANTALLAS.includes(texto(d.pantalla)) ? texto(d.pantalla) : 'otra';
    const plataforma = ['android', 'ios', 'web'].includes(texto(d.plataforma)) ? texto(d.plataforma) : null;
    const abrio = d.abrio === true ? 1 : 0;
    await c.var.db.execute(
      sql`INSERT INTO uso_diario (usuario_id, fecha, segundos, aperturas, pantallas, plataforma)
          VALUES (${c.var.usuario.id}, ${d.fecha}, ${segundos}, ${abrio}, jsonb_build_object(${pantalla}::text, ${segundos}::int), ${plataforma})
          ON CONFLICT (usuario_id, fecha) DO UPDATE SET
            segundos = uso_diario.segundos + EXCLUDED.segundos,
            aperturas = uso_diario.aperturas + EXCLUDED.aperturas,
            pantallas = uso_diario.pantallas || jsonb_build_object(${pantalla}::text, COALESCE((uso_diario.pantallas->>${pantalla})::int, 0) + ${segundos}::int),
            plataforma = COALESCE(EXCLUDED.plataforma, uso_diario.plataforma),
            actualizado = now()`,
    );
    return c.json({ ok: true });
  });
