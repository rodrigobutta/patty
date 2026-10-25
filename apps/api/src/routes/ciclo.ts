// El ciclo menstrual de una persona: con los días de menstruación anotados se calcula el día y la fase de hoy, la
// duración promedio, la próxima, la ovulación y los días fértiles (estimados), y qué síntomas aparecen en cada fase.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { ESTACIONES, estacionDe, FASES_CICLO, fasesPorDia, MENSTRUACION, PREMENSTRUAL, resumenCiclo, type FaseCiclo, type ResumenCiclo, type RolCategoria } from 'shared';
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
  const r: CicloRespuesta = { ...resumen, por_fase };
  return c.json(r);
});

/**
 * Para los patrones: rasgos del calendario que vienen solos, sin anotar nada. La estación de cada día (en la categoría
 * Clima: "en invierno te duele más la cabeza") si el período abarca más de una, y la fase del ciclo de cada día (con
 * los días premenstruales aparte) si hay menstruaciones anotadas.
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
      conceptosR.push({ id, nombre: c.nombre, tipo_valor: c.tipo_valor, rol: cat.rol });
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
  return { filas: filasR, conceptos: conceptosR };
}
