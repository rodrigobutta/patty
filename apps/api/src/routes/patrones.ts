// Análisis de patrones de una persona y los hallazgos que se van acumulando.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { nombreRasgo, perfilTexto, type Hallazgo, type Persona, type Progreso, type ResultadoAnalisis } from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import { analisis, hallazgos } from '../db/schema.js';
import { explicarHallazgos } from '../ia/analizar.js';
import { iaDisponible } from '../ia/cliente.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, sumarDias } from '../lib/fechas.js';
import { cuerpo, idParam, type Env } from '../lib/http.js';
import { climaPorHoraParaPatrones } from './clima.js';
import { buscarPatrones, describir, DIAS_MINIMOS, type ConceptoInfo, type FilaDiaria } from '../patrones/motor.js';

const COLUMNAS = sql`h.id, h.persona_id, h.causa_id, h.efecto_id, ca.nombre AS causa, ef.nombre AS efecto, h.causa_modo, h.efecto_modo,
  ca.tipo_valor AS causa_tipo, ef.tipo_valor AS efecto_tipo,
  h.desfase_dias, h.soporte, h.dias_causa, h.dias_evaluados, h.prob_con, h.prob_sin, h.lift, h.p_valor, h.q_valor, h.puntaje,
  h.explicacion, h.estado, h.detectado`;

function listar(tx: Tx, personaId: number, ids?: number[]): Promise<Hallazgo[]> {
  const filtro = ids ? sql`AND h.id IN ${ids}` : sql``;
  return filas<Hallazgo>(
    tx,
    sql`SELECT ${COLUMNAS} FROM hallazgos h JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        WHERE h.persona_id = ${personaId} ${filtro}
        ORDER BY (h.estado = 'descartado'), h.puntaje DESC`,
  );
}

