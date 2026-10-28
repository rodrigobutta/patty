// Lo que se anota de cada persona. Un registro es "este concepto, a esta hora, con este valor".
import { controlarLimite } from '../lib/usoIa.js';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { comidaEn, conDetalle, COMO_ME_SENTI, COMO_ME_SIENTO, DONDE_COMIDA, esDonde, esPorcion, esTipoComida, PORCIONES, TIPOS_COMIDA, type Concepto, type DatoAutomatico, type NuevoRegistro, type Registro, type Usuario } from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import { registros } from '../db/schema.js';
import { interpretarTexto } from '../ia/interpretar.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, leerInstante, minutosDelDia, sumarDias } from '../lib/fechas.js';
import { rutinasDe, type AnotadoRutina } from '../patrones/rutinas.js';
import { cuerpo, idParam, numeroONulo, texto, type Env } from '../lib/http.js';
import { obtenerOCrearConcepto } from './conceptos.js';
import { vincularToma } from './tratamientos.js';

const COLUMNAS = sql`r.id, r.persona_id, r.concepto_id, r.inicio, r.fin, to_char(r.fecha, 'YYYY-MM-DD') AS fecha,
  r.valor, r.intensidad, r.unidad, r.nota, r.origen, r.datos->>'donde' AS donde, r.datos->>'lugar' AS lugar,
  r.datos->>'porcion' AS porcion, coalesce(r.datos->'tipos', '[]'::jsonb) AS tipos, coalesce(r.datos->'detalles', '[]'::jsonb) AS detalles,
  (r.datos->>'abierto' = 'true') AS abierto, r.datos->'evolucion' AS evolucion, r.datos->>'fin_sugerido' AS fin_sugerido,
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
  if (c.tipo_valor === 'intensidad' && intensidad === null) throw new ErrorApi('¿Qué intensidad (0 a 10) tuvo {nombre}?', 400, { nombre: c.nombre.toLowerCase() });
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

/**
 * Dónde fue una comida o bebida (casera, afuera, delivery) y en qué lugar. Se guarda en `datos` con los conceptos
 * "Comida afuera" y "Comida en {lugar}", que la vista serie_diaria suma como si fueran registros: así entran a los
 * patrones ("cuando comés afuera…") sin agregar renglones al Día. Devuelve undefined si no corresponde tocarlo.
 */
async function datosComida(tx: Tx, u: Usuario, d: NuevoRegistro, c: Concepto): Promise<Record<string, unknown> | null | undefined> {
  if (!('donde' in d) && !('lugar' in d)) return undefined;
  const cat = await una<{ clave: string }>(tx, sql`SELECT clave FROM categorias WHERE id = ${c.categoria_id}`);
  if (!cat || !['comida', 'bebida'].includes(cat.clave)) return undefined;
  const lugar = texto(d.lugar).slice(0, 60) || null;
  const donde = esDonde(d.donde) ? d.donde : lugar ? 'afuera' : null;
  if (!donde) return null;
  const comida = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'comida'`);
  const def = DONDE_COMIDA.find((x) => x.clave === donde)!;
  const dondeConcepto = (await obtenerOCrearConcepto(tx, { nombre: def.concepto, categoriaId: comida!.id, tipoValor: 'evento', unidad: null, usuarioId: u.id })).concepto;
  const datos: Record<string, unknown> = { donde, donde_concepto_id: dondeConcepto.id };
  if (lugar && donde !== 'casa') {
    const l = (await obtenerOCrearConcepto(tx, { nombre: comidaEn(lugar), categoriaId: comida!.id, tipoValor: 'evento', unidad: null, usuarioId: u.id })).concepto;
    Object.assign(datos, { lugar, lugar_concepto_id: l.id });
  }
  return datos;
}

/**
 * Cómo es el plato (porción y tipos). Se guarda en `datos` con los conceptos de cada uno ("Comida frita", "Porción
 * grande") en plato_concepto_ids, que la vista serie_diaria suma como dónde se comió. Undefined si no corresponde tocarlo.
 */
