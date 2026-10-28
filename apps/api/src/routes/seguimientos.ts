// Seguimientos (ver shared: PLANTILLAS_SEGUIMIENTO): activar uno para una persona (ella o alguien de su familia), ver
// los activos, terminarlos, y las plantillas propias. Los avisos a las horas elegidas, en patrones/seguimientos.ts.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { esIdioma, ITEMS_SEGUIMIENTO, traducir, type Idioma, type PlantillaSeguimiento, type Seguimiento } from 'shared';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';
import { hayEnvio } from '../push/firebase.js';
import { avisarUnaVez, dispositivosDe } from '../push/recordatorios.js';

const arreglo = (l: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(l)}::jsonb))`;
const COLUMNAS = sql`s.id, s.persona_id, s.nombre, s.emoji, s.items, s.horarios, s.dias, s.desde, s.hasta, u.nombre AS activado_por`;

/** Una plantilla que llega del pedido, revisada: ítems conocidos, horarios HH:MM, de 1 a 60 días. */
function plantillaDe(d: Record<string, unknown>): PlantillaSeguimiento {
  const nombre = texto(d.nombre).slice(0, 60);
  const items = (Array.isArray(d.items) ? d.items : []).map(String).filter((c) => ITEMS_SEGUIMIENTO.some((i) => i.clave === c));
  const horarios = [...new Set((Array.isArray(d.horarios) ? d.horarios : []).map(String).filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h)))].sort().slice(0, 6);
  const dias = Math.round(Number(d.dias));
  if (!nombre) throw new ErrorApi('Ponele un nombre.');
  if (!items.length) throw new ErrorApi('Elegí al menos una cosa para seguir.');
  if (!(dias >= 1 && dias <= 60)) throw new ErrorApi('Elegí de 1 a 60 días.');
  return { nombre, emoji: texto(d.emoji).slice(0, 8) || '🩺', items, horarios, dias };
}

export const rutasSeguimientos = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1: los activos (todavía no terminaron) y las plantillas propias.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const activos = await filas<Seguimiento>(
      c.var.db,
      sql`SELECT ${COLUMNAS} FROM seguimientos s LEFT JOIN usuarios u ON u.id = s.activado_por
          WHERE s.persona_id = ${p.id} AND s.hasta > now() ORDER BY s.desde`,
    );
    const plantillas = await filas<PlantillaSeguimiento>(
      c.var.db,
      sql`SELECT id, nombre, emoji, items, horarios, dias FROM plantillas_seguimiento WHERE persona_id = ${p.id} ORDER BY nombre`,
    );
    return c.json({ activos, plantillas });
  })
  .post('/', async (c) => {
    // { persona_id, plantilla: {nombre, emoji, items, horarios, dias} }: lo activa desde ahora por esos días.
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const pl = plantillaDe((d.plantilla ?? {}) as Record<string, unknown>);
    const s = await una<{ id: number }>(
      c.var.db,
      sql`INSERT INTO seguimientos (persona_id, nombre, emoji, items, horarios, dias, desde, hasta, activado_por)
          VALUES (${p.id}, ${pl.nombre}, ${pl.emoji}, ${arreglo(pl.items)}, ${arreglo(pl.horarios)}, ${pl.dias}, now(), now() + make_interval(days => ${pl.dias}), ${c.var.usuario.id})
          RETURNING id`,
    );
    // Si lo activó alguien de la familia, a la persona le llega un aviso.
    if (p.rol !== 'dueno' && hayEnvio()) {
      for (const dev of await dispositivosDe(c.var.db, p.id, false)) {
        const i: Idioma = esIdioma(dev.idioma) ? dev.idioma : 'es';
        await avisarUnaVez(c.var.db, dev, `seguimiento-activado|${s!.id}`, {
          titulo: `${pl.emoji} ${traducir(i, pl.nombre)}`,
          cuerpo: traducir(i, '{quien} activó un seguimiento por {n} días: Patty te va a preguntar un poco más.', { quien: c.var.usuario.nombre, n: pl.dias }),
          datos: { tipo: 'seguimiento', persona_id: String(p.id), cara: 'espera' },
          etiqueta: `seguimiento|${p.id}`,
        }).catch(() => {});
      }
    }
    return c.json({ id: s!.id }, 201);
  })
  .delete('/:id', async (c) => {
    // Terminarlo antes (queda guardado, ya terminado).
    const id = idParam(c);
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM seguimientos WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, true);
    await c.var.db.execute(sql`UPDATE seguimientos SET hasta = least(hasta, now()) WHERE id = ${id}`);
    return c.json({ ok: true });
  })
  .post('/plantillas', async (c) => {
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const pl = plantillaDe(d);
    const r = await una<{ id: number }>(
      c.var.db,
      sql`INSERT INTO plantillas_seguimiento (persona_id, nombre, emoji, items, horarios, dias)
          VALUES (${p.id}, ${pl.nombre}, ${pl.emoji}, ${arreglo(pl.items)}, ${arreglo(pl.horarios)}, ${pl.dias}) RETURNING id`,
    );
    return c.json({ id: r!.id, ...pl }, 201);
  })
  .put('/plantillas/:id', async (c) => {
    const id = idParam(c);
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM plantillas_seguimiento WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, true);
    const pl = plantillaDe(await cuerpo(c));
    await c.var.db.execute(
      sql`UPDATE plantillas_seguimiento SET nombre = ${pl.nombre}, emoji = ${pl.emoji}, items = ${arreglo(pl.items)}, horarios = ${arreglo(pl.horarios)}, dias = ${pl.dias} WHERE id = ${id}`,
    );
    return c.json({ id, ...pl });
  })
  .delete('/plantillas/:id', async (c) => {
    const id = idParam(c);
    const x = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM plantillas_seguimiento WHERE id = ${id}`);
    if (!x) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, x.persona_id, true);
    await c.var.db.execute(sql`DELETE FROM plantillas_seguimiento WHERE id = ${id}`);
    return c.json({ ok: true });
  });
