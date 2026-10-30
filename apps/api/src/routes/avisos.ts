// Lo que avisan las apps del teléfono (ver avisos/telefono.ts): el detalle del día (cuántos avisos y mensajes, por hora
// y por app), los pedidos y viajes que Patty pregunta, contestarlos y borrar todo.
//   GET    /api/avisos/dia?persona=1&fecha=AAAA-MM-DD
//   GET    /api/avisos/pendientes?persona=1
//   POST   /api/avisos/:id   { que } (pedido: qué fue), { como } (viaje: cómo fue), { descartar: true }
//   DELETE /api/avisos?persona=1
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { COMO_VIAJE } from 'shared';
import { una } from '../db/client.js';
import { avisosDelDia, avisosPendientes, borrarAvisos, detectado, horaDelPedido, tramoDelViaje } from '../avisos/telefono.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha } from '../lib/fechas.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';
import { nombreAppAviso } from 'shared';
import { guardarRegistro } from './registros.js';
import { contarViaje } from './ubicacion.js';

export const rutasAvisos = new Hono<Env>()
  .get('/dia', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    return c.json(await avisosDelDia(c.var.db, p.id, esFecha(fecha) ? fecha : diaDePatty(new Date(), p.zona_horaria), p.zona_horaria));
  })
  .get('/pendientes', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await avisosPendientes(c.var.db, p.id, p.zona_horaria));
  })
  .post('/:id', async (c) => {
    const id = idParam(c);
    const d = await cuerpo(c);
    const r = await c.var.db.transaction(async (tx) => {
      const v = await detectado(tx, id);
      if (!v || v.tipo === 'ejercicio') throw new ErrorApi('No existe.', 404);
      const p = await persona(tx, c.var.usuario, v.persona_id, true);
      if (v.estado !== 'pendiente') return { ok: true, ya: v.estado };
      if (d.descartar) {
        await tx.execute(sql`UPDATE avisos_detectados SET estado = 'descartado' WHERE id = ${id}`);
        return { ok: true };
      }
      if (v.tipo === 'pedido') {
        // Lo que pidió, como comida pedida (delivery) a la hora en que llegó.
        const que = texto(d.que).slice(0, 80);
        if (!que) throw new ErrorApi('¿Qué fue?');
        const comida = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'comida'`);
        const reg = await guardarRegistro(tx, c.var.usuario, {
          persona_id: p.id,
          concepto_nombre: que,
          categoria_id: comida!.id,
          inicio: new Date(Math.min(horaDelPedido(v), Date.now())).toISOString(),
          donde: 'delivery',
        });
        await tx.execute(sql`UPDATE avisos_detectados SET estado = 'anotado', registro_id = ${reg.id} WHERE id = ${id}`);
        return { ok: true, registro: reg };
      }
      // Un viaje en app: «Viaje en taxi» con cuánto duró y cómo fue, y la app en la nota.
      const como = COMO_VIAJE.find((x) => x.clave === d.como)?.clave ?? 'normal';
      const t = tramoDelViaje(v);
      await contarViaje(tx, p, c.var.usuario.id, {
        inicio: new Date(t.inicio).toISOString(),
        fin: new Date(t.fin ?? t.inicio).toISOString(),
        minutos: t.fin ? Math.round((t.fin - t.inicio) / 60000) : 1,
        modo: 'taxi',
        como,
        app: nombreAppAviso('viaje', v.app),
      });
      await tx.execute(sql`UPDATE avisos_detectados SET estado = 'anotado' WHERE id = ${id}`);
      return { ok: true };
    });
    return c.json(r);
  })
  .delete('/', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), true);
    await c.var.db.transaction((tx) => borrarAvisos(tx, p.id));
    return c.json({ ok: true });
  });
