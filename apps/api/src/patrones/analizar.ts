// El análisis de patrones de una persona: junta sus datos de cada día, busca relaciones, las hace explicar por la IA (si
// está) y las guarda. Lo corre la persona con "Buscar patrones" y el servidor solo, de madrugada (patrones/noche.ts).
import { sql } from 'drizzle-orm';
import { nombreRasgo, patronesFinos, perfilTexto, RELACIONES, traducir, type AjustesPatrones, type RolCategoria, type Hallazgo, type Idioma, type Persona, type ResultadoAnalisis } from 'shared';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { sumarDias } from '../lib/fechas.js';
import { analisis, hallazgos } from '../db/schema.js';
import { rasgosDeComponentes } from './componentes.js';
import { explicarHallazgos } from '../ia/analizar.js';
import { iaDisponible } from '../ia/cliente.js';
import type { PersonaAcceso } from '../lib/acceso.js';
import { rasgosDelCalendario } from '../routes/ciclo.js';
import { climaPorHoraParaPatrones, completarSolYLuna } from '../routes/clima.js';
import { obtenerOCrearConcepto } from '../routes/conceptos.js';
import { buscarPatrones, claveCausas, describir, DIAS_MINIMOS, type ConceptoInfo, type FilaDiaria } from './motor.js';

const COLUMNAS = sql`h.id, h.persona_id, h.causa_id, h.efecto_id, ca.nombre AS causa, ef.nombre AS efecto, h.causa_modo, h.efecto_modo,
  ca.tipo_valor AS causa_tipo, ef.tipo_valor AS efecto_tipo,
  h.umbral, h.protege, ca.unidad AS causa_unidad, h.origen, h.ya_no, h.componente,
  to_char(h.fecha_desde, 'YYYY-MM-DD') AS fecha_desde, to_char(h.fecha_hasta, 'YYYY-MM-DD') AS fecha_hasta,
  h.desfase_dias, h.soporte, h.dias_causa, h.dias_evaluados, h.prob_con, h.prob_sin, h.lift, h.p_valor, h.q_valor, h.puntaje,
  h.explicacion, h.estado, h.detectado,
  coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', c.nombre, 'tipo', c.tipo_valor, 'modo', e->>'modo'))
            FROM jsonb_array_elements(h.causas_extra) e JOIN conceptos c ON c.id = (e->>'id')::int), '[]'::jsonb) AS causas_extra`;

export function listarHallazgos(tx: Tx, personaId: number, ids?: number[]): Promise<Hallazgo[]> {
  const filtro = ids ? sql`AND h.id IN ${ids}` : sql``;
  // Lo que la persona apagó en "Qué patrones buscar" no se muestra (aunque lo haya marcado antes): vuelve si lo prende.
  return filas<Hallazgo>(
    tx,
    sql`SELECT ${COLUMNAS} FROM hallazgos h JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        JOIN personas pe ON pe.id = h.persona_id
        WHERE h.persona_id = ${personaId} ${filtro}
          AND NOT (h.umbral IS NOT NULL AND coalesce(pe.patrones->>'umbrales', '') = 'false')
          AND NOT (h.protege AND coalesce(pe.patrones->>'proteccion', '') = 'false')
          AND NOT (h.desfase_dias >= 2 AND coalesce(pe.patrones->>'desfases_largos', '') = 'false')
          AND NOT (h.origen = 'hipotesis' AND coalesce(pe.patrones->>'hipotesis', '') = 'false')
          AND NOT (h.componente IS NOT NULL AND coalesce(pe.patrones->>'componentes', '') = 'false')
        ORDER BY (h.estado = 'descartado'), h.puntaje DESC`,
  );
}

export interface OpcionesAnalisis {
  desde: string;
  hasta: string;
  idioma: Idioma;
  /** Si se le pide a la IA que explique (si no, quedan los textos del motor). */
  ia: boolean;
  origen: 'manual' | 'noche';
}

/** Por si hay algo anotado con una fecha disparatada: más atrás que esto no se mira. */
const ANIOS_TOPE = 20;

