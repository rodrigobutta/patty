// El ciclo menstrual de una persona: con los días de menstruación anotados se calcula el día y la fase de hoy, la
// duración promedio, la próxima, la ovulación y los días fértiles (estimados), y qué síntomas aparecen en cada fase.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { COMO_ME_SENTI, COMO_ME_SIENTO, ESTACIONES, rasgosDeFecha, estacionDe, FASES_CICLO, fasesPorDia, MENSTRUACION, PREMENSTRUAL, resumenCiclo, type FaseCiclo, type ResumenCiclo, type RolCategoria } from 'shared';
import { filas, type Tx } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { diaDePatty, sumarDias } from '../lib/fechas.js';
import type { Env } from '../lib/http.js';
import type { ConceptoInfo, FilaDiaria } from '../patrones/motor.js';
import { obtenerOCrearConcepto } from './conceptos.js';

/** Los días con menstruación anotada (del concepto del sistema). */
export async function diasDeMenstruacion(tx: Tx, personaId: number): Promise<string[]> {
  return (
    await filas<{ fecha: string }>(
      tx,
      sql`SELECT DISTINCT to_char(r.fecha, 'YYYY-MM-DD') AS fecha FROM registros r JOIN conceptos c ON c.id = r.concepto_id
          JOIN categorias k ON k.id = c.categoria_id
          WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'ciclo' AND c.nombre = ${MENSTRUACION} ORDER BY 1`,
    )
  ).map((f) => f.fecha);
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

export const rutasCiclo = new Hono<Env>().get('/', async (c) => {
  const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
  const hoy = diaDePatty(new Date(), p.zona_horaria);
  const dias = await diasDeMenstruacion(c.var.db, p.id);
  const resumen = resumenCiclo(dias, hoy);
  const desde = sumarDias(hoy, -365);
  const fases = fasesPorDia(dias, desde, hoy);
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

  const fases = fasesPorDia(await diasDeMenstruacion(tx, p.id), desde, hasta);
  const ciclo = await categoria('ciclo');
  if (ciclo && fases.size) {
    for (const [fecha, f] of fases) {
      filasR.push(fila(fecha, await concepto(ciclo, FASES_CICLO[f.fase].concepto)));
      if (f.premenstrual) filasR.push(fila(fecha, await concepto(ciclo, PREMENSTRUAL)));
    }
  }
  const otro = await categoria('otro');
  if (otro) {
    for (const f of dias) for (const nombre of rasgosDeFecha(f)) filasR.push(fila(f, await concepto(otro, nombre)));
  }
  return { filas: filasR, conceptos: conceptosR };
}
