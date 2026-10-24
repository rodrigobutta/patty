// Remedios: los tratamientos de cada persona ("paracetamol 1 g cada 8 h por 5 días", "vitamina D todos los días a las
// 9") y sus tomas. La app pide las próximas tomas para programar los avisos del teléfono, y marca cada una como tomada
// (queda un registro de medicación, que entra a los patrones) o salteada. Las que pasan sin marcar son las olvidadas.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { tomasEntre, type NuevoTratamiento, type Registro, type Toma, type Tratamiento, type Usuario } from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import { tomas, tratamientos } from '../db/schema.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { esFecha, fechaLocal, HORA_INICIO_DIA, leerInstante, localAInstante } from '../lib/fechas.js';
import { cuerpo, idParam, numeroONulo, texto, type Env } from '../lib/http.js';
import { obtenerOCrearConcepto } from './conceptos.js';
import { guardarRegistro } from './registros.js';

/** Una toma anotada a mano (o contada) cuenta para la programada más cercana dentro de este margen. */
const MARGEN_VINCULAR_H = 3;

type Fila = Omit<Tratamiento, 'total' | 'tomadas' | 'proxima' | 'activo'> & { zona: string };

const COLUMNAS = sql`t.id, t.persona_id, t.concepto_id, c.nombre AS remedio, t.dosis, t.unidad, t.cada_horas, t.horarios,
  t.inicio, t.fin, t.motivo, t.nota, t.terminado, p.zona_horaria AS zona`;
const DESDE = sql`FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id JOIN personas p ON p.id = t.persona_id`;

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);

/** Las tomas programadas de un tratamiento entre dos instantes, en la zona de la persona. */
export function programadas(t: Fila, desde: Date, hasta: Date): Date[] {
  return tomasEntre(
    t,
    desde,
    hasta,
    (i) => fechaLocal(i, t.zona),
    (f, h) => localAInstante(f, h, t.zona),
  );
}

/** Termina cuando termina (o cuando se terminó a mano). */
const finDe = (t: Fila) => Math.min(t.fin ? Date.parse(t.fin) : Infinity, t.terminado ? Date.parse(t.terminado) : Infinity);

async function completar(tx: Tx, t: Fila): Promise<Tratamiento> {
  const ahora = new Date();
  const fin = finDe(t);
  const { zona, ...resto } = t;
  void zona;
  const r = await una<{ tomadas: number }>(tx, sql`SELECT count(*)::int AS tomadas FROM tomas tm
    JOIN registros r ON r.id = tm.registro_id AND r.borrado IS NULL WHERE tm.tratamiento_id = ${t.id} AND tm.estado = 'tomada'`);
  const programable = Boolean(t.cada_horas || t.horarios.length);
  const total = programable && Number.isFinite(fin) ? programadas(t, new Date(t.inicio), new Date(fin)).length : null;
  const proxima = programable ? (programadas(t, ahora, new Date(Math.min(fin, ahora.getTime() + 40 * 86400000)))[0] ?? null) : null;
  return {
    ...resto,
    inicio: iso(t.inicio)!,
    fin: iso(t.fin),
    terminado: iso(t.terminado),
    total,
    tomadas: r?.tomadas ?? 0,
    proxima: proxima?.toISOString() ?? null,
    activo: !t.terminado && fin > ahora.getTime(),
  };
}

