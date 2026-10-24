// Supervisar a otro usuario: el supervisor manda la invitación (por usuario o mail), el supervisado la acepta o la
// rechaza, y cualquiera de los dos la puede terminar. Aceptada, el supervisor ve y anota en las personas del
// supervisado (vista `accesos`), recibe avisos (push/recordatorios) y le puede mandar avisos al teléfono.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { MisSupervisiones, Supervision } from 'shared';
import { filas, una } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type C, type Env } from '../lib/http.js';
import { avisarAUsuario } from '../push/usuarios.js';

interface Fila {
  id: number;
  supervisor_id: number;
  supervisado_id: number;
  estado: Supervision['estado'];
}

async function propia(db: Env['Variables']['db'], id: number, usuarioId: number): Promise<Fila> {
  const s = await una<Fila>(db, sql`SELECT id, supervisor_id, supervisado_id, estado FROM supervisiones WHERE id = ${id}
    AND (supervisor_id = ${usuarioId} OR supervisado_id = ${usuarioId})`);
  if (!s) throw new ErrorApi('No existe.', 404);
  return s;
}

export const rutasSupervision = new Hono<Env>()
  .get('/', async (c) => {
    const u = c.var.usuario;
    const lado = (yo: 'supervisor_id' | 'supervisado_id', otro: 'supervisor_id' | 'supervisado_id') =>
      filas<Supervision>(
        c.var.db,
        sql`SELECT s.id, s.estado, s.creado, json_build_object('id', o.id, 'nombre', o.nombre, 'usuario', o.usuario) AS otro
            FROM supervisiones s JOIN usuarios o ON o.id = s.${sql.raw(otro)}
            WHERE s.${sql.raw(yo)} = ${u.id} AND s.estado <> 'rechazada' AND o.activo
            ORDER BY s.estado, o.nombre`,
      );
    const r: MisSupervisiones = { supervisas: await lado('supervisor_id', 'supervisado_id'), te_supervisan: await lado('supervisado_id', 'supervisor_id') };
    return c.json(r);
  })
  .post('/invitar', async (c) => {
    // {quien}: el usuario o el mail de la persona a supervisar. Si ya la había rechazado, se puede volver a pedir.
    const u = c.var.usuario;
    const quien = texto((await cuerpo(c)).quien).toLowerCase();
    if (!quien) throw new ErrorApi('¿A quién? Escribí su usuario o su mail.');
    const otro = await una<{ id: number; nombre: string }>(
      c.var.db,
      sql`SELECT id, nombre FROM usuarios WHERE activo AND (usuario = ${quien} OR lower(email) = ${quien})`,
    );
    if (!otro) throw new ErrorApi('No encontré a nadie con ese usuario o mail en Patty.');
    if (otro.id === u.id) throw new ErrorApi('No podés supervisarte a vos mismo.');
    const ya = await una<Fila>(c.var.db, sql`SELECT id, estado FROM supervisiones WHERE supervisor_id = ${u.id} AND supervisado_id = ${otro.id}`);
    if (ya?.estado === 'aceptada') throw new ErrorApi(`Ya supervisás a ${otro.nombre}.`);
    const nueva = await una<{ id: number }>(c.var.db, sql`INSERT INTO supervisiones (supervisor_id, supervisado_id) VALUES (${u.id}, ${otro.id})
      ON CONFLICT (supervisor_id, supervisado_id) DO UPDATE SET estado = 'pendiente', creado = now(), respondido = NULL
      RETURNING id`);
    await avisarAUsuario(c.var.db, otro.id, {
      titulo: 'Patty',
      cuerpo: `${u.nombre} quiere supervisarte: ver tu día y avisarte si te olvidás algo. ¿Aceptás?`,
      // Con el id, el aviso trae los botones Aceptar y No (AvisosPushService).
      datos: { tipo: 'supervision', supervision_id: String(nueva!.id) },
    });
    return c.json({ ok: true, nombre: otro.nombre }, 201);
  })
  .post('/:id/responder', async (c) => {
    // {aceptar: true | false}: solo el supervisado, y solo si está pendiente.
    const u = c.var.usuario;
    const s = await propia(c.var.db, idParam(c), u.id);
    if (s.supervisado_id !== u.id) throw new ErrorApi('Solo la persona invitada puede contestar.', 403);
    if (s.estado !== 'pendiente') throw new ErrorApi('Esa invitación ya se contestó.');
    const aceptar = (await cuerpo(c)).aceptar === true;
    await c.var.db.execute(sql`UPDATE supervisiones SET estado = ${aceptar ? 'aceptada' : 'rechazada'}, respondido = now() WHERE id = ${s.id}`);
    if (aceptar) {
      await avisarAUsuario(c.var.db, s.supervisor_id, { titulo: 'Patty', cuerpo: `${u.nombre} aceptó tu supervisión. Ya podés ver su día en Patty.`, datos: { tipo: 'supervision' } });
    }
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    // Terminarla (o cancelar la invitación): cualquiera de los dos.
    const s = await propia(c.var.db, idParam(c), c.var.usuario.id);
    await c.var.db.execute(sql`DELETE FROM supervisiones WHERE id = ${s.id}`);
    return c.json({ ok: true });
  })
  .post('/avisar-persona', async (c) => {
    // {persona_id, texto}: lo mismo, desde el día de una persona que se supervisa (le llega a su dueño).
    const u = c.var.usuario;
    const d = await cuerpo(c);
    const s = await una<{ id: number }>(
      c.var.db,
      sql`SELECT s.id FROM supervisiones s JOIN persona_usuarios pu ON pu.usuario_id = s.supervisado_id AND pu.rol = 'dueno'
          WHERE s.supervisor_id = ${u.id} AND s.estado = 'aceptada' AND pu.persona_id = ${Number(d.persona_id) || 0} LIMIT 1`,
    );
    if (!s) throw new ErrorApi('No supervisás a esa persona.', 403);
    return avisar(c, s.id, d.texto);
  })
  .post('/:id/avisar', async (c) => avisar(c, idParam(c), (await cuerpo(c)).texto));

/** El supervisor le manda un aviso al teléfono del supervisado ("acordate de tomar el remedio"). */
async function avisar(c: C, id: number, crudo: unknown) {
  const u = c.var.usuario;
  const s = await propia(c.var.db, id, u.id);
  if (s.supervisor_id !== u.id || s.estado !== 'aceptada') throw new ErrorApi('Solo quien supervisa puede mandar avisos.', 403);
  const t = texto(crudo);
  if (!t) throw new ErrorApi('Escribí qué le querés decir.');
  if (t.length > 300) throw new ErrorApi('Es muy largo (máximo 300 letras).');
  const llegaron = await avisarAUsuario(c.var.db, s.supervisado_id, { titulo: `📣 ${u.nombre}`, cuerpo: t, datos: { tipo: 'mensaje' } });
  return c.json({ enviados: llegaron });
}
