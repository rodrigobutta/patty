// Ubicación y lugares con nombre.
//   POST   /api/ubicacion            { persona_id, puntos: [{ lat, lon, instante?, precision? }] }   (la web, con sesión)
//   POST   /api/ingesta/ubicacion    { lat, lon, instante? }   con el token de una fuente (un atajo del teléfono)
//   GET    /api/ubicacion/dia?persona=1&fecha=2026-10-24      viajes, km y estadías del día
//   DELETE /api/ubicacion?persona=1                           borra todos los puntos y lo calculado con ellos
//   GET/POST /api/ubicacion/lugares, PUT/DELETE /api/ubicacion/lugares/:id
// De los puntos se guarda solo uno cada vez que la persona se movió más de 1 km o entró o salió de un lugar (el
// primero de cada día siempre). Con ellos se recalculan, por día, las mediciones de la fuente «Ubicación»: «Viajes»,
// «Km recorridos» y una por cada estadía en un lugar (el concepto del lugar, con los minutos). Eso es lo que ve el motor.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { adivinarViaje, COMO_VIAJE, MODOS_VIAJE, traducir, VIAJE_PESADO, type ModoViaje, type ViajeDelDia, distanciaMetros, lugarDe, nombreLindo, normalizar, puntoNuevo, RADIO_LUGAR_M, type DiaUbicacion, type Lugar, type ParadaSinNombre } from 'shared';
import { direccionDe } from '../ubicacion/direccion.js';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { fuentes, lugares, mediciones, puntos, registros } from '../db/schema.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, leerInstante, localAInstante } from '../lib/fechas.js';
import { cuerpo, idParam, numeroONulo, texto, type Env } from '../lib/http.js';
import { paradasSinNombre, resumirDia, viajesDelDia, type LugarZona, type Punto } from '../ubicacion/resumen.js';
import { agregarAlias, obtenerOCrearConcepto } from './conceptos.js';
import { conceptoMedido } from './ingesta.js';

export const NOMBRE_FUENTE = 'Ubicación';
/** Los puntos (lo único con coordenadas) se borran solos pasado este tiempo; los resúmenes quedan. */
export const DIAS_GUARDADOS = 90;

type PersonaZona = Pick<PersonaAcceso, 'id' | 'zona_horaria'>;

async function fuenteUbicacion(tx: Tx, personaId: number): Promise<number> {
  const ya = await una<{ id: number }>(tx, sql`SELECT id FROM fuentes WHERE persona_id = ${personaId} AND tipo = 'ubicacion' AND nombre = ${NOMBRE_FUENTE}`);
  if (ya) return ya.id;
  const [f] = await tx
    .insert(fuentes)
    .values({ persona_id: personaId, tipo: 'ubicacion', nombre: NOMBRE_FUENTE, token_hash: createHash('sha256').update(randomBytes(32)).digest('hex') })
    .returning({ id: fuentes.id });
  return f.id;
}

function coordenada(v: unknown, campo: string, limite: number): number {
  const n = numeroONulo(v, campo);
  if (n === null || Math.abs(n) > limite) throw new ErrorApi('{campo}: ubicación inválida.', 400, { campo });
  return n;
}

/** ~11 m: alcanza para saber en qué lugar estaba y no guarda la ubicación exacta. */
const redondear = (n: number) => Math.round(n * 10000) / 10000;

const zonas = (tx: Tx, personaId: number) =>
  filas<LugarZona & { concepto_id: number }>(tx, sql`SELECT id, lat, lon, radio_m, concepto_id FROM lugares WHERE persona_id = ${personaId}`);