async function fila(tx: Tx, id: number): Promise<Fila | null> {
  return una<Fila>(tx, sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.id = ${id} AND t.borrado IS NULL`);
}

async function propio(tx: Tx, u: Usuario, id: number, escribir: boolean): Promise<{ t: Fila; p: PersonaAcceso }> {
  const t = await fila(tx, id);
  if (!t) throw new ErrorApi('Ese remedio no existe.', 404);
  return { t, p: await persona(tx, u, t.persona_id, escribir) };
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida lo que se manda al crear o cambiar un tratamiento. */
function datos(d: Partial<NuevoTratamiento>) {
  const dosis = numeroONulo(d.dosis, 'dosis');
  if (dosis !== null && dosis <= 0) throw new ErrorApi('La dosis tiene que ser mayor que cero.');
  const cada = numeroONulo(d.cada_horas, 'cada cuántas horas');
  if (cada !== null && (cada < 0.5 || cada > 24 * 31)) throw new ErrorApi('¿Cada cuántas horas? Entre media hora y un mes.');
  const horarios = Array.isArray(d.horarios) ? [...new Set(d.horarios.map((h) => texto(h).padStart(5, '0')))].sort() : [];
  if (horarios.some((h) => !HORA.test(h))) throw new ErrorApi('Los horarios van como 09:00.');
  if (horarios.length > 12) throw new ErrorApi('Hasta 12 horarios por día.');
  const inicio = leerInstante(d.inicio, 'primera toma');
  const fin = d.fin ? leerInstante(d.fin, 'fin') : null;
  if (fin && fin <= inicio) throw new ErrorApi('El final tiene que ser después de la primera toma.');
  return {
    dosis,
    unidad: texto(d.unidad) || null,
    cada_horas: cada,
    horarios: cada ? [] : horarios,
    inicio: inicio.toISOString(),
    fin: fin?.toISOString() ?? null,
    motivo: texto(d.motivo) || null,
    nota: texto(d.nota) || null,
  };
}

async function conceptoDelRemedio(tx: Tx, u: Usuario, d: Partial<NuevoTratamiento>, unidad: string | null): Promise<number> {
  if (d.concepto_id) {
    const c = await una<{ id: number }>(
      tx,
      sql`SELECT c.id FROM conceptos c JOIN categorias k ON k.id = c.categoria_id WHERE c.id = ${Number(d.concepto_id)} AND c.unido_a IS NULL`,
    );
    if (!c) throw new ErrorApi('Ese remedio no existe (¿se unió con otro?).');
    return c.id;
  }
  const nombre = texto(d.concepto_nombre);
  if (!nombre) throw new ErrorApi('¿Qué remedio?');
  const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'medicacion'`);
  const { concepto, nuevo } = await obtenerOCrearConcepto(tx, {
    nombre,
    categoriaId: cat?.id,
    tipoValor: unidad ? 'cantidad' : 'evento',
    unidad,
    usuarioId: u.id,
  });
  // Si lo crea el tratamiento, ya se sabe en qué se mide: no hace falta preguntarlo al anotarlo a mano.
  if (nuevo) await tx.execute(sql`UPDATE conceptos SET cantidad_decidida = true WHERE id = ${concepto.id}`);
  return concepto.id;
}

export async function crearTratamiento(tx: Tx, u: Usuario, d: NuevoTratamiento): Promise<Tratamiento> {
  const p = await persona(tx, u, Number(d.persona_id), true);
  const v = datos(d);
  const concepto_id = await conceptoDelRemedio(tx, u, d, v.unidad);
  const [n] = await tx
    .insert(tratamientos)
    .values({ persona_id: p.id, concepto_id, ...v, creado_por: u.id })
    .returning({ id: tratamientos.id });
  return completar(tx, (await fila(tx, n.id))!);
}

/**
 * Si se anota a mano (o se cuenta) un remedio que tiene tratamiento, cuenta como la toma programada más cercana que
 * todavía no se marcó (hasta 3 horas antes o después). Así no queda "olvidada" una toma que sí se tomó.
 */