async function datosPlato(tx: Tx, u: Usuario, d: NuevoRegistro, c: Concepto): Promise<Record<string, unknown> | null | undefined> {
  if (!('porcion' in d) && !('tipos' in d)) return undefined;
  const cat = await una<{ clave: string }>(tx, sql`SELECT clave FROM categorias WHERE id = ${c.categoria_id}`);
  if (cat?.clave !== 'comida') return undefined;
  const porcion = esPorcion(d.porcion) ? d.porcion : null;
  const tipos = [...new Set(Array.isArray(d.tipos) ? d.tipos.filter(esTipoComida) : [])];
  if (!porcion && !tipos.length) return null;
  const tamano = PORCIONES.find((x) => x.clave === porcion)?.concepto;
  const nombres: string[] = [...tipos.map((x) => TIPOS_COMIDA.find((t) => t.clave === x)!.concepto), ...(tamano ? [tamano] : [])];
  const ids: number[] = [];
  for (const nombre of nombres) ids.push((await obtenerOCrearConcepto(tx, { nombre, categoriaId: c.categoria_id, tipoValor: 'evento', unidad: null, usuarioId: u.id })).concepto.id);
  return { porcion, tipos, plato_concepto_ids: ids };
}

/**
 * Lo contestado a las preguntas configuradas ("¿Con qué?" → azúcar): en `datos.detalles`, con un concepto por respuesta
 * ("Café · Azúcar", en la misma categoría) en detalle_concepto_ids, que la vista serie_diaria suma a los patrones.
 */
async function datosDetalles(tx: Tx, u: Usuario, d: NuevoRegistro, c: Concepto): Promise<Record<string, unknown> | null | undefined> {
  if (!('detalles' in d)) return undefined;
  const detalles = (Array.isArray(d.detalles) ? d.detalles : [])
    .map((x) => ({ pregunta: texto(x?.pregunta).slice(0, 120), respuestas: (Array.isArray(x?.respuestas) ? x.respuestas : []).map((r) => texto(r).slice(0, 40)).filter(Boolean).slice(0, 8) }))
    .filter((x) => x.pregunta && x.respuestas.length)
    .slice(0, 5);
  if (!detalles.length) return null;
  const ids: number[] = [];
  for (const r of new Set(detalles.flatMap((x) => x.respuestas))) {
    ids.push((await obtenerOCrearConcepto(tx, { nombre: conDetalle(c.nombre, r), categoriaId: c.categoria_id, tipoValor: 'evento', unidad: null, usuarioId: u.id })).concepto.id);
  }
  return { detalles, detalle_concepto_ids: ids };
}

