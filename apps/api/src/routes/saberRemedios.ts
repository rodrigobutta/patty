// Lo que se sabe de lo que una persona toma:
//   GET  /api/remedios/vigilados?persona=1            lo que toma y qué se vigila de cada cosa
//   GET  /api/remedios/senales?persona=1&fecha=…      cuando un síntoma coincide con un efecto posible (o &registro=…)
//   POST /api/remedios/senales/apartar                "no tiene que ver": no volver a señalarlo
//   GET  /api/remedios/cobertura?persona=1            qué cubre y qué aparece poco
// y las vitaminas y suplementos (/api/suplementos): cargarlos por nombre o por foto del envase, corregirlos, terminarlos. La foto no se guarda.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { LecturaEnvase, NuevoSuplemento } from 'shared';
import { una, type Tx } from '../db/client.js';
import { suplementos } from '../db/schema.js';
import { pedirLecturaEnvase } from '../ia/saberRemedios.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha } from '../lib/fechas.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';
import { controlarLimite } from '../lib/usoIa.js';
import { coberturaDe, suplementosDe } from '../remedios/cobertura.js';
import { claveRemedio, limpiarContenido } from '../remedios/saberes.js';
import { remediosVigilados, senalesDelDia, senalesDelRegistro } from '../remedios/senales.js';

export const rutasRemedios = new Hono<Env>()
  .get('/vigilados', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await remediosVigilados(c.var.db, p.id, c.var.idioma));
  })
  .get('/senales', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const registro = Number(c.req.query('registro'));
    if (registro) return c.json(await senalesDelRegistro(c.var.db, p.id, registro, c.var.idioma));
    const fecha = c.req.query('fecha');
    if (!esFecha(fecha)) throw new ErrorApi('¿Qué día?');
    return c.json(await senalesDelDia(c.var.db, p.id, fecha, c.var.idioma));
  })
  .post('/senales/apartar', async (c) => {
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const clave = texto(d.clave);
    const concepto = Number(d.concepto_id);
    if (!clave || !concepto) throw new ErrorApi('¿Qué señal?');
    await c.var.db.execute(sql`INSERT INTO senales_apartadas (persona_id, concepto_id, clave) VALUES (${p.id}, ${concepto}, ${clave}) ON CONFLICT DO NOTHING`);
    return c.json({ ok: true });
  })
  .get('/cobertura', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await coberturaDe(c.var.db, p.id, diaDePatty(new Date(), p.zona_horaria)));
  });

async function propio(tx: Tx, c: { var: Env['Variables'] }, id: number, escribir: boolean) {
  const s = await una<{ persona_id: number }>(tx, sql`SELECT persona_id FROM suplementos WHERE id = ${id} AND borrado IS NULL`);
  if (!s) throw new ErrorApi('Ese suplemento no existe.', 404);
  return persona(tx, c.var.usuario, s.persona_id, escribir);
}

export const rutasSuplementos = new Hono<Env>()
  .get('/', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await suplementosDe(c.var.db, p.id));
  })
  .post('/leer-foto', async (c) => {
    // {persona_id, imagen (base64), tipo}: lo que dice el envase, como propuesta. No guarda nada, y menos la foto.
    const d = await cuerpo(c);
    await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const tipo = ['image/jpeg', 'image/png', 'image/webp'].includes(texto(d.tipo)) ? (texto(d.tipo) as 'image/jpeg') : 'image/jpeg';
    const datos = texto(d.imagen).replace(/^data:[^;]+;base64,/, '');
    if (!datos || !/^[A-Za-z0-9+/=]+$/.test(datos)) throw new ErrorApi('Falta la foto.');
    if (datos.length > 7_000_000) throw new ErrorApi('La foto es muy grande.');
    await controlarLimite(c.var.db, c.var.usuario, 'foto');
    const r = await pedirLecturaEnvase({ tipo, datos });
    const nombre = r?.reconocido === true ? texto(r.nombre).slice(0, 120) : '';
    const salida: LecturaEnvase = nombre ? { reconocido: true, nombre, contenido: limpiarContenido(r.contenido) } : { reconocido: false, nombre: '', contenido: [] };
    return c.json(salida);
  })
  .post('/', async (c) => {
    const d = (await cuerpo(c)) as unknown as NuevoSuplemento;
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const nombre = texto(d.nombre).slice(0, 120);
    if (!nombre) throw new ErrorApi('¿Cómo se llama?');
    const contenido = Array.isArray(d.contenido) ? limpiarContenido(d.contenido) : null;
    const [n] = await c.var.db
      .insert(suplementos)
      .values({ persona_id: p.id, nombre, clave: claveRemedio(nombre), contenido, origen: d.origen === 'foto' && contenido ? 'foto' : 'nombre', corregido: d.corregido === true, creado_por: c.var.usuario.id })
      .returning({ id: suplementos.id });
    return c.json((await suplementosDe(c.var.db, p.id, n.id))[0], 201);
  })
  .put('/:id', async (c) => {
    // Corregir el nombre o lo que contiene: desde ahí vale lo que dijo la persona.
    const id = idParam(c);
    const d = (await cuerpo(c)) as Partial<NuevoSuplemento>;
    const p = await propio(c.var.db, c, id, true);
    const nombre = d.nombre === undefined ? null : texto(d.nombre).slice(0, 120);
    if (nombre === '') throw new ErrorApi('¿Cómo se llama?');
    if (nombre) await c.var.db.execute(sql`UPDATE suplementos SET nombre = ${nombre}, clave = ${claveRemedio(nombre)} WHERE id = ${id}`);
    if (Array.isArray(d.contenido)) await c.var.db.execute(sql`UPDATE suplementos SET contenido = ${JSON.stringify(limpiarContenido(d.contenido))}::jsonb, corregido = true WHERE id = ${id}`);
    return c.json((await suplementosDe(c.var.db, p.id, id))[0]);
  })
  .post('/:id/terminar', async (c) => {
    const id = idParam(c);
    const d = await cuerpo(c);
    const p = await propio(c.var.db, c, id, true);
    await c.var.db.execute(sql`UPDATE suplementos SET terminado = ${d.retomar ? null : new Date().toISOString()} WHERE id = ${id}`);
    return c.json((await suplementosDe(c.var.db, p.id, id))[0]);
  })
  .delete('/:id', async (c) => {
    const id = idParam(c);
    await propio(c.var.db, c, id, true);
    await c.var.db.execute(sql`UPDATE suplementos SET borrado = now() WHERE id = ${id}`);
    return c.json({ ok: true });
  });