export async function vincularToma(tx: Tx, r: Registro): Promise<void> {
  const lista = await filas<Fila>(
    tx,
    sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.persona_id = ${r.persona_id} AND t.concepto_id = ${r.concepto_id} AND t.borrado IS NULL`,
  );
  const cuando = Date.parse(r.inicio);
  const margen = MARGEN_VINCULAR_H * 3600000;
  let mejor: { t: Fila; programada: Date } | null = null;
  for (const t of lista) {
    const marcadas = new Set(
      (await filas<{ programada: string }>(tx, sql`SELECT programada FROM tomas WHERE tratamiento_id = ${t.id}`)).map((x) => Date.parse(x.programada)),
    );
    for (const x of programadas(t, new Date(cuando - margen), new Date(cuando + margen))) {
      if (marcadas.has(x.getTime())) continue;
      if (!mejor || Math.abs(x.getTime() - cuando) < Math.abs(mejor.programada.getTime() - cuando)) mejor = { t, programada: x };
    }
  }
  if (!mejor) return;
  await tx
    .insert(tomas)
    .values({ tratamiento_id: mejor.t.id, programada: mejor.programada.toISOString(), estado: 'tomada', registro_id: r.id })
    .onConflictDoNothing();
}

/** Las tomas de varios tratamientos entre dos instantes, con lo que pasó con cada una. */
async function tomasDe(tx: Tx, lista: Fila[], desde: Date, hasta: Date): Promise<Toma[]> {
  if (!lista.length) return [];
  const ids = lista.map((t) => t.id);
  const hechas = await filas<{ tratamiento_id: number; programada: string; estado: 'tomada' | 'salteada'; tomada: string | null }>(
    tx,
    sql`SELECT tm.tratamiento_id, tm.programada, tm.estado, r.inicio AS tomada
        FROM tomas tm LEFT JOIN registros r ON r.id = tm.registro_id AND r.borrado IS NULL
        WHERE tm.tratamiento_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
          AND tm.programada >= ${desde.toISOString()} AND tm.programada < ${hasta.toISOString()}
          -- una tomada cuyo registro se borró vuelve a estar pendiente
          AND (tm.estado = 'salteada' OR r.id IS NOT NULL)`,
  );
  const clave = (id: number, t: number) => `${id}|${t}`;
  const porClave = new Map(hechas.map((h) => [clave(h.tratamiento_id, Date.parse(h.programada)), h]));
  const salida: Toma[] = [];
  for (const t of lista) {
    for (const x of programadas(t, desde, hasta)) {
      const h = porClave.get(clave(t.id, x.getTime()));
      salida.push({
        tratamiento_id: t.id,
        persona_id: t.persona_id,
        remedio: t.remedio,
        dosis: t.dosis,
        unidad: t.unidad,
        programada: x.toISOString(),
        estado: h?.estado ?? null,
        tomada: iso(h?.tomada ?? null),
      });
    }
  }
  return salida.sort((a, b) => a.programada.localeCompare(b.programada) || a.remedio.localeCompare(b.remedio));
}

export const rutasTratamientos = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1: todos (activos primero; los terminados, para ver lo que se tomó).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const lista = await filas<Fila>(c.var.db, sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.persona_id = ${p.id} AND t.borrado IS NULL ORDER BY t.inicio DESC`);
    const completos = await Promise.all(lista.map((t) => completar(c.var.db, t)));
    return c.json(completos.sort((a, b) => Number(b.activo) - Number(a.activo)));
  })
  .get('/tomas', async (c) => {
    // ?persona=1&fecha=AAAA-MM-DD: las tomas de ese día de Patty (de 5 a 5).
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    if (!esFecha(fecha)) throw new ErrorApi('¿Qué día?');
    const desde = localAInstante(fecha, `0${HORA_INICIO_DIA}:00`, p.zona_horaria);
    const hasta = new Date(desde.getTime() + 86400000);
    const lista = await filas<Fila>(
      c.var.db,
      sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.persona_id = ${p.id} AND t.borrado IS NULL
          AND t.inicio < ${hasta.toISOString()} AND (t.fin IS NULL OR t.fin > ${desde.toISOString()})
          AND (t.terminado IS NULL OR t.terminado > ${desde.toISOString()})`,
    );
    return c.json(await tomasDe(c.var.db, lista, desde, hasta));
  })
  .get('/proximas', async (c) => {
    // Para programar los avisos del teléfono: las tomas sin marcar de las próximas horas (por defecto, una semana),
    // de todas las personas que el usuario puede anotar.
    const u = c.var.usuario;
    const horas = Math.min(Math.max(Number(c.req.query('horas')) || 168, 1), 24 * 31);
    // Desde una hora atrás: la que recién pasó sin marcar todavía tiene su "¿la tomaste?".
    const desde = new Date(Date.now() - 3600000);
    const hasta = new Date(Date.now() + horas * 3600000);
    const lista = await filas<Fila>(
      c.var.db,
      sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.borrado IS NULL AND t.terminado IS NULL
          AND (t.fin IS NULL OR t.fin > now()) AND (cardinality(t.horarios) > 0 OR t.cada_horas IS NOT NULL)
          AND (${u.rol === 'admin'} OR EXISTS (SELECT 1 FROM persona_usuarios pu WHERE pu.persona_id = t.persona_id AND pu.usuario_id = ${u.id}))`,
    );
    return c.json((await tomasDe(c.var.db, lista, desde, hasta)).filter((t) => t.estado === null));
  })
  .post('/', async (c) => {
    const d = (await cuerpo(c)) as unknown as NuevoTratamiento;
    return c.json(await c.var.db.transaction((tx) => crearTratamiento(tx, c.var.usuario, d)), 201);
  })
  .put('/:id', async (c) => {
    // Cambiar dosis, horarios o fechas. Lo ya marcado queda como estaba.
    const id = idParam(c);
    const d = (await cuerpo(c)) as Partial<NuevoTratamiento>;
    const r = await c.var.db.transaction(async (tx) => {
      const { t } = await propio(tx, c.var.usuario, id, true);
      const v = datos({ ...t, ...d, horarios: d.horarios ?? t.horarios });
      const concepto_id = d.concepto_id || d.concepto_nombre ? await conceptoDelRemedio(tx, c.var.usuario, d, v.unidad) : t.concepto_id;
      await tx.update(tratamientos).set({ ...v, concepto_id }).where(sql`id = ${id}`);
      return completar(tx, (await fila(tx, id))!);
    });
    return c.json(r);
  })
  .post('/:id/terminar', async (c) => {
    // Dejarlo (o retomarlo, con {"retomar": true}).
    const id = idParam(c);
    const d = await cuerpo(c);
    const r = await c.var.db.transaction(async (tx) => {
      await propio(tx, c.var.usuario, id, true);
      await tx.execute(sql`UPDATE tratamientos SET terminado = ${d.retomar ? null : new Date().toISOString()} WHERE id = ${id}`);
      return completar(tx, (await fila(tx, id))!);
    });
    return c.json(r);
  })
  .delete('/:id', async (c) => {
    // Borrar el tratamiento (por si se cargó mal). Lo que ya se anotó como tomado queda en el día.
    const id = idParam(c);
    await c.var.db.transaction(async (tx) => {
      await propio(tx, c.var.usuario, id, true);
      await tx.execute(sql`UPDATE tratamientos SET borrado = now() WHERE id = ${id}`);
    });
    return c.json({ ok: true });
  })
  .post('/:id/tomas', async (c) => {
    // {programada, estado: "tomada" | "salteada", inicio?}: marcar una toma. Tomada deja el registro de medicación.
    const id = idParam(c);
    const d = await cuerpo(c);
    const estado = d.estado;
    if (estado !== 'tomada' && estado !== 'salteada') throw new ErrorApi('¿La tomó o no?');
    const r = await c.var.db.transaction(async (tx) => {
      const { t, p } = await propio(tx, c.var.usuario, id, true);
      const programada = leerInstante(d.programada, 'programada');
      const existe = programadas(t, new Date(programada.getTime() - 1000), new Date(programada.getTime() + 1000)).length > 0;
      if (!existe) throw new ErrorApi('Esa toma no está en el tratamiento.');
      const vieja = await una<{ registro_id: number | null }>(tx, sql`SELECT registro_id FROM tomas WHERE tratamiento_id = ${id} AND programada = ${programada.toISOString()}`);
      if (vieja?.registro_id) await tx.execute(sql`UPDATE registros SET borrado = now() WHERE id = ${vieja.registro_id} AND borrado IS NULL`);
      let registro: Registro | null = null;
      if (estado === 'tomada') {
        registro = await guardarRegistro(
          tx,
          c.var.usuario,
          { persona_id: p.id, concepto_id: t.concepto_id, inicio: d.inicio ? String(d.inicio) : new Date().toISOString(), valor: t.dosis, unidad: t.unidad },
          'recordatorio',
          { sinVincular: true },
        );
      }
      await tx
        .insert(tomas)
        .values({ tratamiento_id: id, programada: programada.toISOString(), estado, registro_id: registro?.id ?? null })
        .onConflictDoUpdate({ target: [tomas.tratamiento_id, tomas.programada], set: { estado, registro_id: registro?.id ?? null, creado: sql`now()` } });
      return { estado, registro };
    });
    return c.json(r, 201);
  })
  .delete('/:id/tomas', async (c) => {
    // ?programada=ISO: deshacer lo marcado (si se tomó, se borra también el registro).
    const id = idParam(c);
    const programada = leerInstante(c.req.query('programada'), 'programada');
    await c.var.db.transaction(async (tx) => {
      await propio(tx, c.var.usuario, id, true);
      const vieja = await una<{ registro_id: number | null }>(tx, sql`DELETE FROM tomas WHERE tratamiento_id = ${id} AND programada = ${programada.toISOString()} RETURNING registro_id`);
      if (vieja?.registro_id) await tx.execute(sql`UPDATE registros SET borrado = now() WHERE id = ${vieja.registro_id}`);
    });
    return c.json({ ok: true });
  });

