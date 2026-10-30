// Hipótesis de Patty: la IA propone, el motor verifica. Una vez por semana por persona, después del análisis de la noche: le
// manda a la IA el perfil, valida lo que vuelve contra lo que existe, lo mide (patrones/verificar.ts) y lo que pasa queda como
// un hallazgo más, marcado con su origen. Lo que no pasa queda anotado y no se vuelve a proponer. Si la IA falta o falla, sigue
// igual: lo ya confirmado se vuelve a medir, y nada de esto toca al resto del análisis.
import { sql } from 'drizzle-orm';
import { nombreRasgo, patronesFinos, perfilTexto, type AjustesPatrones, type Idioma, type Modo, type Persona, type TipoValor } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { hallazgos, hipotesis as tablaHipotesis } from '../db/schema.js';
import { hayIa } from '../ia/cliente.js';
import { pedirHipotesis } from '../ia/hipotesis.js';
import { lunesDe } from '../ia/resumirSemana.js';
import type { PersonaAcceso } from '../lib/acceso.js';
import { diasEntre } from '../lib/fechas.js';
import { conUso, controlarLimite } from '../lib/usoIa.js';
import { datosDePersona, primerDiaDe } from './analizar.js';
import { armarRasgos, type ConceptoInfo, type FilaDiaria } from './motor.js';
import { armarPerfil } from './perfil.js';
import { claveHipotesis, evaluarHipotesis, explicarVeredicto, validarHipotesis, type Descartada, type Hipotesis, type Veredicto } from './verificar.js';

/** Con menos días anotados que esto, todavía no hay de dónde sospechar nada. */
export const DIAS_HIPOTESIS = 60;
/** Lo rechazado no se vuelve a probar en este tiempo (después, con más datos, puede ser otra cosa). */
const DIAS_SIN_REPETIR = 180;
/** Cuánto de lo rechazado y de lo ya encontrado se le recuerda a la IA. */
const RECHAZADAS_MAX = 30;
const CONOCIDOS_MAX = 30;

export interface ResumenHipotesis {
  /** Por qué no corrió, si no corrió. */
  sin_correr?: 'apagado' | 'pocos_datos' | 'ya_esta_semana';
  /** Qué pasó con la IA. */
  ia?: 'ok' | 'sin_ia' | 'limite' | 'fallo';
  error?: string;
  perfil_caracteres?: number;
  propuestas: number;
  descartadas: Descartada[];
  /** Lo que la IA volvió a proponer y ya se había probado. */
  repetidas: number;
  confirmadas: Array<{ causa: string; efecto: string; tipo: string; p_valor: number; q_valor: number; lift: number }>;
  rechazadas: Array<{ causa: string; efecto: string; tipo: string; motivo: string | null; p_valor: number; q_valor: number; lift: number }>;
  /** Hallazgos que la persona no tenía. */
  nuevos: number[];
}

const vacio = (): ResumenHipotesis => ({ propuestas: 0, descartadas: [], repetidas: 0, confirmadas: [], rechazadas: [], nuevos: [] });

/** Cómo queda en la tabla de hallazgos (`combo` separa lo que es de un período o de una fecha de lo de toda la historia). */
const comboDe = (h: Pick<Hipotesis, 'tipo' | 'fecha_desde' | 'fecha_hasta'>) => (!h.fecha_desde ? '' : h.tipo === 'cambio' ? `h:${h.fecha_desde}` : `h:${h.fecha_desde}:${h.fecha_hasta}`);

interface Guardada extends Omit<Hipotesis, 'fecha_desde' | 'fecha_hasta'> {
  id: number;
  clave: string;
  estado: 'confirmada' | 'rechazada';
  reciente: boolean;
  causa: string;
  efecto: string;
  motivo: string | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
}

/**
 * Corre el paso de hipótesis de una persona. `forzar`: sin esperar a la semana (para probarlo desde la administración). No tira
 * por lo que haga la IA.
 */
