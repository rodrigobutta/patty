// "Preguntale a Patty": una pregunta libre sobre los propios datos ("¿cuándo comí huevos?", "¿cuántas veces me dolió
// la cabeza este mes?"). En dos pasos, para no mandarle a la IA todo lo anotado: primero elige qué cosas y qué fechas
// hacen falta (de la lista de lo que la persona tiene), después contesta con esos datos.
import { sql } from 'drizzle-orm';
import type { Idioma } from 'shared';
import { filas, type Tx } from '../db/client.js';
import type { PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha, sumarDias } from '../lib/fechas.js';
import { pedirJson } from './cliente.js';

/** Hasta cuánto para atrás se mira si la pregunta no dice cuándo. */
const DIAS_POR_DEFECTO = 365;
const MAX_CONCEPTOS = 12;
const MAX_FILAS = 400;

export interface RespuestaPregunta {
  respuesta: string;
  /** Los días de los que habla la respuesta (para ir a verlos). */
  fechas: string[];
  conceptos: Array<{ id: number; nombre: string }>;
}

const diaDeLaSemana = (fecha: string, idioma: Idioma) =>
  new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));

export async function preguntarDatos(tx: Tx, p: PersonaAcceso, pregunta: string, idioma: Idioma): Promise<RespuestaPregunta> {
  if (!pregunta) throw new ErrorApi('Escribí qué querés saber.');
  if (pregunta.length > 500) throw new ErrorApi('La pregunta es muy larga (máximo 500 letras).');
  const hoy = diaDePatty(new Date(), p.zona_horaria);
  const lengua = idioma === 'en' ? 'English' : 'castellano rioplatense (voseo)';

  // Lo que la persona tiene anotado o medido, con cuántos días y el último.
  const lista = await filas<{ id: number; nombre: string; categoria: string; dias: number; ultimo: string }>(
    tx,
    sql`SELECT c.id, c.nombre, k.nombre AS categoria, count(DISTINCT s.fecha)::int AS dias, to_char(max(s.fecha), 'YYYY-MM-DD') AS ultimo
        FROM serie_diaria s JOIN conceptos c ON c.id = s.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE s.persona_id = ${p.id} GROUP BY c.id, c.nombre, k.nombre ORDER BY dias DESC LIMIT 600`,
  );
  if (!lista.length) return { respuesta: idioma === 'en' ? 'There is nothing logged yet to answer from.' : 'Todavía no hay nada anotado para poder contestarte.', fechas: [], conceptos: [] };

  const plan = await pedirJson<{ concepto_ids: number[]; desde: string; hasta: string }>({
    sistema:
      `Sos Patty, una app donde una persona anota lo que come, hace y siente. Te hace una pregunta sobre sus propios datos. ` +
      `Elegí de la lista qué cosas hacen falta para contestarla (hasta ${MAX_CONCEPTOS}; incluí sinónimos y variantes: "huevos" → Huevo, Huevos revueltos, Tortilla) ` +
      `y el período (AAAA-MM-DD; vacíos si la pregunta no dice cuándo). Hoy es ${hoy} (${diaDeLaSemana(hoy, 'es')}).`,
    texto: `Pregunta: ${pregunta}\n\nLo que tiene (id | nombre | categoría | días con datos | último día):\n${lista.map((c) => `${c.id} | ${c.nombre} | ${c.categoria} | ${c.dias} | ${c.ultimo}`).join('\n')}`,
    esquema: {
      type: 'object',
      properties: {
        concepto_ids: { type: 'array', items: { type: 'integer' } },
        desde: { type: 'string' },
        hasta: { type: 'string' },
      },
      required: ['concepto_ids', 'desde', 'hasta'],
      additionalProperties: false,
    },
    esfuerzo: 'low',
    maxTokens: 2000,
  });
  const validos = new Map(lista.map((c) => [c.id, c.nombre]));
  const ids = [...new Set(plan.concepto_ids)].filter((id) => validos.has(id)).slice(0, MAX_CONCEPTOS);
  const hasta = esFecha(plan.hasta) && plan.hasta <= hoy ? plan.hasta : hoy;
  const desde = esFecha(plan.desde) && plan.desde <= hasta ? plan.desde : sumarDias(hasta, -DIAS_POR_DEFECTO + 1);

  // Lo anotado a mano, con hora, nota y dónde; y lo automático (sueño, pasos, clima, lugares) por día.
  const detalle = ids.length
    ? await filas<{ fecha: string; hora: string; que: string; valor: number | null; unidad: string | null; intensidad: number | null; nota: string | null; lugar: string | null }>(
        tx,
        sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, to_char(r.inicio AT TIME ZONE ${p.zona_horaria}, 'HH24:MI') AS hora, c.nombre AS que,
                   r.valor::float AS valor, r.unidad, r.intensidad, r.nota, l.nombre AS lugar
            FROM registros r JOIN conceptos c ON c.id = r.concepto_id
            LEFT JOIN conceptos l ON l.id = (r.datos->>'lugar_concepto_id')::int
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hasta}
              AND (r.concepto_id IN ${ids} OR (r.datos->>'lugar_concepto_id')::int IN ${ids} OR (r.datos->>'donde_concepto_id')::int IN ${ids})
            ORDER BY r.inicio DESC LIMIT ${MAX_FILAS}`,
      )
    : [];
  const automaticos = ids.length
    ? await filas<{ fecha: string; que: string; veces: number; suma: number | null; promedio: number | null }>(
        tx,
        sql`SELECT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, c.nombre AS que, count(*)::int AS veces, sum(m.valor)::float AS suma, avg(m.valor)::float AS promedio
            FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
            WHERE m.persona_id = ${p.id} AND m.concepto_id IN ${ids} AND m.fecha BETWEEN ${desde} AND ${hasta}
            GROUP BY m.fecha, c.nombre ORDER BY m.fecha DESC LIMIT ${MAX_FILAS}`,
      )
    : [];
  const num = (n: number | null) => (n === null ? '' : String(Math.round(n * 100) / 100));
  const datos = [
    ...detalle.map((r) => `${r.fecha} ${r.hora} · ${r.que}${r.valor !== null ? ` ${num(r.valor)}${r.unidad ? ' ' + r.unidad : ''}` : ''}${r.intensidad !== null ? ` (intensidad ${r.intensidad}/10)` : ''}${r.lugar ? ` · en ${r.lugar}` : ''}${r.nota ? ` · "${r.nota}"` : ''}`),
    ...automaticos.map((m) => `${m.fecha} · ${m.que} (automático): ${m.veces} vez/veces${m.suma !== null ? `, total ${num(m.suma)}, promedio ${num(m.promedio)}` : ''}`),
  ];

  const r = await pedirJson<{ respuesta: string; fechas: string[] }>({
    sistema:
      `Sos Patty, una app de registro diario. Contestá la pregunta de la persona sobre sus propios datos, en ${lengua}, corto y claro (2 a 5 oraciones), ` +
      `hablándole de vos. Usá solo los datos que te paso: si no alcanzan, decilo. Para fechas usá el día y el mes ("el martes 14 de octubre"), ` +
      `y si son muchas, resumí (cuántas veces, cada cuánto, la última). No des diagnósticos médicos. ` +
      `En "fechas" poné los días (AAAA-MM-DD) de los que habla la respuesta, los más recientes primero, hasta 40. Hoy es ${hoy}.`,
    texto: `Pregunta: ${pregunta}\nPeríodo mirado: ${desde} a ${hasta}.\n\nDatos (${datos.length}${datos.length >= MAX_FILAS ? ', cortados a los más recientes' : ''}):\n${datos.join('\n') || '(nada en ese período)'}`,
    esquema: {
      type: 'object',
      properties: { respuesta: { type: 'string' }, fechas: { type: 'array', items: { type: 'string' } } },
      required: ['respuesta', 'fechas'],
      additionalProperties: false,
    },
    esfuerzo: 'low',
    maxTokens: 3000,
  });
  return {
    respuesta: r.respuesta.trim(),
    fechas: [...new Set(r.fechas.filter((f) => esFecha(f) && f >= desde && f <= hasta))].slice(0, 40),
    conceptos: ids.map((id) => ({ id, nombre: validos.get(id)! })),
  };
}
