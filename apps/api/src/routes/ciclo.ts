// El ciclo menstrual de una persona: con los días de menstruación anotados se calcula el día y la fase de hoy, la
// duración promedio, la próxima, la ovulación y los días fértiles (estimados), y qué síntomas aparecen en cada fase.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  COMO_ME_SENTI,
  COMO_ME_SIENTO,
  ESTACIONES,
  rasgosDeFecha,
  estacionDe,
  FASES_CICLO,
  fasesPorDia,
  FIN_MENSTRUACION,
  MENSTRUACION,
  periodosDe,
  PREMENSTRUAL,
  resumenCiclo,
  TIPOS_RESPUESTA_CICLO,
  type FaseCiclo,
  type ResumenCiclo,
  type RespuestaCiclo,
  type RolCategoria,
  type TipoRespuestaCiclo,
  type Usuario,
} from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import { persona, type PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, diasEntre, esFecha, localAInstante, sumarDias } from '../lib/fechas.js';
import { cuerpo, texto, type Env } from '../lib/http.js';
import type { ConceptoInfo, FilaDiaria } from '../patrones/motor.js';
import { obtenerOCrearConcepto } from './conceptos.js';
import { guardarRegistro } from './registros.js';

/** Los días con algo anotado de un concepto del ciclo (del sistema). */
async function diasDe(tx: Tx, personaId: number, nombre: string): Promise<string[]> {
  return (
    await filas<{ fecha: string }>(
      tx,
      sql`SELECT DISTINCT to_char(r.fecha, 'YYYY-MM-DD') AS fecha FROM registros r JOIN conceptos c ON c.id = r.concepto_id
          JOIN categorias k ON k.id = c.categoria_id
          WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'ciclo' AND c.nombre = ${nombre} ORDER BY 1`,
    )
  ).map((f) => f.fecha);
}

/** Los días con menstruación anotada (del concepto del sistema). */
export const diasDeMenstruacion = (tx: Tx, personaId: number) => diasDe(tx, personaId, MENSTRUACION);

/**
 * Todo lo que hace falta para calcular el ciclo: los días de menstruación y los fines confirmados (los dos son
 * registros, la misma fuente que el Día y lo que se cuenta con la voz) y lo contestado a las preguntas.
 */
export async function datosDelCiclo(tx: Tx, personaId: number): Promise<{ dias: string[]; fines: string[]; respuestas: RespuestaCiclo[] }> {
  const respuestas = await filas<RespuestaCiclo>(
    tx,
    sql`SELECT tipo, to_char(referencia, 'YYYY-MM-DD') AS referencia, to_char(fecha, 'YYYY-MM-DD') AS fecha
        FROM ciclo_respuestas WHERE persona_id = ${personaId} ORDER BY fecha`,
  );
  return { dias: await diasDeMenstruacion(tx, personaId), fines: await diasDe(tx, personaId, FIN_MENSTRUACION), respuestas };
}

export interface CicloRespuesta extends ResumenCiclo {
  /** Lo que más se anotó (dolores, molestias, ánimo) en cada fase: para ver qué trae cada parte del ciclo. */
  por_fase: Record<FaseCiclo | 'premenstrual', Array<{ concepto: string; dias: number }>>;
  /**
   * Cada fase cruzada con cómo estuvo: de los días con algo anotado en esa fase, el ánimo promedio (0 a 10), en qué
   * parte hubo alguna molestia, y las horas de sueño promedio. Para ver si una fase trae peor ánimo o más dolores.
   */
  cruce: Record<FaseCiclo | 'premenstrual', { dias: number; animo: number | null; molestias: number | null; sueno: number | null }>;
}