export async function correrHipotesis(db: Db, p: PersonaAcceso, o: { hasta: string; idioma: Idioma; forzar?: boolean }): Promise<ResumenHipotesis> {
  const r = vacio();
  const persona = await una<Persona & { patrones: AjustesPatrones }>(
    db,
    sql`SELECT to_char(nacimiento, 'YYYY-MM-DD') AS nacimiento, sexo, altura_cm, peso_kg, condiciones, patrones FROM personas WHERE id = ${p.id}`,
  );
  const finos = patronesFinos(persona?.patrones);
  if (!finos.hipotesis) return { ...r, sin_correr: 'apagado' };
  const desde = await primerDiaDe(db, p.id, o.hasta);
  const dias = await una<{ n: number }>(db, sql`SELECT count(DISTINCT fecha)::int AS n FROM registros WHERE persona_id = ${p.id} AND borrado IS NULL AND fecha BETWEEN ${desde} AND ${o.hasta}`);
  if ((dias?.n ?? 0) < DIAS_HIPOTESIS) return { ...r, sin_correr: 'pocos_datos' };
  // Una por semana, aunque falle: es lo que acota el gasto.
  if (!o.forzar) {
    const primera = await una(db, sql`INSERT INTO avisos_enviados (clave) VALUES (${`hipotesis|${p.id}|${lunesDe(o.hasta)}`}) ON CONFLICT DO NOTHING RETURNING clave`);
    if (!primera) return { ...r, sin_correr: 'ya_esta_semana' };
  }

  const { datos, conceptos } = await datosDePersona(db, p, desde, o.hasta);
  const guardadas = await filas<Guardada>(
    db,
    sql`SELECT h.id, h.clave, h.tipo, h.causa_id, h.causa_modo, h.efecto_id, h.efecto_modo, h.sentido, h.causa_despues, h.desfase_dias,
               to_char(h.fecha_desde, 'YYYY-MM-DD') AS fecha_desde, to_char(h.fecha_hasta, 'YYYY-MM-DD') AS fecha_hasta, h.razon, h.estado, h.motivo,
               h.evaluada > now() - make_interval(days => ${DIAS_SIN_REPETIR}) AS reciente, ca.nombre AS causa, ef.nombre AS efecto
        FROM hipotesis h JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        WHERE h.persona_id = ${p.id} ORDER BY h.evaluada DESC`,
  );
  const opinadas = await filas<{ causa_id: number; efecto_id: number; causa: string; efecto: string; estado: string }>(
    db,
    sql`SELECT DISTINCT h.causa_id, h.efecto_id, ca.nombre AS causa, ef.nombre AS efecto, h.estado FROM hallazgos h
        JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        WHERE h.persona_id = ${p.id} AND h.estado IN ('obvio', 'descartado')`,
  );
  const apartados = new Set(opinadas.map((x) => `${x.causa_id}|${x.efecto_id}`));
  const delMotor = await filas<{ causa_id: number; causa_modo: Modo; efecto_id: number; efecto_modo: Modo; causa: string; efecto: string; desfase_dias: number }>(
    db,
    sql`SELECT h.causa_id, h.causa_modo, h.efecto_id, h.efecto_modo, ca.nombre AS causa, ef.nombre AS efecto, h.desfase_dias FROM hallazgos h
        JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        WHERE h.persona_id = ${p.id} AND h.origen = 'motor' ORDER BY h.puntaje DESC`,
  );
  const yaDelMotor = new Set(delMotor.map((x) => `${x.causa_id}|${x.causa_modo}|${x.efecto_id}|${x.efecto_modo}`));

  // Lo que ya se confirmó se vuelve a medir siempre (con los datos de ahora puede dejar de pasar), con o sin IA.
  const yaConfirmadas: Hipotesis[] = guardadas
    .filter((x) => x.estado === 'confirmada' && !apartados.has(`${x.causa_id}|${x.efecto_id}`))
    .map(({ tipo, causa_id, causa_modo, efecto_id, efecto_modo, sentido, causa_despues, desfase_dias, fecha_desde, fecha_hasta, razon }) => ({ tipo, causa_id, causa_modo, efecto_id, efecto_modo, sentido, causa_despues, desfase_dias, fecha_desde, fecha_hasta, razon }));
  const nuevas = await proponer(db, p, o, r, { datos, conceptos, desde, guardadas, opinadas, delMotor, apartados, yaDelMotor, finos, persona: persona! });

  const lista = [...yaConfirmadas, ...nuevas];
  if (!lista.length) return r;
  const veredictos = evaluarHipotesis(datos, conceptos, desde, o.hasta, lista);
  const porId = new Map(conceptos.map((c) => [c.id, c]));
  for (const v of veredictos) {
    const h = v.hipotesis;
    const fila = { causa: porId.get(h.causa_id)?.nombre ?? String(h.causa_id), efecto: porId.get(h.efecto_id)?.nombre ?? String(h.efecto_id), tipo: h.tipo, p_valor: v.p_valor, q_valor: v.q_valor, lift: v.lift };
    if (v.pasa) r.confirmadas.push(fila);
    else r.rechazadas.push({ ...fila, motivo: v.motivo });
  }
  r.nuevos = await guardar(db, p, veredictos, porId, yaDelMotor, o.idioma);
  console.log(`Hipótesis: persona ${p.id}, ${r.propuestas} propuestas, ${r.descartadas.length} descartadas, ${r.repetidas} repetidas, ${r.confirmadas.length} confirmadas, ${r.rechazadas.length} rechazadas.`);
  return r;
}

