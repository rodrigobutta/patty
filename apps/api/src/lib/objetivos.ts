// Los objetivos de la semana (tabla objetivos): cuántos días se cumplió cada uno, día por día, con lo anotado y lo que
// llegó solo. Un día que todavía no pasó queda sin marcar (null).
import { sql } from 'drizzle-orm';
import { normalizar } from 'shared';
import { filas, type Db, type Tx } from '../db/client.js';
import { sumarDias } from './fechas.js';

export type TipoObjetivo = 'concepto' | 'sin_concepto' | 'sueno_min' | 'pasos_min' | 'pantalla_max';
export const TIPOS_OBJETIVO: TipoObjetivo[] = ['concepto', 'sin_concepto', 'sueno_min', 'pasos_min', 'pantalla_max'];

export interface Objetivo {
  id: number;
  persona_id: number;
  semana: string;
  texto: string;
  emoji: string;
  tipo: TipoObjetivo;
  concepto: string | null;
  valor: number | null;
  meta_dias: number;
  estado: 'propuesto' | 'aceptado' | 'descartado';
  logrados: number | null;
}

export interface ConProgreso extends Objetivo {
  dias: Array<{ fecha: string; cumple: boolean | null }>;
  cumplidos: number;
}

const MEDICION: Partial<Record<TipoObjetivo, string>> = { sueno_min: 'Horas de sueño', pasos_min: 'Pasos', pantalla_max: 'Tiempo de pantalla' };

/** Los 7 días de la semana de `o`, cada uno cumplido o no (null si es después de `hoy`). */
export async function progreso(db: Db | Tx, o: Objetivo, hoy: string): Promise<ConProgreso> {
  const fechas = Array.from({ length: 7 }, (_, k) => sumarDias(o.semana, k));
  const hasta = fechas[6];
  let por: Map<string, number>;
  const medicion = MEDICION[o.tipo];
  if (medicion) {
    const l = await filas<{ fecha: string; v: number }>(
      db,
      sql`SELECT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, sum(m.valor)::float AS v FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
          WHERE m.persona_id = ${o.persona_id} AND c.nombre = ${medicion} AND m.fecha BETWEEN ${o.semana} AND ${hasta} GROUP BY m.fecha`,
    );
    por = new Map(l.map((x) => [x.fecha, x.v]));
  } else {
    // Un concepto: anotado a mano, o que llegó solo (una caminata del reloj), o como tipo de comida ("Comida frita").
    const norm = normalizar(o.concepto ?? '');
    const l = await filas<{ fecha: string; n: number }>(
      db,
      sql`SELECT s.fecha, count(*)::int AS n FROM (
            SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, concepto_id FROM serie_diaria
            WHERE persona_id = ${o.persona_id} AND fecha BETWEEN ${o.semana} AND ${hasta}) s
          JOIN conceptos c ON c.id = s.concepto_id WHERE c.nombre_norm = ${norm} GROUP BY s.fecha`,
    );
    por = new Map(l.map((x) => [x.fecha, x.n]));
  }
  // Para "sin": solo cuentan los días en que anotó algo (si no, un día sin usar la app contaría como logrado).
  const anotados =
    o.tipo === 'sin_concepto'
      ? new Set(
          (await filas<{ fecha: string }>(
            db,
            sql`SELECT DISTINCT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM registros WHERE persona_id = ${o.persona_id} AND borrado IS NULL AND origen IN ('manual', 'ia', 'noche') AND fecha BETWEEN ${o.semana} AND ${hasta}`,
          )).map((x) => x.fecha),
        )
      : null;
  const dias = fechas.map((fecha) => {
    const v = por.get(fecha);
    let cumple: boolean | null;
    switch (o.tipo) {
      case 'concepto':
        cumple = v !== undefined;
        break;
      case 'sin_concepto':
        cumple = anotados!.has(fecha) ? v === undefined : fecha < hoy ? false : null;
        break;
      case 'sueno_min':
      case 'pasos_min':
        cumple = v !== undefined && v >= (o.valor ?? 0);
        break;
      case 'pantalla_max':
        cumple = v === undefined ? (fecha < hoy ? false : null) : v <= (o.valor ?? 0);
        break;
    }
    // Lo que todavía no pasó (o es hoy y aún no se cumplió) queda sin marcar.
    if (fecha > hoy || (fecha === hoy && !cumple)) cumple = null;
    return { fecha, cumple };
  });
  return { ...o, dias, cumplidos: dias.filter((d) => d.cumple).length };
}

export function objetivosDe(db: Db | Tx, personaId: number, semana: string, estados: string[] = ['propuesto', 'aceptado']): Promise<Objetivo[]> {
  return filas<Objetivo>(
    db,
    sql`SELECT id, persona_id, to_char(semana, 'YYYY-MM-DD') AS semana, texto, emoji, tipo, concepto, valor, meta_dias, estado, logrados
        FROM objetivos WHERE persona_id = ${personaId} AND semana = ${semana} AND estado IN ${estados} ORDER BY id`,
  );
}