/** Vuelve a calcular las mediciones de ubicación de esos días a partir de los puntos que hay. */
export async function recalcular(tx: Tx, p: PersonaZona, fechas: string[]): Promise<void> {
  if (!fechas.length) return;
  const fuenteId = await fuenteUbicacion(tx, p.id);
  const ls = await zonas(tx, p.id);
  const concepto = new Map(ls.map((l) => [l.id, l.concepto_id]));
  const f = { id: fuenteId, persona_id: p.id, tipo: 'ubicacion', zona_horaria: p.zona_horaria };
  const cache = new Map<string, number>();
  const viajes = await conceptoMedido(tx, f, 'Viajes', 'lugar', 'viajes', cache);
  const km = await conceptoMedido(tx, f, 'Km recorridos', 'lugar', 'km', cache);
  await tx.execute(sql`DELETE FROM mediciones WHERE fuente_id = ${fuenteId} AND fecha IN ${fechas}`);
  const delDia = await filas<{ fecha: string; instante: string; lat: number; lon: number }>(
    tx,
    sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND fecha IN ${fechas}`,
  );
  const porDia = new Map<string, Punto[]>();
  for (const x of delDia) {
    let l = porDia.get(x.fecha);
    if (!l) porDia.set(x.fecha, (l = []));
    l.push({ instante: new Date(x.instante).getTime(), lat: x.lat, lon: x.lon });
  }
  const valores: Array<typeof mediciones.$inferInsert> = [];
  for (const [fecha, lista] of porDia) {
    const r = resumirDia(lista, ls);
    const base = { persona_id: p.id, fuente_id: fuenteId, fecha };
    const comienzo = localAInstante(fecha, '05:00', p.zona_horaria).toISOString();
    valores.push({ ...base, concepto_id: viajes, inicio: comienzo, valor: r.viajes, unidad: 'viajes' });
    valores.push({ ...base, concepto_id: km, inicio: comienzo, valor: r.km, unidad: 'km' });
    for (const e of r.estadias) {
      valores.push({
        ...base,
        concepto_id: concepto.get(e.lugar_id)!,
        inicio: new Date(e.llegada).toISOString(),
        fin: new Date(e.salida).toISOString(),
        valor: Math.round((e.salida - e.llegada) / 60000),
        unidad: 'min',
      });
    }
  }
  if (valores.length) await tx.insert(mediciones).values(valores).onConflictDoNothing();
  await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${fuenteId}`);
}

/** Todos los días que todavía tienen puntos (para cuando cambian los lugares). */
export async function recalcularTodo(tx: Tx, p: PersonaZona): Promise<void> {
  const dias = await filas<{ fecha: string }>(tx, sql`SELECT DISTINCT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM puntos WHERE persona_id = ${p.id}`);
  await recalcular(tx, p, dias.map((d) => d.fecha));
}

/**
 * Guarda los puntos que valen la pena (ver `puntoNuevo`) y recalcula sus días. Devuelve cuántos guardó y en qué lugar
 * está el último punto recibido.
 */