/** Le pide hipótesis nuevas a la IA (si está y se puede) y las valida. Si falla, ninguna. */
async function proponer(
  db: Db,
  p: PersonaAcceso,
  o: { hasta: string; idioma: Idioma },
  r: ResumenHipotesis,
  d: {
    datos: FilaDiaria[];
    conceptos: ConceptoInfo[];
    desde: string;
    guardadas: Guardada[];
    opinadas: Array<{ causa_id: number; efecto_id: number; causa: string; efecto: string; estado: string }>;
    delMotor: Array<{ causa: string; efecto: string; causa_modo: Modo; efecto_modo: Modo; desfase_dias: number }>;
    apartados: Set<string>;
    yaDelMotor: Set<string>;
    finos: ReturnType<typeof patronesFinos>;
    persona: Persona;
  },
): Promise<Hipotesis[]> {
  if (!hayIa()) {
    r.ia = 'sin_ia';
    return [];
  }
  const dueno = await una<{ id: number; rol: string }>(
    db,
    sql`SELECT u.id, u.rol FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id WHERE pu.persona_id = ${p.id} ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1`,
  );
  try {
    // El límite de IA de su plan: si hoy ya no le queda para buscar patrones, tampoco para esto. Esto no le gasta el suyo.
    if (dueno) await conUso({ usuarioId: dueno.id, tipo: 'hipotesis' }, () => controlarLimite(db, dueno, 'analisis'));
  } catch {
    r.ia = 'limite';
    return [];
  }
  try {
    const perfil = armarPerfil(d.datos, d.conceptos, d.desde, o.hasta);
    r.perfil_caracteres = perfil.texto.length;
    const rasgos = new Set(armarRasgos(d.datos, new Map(d.conceptos.map((c) => [c.id, c])), d.desde, diasEntre(d.desde, o.hasta) + 1).map((x) => `${x.concepto.id}|${x.modo}`));
    const nombreDe = (x: Guardada) => `${x.causa} (${x.causa_modo}) → ${x.efecto} (${x.efecto_modo})${x.tipo === 'cambio' ? `, cambio desde ${x.fecha_desde}` : `, ${x.desfase_dias} días${x.fecha_desde ? `, del ${x.fecha_desde} al ${x.fecha_hasta}` : ''}`}`;
    const crudas = await conUso({ usuarioId: dueno?.id ?? null, tipo: 'hipotesis' }, () =>
      pedirHipotesis({
        perfil: perfil.texto,
        sobreLaPersona: perfilTexto(d.persona),
        conocidos: d.delMotor.slice(0, CONOCIDOS_MAX).map((x) => `${x.causa} (${x.causa_modo}) → ${x.efecto} (${x.efecto_modo}), ${x.desfase_dias} días`),
        rechazadas: d.guardadas.filter((x) => x.estado === 'rechazada').slice(0, RECHAZADAS_MAX).map(nombreDe),
        apartados: d.opinadas.map((x) => `${x.causa} → ${x.efecto}`),
        idioma: o.idioma,
      }),
    );
    r.ia = 'ok';
    r.propuestas = crudas.length;
    const { validas, descartadas } = validarHipotesis(crudas, { nombres: perfil.nombres, conceptos: d.conceptos, rasgos, desde: d.desde, hasta: o.hasta, desfasesLargos: d.finos.desfases_largos, proteccion: d.finos.proteccion });
    r.descartadas.push(...descartadas);
    const yaProbadas = new Map(d.guardadas.map((x) => [x.clave, x]));
    const quedan: Hipotesis[] = [];
    for (const h of validas) {
      const antes = yaProbadas.get(claveHipotesis(h));
      if (antes && (antes.estado === 'confirmada' || antes.reciente)) {
        r.repetidas++;
        continue;
      }
      if (d.apartados.has(`${h.causa_id}|${h.efecto_id}`)) {
        r.descartadas.push({ causa: String(h.causa_id), efecto: String(h.efecto_id), motivo: 'la_persona_lo_aparto' });
        continue;
      }
      if (!h.fecha_desde && d.yaDelMotor.has(`${h.causa_id}|${h.causa_modo}|${h.efecto_id}|${h.efecto_modo}`)) {
        r.descartadas.push({ causa: String(h.causa_id), efecto: String(h.efecto_id), motivo: 'ya_lo_encontro_el_motor' });
        continue;
      }
      quedan.push(h);
    }
    return quedan;
  } catch (e) {
    r.ia = 'fallo';
    r.error = e instanceof Error ? e.message : String(e);
    console.error(`Hipótesis: la IA no pudo proponer para la persona ${p.id}:`, r.error);
    return [];
  }
}