type ClaveFase = FaseCiclo | 'premenstrual';
const CLAVES: ClaveFase[] = ['menstrual', 'folicular', 'ovulatoria', 'lutea', 'premenstrual'];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** El cruce de las fases con el ánimo, las molestias y el sueño (ver CicloRespuesta.cruce). */
async function cruzarFases(tx: Tx, personaId: number, fases: ReturnType<typeof fasesPorDia>, desde: string, hasta: string): Promise<CicloRespuesta['cruce']> {
  const dias = await filas<{ fecha: string; animo: number | null; molestia: boolean; sueno: number | null }>(
    tx,
    sql`WITH d AS (
          SELECT r.fecha,
                 avg(r.intensidad) FILTER (WHERE c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI})) AS animo,
                 bool_or(k.clave = 'sintoma') AS molestia
          FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND r.origen IN ('manual', 'ia') AND r.fecha BETWEEN ${desde} AND ${hasta}
          GROUP BY r.fecha)
        SELECT to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.animo::float AS animo, d.molestia,
               (SELECT sum(m.valor)::float FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
                WHERE m.persona_id = ${personaId} AND m.fecha = d.fecha AND c.nombre = 'Horas de sueño') AS sueno
        FROM d`,
  );
  const acum = new Map<ClaveFase, { dias: number; animo: number[]; molestias: number; sueno: number[] }>();
  for (const d of dias) {
    const f = fases.get(d.fecha);
    if (!f) continue;
    for (const clave of [f.fase, ...(f.premenstrual ? ['premenstrual' as const] : [])]) {
      const a = acum.get(clave) ?? { dias: 0, animo: [], molestias: 0, sueno: [] };
      a.dias++;
      if (d.animo !== null) a.animo.push(d.animo);
      if (d.molestia) a.molestias++;
      if (d.sueno !== null) a.sueno.push(d.sueno);
      acum.set(clave, a);
    }
  }
  const prom = (xs: number[]) => (xs.length >= 2 ? r1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return Object.fromEntries(
    CLAVES.map((clave) => {
      const a = acum.get(clave);
      return [clave, a ? { dias: a.dias, animo: prom(a.animo), molestias: a.dias >= 2 ? r1(a.molestias / a.dias) : null, sueno: prom(a.sueno) } : { dias: 0, animo: null, molestias: null, sueno: null }];
    }),
  ) as CicloRespuesta['cruce'];
}

/** Una fecha del pedido que tiene que ser de hoy (el día de Patty) para atrás, hasta dos años. */
function fechaPasada(v: unknown, hoy: string, campo = 'fecha'): string {
  if (!esFecha(v)) throw new ErrorApi('{campo}: fecha inválida.', 400, { campo });
  if (v > hoy) throw new ErrorApi('No se puede marcar un día que todavía no llegó.');
  if (v < sumarDias(hoy, -730)) throw new ErrorApi('Esa fecha es demasiado vieja.');
  return v;
}

/** Anota un concepto del ciclo en un día: si es hoy, con la hora de ahora; si es otro, al mediodía de ese día. */
async function anotar(tx: Tx, u: Usuario, p: PersonaAcceso, fecha: string, hoy: string, nombre: string): Promise<void> {
  const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'ciclo'`);
  if (!cat) throw new ErrorApi('Falta la categoría del ciclo.', 500);
  const ya = await una(
    tx,
    sql`SELECT 1 AS x FROM registros r JOIN conceptos c ON c.id = r.concepto_id
        WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha = ${fecha} AND c.categoria_id = ${cat.id} AND c.nombre = ${nombre}`,
  );
  if (ya) return;
  const inicio = fecha === hoy ? new Date() : localAInstante(fecha, '12:00', p.zona_horaria);
  await guardarRegistro(tx, u, {
    persona_id: p.id,
    concepto_nombre: nombre,
    categoria_id: cat.id,
    ...(nombre === MENSTRUACION ? { intensidad: 6 } : {}),
    inicio: inicio.toISOString(),
  });
}

/** Borra (se puede deshacer desde la base) lo anotado del ciclo de ciertos conceptos entre dos días. */
async function borrarEntre(tx: Tx, personaId: number, nombres: string[], desde: string, hasta: string): Promise<void> {
  if (hasta < desde) return;
  await tx.execute(sql`UPDATE registros r SET borrado = now() FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
                       WHERE r.concepto_id = c.id AND k.clave = 'ciclo' AND c.nombre IN (${sql.join(nombres.map((n) => sql`${n}`), sql`, `)})
                         AND r.persona_id = ${personaId} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hasta}`);
}

/**
 * Un fin de período recién anotado (desde el calendario, la tarjeta o contándolo: "ya se me fue") reemplaza a otro
 * fin que hubiera del mismo período, así queda uno solo.
 */
export async function ordenarFin(tx: Tx, personaId: number, registroId: number, fecha: string): Promise<void> {
  const periodo = periodosDe(await diasDeMenstruacion(tx, personaId), [fecha]).find((x) => x.terminado && x.fin >= fecha && x.inicio <= fecha);
  if (!periodo) return;
  await tx.execute(sql`UPDATE registros r SET borrado = now() FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
                       WHERE r.concepto_id = c.id AND k.clave = 'ciclo' AND c.nombre = ${FIN_MENSTRUACION} AND r.id <> ${registroId}
                         AND r.persona_id = ${personaId} AND r.borrado IS NULL AND r.fecha BETWEEN ${periodo.inicio} AND ${sumarDias(periodo.inicio, 14)}`);
}

/** El período que empieza ese día (para corregirlo o borrarlo desde el calendario). */
async function periodoQueEmpieza(tx: Tx, personaId: number, inicio: unknown) {
  const { dias, fines } = await datosDelCiclo(tx, personaId);
  const p = periodosDe(dias, fines).find((x) => x.inicio === inicio);
  if (!p) throw new ErrorApi('No hay un período que empiece ese día.', 404);
  return p;
}

/** Lo que cambia en el calendario: escribe sobre la persona del pedido, en una transacción. */
async function cambiar(c: { var: Env['Variables'] }, d: Record<string, unknown>, f: (tx: Tx, p: PersonaAcceso, hoy: string) => Promise<void>) {
  await c.var.db.transaction(async (tx) => {
    const p = await persona(tx, c.var.usuario, Number(d.persona_id), true);
    await f(tx, p, diaDePatty(new Date(), p.zona_horaria));
  });
}

export const rutasCiclo = new Hono<Env>()
  .post('/inicio', async (c) => {
    // {persona_id, fecha, dias?}: el primer día de un período (también uno pasado). Con `dias` (un período viejo del
    // que sabe cuánto duró), también su fin.
    const d = await cuerpo(c);
    await cambiar(c, d, async (tx, p, hoy) => {
      const fecha = fechaPasada(d.fecha, hoy);
      await anotar(tx, c.var.usuario, p, fecha, hoy, MENSTRUACION);
      const n = Number(d.dias);
      if (Number.isInteger(n) && n >= 1 && n <= 15) {
        const fin = sumarDias(fecha, n - 1);
        if (fin <= hoy) await anotar(tx, c.var.usuario, p, fin, hoy, FIN_MENSTRUACION);
      }
    });
    return c.json({ ok: true }, 201);
  })
  .post('/fin', async (c) => {
    // {persona_id, fecha}: el último día del período que venía (confirma el fin; si quedaban días anotados después,
    // se sacan: ella dice que ya había terminado).
    const d = await cuerpo(c);
    await cambiar(c, d, async (tx, p, hoy) => {
      const fecha = fechaPasada(d.fecha, hoy);
      const { dias, fines } = await datosDelCiclo(tx, p.id);
      const periodo = periodosDe(dias, fines).filter((x) => x.inicio <= fecha).at(-1);
      if (!periodo || diasEntre(periodo.inicio, fecha) > 14) throw new ErrorApi('No hay un período que haya empezado en los días anteriores.');
      await borrarEntre(tx, p.id, [MENSTRUACION], sumarDias(fecha, 1), periodo.fin);
      await anotar(tx, c.var.usuario, p, fecha, hoy, FIN_MENSTRUACION);
    });
    return c.json({ ok: true });
  })
  .post('/mover', async (c) => {
    // {persona_id, inicio, fecha}: "me vino otro día": corre todo el período (con su fin) para que empiece en `fecha`.
    const d = await cuerpo(c);
    await cambiar(c, d, async (tx, p, hoy) => {
      const fecha = fechaPasada(d.fecha, hoy);
      const periodo = await periodoQueEmpieza(tx, p.id, d.inicio);
      const corrimiento = diasEntre(periodo.inicio, fecha);
      if (!corrimiento) return;
      if (sumarDias(periodo.fin, corrimiento) > hoy) throw new ErrorApi('Corrido así, el período terminaría en un día que todavía no llegó.');
      await tx.execute(sql`UPDATE registros r SET fecha = r.fecha + ${corrimiento}::int, inicio = r.inicio + make_interval(days => ${corrimiento}::int)
                           FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
                           WHERE r.concepto_id = c.id AND k.clave = 'ciclo' AND c.nombre IN (${MENSTRUACION}, ${FIN_MENSTRUACION})
                             AND r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${periodo.inicio} AND ${periodo.fin}`);
      await tx.execute(sql`UPDATE ciclo_respuestas SET referencia = ${fecha} WHERE persona_id = ${p.id} AND referencia = ${periodo.inicio}`);
    });
    return c.json({ ok: true });
  })
  .post('/borrar', async (c) => {
    // {persona_id, inicio}: borra un período entero (los días anotados y su fin).
    const d = await cuerpo(c);
    await cambiar(c, d, async (tx, p) => {
      const periodo = await periodoQueEmpieza(tx, p.id, d.inicio);
      await borrarEntre(tx, p.id, [MENSTRUACION, FIN_MENSTRUACION], periodo.inicio, periodo.fin);
      await tx.execute(sql`DELETE FROM ciclo_respuestas WHERE persona_id = ${p.id} AND referencia = ${periodo.inicio}`);
    });
    return c.json({ ok: true });
  })
  .post('/respuesta', async (c) => {
    // {persona_id, tipo}: "todavía no me vino", "todavía sigo", o que no pregunte más por este ciclo.
    const d = await cuerpo(c);
    const tipo = texto(d.tipo) as TipoRespuestaCiclo;
    if (!TIPOS_RESPUESTA_CICLO.includes(tipo)) throw new ErrorApi('Respuesta inválida.');
    await cambiar(c, d, async (tx, p, hoy) => {
      const { dias, fines } = await datosDelCiclo(tx, p.id);
      const ultimo = periodosDe(dias.filter((f) => f <= hoy), fines).at(-1);
      if (!ultimo) throw new ErrorApi('Todavía no hay ningún período anotado.');
      await tx.execute(sql`INSERT INTO ciclo_respuestas (persona_id, tipo, referencia, fecha) VALUES (${p.id}, ${tipo}, ${ultimo.inicio}, ${hoy})`);
    });
    return c.json({ ok: true }, 201);
  })
  .get('/', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const { dias, fines, respuestas } = await datosDelCiclo(c.var.db, p.id);
    const resumen = resumenCiclo(dias, hoy, { fines, respuestas });
    const desde = sumarDias(hoy, -365);
    const fases = fasesPorDia(dias, desde, hoy, fines);
    const por_fase: CicloRespuesta['por_fase'] = { menstrual: [], folicular: [], ovulatoria: [], lutea: [], premenstrual: [] };
    if (fases.size) {
      const efectos = await filas<{ fecha: string; concepto: string }>(
        c.var.db,
        sql`SELECT DISTINCT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, k.nombre AS concepto FROM registros r JOIN conceptos k ON k.id = r.concepto_id
            JOIN categorias g ON g.id = k.categoria_id
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hoy} AND g.clave = 'sintoma'`,
      );
      const cuenta = new Map<string, Map<string, number>>();
      for (const e of efectos) {
        const f = fases.get(e.fecha);
        if (!f) continue;
        for (const clave of [f.fase, ...(f.premenstrual ? ['premenstrual'] : [])]) {
          const m = cuenta.get(clave) ?? new Map<string, number>();
          m.set(e.concepto, (m.get(e.concepto) ?? 0) + 1);
          cuenta.set(clave, m);
        }
      }
      for (const [clave, m] of cuenta) {
        por_fase[clave as FaseCiclo] = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([concepto, dias]) => ({ concepto, dias }));
      }
    }
    const cruce = await cruzarFases(c.var.db, p.id, fases, desde, hoy);
    const r: CicloRespuesta = { ...resumen, por_fase, cruce };
    return c.json(r);
  });

/**
 * Para los patrones: rasgos del calendario que vienen solos, sin anotar nada. La estación de cada día (en la categoría
 * Clima: "en invierno te duele más la cabeza") si el período abarca más de una, la fase del ciclo de cada día (con
 * los días premenstruales aparte) si hay menstruaciones anotadas, y lo de cada fecha: el día de la semana, el fin de
 * semana, los feriados, Navidad y las fiestas, el principio y el fin de mes (ver rasgosDeFecha). Estos últimos van en
 * "Otro" y solo como causa ("los domingos estás más bajón"): nunca son el efecto.
 */
export async function rasgosDelCalendario(
  tx: Tx,
  p: { id: number; zona_horaria: string },
  desde: string,
  hasta: string,
): Promise<{ filas: FilaDiaria[]; conceptos: ConceptoInfo[] }> {
  const filasR: FilaDiaria[] = [];
  const conceptosR: ConceptoInfo[] = [];
  const categoria = async (clave: string) => (await filas<{ id: number; rol: RolCategoria }>(tx, sql`SELECT id, rol FROM categorias WHERE clave = ${clave} LIMIT 1`))[0];
  const ids = new Map<string, number>();
  const concepto = async (cat: { id: number; rol: RolCategoria }, nombre: string) => {
    let id = ids.get(nombre);
    if (id === undefined) {
      const { concepto: c } = await obtenerOCrearConcepto(tx, { nombre, categoriaId: cat.id, tipoValor: 'evento', unidad: null });
      id = c.id;
      ids.set(nombre, id);
      // Todo lo del calendario es causa: la fase del ciclo o la estación no son algo que "pase" por otra cosa.
      conceptosR.push({ id, nombre: c.nombre, tipo_valor: c.tipo_valor, rol: 'causa' });
    }
    return id;
  };
  const fila = (fecha: string, concepto_id: number): FilaDiaria => ({ fecha, concepto_id, veces: 1, suma: null, promedio: null, intensidad: null, primera: null, automatica: true });

  const dias: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);
  const estaciones = dias.map((f) => estacionDe(f, p.zona_horaria));
  const clima = await categoria('clima');
  if (clima && new Set(estaciones).size > 1) {
    for (let i = 0; i < dias.length; i++) filasR.push(fila(dias[i], await concepto(clima, ESTACIONES[estaciones[i]].nombre)));
  }

  const ciclo = await datosDelCiclo(tx, p.id);
  const fases = fasesPorDia(ciclo.dias, desde, hasta, ciclo.fines);
  const catCiclo = await categoria('ciclo');
  if (catCiclo && fases.size) {
    for (const [fecha, f] of fases) {
      filasR.push(fila(fecha, await concepto(catCiclo, FASES_CICLO[f.fase].concepto)));
      if (f.premenstrual) filasR.push(fila(fecha, await concepto(catCiclo, PREMENSTRUAL)));
    }
  }
  const otro = await categoria('otro');
  if (otro) {
    for (const f of dias) for (const nombre of rasgosDeFecha(f)) filasR.push(fila(f, await concepto(otro, nombre)));
  }
  return { filas: filasR, conceptos: conceptosR };
}
