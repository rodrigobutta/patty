// Lo que se anota de cada persona. Un registro es "este concepto, a esta hora, con este valor".
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Concepto, NuevoRegistro, Registro, Usuario } from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import { registros } from '../db/schema.js';
import { interpretarTexto } from '../ia/interpretar.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, leerInstante, minutosDelDia, sumarDias } from '../lib/fechas.js';
import { cuerpo, idParam, numeroONulo, texto, type Env } from '../lib/http.js';
import { obtenerOCrearConcepto } from './conceptos.js';

const COLUMNAS = sql`r.id, r.persona_id, r.concepto_id, r.inicio, r.fin, to_char(r.fecha, 'YYYY-MM-DD') AS fecha,
  r.valor, r.intensidad, r.unidad, r.nota, r.origen,
  (SELECT c.nombre FROM conceptos c WHERE c.id = r.concepto_id) AS concepto,
  (SELECT c.categoria_id FROM conceptos c WHERE c.id = r.concepto_id) AS categoria_id`;

async function conceptoDe(tx: Tx, d: NuevoRegistro, u: Usuario): Promise<Concepto> {
  if (d.concepto_id) {
    const c = await una<Concepto>(
      tx,
      sql`SELECT id, categoria_id, nombre, tipo_valor, unidad, usos FROM conceptos WHERE id = ${Number(d.concepto_id)} AND unido_a IS NULL`,
    );
    if (!c) throw new ErrorApi('Ese concepto no existe (¿se unió con otro?).');
    return c;
  }
  return (await obtenerOCrearConcepto(tx, { nombre: texto(d.concepto_nombre), categoriaId: d.categoria_id, usuarioId: u.id })).concepto;
}

/** Valida y completa un registro: día (de 5 a 5), valor de las horas, intensidad entre 0 y 10. */
function valores(d: NuevoRegistro, c: Concepto, p: PersonaAcceso) {
  const inicio = leerInstante(d.inicio, 'inicio');
  const fin = d.fin ? leerInstante(d.fin, 'fin') : null;
  if (fin && fin < inicio) throw new ErrorApi('El fin no puede ser antes del inicio.');
  let valor = numeroONulo(d.valor, 'valor');
  const intensidad = numeroONulo(d.intensidad, 'intensidad');
  if (intensidad !== null && (!Number.isInteger(intensidad) || intensidad < 0 || intensidad > 10)) {
    throw new ErrorApi('La intensidad va de 0 a 10.');
  }
  if (c.tipo_valor === 'intensidad' && intensidad === null) throw new ErrorApi(`¿Qué intensidad (0 a 10) tuvo ${c.nombre.toLowerCase()}?`);
  if (c.tipo_valor === 'hora') valor = minutosDelDia(inicio, p.zona_horaria);
  if (c.tipo_valor === 'duracion' && valor === null && fin) valor = Math.round((fin.getTime() - inicio.getTime()) / 60000);
  return {
    inicio: inicio.toISOString(),
    fin: fin?.toISOString() ?? null,
    fecha: diaDePatty(inicio, p.zona_horaria),
    valor,
    intensidad,
    unidad: d.unidad === undefined ? c.unidad : texto(d.unidad) || null,
    nota: texto(d.nota) || null,
  };
}

export async function guardarRegistro(tx: Tx, u: Usuario, d: NuevoRegistro, origen = 'manual'): Promise<Registro> {
  const p = await persona(tx, u, Number(d.persona_id), true);
  const c = await conceptoDe(tx, d, u);
  const [r] = await tx
    .insert(registros)
    .values({ persona_id: p.id, concepto_id: c.id, ...valores(d, c, p), origen, creado_por: u.id })
    .returning({ id: registros.id });
  await tx.execute(sql`UPDATE conceptos SET usos = usos + 1, ultimo_uso = now() WHERE id = ${c.id}`);
  return (await una<Registro>(tx, sql`SELECT ${COLUMNAS} FROM registros r WHERE r.id = ${r.id}`))!;
}

async function propio(tx: Tx, u: Usuario, id: number) {
  const r = await una<{ persona_id: number; concepto_id: number }>(tx, sql`SELECT persona_id, concepto_id FROM registros WHERE id = ${id} AND borrado IS NULL`);
  if (!r) throw new ErrorApi('No existe.', 404);
  return { ...r, persona: await persona(tx, u, r.persona_id, true) };
}

export const rutasRegistros = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1&desde=AAAA-MM-DD&hasta=AAAA-MM-DD (por defecto, hoy en la zona de la persona)
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const desde = esFecha(c.req.query('desde')) ? c.req.query('desde')! : hoy;
    const hasta = esFecha(c.req.query('hasta')) ? c.req.query('hasta')! : desde;
    if (hasta < desde || hasta > sumarDias(desde, 366)) throw new ErrorApi('Rango de fechas inválido.');
    return c.json(
      await filas<Registro>(
        c.var.db,
        sql`SELECT ${COLUMNAS} FROM registros r
            WHERE r.persona_id = ${p.id} AND r.fecha BETWEEN ${desde} AND ${hasta} AND r.borrado IS NULL
            ORDER BY r.inicio, r.id`,
      ),
    );
  })
  .post('/', async (c) => {
    const d = (await cuerpo(c)) as unknown as NuevoRegistro;
    return c.json(await c.var.db.transaction((tx) => guardarRegistro(tx, c.var.usuario, d)), 201);
  })
  .post('/varios', async (c) => {
    // Varios de una vez (lo que propone la IA a partir de un texto, una vez que la persona lo revisó).
    const lista = (await cuerpo(c)).registros;
    if (!Array.isArray(lista) || !lista.length || lista.length > 50) throw new ErrorApi('Mandá entre 1 y 50 registros.');
    const r = await c.var.db.transaction(async (tx) => {
      const hechos: Registro[] = [];
      for (const d of lista as NuevoRegistro[]) hechos.push(await guardarRegistro(tx, c.var.usuario, d, 'ia'));
      return hechos;
    });
    return c.json(r, 201);
  })
  .put('/:id', async (c) => {
    const id = idParam(c);
    const d = (await cuerpo(c)) as unknown as NuevoRegistro;
    const r = await c.var.db.transaction(async (tx) => {
      const actual = await propio(tx, c.var.usuario, id);
      const concepto = await conceptoDe(tx, { ...d, concepto_id: d.concepto_id ?? (d.concepto_nombre ? undefined : actual.concepto_id) }, c.var.usuario);
      await tx.update(registros).set({ concepto_id: concepto.id, ...valores(d, concepto, actual.persona) }).where(sql`id = ${id}`);
      return una<Registro>(tx, sql`SELECT ${COLUMNAS} FROM registros r WHERE r.id = ${id}`);
    });
    return c.json(r);
  })
  .delete('/:id', async (c) => {
    const id = idParam(c);
    await c.var.db.transaction(async (tx) => {
      await propio(tx, c.var.usuario, id);
      await tx.execute(sql`UPDATE registros SET borrado = now() WHERE id = ${id}`);
    });
    return c.json({ ok: true });
  })
  .post('/interpretar', async (c) => {
    // "Desayuné café con tostadas, a las 11 me dolió la cabeza (4)" → registros propuestos, sin guardar.
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    return c.json(await interpretarTexto(c.var.db, p, texto(d.texto)));
  });