export const rutasPatrones = new Hono<Env>()
  .post('/analisis', async (c) => {
    const d = await cuerpo(c);
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(d.persona_id), true);
    const hasta = esFecha(d.hasta) ? d.hasta : diaDePatty(new Date(), p.zona_horaria);
    const desde = esFecha(d.desde) ? d.desde : sumarDias(hasta, -179);
    if (desde > hasta || desde < sumarDias(hasta, -730)) throw new ErrorApi('El período tiene que ser de hasta dos años.');

    const porHora = await db.transaction((tx) => climaPorHoraParaPatrones(tx, p, desde, hasta));
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
    const conceptos = await filas<ConceptoInfo>(
      db,
      sql`SELECT c.id, c.nombre, c.tipo_valor, k.rol FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
          WHERE c.id IN (SELECT DISTINCT concepto_id FROM serie_diaria WHERE persona_id = ${p.id})`,
    );
    const r = buscarPatrones(datos, conceptos, desde, hasta);
    const nombre = new Map(conceptos.map((x) => [x.id, x.nombre]));
    const tipo = new Map(conceptos.map((x) => [x.id, x.tipo_valor]));
    const conNombres = r.candidatos.map((x) => ({
      ...x,
      causa: nombreRasgo(nombre.get(x.causa_id)!, tipo.get(x.causa_id)!, x.causa_modo),
      efecto: nombreRasgo(nombre.get(x.efecto_id)!, tipo.get(x.efecto_id)!, x.efecto_modo),
    }));

    // La IA es opcional: si no está o falla, quedan los textos armados por el motor.
    let ia: Awaited<ReturnType<typeof explicarHallazgos>> | null = null;
    if (d.ia !== false && iaDisponible() && conNombres.length) {
      const diasPor = new Map<number, number>();
      for (const f of datos) diasPor.set(f.concepto_id, (diasPor.get(f.concepto_id) ?? 0) + 1);
      const frecuentes = [...diasPor].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, dias]) => ({ nombre: nombre.get(id)!, dias }));
      try {
        ia = await explicarHallazgos({
          persona: p.nombre, perfil: perfilTexto((await una<Persona>(db, sql`SELECT to_char(nacimiento, 'YYYY-MM-DD') AS nacimiento, sexo, altura_cm, peso_kg, condiciones FROM personas WHERE id = ${p.id}`))!), desde, hasta, diasActivos: r.dias_activos, paresEvaluados: r.pares_evaluados,
          candidatos: conNombres.slice(0, 25), frecuentes,
        });
      } catch (e) {
        console.error('Análisis: la IA no pudo explicar los hallazgos:', e instanceof Error ? e.message : e);
      }
    }
    const explicacion = new Map(ia?.hallazgos.map((h) => [h.indice, `${h.explicacion}${h.plausibilidad === 'baja' ? ' (puede ser casualidad)' : ''}`]));

    const resultado = await db.transaction(async (tx) => {
      const [a] = await tx
        .insert(analisis)
        .values({ persona_id: p.id, desde, hasta, dias: r.dias_activos, pares_evaluados: r.pares_evaluados, resumen: ia?.resumen ?? null, sugerencias: ia?.sugerencias ?? [] })
        .returning({ id: analisis.id });
      // Los "nuevos" que ya no aparecen se van; los que la persona confirmó o descartó quedan.
      await tx.execute(sql`DELETE FROM hallazgos WHERE persona_id = ${p.id} AND estado = 'nuevo'`);
      const ids: number[] = [];
      for (const [i, x] of conNombres.entries()) {
        const { causa, efecto, ...stats } = x;
        const [h] = await tx
          .insert(hallazgos)
          .values({ persona_id: p.id, ...stats, explicacion: explicacion.get(i) ?? describir(x, causa, efecto), analisis_id: a.id })
          .onConflictDoUpdate({
            target: [hallazgos.persona_id, hallazgos.causa_id, hallazgos.causa_modo, hallazgos.efecto_id, hallazgos.efecto_modo, hallazgos.desfase_dias],
            set: {
              ...stats,
              explicacion: explicacion.get(i) ?? describir(x, causa, efecto),
              analisis_id: a.id,
              actualizado: sql`now()`,
            },
          })
          .returning({ id: hallazgos.id });
        ids.push(h.id);
      }
      return { id: a.id, hallazgos: ids.length ? await listar(tx, p.id, ids) : [] };
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
          ? `Todavía hay ${r.dias_activos} días anotados. Con ${DIAS_MINIMOS} o más ya se pueden empezar a buscar patrones.`
          : null),
      sugerencias: ia?.sugerencias ?? [],
    };
    return c.json(res);
  })
  .get('/progreso', async (c) => {
    // ?persona=1: cuántos días anotados hay (y con cómo se sintió), para la rueda que se llena hasta poder buscar.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hasta = diaDePatty(new Date(), p.zona_horaria);
    const r = await una<{ dias: number; dias_efecto: number }>(
      c.var.db,
      sql`SELECT count(DISTINCT r.fecha)::int AS dias,
                 count(DISTINCT r.fecha) FILTER (WHERE k.rol = 'efecto')::int AS dias_efecto
          FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${sumarDias(hasta, -179)} AND ${hasta}`,
    );
    const res: Progreso = { dias: r?.dias ?? 0, dias_efecto: r?.dias_efecto ?? 0, minimo: DIAS_MINIMOS, minimo_efecto: 7 };
    return c.json(res);
  })
  .get('/analisis/ultimo', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await una(c.var.db, sql`SELECT * FROM analisis WHERE persona_id = ${p.id} ORDER BY creado DESC LIMIT 1`));
  })
  .get('/hallazgos', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    return c.json(await listar(c.var.db, p.id));
  })
  .put('/hallazgos/:id', async (c) => {
    const id = idParam(c);
    const estado = (await cuerpo(c)).estado;
    if (!['nuevo', 'confirmado', 'descartado'].includes(estado as string)) throw new ErrorApi('Estado inválido.');
    const h = await una<{ persona_id: number }>(c.var.db, sql`SELECT persona_id FROM hallazgos WHERE id = ${id}`);
    if (!h) throw new ErrorApi('No existe.', 404);
    await persona(c.var.db, c.var.usuario, h.persona_id, true);
    await c.var.db.update(hallazgos).set({ estado: estado as Hallazgo['estado'], actualizado: sql`now()` }).where(sql`id = ${id}`);
    return c.json({ ok: true });
  });