export async function guardarPuntos(tx: Tx, p: PersonaZona, lista: unknown[]): Promise<{ guardados: number; lugar: string | null }> {
  if (lista.length > 500) throw new ErrorApi('Mandá hasta 500 puntos por vez.');
  const ahora = Date.now();
  const recibidos = (lista as Array<Record<string, unknown>>)
    .map((x, i) => {
      const t = leerInstante(x?.instante, `puntos[${i}].instante`);
      const precision = numeroONulo(x?.precision, `puntos[${i}].precision`);
      return {
        instante: t,
        dia: diaDePatty(t, p.zona_horaria),
        lat: redondear(coordenada(x?.lat, `puntos[${i}].lat`, 90)),
        lon: redondear(coordenada(x?.lon, `puntos[${i}].lon`, 180)),
        precision: precision === null ? null : Math.round(precision),
      };
    })
    .filter((x) => x.instante.getTime() > ahora - DIAS_GUARDADOS * 86400000 && x.instante.getTime() < ahora + 3600000)
    .sort((a, b) => a.instante.getTime() - b.instante.getTime());
  if (!recibidos.length) return { guardados: 0, lugar: null };

  const ls = await filas<LugarZona & { nombre: string }>(
    tx,
    sql`SELECT l.id, l.lat, l.lon, l.radio_m, c.nombre FROM lugares l JOIN conceptos c ON c.id = l.concepto_id WHERE l.persona_id = ${p.id}`,
  );
  const previo = await una<{ instante: string; lat: number; lon: number }>(
    tx,
    sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND instante < ${recibidos[0].instante.toISOString()}
        ORDER BY instante DESC LIMIT 1`,
  );
  let anterior = previo ? { lat: previo.lat, lon: previo.lon, dia: diaDePatty(new Date(previo.instante), p.zona_horaria) } : null;
  const nuevos: Array<typeof puntos.$inferInsert> = [];
  for (const x of recibidos) {
    if (!puntoNuevo(anterior, x, ls)) continue;
    nuevos.push({ persona_id: p.id, instante: x.instante.toISOString(), fecha: x.dia, lat: x.lat, lon: x.lon, precision_m: x.precision });
    anterior = x;
  }
  const guardados = nuevos.length ? await tx.insert(puntos).values(nuevos).onConflictDoNothing().returning({ fecha: puntos.fecha }) : [];
  await recalcular(tx, p, [...new Set(guardados.map((g) => g.fecha))]);
  await tx.execute(sql`DELETE FROM puntos WHERE persona_id = ${p.id} AND instante < now() - make_interval(days => ${DIAS_GUARDADOS})`);
  const ultimo = recibidos[recibidos.length - 1];
  const lugar = lugarDe(ultimo, ls)?.nombre ?? null;
  return { guardados: guardados.length, lugar };
}

const COLUMNAS_LUGAR = sql`l.id, l.persona_id, l.concepto_id, c.nombre, l.lat, l.lon, l.radio_m`;

async function buscarLugar(tx: Tx, c: { var: Env['Variables'] }, id: number, escribir: boolean) {
  const l = await una<Lugar>(tx, sql`SELECT ${COLUMNAS_LUGAR} FROM lugares l JOIN conceptos c ON c.id = l.concepto_id WHERE l.id = ${id}`);
  if (!l) throw new ErrorApi('No existe ese lugar.', 404);
  return { lugar: l, p: await persona(tx, c.var.usuario, l.persona_id, escribir) };
}

function radio(v: unknown): number {
  const n = numeroONulo(v, 'radio_m') ?? RADIO_LUGAR_M;
  if (n < 30 || n > 5000) throw new ErrorApi('El radio tiene que ser de 30 a 5000 metros.');
  return Math.round(n);
}

export const rutasUbicacion = new Hono<Env>()
  .post('/', async (c) => {
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    if (!Array.isArray(d.puntos)) throw new ErrorApi('Mandá una lista "puntos".');
    const lista = d.puntos;
    return c.json({ ok: true, ...(await c.var.db.transaction((tx) => guardarPuntos(tx, p, lista))) });
  })
  .get('/dia', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    const dia = esFecha(fecha) ? fecha : diaDePatty(new Date(), p.zona_horaria);
    const ps = await filas<{ instante: string; lat: number; lon: number }>(
      c.var.db,
      sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND fecha = ${dia}`,
    );
    const ls = await filas<LugarZona & { nombre: string }>(
      c.var.db,
      sql`SELECT l.id, l.lat, l.lon, l.radio_m, c.nombre FROM lugares l JOIN conceptos c ON c.id = l.concepto_id WHERE l.persona_id = ${p.id}`,
    );
    const r = resumirDia(ps.map((x) => ({ instante: new Date(x.instante).getTime(), lat: x.lat, lon: x.lon })), ls);
    const nombre = new Map(ls.map((l) => [l.id, l.nombre]));
    const res: DiaUbicacion = {
      fecha: dia,
      puntos: ps.length,
      viajes: r.viajes,
      km: r.km,
      estadias: r.estadias.map((e) => ({
        lugar_id: e.lugar_id,
        lugar: nombre.get(e.lugar_id)!,
        llegada: new Date(e.llegada).toISOString(),
        salida: new Date(e.salida).toISOString(),
        minutos: Math.round((e.salida - e.llegada) / 60000),
      })),
    };
    return c.json(res);
  })
  .get('/recorrido', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: el mapita del día (en el widget de viajes). Los puntos en orden, más el último del día
    // anterior y el primero del siguiente si están cerca de la medianoche (un viaje que empezó antes o sigue después), y
    // los lugares con nombre donde estuvo.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    const dia = esFecha(fecha) ? fecha : diaDePatty(new Date(), p.zona_horaria);
    const ps = await filas<{ instante: string; lat: number; lon: number }>(
      c.var.db,
      sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND fecha = ${dia} ORDER BY instante`,
    );
    const BORDE_H = 3;
    const antes = ps.length
      ? await una<{ instante: string; lat: number; lon: number }>(
          c.var.db,
          sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND instante < ${ps[0].instante}
                AND instante > ${ps[0].instante}::timestamptz - make_interval(hours => ${BORDE_H}) ORDER BY instante DESC LIMIT 1`,
        )
      : null;
    const despues = ps.length
      ? await una<{ instante: string; lat: number; lon: number }>(
          c.var.db,
          sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND instante > ${ps[ps.length - 1].instante}
                AND instante < ${ps[ps.length - 1].instante}::timestamptz + make_interval(hours => ${BORDE_H}) ORDER BY instante LIMIT 1`,
        )
      : null;
    const ls = await filas<LugarZona & { nombre: string }>(
      c.var.db,
      sql`SELECT l.id, l.lat, l.lon, l.radio_m, c.nombre FROM lugares l JOIN conceptos c ON c.id = l.concepto_id WHERE l.persona_id = ${p.id}`,
    );
    const r = resumirDia(ps.map((x) => ({ instante: new Date(x.instante).getTime(), lat: x.lat, lon: x.lon })), ls);
    const visitados = new Set(r.estadias.map((e) => e.lugar_id));
    return c.json({
      puntos: ps.map((x) => ({ lat: x.lat, lon: x.lon, instante: new Date(x.instante).toISOString() })),
      antes: antes ? { lat: antes.lat, lon: antes.lon, instante: new Date(antes.instante).toISOString() } : null,
      despues: despues ? { lat: despues.lat, lon: despues.lon, instante: new Date(despues.instante).toISOString() } : null,
      lugares: ls.filter((l) => visitados.has(l.id)).map((l) => ({ nombre: l.nombre, lat: l.lat, lon: l.lon, radio_m: l.radio_m })),
      viajes: r.viajes,
      km: r.km,
    });
  })
  .get('/viajes', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: los viajes del día con lo que se adivina (en qué fue, si parece pesado) y si ya se
    // contó cómo fue.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    const dia = esFecha(fecha) ? fecha : diaDePatty(new Date(), p.zona_horaria);
    const ps = await filas<{ instante: string; lat: number; lon: number }>(c.var.db, sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND fecha = ${dia}`);
    const contados = new Set(
      (await filas<{ inicio: string }>(
        c.var.db,
        sql`SELECT r.inicio FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
            WHERE r.persona_id = ${p.id} AND r.fecha = ${dia} AND r.borrado IS NULL AND k.clave = 'viaje'`,
      )).map((x) => new Date(x.inicio).getTime()),
    );
    const lugaresP = await filas<LugarZona>(c.var.db, sql`SELECT id, lat, lon, radio_m FROM lugares WHERE persona_id = ${p.id}`);
    const r: ViajeDelDia[] = viajesDelDia(ps.map((x) => ({ instante: new Date(x.instante).getTime(), lat: x.lat, lon: x.lon })), lugaresP).map((v) => {
      const minutos = Math.max(1, Math.round((v.fin - v.inicio) / 60000));
      const km = Math.round(v.metros / 100) / 10;
      const g = adivinarViaje(km, minutos);
      return {
        inicio: new Date(v.inicio).toISOString(),
        fin: new Date(v.fin).toISOString(),
        minutos,
        km,
        velocidad: Math.round(km / (minutos / 60)),
        modo: g.modo,
        pista: traducir(c.var.idioma, g.pista),
        pesado: g.pesado,
        contado: [...contados].some((t) => Math.abs(t - v.inicio) < 60000),
        camino: v.camino ?? [],
      };
    });
    return c.json(r);
  })
  .post('/viajes', async (c) => {
    // {persona_id, inicio, fin, minutos, km, modo, como}: cómo fue un viaje. Queda como "Viaje en auto" (con los minutos
    // y cuánto pesó) y, si fue pesado, además "Viaje pesado": así entra en los patrones.
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const modo = MODOS_VIAJE[d.modo as ModoViaje] ? (d.modo as ModoViaje) : 'auto';
    const como = COMO_VIAJE.find((x) => x.clave === d.como) ?? COMO_VIAJE[1];
    const inicio = leerInstante(d.inicio, 'inicio');
    const fin = leerInstante(d.fin, 'fin');
    const minutos = Math.max(1, Math.min(24 * 60, Math.round(Number(d.minutos) || (fin.getTime() - inicio.getTime()) / 60000)));
    const km = Math.max(0, Number(d.km) || 0);
    await c.var.db.transaction(async (tx) => {
      const cat = (await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'viaje'`))!.id;
      // Si ya se había contado este viaje, se reemplaza.
      await tx.execute(sql`UPDATE registros r SET borrado = now() FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
        WHERE c.id = r.concepto_id AND k.clave = 'viaje' AND r.persona_id = ${p.id} AND r.borrado IS NULL
          AND abs(extract(epoch FROM r.inicio - ${inicio.toISOString()}::timestamptz)) < 60`);
      const viaje = (await obtenerOCrearConcepto(tx, { nombre: MODOS_VIAJE[modo].concepto, categoriaId: cat, tipoValor: 'duracion', unidad: 'min' })).concepto;
      const nuevos = [{ concepto_id: viaje.id, valor: minutos, unidad: 'min', intensidad: como.intensidad, nota: km ? `${String(km).replace('.', ',')} km` : null }];
      if (como.clave === 'pesado') {
        const pesado = (await obtenerOCrearConcepto(tx, { nombre: VIAJE_PESADO, categoriaId: cat, tipoValor: 'evento', unidad: null })).concepto;
        nuevos.push({ concepto_id: pesado.id, valor: null as unknown as number, unidad: null as unknown as string, intensidad: como.intensidad, nota: null });
      }
      for (const n of nuevos) {
        await tx.insert(registros).values({
          persona_id: p.id,
          concepto_id: n.concepto_id,
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
          fecha: diaDePatty(inicio, p.zona_horaria),
          valor: n.valor,
          unidad: n.unidad,
          intensidad: n.intensidad,
          nota: n.nota,
          origen: 'manual',
          creado_por: c.var.usuario.id,
        });
      }
    });
    return c.json({ ok: true }, 201);
  })
  .get('/frecuentes', async (c) => {
    // ?persona=1&dias=90: para el mapa de Patrones. Los lugares con nombre con cuánto tiempo y cuántos días se estuvo
    // ahí, y los lugares sin nombre donde se quedó un buen rato más de un día (juntando los que están cerca).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const dias = Math.min(365, Math.max(7, Number(c.req.query('dias')) || 90));
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const conNombre = await filas<{ id: number; nombre: string; lat: number; lon: number; radio_m: number; minutos: number; dias: number }>(
      c.var.db,
      sql`SELECT l.id, c.nombre, l.lat, l.lon, l.radio_m, coalesce(sum(m.valor), 0)::float AS minutos, count(DISTINCT m.fecha)::int AS dias
          FROM lugares l JOIN conceptos c ON c.id = l.concepto_id
          LEFT JOIN mediciones m ON m.concepto_id = l.concepto_id AND m.persona_id = l.persona_id AND m.fecha > ${hoy}::date - ${dias}::int
          WHERE l.persona_id = ${p.id} GROUP BY l.id, c.nombre ORDER BY 6 DESC`,
    );
    const ps = await filas<{ instante: string; lat: number; lon: number; fecha: string }>(
      c.var.db,
      sql`SELECT instante, lat, lon, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM puntos WHERE persona_id = ${p.id} AND fecha > ${hoy}::date - ${dias}::int`,
    );
    const ls = await filas<LugarZona>(c.var.db, sql`SELECT id, lat, lon, radio_m FROM lugares WHERE persona_id = ${p.id}`);
    const grupos: Array<{ lat: number; lon: number; minutos: number; dias: Set<string> }> = [];
    for (const f of [...new Set(ps.map((x) => x.fecha))]) {
      const fin = f === hoy ? Date.now() : localAInstante(f, '23:59', p.zona_horaria).getTime();
      const delDia = ps.filter((x) => x.fecha === f).map((x) => ({ instante: new Date(x.instante).getTime(), lat: x.lat, lon: x.lon }));
      for (const x of paradasSinNombre(delDia, ls, fin)) {
        const g = grupos.find((y) => distanciaMetros(y, x) < RADIO_LUGAR_M * 2);
        if (g) {
          g.minutos += (x.salida - x.llegada) / 60000;
          g.dias.add(f);
        } else grupos.push({ lat: x.lat, lon: x.lon, minutos: (x.salida - x.llegada) / 60000, dias: new Set([f]) });
      }
    }
    return c.json({
      lugares: conNombre.map((l) => ({ ...l, minutos: Math.round(l.minutos) })),
      sin_nombre: grupos
        .filter((g) => g.dias.size > 1)
        .sort((a, b) => b.minutos - a.minutos)
        .slice(0, 15)
        .map((g) => ({ lat: g.lat, lon: g.lon, minutos: Math.round(g.minutos), dias: g.dias.size })),
    });
  })
  .get('/ultimo', async (c) => {
    // ?persona=1: cuándo llegó el último punto (para "Última sincronización" en Lugares; lo manda también el teléfono solo).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const r = await una<{ instante: string | null }>(c.var.db, sql`SELECT max(instante) AS instante FROM puntos WHERE persona_id = ${p.id}`);
    return c.json({ instante: r?.instante ?? null });
  })
  .get('/calor', async (c) => {
    // ?persona=1&dias=30: el mapa de calor de Descubrir. Los puntos guardados, juntados en cuadraditos de ~150 m, con
    // cuántos hay en cada uno (más puntos: más tiempo o más idas y vueltas por ahí).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const dias = Math.min(365, Math.max(1, Number(c.req.query('dias')) || 30));
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const PASO = 0.0015;
    const celdas = await filas<{ lat: number; lon: number; n: number }>(
      c.var.db,
      sql`SELECT (floor(lat / ${PASO}) + 0.5) * ${PASO} AS lat, (floor(lon / ${PASO}) + 0.5) * ${PASO} AS lon, count(*)::int AS n
          FROM puntos WHERE persona_id = ${p.id} AND fecha > ${hoy}::date - ${dias}::int
          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 2000`,
    );
    return c.json(celdas.map((x) => ({ lat: Number(x.lat), lon: Number(x.lon), n: x.n })));
  })
  .get('/paradas', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: dónde se quedó un buen rato ese día sin que sea un lugar con nombre (para preguntarle
    // qué lugar es), con la dirección aproximada y cuántos otros días estuvo ahí en el último mes.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const dia = esFecha(fecha) ? fecha : hoy;
    const ps = await filas<{ instante: string; lat: number; lon: number; fecha: string }>(
      c.var.db,
      sql`SELECT instante, lat, lon, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM puntos WHERE persona_id = ${p.id} AND fecha > ${dia}::date - 30 AND fecha <= ${dia}`,
    );
    const ls = await filas<LugarZona>(c.var.db, sql`SELECT id, lat, lon, radio_m FROM lugares WHERE persona_id = ${p.id}`);
    const aPunto = (x: { instante: string; lat: number; lon: number }) => ({ instante: new Date(x.instante).getTime(), lat: x.lat, lon: x.lon });
    // El último punto del día cuenta hasta ahora (si es hoy) o hasta el fin del día.
    const finDe = (f: string) => (f === hoy ? Date.now() : localAInstante(f, '23:59', p.zona_horaria).getTime());
    const paradas = paradasSinNombre(ps.filter((x) => x.fecha === dia).map(aPunto), ls, finDe(dia));
    // Los otros días del mes con una parada cerca de cada una (para decir "estuviste acá 4 días").
    const otrosDias = [...new Set(ps.map((x) => x.fecha))].filter((f) => f !== dia);
    const paradasOtros = otrosDias.map((f) => ({ f, l: paradasSinNombre(ps.filter((x) => x.fecha === f).map(aPunto), ls, finDe(f)) }));
    const r: ParadaSinNombre[] = [];
    for (const x of paradas.slice(0, 5)) {
      r.push({
        lat: x.lat,
        lon: x.lon,
        llegada: new Date(x.llegada).toISOString(),
        salida: new Date(x.salida).toISOString(),
        minutos: Math.round((x.salida - x.llegada) / 60000),
        direccion: await direccionDe(x.lat, x.lon, c.var.idioma),
        otros_dias: paradasOtros.filter((o) => o.l.some((y) => distanciaMetros(x, y) < RADIO_LUGAR_M * 2)).length,
      });
    }
    return c.json(r);
  })
  .delete('/', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), true);
    await c.var.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM puntos WHERE persona_id = ${p.id}`);
      await tx.execute(sql`DELETE FROM mediciones WHERE fuente_id IN (SELECT id FROM fuentes WHERE persona_id = ${p.id} AND tipo = 'ubicacion')`);
    });
    return c.json({ ok: true });
  })
  .get('/lugares', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(
      await filas<Lugar>(c.var.db, sql`SELECT ${COLUMNAS_LUGAR} FROM lugares l JOIN conceptos c ON c.id = l.concepto_id WHERE l.persona_id = ${p.id} ORDER BY c.nombre`),
    );
  })
  .post('/lugares', async (c) => {
    const d = await cuerpo(c);
    const p = await persona(c.var.db, c.var.usuario, Number(d.persona_id), true);
    const nombre = texto(d.nombre);
    if (!nombre) throw new ErrorApi('Poné un nombre para el lugar.');
    const lat = coordenada(d.lat, 'lat', 90);
    const lon = coordenada(d.lon, 'lon', 180);
    const id = await c.var.db.transaction(async (tx) => {
      const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'lugar'`);
      const { concepto } = await obtenerOCrearConcepto(tx, { nombre, categoriaId: cat!.id, tipoValor: 'duracion', unidad: 'min', usuarioId: c.var.usuario.id });
      const ya = await una(tx, sql`SELECT 1 FROM lugares WHERE persona_id = ${p.id} AND concepto_id = ${concepto.id}`);
      if (ya) throw new ErrorApi('Ya hay un lugar «{nombre}».', 409, { nombre: concepto.nombre });
      const [l] = await tx
        .insert(lugares)
        .values({ persona_id: p.id, concepto_id: concepto.id, lat: redondear(lat), lon: redondear(lon), radio_m: radio(d.radio_m) })
        .returning({ id: lugares.id });
      await recalcularTodo(tx, p);
      return l.id;
    });
    return c.json((await buscarLugar(c.var.db, c, id, false)).lugar, 201);
  })
  .put('/lugares/:id', async (c) => {
    const id = idParam(c);
    const d = await cuerpo(c);
    await c.var.db.transaction(async (tx) => {
      const { lugar, p } = await buscarLugar(tx, c, id, true);
      const cambios: Partial<typeof lugares.$inferInsert> = {};
      if (d.lat !== undefined || d.lon !== undefined) {
        cambios.lat = redondear(coordenada(d.lat, 'lat', 90));
        cambios.lon = redondear(coordenada(d.lon, 'lon', 180));
      }
      if (d.radio_m !== undefined) cambios.radio_m = radio(d.radio_m);
      if (Object.keys(cambios).length) await tx.update(lugares).set(cambios).where(sql`id = ${id}`);
      // El nombre es el del concepto: cambiarlo deja el viejo como alias, igual que al renombrar un concepto.
      const nombre = nombreLindo(texto(d.nombre));
      if (nombre && normalizar(nombre) !== normalizar(lugar.nombre)) {
        await tx.execute(sql`UPDATE conceptos SET nombre = ${nombre}, nombre_norm = ${normalizar(nombre)} WHERE id = ${lugar.concepto_id}`);
        await agregarAlias(tx, lugar.concepto_id, lugar.nombre);
      }
      if (Object.keys(cambios).length) await recalcularTodo(tx, p);
    });
    return c.json((await buscarLugar(c.var.db, c, id, false)).lugar);
  })
  .post('/lugares/:id/unir', async (c) => {
    // Dos lugares que son el mismo ("Casa" y "Mi casa", guardados con un rato de diferencia): lo del primero pasa al
    // segundo, solo de esta persona (los conceptos son de todos), y el primero se borra. El segundo crece para abarcar
    // a los dos.
    const id = idParam(c);
    const en = Number((await cuerpo(c)).en);
    if (!en || en === id) throw new ErrorApi('Elegí con qué lugar unirlo.');
    await c.var.db.transaction(async (tx) => {
      const { lugar: a, p } = await buscarLugar(tx, c, id, true);
      const { lugar: b } = await buscarLugar(tx, c, en, true);
      if (a.persona_id !== b.persona_id) throw new ErrorApi('Son de personas distintas.');
      await tx.execute(sql`UPDATE registros SET concepto_id = ${b.concepto_id} WHERE persona_id = ${p.id} AND concepto_id = ${a.concepto_id}`);
      await tx.execute(
        sql`UPDATE registros SET datos = jsonb_set(datos, '{lugar_concepto_id}', to_jsonb(${b.concepto_id}::int))
            WHERE persona_id = ${p.id} AND (datos->>'lugar_concepto_id')::int = ${a.concepto_id}`,
      );
      await tx.execute(sql`UPDATE mediciones m SET concepto_id = ${b.concepto_id} WHERE persona_id = ${p.id} AND concepto_id = ${a.concepto_id}
                           AND NOT EXISTS (SELECT 1 FROM mediciones o WHERE o.persona_id = m.persona_id AND o.concepto_id = ${b.concepto_id}
                                           AND o.inicio = m.inicio AND o.fuente_id = m.fuente_id)`);
      await tx.execute(sql`DELETE FROM mediciones WHERE persona_id = ${p.id} AND concepto_id = ${a.concepto_id}`);
      await tx.execute(sql`DELETE FROM hallazgos WHERE persona_id = ${p.id} AND (causa_id = ${a.concepto_id} OR efecto_id = ${a.concepto_id})`);
      const d = distanciaMetros(a, b);
      await tx.execute(sql`UPDATE lugares SET radio_m = ${radio(Math.min(1000, Math.max(b.radio_m, Math.round(d + a.radio_m / 2))))} WHERE id = ${b.id}`);
      await tx.execute(sql`DELETE FROM lugares WHERE id = ${a.id}`);
      await recalcularTodo(tx, p);
    });
    return c.json((await buscarLugar(c.var.db, c, en, false)).lugar);
  })
  .delete('/lugares/:id', async (c) => {
    const id = idParam(c);
    await c.var.db.transaction(async (tx) => {
      const { p } = await buscarLugar(tx, c, id, true);
      await tx.execute(sql`DELETE FROM lugares WHERE id = ${id}`);
      // Las estadías de los días que todavía tienen puntos se van; las más viejas quedan en el historial.
      await recalcularTodo(tx, p);
    });
    return c.json({ ok: true });
  });

/**
 * Cuando cambia la forma de contar (los viajes, por ejemplo), recalcula una sola vez lo guardado de todas las personas
 * con puntos (`version`: la de la forma nueva; queda anotada en ajustes).
 */
export async function recalcularSiCambio(db: Db, version: string): Promise<void> {
  const clave = 'calculo_ubicacion';
  const ya = await una<{ valor: string }>(db, sql`SELECT valor FROM ajustes WHERE clave = ${clave}`);
  if (ya?.valor === version) return;
  const personas = await filas<PersonaZona>(db, sql`SELECT id, zona_horaria FROM personas WHERE id IN (SELECT DISTINCT persona_id FROM puntos)`);
  for (const p of personas) {
    try {
      await db.transaction((tx) => recalcularTodo(tx, p));
    } catch (e) {
      console.error(`Recalcular ubicación de la persona ${p.id}:`, e instanceof Error ? e.message : e);
    }
  }
  await db.execute(
    sql`INSERT INTO ajustes (clave, valor) VALUES (${clave}, ${JSON.stringify(version)}::jsonb)
        ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, creado = now()`,
  );
  console.log(`Ubicación recalculada (${version}) para ${personas.length} personas.`);
}