/**
 * Desde cuándo tiene datos una persona: los patrones miran toda su historia. El motor cuenta de a bits y tiene tope de pruebas
 * (ver CAUSAS_MAX en motor.ts), así que crece poco con los años.
 */
export async function primerDiaDe(db: Db | Tx, personaId: number, hasta: string): Promise<string> {
  const tope = sumarDias(hasta, -365 * ANIOS_TOPE);
  const r = await una<{ primero: string | null }>(
    db,
    sql`SELECT to_char(least(
          (SELECT min(fecha) FROM registros WHERE persona_id = ${personaId} AND borrado IS NULL AND fecha >= ${tope}),
          (SELECT min(fecha) FROM mediciones WHERE persona_id = ${personaId} AND fecha >= ${tope})
        ), 'YYYY-MM-DD') AS primero`,
  );
  return r?.primero && r.primero <= hasta ? r.primero : hasta;
}

/**
 * Los datos de cada día de una persona, como los usa el motor: la serie diaria (sin el clima por hora, que va resumido),
 * con la hora de lo que se anotó, y la estación y la fase del ciclo. También los usa el aviso preventivo.
 */
export async function datosDePersona(db: Db, p: PersonaAcceso, desde: string, hasta: string, o: { componentes?: boolean } = {}): Promise<{ datos: FilaDiaria[]; conceptos: Array<ConceptoInfo & { unidad?: string | null }> }> {
  const porHora = await db.transaction(async (tx) => {
    await completarSolYLuna(tx, p, desde, hasta);
    return climaPorHoraParaPatrones(tx, p, desde, hasta);
  });
  const serieCompleta = await filas<FilaDiaria & { primera: Date | null }>(
    db,
    sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, concepto_id, veces, suma, promedio, intensidad_max AS intensidad, primera
        FROM serie_diaria WHERE persona_id = ${p.id} AND fecha BETWEEN ${desde} AND ${hasta}`,
  );
  const serie = serieCompleta.filter((f) => !porHora.has(Number(f.concepto_id)));
  // Las mediciones automáticas no tienen "primera" con sentido para el orden del día: solo las manuales.
  const manuales = new Set(
    (await filas<{ fecha: string; concepto_id: number }>(
      db,
      sql`SELECT DISTINCT to_char(fecha, 'YYYY-MM-DD') AS fecha, concepto_id FROM registros
          WHERE persona_id = ${p.id} AND fecha BETWEEN ${desde} AND ${hasta} AND borrado IS NULL`,
    )).map((f) => `${f.fecha}|${f.concepto_id}`),
  );
  // Las llegadas a un lugar sí tienen hora con sentido ("fui al súper a las 11, me dolió la cabeza a las 15"), pero
  // no hacen que el día cuente como anotado.
  const llegadas = new Set(
    (await filas<{ fecha: string; concepto_id: number }>(
      db,
      sql`SELECT DISTINCT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.concepto_id FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id
          JOIN lugares l ON l.concepto_id = m.concepto_id AND l.persona_id = m.persona_id
          WHERE m.persona_id = ${p.id} AND f.tipo = 'ubicacion' AND m.fecha BETWEEN ${desde} AND ${hasta}`,
    )).map((f) => `${f.fecha}|${f.concepto_id}`),
  );
  const datos: FilaDiaria[] = serie.map((f) => {
    const clave = `${f.fecha}|${f.concepto_id}`;
    const conHora = (manuales.has(clave) || llegadas.has(clave)) && f.primera;
    return {
      ...f,
      suma: f.suma === null ? null : Number(f.suma),
      promedio: f.promedio === null ? null : Number(f.promedio),
      primera: conHora ? new Date(f.primera!).getTime() : null,
      automatica: !manuales.has(clave) && llegadas.has(clave),
    };
  });
  // La estación y la fase del ciclo de cada día, que vienen solas.
  const calendario = await db.transaction((tx) => rasgosDelCalendario(tx, p, desde, hasta));
  datos.push(...calendario.filas);
  const conceptos = await filas<ConceptoInfo & { unidad?: string | null }>(
    db,
    sql`SELECT c.id, c.nombre, c.tipo_valor, k.rol, k.clave AS categoria, coalesce(c.unidad, k.unidad) AS unidad
        FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
        WHERE c.id IN (SELECT DISTINCT concepto_id FROM serie_diaria WHERE persona_id = ${p.id})`,
  );
  for (const x of calendario.conceptos) if (!conceptos.some((k) => k.id === x.id)) conceptos.push(x);
  // Con quién, por grupo: los días que estuvo con alguien de la familia, del trabajo… (ver RELACIONES en Personas guardadas).
  const grupos = await db.transaction((tx) => rasgosDeGente(tx, p.id, desde, hasta));
  datos.push(...grupos.filas);
  for (const x of grupos.conceptos) if (!conceptos.some((k) => k.id === x.id)) conceptos.push(x);
  // Los componentes de lo que comió, si no los apagó: "Días con mucha sal". Como los anteriores, solo como causa.
  if (o.componentes !== false && patronesFinos((await una<{ patrones: AjustesPatrones }>(db, sql`SELECT patrones FROM personas WHERE id = ${p.id}`))?.patrones).componentes) {
    const comp = await db.transaction((tx) => rasgosDeComponentes(tx, p.id, desde, hasta));
    datos.push(...comp.filas);
    conceptos.push(...comp.conceptos);
  }
  return { datos, conceptos };
}

/** Corre el análisis y lo guarda. `nuevos`: los hallazgos que la persona no tenía antes. */
export async function analizarPersona(db: Db, p: PersonaAcceso, o: OpcionesAnalisis): Promise<ResultadoAnalisis & { nuevos: number[] }> {
  const { desde, hasta, idioma } = o;
  const { datos, conceptos } = await datosDePersona(db, p, desde, hasta);
  // Qué patrones más finos quiere que le busquen (Más → Qué patrones buscar).
  const finos = patronesFinos(
    (await una<{ patrones: AjustesPatrones }>(db, sql`SELECT patrones FROM personas WHERE id = ${p.id}`))?.patrones,
  );
  const r = buscarPatrones(datos, conceptos, desde, hasta, {
    umbrales: finos.umbrales,
    proteccion: finos.proteccion,
    desfasesLargos: finos.desfases_largos,
  });
  const nombre = new Map(conceptos.map((x) => [x.id, x.nombre]));
  const conComponente = new Map(conceptos.filter((x) => x.componente).map((x) => [x.id, x.componente!]));
  const tipo = new Map(conceptos.map((x) => [x.id, x.tipo_valor]));
  const unidad = new Map(conceptos.map((x) => [x.id, x.unidad ?? null]));
  // Lo que la persona ya opinó. Un par que marcó como obvio o sin sentido no vuelve como novedad con otro desfase u otro
  // modo (sí se actualiza el mismo hallazgo, que queda apartado); y la IA aprende de todas las opiniones.
  const opinados = await filas<{ causa_id: number; efecto_id: number; causa: string; efecto: string; estado: 'confirmado' | 'obvio' | 'descartado'; clave: string; combo: string }>(
    db,
    sql`SELECT h.causa_id, h.efecto_id, ca.nombre AS causa, ef.nombre AS efecto, h.estado,
               h.causa_id || '|' || h.causa_modo || '|' || h.combo || '|' || h.efecto_id || '|' || h.efecto_modo || '|' || h.desfase_dias AS clave, h.combo
        FROM hallazgos h JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        WHERE h.persona_id = ${p.id} AND h.estado <> 'nuevo' ORDER BY h.actualizado DESC LIMIT 40`,
  );
  const apartados = new Set(opinados.filter((o) => o.estado !== 'confirmado').map((o) => `${o.causa_id}|${o.combo}|${o.efecto_id}`));
  const combo = (x: (typeof r.candidatos)[number]) => (x.causas_extra.length ? claveCausas(x) : '');
  const mismos = new Set(opinados.map((o) => o.clave));
  r.candidatos = r.candidatos.filter(
    (x) =>
      !apartados.has(`${x.causa_id}|${combo(x)}|${x.efecto_id}`) ||
      mismos.has(`${x.causa_id}|${x.causa_modo}|${combo(x)}|${x.efecto_id}|${x.efecto_modo}|${x.desfase_dias}`),
  );
  // Una combinación se nombra con todas sus causas: "Comida frita + Fase menstrual + Más temperatura máxima".
  // Un umbral lleva su valor: "Café: 3 o más".
  const conNombres = r.candidatos.map((x) => ({
    ...x,
    umbral: x.umbral ?? null,
    protege: x.protege ?? false,
    ya_no: x.ya_no ?? false,
    // Si esto lo había sospechado antes Patty y ahora lo encuentra el motor solo, queda como del motor.
    origen: 'motor' as const,
    fecha_desde: null,
    fecha_hasta: null,
    combo: combo(x),
    componente: [x.causa_id, ...x.causas_extra.map((c) => c.id)].map((id) => conComponente.get(id)).find(Boolean) ?? null,
    causa: [{ id: x.causa_id, modo: x.causa_modo }, ...x.causas_extra]
      .map((c) => nombreRasgo(nombre.get(c.id)!, tipo.get(c.id)!, c.modo, idioma, { valor: x.umbral ?? null, unidad: unidad.get(c.id) }))
      .join(' + '),
    efecto: nombreRasgo(nombre.get(x.efecto_id)!, tipo.get(x.efecto_id)!, x.efecto_modo, idioma),
  }));

  // La IA es opcional: si no está o falla, quedan los textos armados por el motor.
  let ia: Awaited<ReturnType<typeof explicarHallazgos>> | null = null;
  if (o.ia && iaDisponible() && conNombres.length) {
    const diasPor = new Map<number, number>();
    for (const f of datos) diasPor.set(f.concepto_id, (diasPor.get(f.concepto_id) ?? 0) + 1);
    const frecuentes = [...diasPor].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, dias]) => ({ nombre: nombre.get(id)!, dias }));
    try {
      ia = await explicarHallazgos({
        persona: p.nombre, perfil: perfilTexto((await una<Persona>(db, sql`SELECT to_char(nacimiento, 'YYYY-MM-DD') AS nacimiento, sexo, altura_cm, peso_kg, condiciones FROM personas WHERE id = ${p.id}`))!), desde, hasta, diasActivos: r.dias_activos, paresEvaluados: r.pares_evaluados,
        candidatos: conNombres.slice(0, 25), frecuentes, idioma,
        opiniones: opinados.map((o) => ({ causa: o.causa, efecto: o.efecto, opinion: o.estado === 'confirmado' ? 'le sirvió' : o.estado === 'obvio' ? 'ya lo sabía' : 'no tiene sentido' })),
      });
    } catch (e) {
      console.error('Análisis: la IA no pudo explicar los hallazgos:', e instanceof Error ? e.message : e);
    }
  }
  const explicacion = new Map(ia?.hallazgos.map((h) => [h.indice, `${h.explicacion}${h.plausibilidad === 'baja' ? traducir(idioma, ' (puede ser casualidad)') : ''}`]));

  const resultado = await db.transaction(async (tx) => {
    // Lo que ya estaba antes (en cualquier estado): lo que no, es nuevo y se puede avisar.
    const clave = (h: { causa_id: number; causa_modo: string; combo: string; efecto_id: number; efecto_modo: string; desfase_dias: number }) =>
      `${h.causa_id}|${h.causa_modo}|${h.combo}|${h.efecto_id}|${h.efecto_modo}|${h.desfase_dias}`;
    const antes = new Set(
      (await filas<{ causa_id: number; causa_modo: string; combo: string; efecto_id: number; efecto_modo: string; desfase_dias: number }>(
        tx,
        sql`SELECT causa_id, causa_modo, combo, efecto_id, efecto_modo, desfase_dias FROM hallazgos WHERE persona_id = ${p.id}`,
      )).map(clave),
    );
    const [a] = await tx
      .insert(analisis)
      .values({ persona_id: p.id, desde, hasta, dias: r.dias_activos, pares_evaluados: r.pares_evaluados, resumen: ia?.resumen ?? null, sugerencias: ia?.sugerencias ?? [], origen: o.origen })
      .returning({ id: analisis.id });
    // Los "nuevos" que ya no aparecen se van; los que la persona confirmó o descartó quedan. Los que salieron de una
    // hipótesis se vuelven a medir aparte, una vez por semana (patrones/hipotesis.ts).
    await tx.execute(sql`DELETE FROM hallazgos WHERE persona_id = ${p.id} AND estado = 'nuevo' AND origen = 'motor'`);
    const ids: number[] = [];
    const nuevos: number[] = [];
    for (const [i, x] of conNombres.entries()) {
      const { causa, efecto, ...stats } = x;
      const [h] = await tx
        .insert(hallazgos)
        .values({ persona_id: p.id, ...stats, explicacion: explicacion.get(i) ?? describir(x, causa, efecto, idioma), analisis_id: a.id })
        .onConflictDoUpdate({
          target: [hallazgos.persona_id, hallazgos.causa_id, hallazgos.causa_modo, hallazgos.combo, hallazgos.efecto_id, hallazgos.efecto_modo, hallazgos.desfase_dias],
          set: {
            ...stats,
            explicacion: explicacion.get(i) ?? describir(x, causa, efecto, idioma),
            analisis_id: a.id,
            actualizado: sql`now()`,
          },
        })
        .returning({ id: hallazgos.id });
      ids.push(h.id);
      if (!antes.has(clave(x))) nuevos.push(h.id);
    }
    if (nuevos.length) await tx.update(analisis).set({ nuevos }).where(sql`id = ${a.id}`);
    return { id: a.id, nuevos, hallazgos: ids.length ? await listarHallazgos(tx, p.id, ids) : [] };
  });
  const res: ResultadoAnalisis = {
    id: resultado.id,
    desde,
    hasta,
    dias: r.dias_activos,
    pares_evaluados: r.pares_evaluados,
    hallazgos: resultado.hallazgos,
    resumen:
      ia?.resumen ??
      (r.dias_activos < DIAS_MINIMOS
        ? traducir(idioma, 'Todavía hay {n} días anotados. Con {minimo} o más ya se pueden empezar a buscar patrones.', { n: r.dias_activos, minimo: DIAS_MINIMOS })
        : null),
    sugerencias: ia?.sugerencias ?? [],
  };
  return { ...res, nuevos: resultado.nuevos };
}

/**
 * Los días que la persona estuvo con alguien de cada grupo (familia, pareja, trabajo…), según qué es cada uno en sus
 * Personas guardadas: un rasgo por grupo ("Con la familia"), de la categoría de la gente, que entra como causa.
 */
export async function rasgosDeGente(tx: Tx, personaId: number, desde: string, hasta: string): Promise<{ filas: FilaDiaria[]; conceptos: ConceptoInfo[] }> {
  const l = await filas<{ fecha: string; relacion: string; veces: number }>(
    tx,
    sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, g.relacion, count(*)::int AS veces
        FROM registros r JOIN gente g ON g.persona_id = r.persona_id AND g.concepto_id = r.concepto_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND g.relacion IS NOT NULL AND r.fecha BETWEEN ${desde} AND ${hasta}
        GROUP BY 1, 2`,
  );
  if (!l.length) return { filas: [], conceptos: [] };
  const cat = await una<{ id: number; rol: RolCategoria }>(tx, sql`SELECT id, rol FROM categorias WHERE clave = 'gente'`);
  if (!cat) return { filas: [], conceptos: [] };
  const conceptos: ConceptoInfo[] = [];
  const ids = new Map<string, number>();
  const r: FilaDiaria[] = [];
  for (const x of l) {
    const grupo = RELACIONES.find((g) => g.clave === x.relacion)?.grupo;
    if (!grupo) continue;
    let id = ids.get(grupo);
    if (id === undefined) {
      const { concepto } = await obtenerOCrearConcepto(tx, { nombre: grupo, categoriaId: cat.id, tipoValor: 'evento', unidad: null });
      id = concepto.id;
      ids.set(grupo, id);
      conceptos.push({ id, nombre: concepto.nombre, tipo_valor: concepto.tipo_valor, rol: 'causa', categoria: 'gente' });
    }
    r.push({ fecha: x.fecha, concepto_id: id, veces: x.veces, suma: null, promedio: null, intensidad: null, primera: null, automatica: true });
  }
  return { filas: r, conceptos };
}