export async function guardarRegistro(
  tx: Tx,
  u: Usuario,
  d: NuevoRegistro,
  origen = 'manual',
  opciones: { sinVincular?: boolean } = {},
): Promise<Registro> {
  const p = await persona(tx, u, Number(d.persona_id), true);
  const c = await conceptoDe(tx, d, u);
  const comida = await datosComida(tx, u, d, c);
  const plato = await datosPlato(tx, u, d, c);
  const detalles = await datosDetalles(tx, u, d, c);
  const datos = comida || plato || detalles ? { ...comida, ...plato, ...detalles } : null;
  const [r] = await tx
    .insert(registros)
    .values({ persona_id: p.id, concepto_id: c.id, ...valores(d, c, p), origen, creado_por: u.id, ...(datos ? { datos } : {}) })
    .returning({ id: registros.id });
  await tx.execute(sql`UPDATE conceptos SET usos = usos + 1, ultimo_uso = now() WHERE id = ${c.id}`);
  // Una actividad que dura (caminar, fútbol) anotada recién, sin cuánto duró, queda en curso: Patty sugiere cerrarla
  // cuando ve (por la ubicación) que terminó. Ver patrones/actividades.ts.
  if (c.tipo_valor === 'duracion' && !d.fin && (d.valor === undefined || d.valor === null)) {
    await tx.execute(sql`UPDATE registros r SET datos = coalesce(r.datos, '{}'::jsonb) || '{"abierto": true}'::jsonb
                         FROM categorias k WHERE r.id = ${r.id} AND k.id = ${c.categoria_id} AND k.clave = 'actividad'
                           AND r.inicio > now() - interval '2 hours'`);
  }
  // Un malestar recién anotado (de las últimas horas, sin fin) queda abierto: Patty pregunta cada tanto si sigue.
  if (c.tipo_valor === 'intensidad' && !d.fin) {
    await tx.execute(sql`UPDATE registros r SET datos = coalesce(r.datos, '{}'::jsonb) || '{"abierto": true}'::jsonb
                         FROM categorias k WHERE r.id = ${r.id} AND k.id = ${c.categoria_id} AND k.clave = 'sintoma'
                           AND r.inicio > now() - interval '6 hours'`);
  }
  const hecho = (await una<Registro>(tx, sql`SELECT ${COLUMNAS} FROM registros r WHERE r.id = ${r.id}`))!;
  // Un remedio con tratamiento: cuenta como la toma programada más cercana.
  if (!opciones.sinVincular) await vincularToma(tx, hecho);
  return hecho;
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
  .get('/:id/contexto', async (c) => {
    // "¿Qué pasó antes?" de una molestia o un mal momento (lo arma un job al rato de anotarlo; null si todavía no).
    const id = idParam(c);
    const r = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM registros WHERE id = ${id}`);
    if (!r) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, r.persona_id, false);
    return c.json(await una(c.var.db, sql`SELECT texto, items FROM contexto_registro WHERE registro_id = ${id}`));
  })
  .get('/rutinas', async (c) => {
    // ?persona=1: lo que se viene anotando seguido y hoy todavía no (ver patrones/rutinas.ts). Solo cosas que se hacen
    // (comida, bebida, actividad…): no cómo se siente ni los remedios, que tienen lo suyo.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const anotado = await filas<AnotadoRutina>(
      c.var.db,
      sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.concepto_id, c.nombre, c.categoria_id,
                 (extract(hour FROM r.inicio AT TIME ZONE ${p.zona_horaria}) * 60 + extract(minute FROM r.inicio AT TIME ZONE ${p.zona_horaria}))::int AS minutos,
                 r.valor::float AS valor, r.unidad
          FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.origen IN ('manual', 'ia')
            AND k.clave IN ('comida', 'bebida', 'actividad', 'otro', 'lugar', 'gente')
            AND r.fecha BETWEEN ${sumarDias(hoy, -21)} AND ${hoy}`,
    );
    return c.json(rutinasDe(anotado, hoy));
  })
  .get('/animo-semana', async (c) => {
    // ?persona=1&hasta=AAAA-MM-DD: el ánimo promedio (1 a 10) de cada uno de los 14 días hasta esa fecha (null si no
    // se anotó), para el mini gráfico de la semana del Día y compararla con la anterior.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const pedida = c.req.query('hasta') ?? '';
    const hasta = esFecha(pedida) ? pedida : diaDePatty(new Date(), p.zona_horaria);
    const desde = sumarDias(hasta, -13);
    const hay = await filas<{ fecha: string; animo: number }>(
      c.var.db,
      sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, avg(r.intensidad)::float AS animo
          FROM registros r JOIN conceptos k ON k.id = r.concepto_id
          WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND k.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI})
            AND r.intensidad IS NOT NULL AND r.fecha BETWEEN ${desde} AND ${hasta}
          GROUP BY r.fecha`,
    );
    const por = new Map(hay.map((x) => [x.fecha, Math.round(x.animo * 10) / 10]));
    return c.json(Array.from({ length: 14 }, (_, i) => sumarDias(desde, i)).map((fecha) => ({ fecha, animo: por.get(fecha) ?? null })));
  })
  .get('/abiertos', async (c) => {
    // ?persona=1: los malestares que siguen abiertos (Patty pregunta si siguen), del más viejo al más nuevo.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(
      await filas<Registro>(
        c.var.db,
        sql`SELECT ${COLUMNAS} FROM registros r
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.datos->>'abierto' = 'true' ORDER BY r.inicio`,
      ),
    );
  })
  .post('/:id/seguir', async (c) => {
    // { estado: 'paso' | 'igual' | 'mejor' | 'peor', fin? }: cómo sigue un malestar (o una actividad) en curso. "paso"
    // lo cierra (queda la duración), a ahora o a `fin` si se dice (lo que sugirió Patty: "terminaste a las 18:42").
    const id = idParam(c);
    const pedido = await cuerpo(c);
    const estado = texto(pedido.estado);
    const finPedido = typeof pedido.fin === 'string' && !Number.isNaN(Date.parse(pedido.fin)) ? new Date(pedido.fin).toISOString() : null;
    if (!['paso', 'igual', 'mejor', 'peor'].includes(estado)) throw new ErrorApi('Estado inválido.');
    const r = await c.var.db.transaction(async (tx) => {
      await propio(tx, c.var.usuario, id);
      const paso = { t: new Date().toISOString(), estado };
      await tx.execute(
        sql`UPDATE registros SET
              fin = CASE WHEN ${estado}::text = 'paso' THEN greatest(least(coalesce(${finPedido}::timestamptz, now()), now()), inicio + interval '1 minute') ELSE fin END,
              -- Una actividad que se cierra queda con sus minutos.
              valor = CASE WHEN ${estado}::text = 'paso' AND valor IS NULL AND unidad = 'min'
                           THEN round(extract(epoch FROM greatest(least(coalesce(${finPedido}::timestamptz, now()), now()), inicio + interval '1 minute') - inicio) / 60)
                           ELSE valor END,
              datos = coalesce(datos, '{}'::jsonb)
                || jsonb_build_object('abierto', ${estado}::text <> 'paso', 'chequeado', now())
                || jsonb_build_object('evolucion', coalesce(datos->'evolucion', '[]'::jsonb) || ${JSON.stringify([paso])}::jsonb)
            WHERE id = ${id}`,
      );
      return una<Registro>(tx, sql`SELECT ${COLUMNAS} FROM registros r WHERE r.id = ${id}`);
    });
    return c.json(r);
  })
  .get('/lugares-comida', async (c) => {
    // ?persona=1: los lugares donde se comió antes (para sugerirlos), los más usados y recientes primero.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(
      await filas<{ lugar: string; donde: string; veces: number }>(
        c.var.db,
        sql`SELECT datos->>'lugar' AS lugar, max(datos->>'donde') AS donde, count(*)::int AS veces FROM registros
            WHERE persona_id = ${p.id} AND borrado IS NULL AND datos->>'lugar' IS NOT NULL
            GROUP BY datos->>'lugar' ORDER BY count(*) DESC, max(inicio) DESC LIMIT 30`,
      ),
    );
  })
  .get('/automaticos', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: lo que llegó solo ese día (teléfono, ubicación, clima, reloj), por fuente y concepto.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = esFecha(c.req.query('fecha')) ? c.req.query('fecha')! : diaDePatty(new Date(), p.zona_horaria);
    return c.json(
      await filas<DatoAutomatico>(
        c.var.db,
        sql`SELECT f.nombre AS fuente, f.tipo AS tipo_fuente, c.nombre AS concepto, c.categoria_id, max(m.unidad) AS unidad,
                   count(*)::int AS cantidad, sum(m.valor)::float AS suma, min(m.valor)::float AS minimo, max(m.valor)::float AS maximo
            FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id JOIN conceptos c ON c.id = m.concepto_id
            WHERE m.persona_id = ${p.id} AND m.fecha = ${fecha}
            GROUP BY f.id, f.nombre, f.tipo, c.id, c.nombre, c.categoria_id
            ORDER BY f.tipo, sum(m.valor) DESC`,
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
      const comida = await datosComida(tx, c.var.usuario, d, concepto);
      const plato = await datosPlato(tx, c.var.usuario, d, concepto);
      const detalles = await datosDetalles(tx, c.var.usuario, d, concepto);
      await tx.update(registros).set({ concepto_id: concepto.id, ...valores(d, concepto, actual.persona) }).where(sql`id = ${id}`);
      // Dónde se comió: se reemplaza (o se saca) solo si vino en el pedido.
      if (comida !== undefined) {
        await tx.execute(sql`UPDATE registros SET datos = (coalesce(datos, '{}'::jsonb) - 'donde' - 'donde_concepto_id' - 'lugar' - 'lugar_concepto_id') || ${JSON.stringify(comida ?? {})}::jsonb WHERE id = ${id}`);
      }
      if (detalles !== undefined) {
        await tx.execute(sql`UPDATE registros SET datos = (coalesce(datos, '{}'::jsonb) - 'detalles' - 'detalle_concepto_ids') || ${JSON.stringify(detalles ?? {})}::jsonb WHERE id = ${id}`);
      }
      if (plato !== undefined) {
        await tx.execute(sql`UPDATE registros SET datos = (coalesce(datos, '{}'::jsonb) - 'porcion' - 'tipos' - 'plato_concepto_ids') || ${JSON.stringify(plato ?? {})}::jsonb WHERE id = ${id}`);
      }
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
  .post('/:id/restaurar', async (c) => {
    // Deshacer un borrado (el "Deshacer" que aparece después de deslizar para borrar).
    const id = idParam(c);
    await c.var.db.transaction(async (tx) => {
      const r = await una<{ persona_id: number }>(tx, sql`SELECT persona_id FROM registros WHERE id = ${id} AND borrado IS NOT NULL`);
      if (!r) throw new ErrorApi('No existe.', 404);
      await persona(tx, c.var.usuario, r.persona_id, true);
      await tx.execute(sql`UPDATE registros SET borrado = NULL WHERE id = ${id}`);
    });
    return c.json({ ok: true });
  })
  .post('/foto', async (c) => {
    // {persona_id, imagen (base64, JPEG/PNG/WebP), tipo, texto?, fecha?}: lo que se ve en la foto (un plato de comida,
    // una bebida, un remedio) como registros propuestos, igual que contarlo. No guarda nada ni la foto.
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const tipo = ['image/jpeg', 'image/png', 'image/webp'].includes(texto(d.tipo)) ? (texto(d.tipo) as 'image/jpeg') : 'image/jpeg';
    const datos = texto(d.imagen).replace(/^data:[^;]+;base64,/, '');
    if (!datos || !/^[A-Za-z0-9+/=]+$/.test(datos)) throw new ErrorApi('Falta la foto.');
    if (datos.length > 7_000_000) throw new ErrorApi('La foto es muy grande.');
    await controlarLimite(c.var.db, c.var.usuario, 'foto');
    return c.json(await interpretarTexto(c.var.db, p, texto(d.texto), esFecha(d.fecha) ? d.fecha : undefined, { tipo, datos }, c.var.idioma, texto(d.pista).slice(0, 200)));
  })
  .post('/interpretar', async (c) => {
    // "Desayuné café con tostadas, a las 11 me dolió la cabeza (4)" → registros propuestos, sin guardar.
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    await controlarLimite(c.var.db, c.var.usuario, 'contar');
    // momento: cuándo se contó, si fue sin señal y se ordena ahora (hasta una semana atrás).
    const m = typeof d.momento === 'string' ? new Date(d.momento) : null;
    const momento = m && !Number.isNaN(m.getTime()) && m.getTime() <= Date.now() && Date.now() - m.getTime() < 7 * 86400000 ? m : undefined;
    return c.json(await interpretarTexto(c.var.db, p, texto(d.texto), esFecha(d.fecha) ? d.fecha : undefined, undefined, c.var.idioma, texto(d.pista).slice(0, 200), momento));
  });