async function guardar(db: Db, p: PersonaAcceso, veredictos: Veredicto[], porId: Map<number, ConceptoInfo>, yaDelMotor: Set<string>, idioma: Idioma): Promise<number[]> {
  return db.transaction(async (tx) => {
    const ultimo = await una<{ id: number }>(tx, sql`SELECT id FROM analisis WHERE persona_id = ${p.id} ORDER BY creado DESC LIMIT 1`);
    const antes = new Set(
      (await filas<{ clave: string }>(tx, sql`SELECT causa_id || '|' || causa_modo || '|' || combo || '|' || efecto_id || '|' || efecto_modo || '|' || desfase_dias AS clave FROM hallazgos WHERE persona_id = ${p.id}`)).map((x) => x.clave),
    );
    const nuevos: number[] = [];
    for (const v of veredictos) {
      const h = v.hipotesis;
      const clave = claveHipotesis(h);
      const valores = {
        estado: (v.pasa ? 'confirmada' : 'rechazada') as 'confirmada' | 'rechazada',
        motivo: v.motivo,
        p_valor: v.p_valor,
        q_valor: v.q_valor,
        lift: v.lift,
        evaluada: sql`now()`,
      };
      await tx
        .insert(tablaHipotesis)
        .values({ persona_id: p.id, clave, ...h, ...valores })
        .onConflictDoUpdate({ target: [tablaHipotesis.persona_id, tablaHipotesis.clave], set: { ...valores, razon: h.razon } });
      const combo = comboDe(h);
      if (!v.pasa) {
        // Si dejó de pasar, se va (salvo que la persona ya haya opinado de ese hallazgo).
        await tx.execute(sql`DELETE FROM hallazgos WHERE persona_id = ${p.id} AND origen = 'hipotesis' AND estado = 'nuevo'
          AND causa_id = ${h.causa_id} AND causa_modo = ${h.causa_modo} AND combo = ${combo} AND efecto_id = ${h.efecto_id} AND efecto_modo = ${h.efecto_modo} AND desfase_dias = ${h.desfase_dias}`);
        continue;
      }
      // Si mientras tanto lo encontró el motor solo, queda como suyo.
      if (!h.fecha_desde && yaDelMotor.has(`${h.causa_id}|${h.causa_modo}|${h.efecto_id}|${h.efecto_modo}`)) continue;
      const causa = porId.get(h.causa_id)!;
      const efecto = porId.get(h.efecto_id)!;
      const stats = {
        origen: 'hipotesis' as const,
        componente: causa.componente ?? null,
        protege: h.tipo === 'relacion' && h.sentido === 'baja',
        ya_no: v.ya_no,
        fecha_desde: h.fecha_desde,
        fecha_hasta: h.fecha_hasta,
        soporte: v.soporte,
        dias_causa: v.dias_causa,
        dias_evaluados: v.dias_evaluados,
        prob_con: v.prob_con,
        prob_sin: v.prob_sin,
        lift: v.lift,
        p_valor: v.p_valor,
        q_valor: v.q_valor,
        puntaje: v.puntaje,
        explicacion: explicarVeredicto(v, { causa: causa.nombre, efecto: efecto.nombre, causaTipo: causa.tipo_valor as TipoValor, efectoTipo: efecto.tipo_valor as TipoValor }, idioma),
        analisis_id: ultimo?.id ?? null,
      };
      const [f] = await tx
        .insert(hallazgos)
        .values({ persona_id: p.id, causa_id: h.causa_id, causa_modo: h.causa_modo, combo, efecto_id: h.efecto_id, efecto_modo: h.efecto_modo, desfase_dias: h.desfase_dias, ...stats })
        .onConflictDoUpdate({
          target: [hallazgos.persona_id, hallazgos.causa_id, hallazgos.causa_modo, hallazgos.combo, hallazgos.efecto_id, hallazgos.efecto_modo, hallazgos.desfase_dias],
          set: { ...stats, actualizado: sql`now()` },
        })
        .returning({ id: hallazgos.id });
      if (!antes.has(`${h.causa_id}|${h.causa_modo}|${combo}|${h.efecto_id}|${h.efecto_modo}|${h.desfase_dias}`)) nuevos.push(f.id);
    }
    // Lo nuevo entra en el aviso de las 9, junto con lo del análisis de esta noche.
    if (nuevos.length && ultimo) await tx.execute(sql`UPDATE analisis SET nuevos = nuevos || ${JSON.stringify(nuevos)}::jsonb WHERE id = ${ultimo.id}`);
    return nuevos;
  });
}

/** Para la administración: el perfil tal como le llegaría a la IA, y lo que ya se probó. Sin gastar IA. */
export async function verHipotesis(db: Db, p: PersonaAcceso, hasta: string) {
  const desde = await primerDiaDe(db, p.id, hasta);
  const { datos, conceptos } = await datosDePersona(db, p, desde, hasta);
  const perfil = armarPerfil(datos, conceptos, desde, hasta);
  const hipotesis = await filas(
    db,
    sql`SELECT h.tipo, ca.nombre AS causa, h.causa_modo, ef.nombre AS efecto, h.efecto_modo, h.sentido, h.desfase_dias, to_char(h.fecha_desde, 'YYYY-MM-DD') AS fecha_desde,
               to_char(h.fecha_hasta, 'YYYY-MM-DD') AS fecha_hasta, h.razon, h.estado, h.motivo, h.p_valor, h.q_valor, h.lift, h.evaluada
        FROM hipotesis h JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        WHERE h.persona_id = ${p.id} ORDER BY h.evaluada DESC LIMIT 200`,
  );
  return { desde, hasta, perfil_caracteres: perfil.texto.length, conceptos_listados: perfil.listados, conceptos_total: perfil.total, perfil: perfil.texto, hipotesis };
}
