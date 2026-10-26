// Los comentarios de Patty sobre lo que la persona viene anotando ("¡qué bien que comas huevo seguido, es nutritivo!",
// "genial que saques a los perros: de paso caminás"). Desde el primer día, para que vea que Patty tiene en cuenta lo que
// le cuenta, mucho antes de que haya patrones. La IA mira lo anotado en la última semana y lo que ya se le comentó.
import { sql } from 'drizzle-orm';
import { perfilTexto, type Idioma, type Persona } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { diaDePatty, sumarDias } from '../lib/fechas.js';
import { hayIa, pedirJson } from './cliente.js';

const DIAS_MIRADOS = 7;
const MAX_COMENTARIOS = 3;
const MAX_FILAS = 250;

export interface Comentario {
  id: number;
  persona_id: number;
  fecha: string;
  emoji: string;
  texto: string;
  estado: 'nuevo' | 'visto' | 'gusta';
}

/** Una sola vez por `clave` (aunque haya varios servidores o se pida dos veces). */
const primeraVez = async (db: Db, clave: string) =>
  Boolean(await una(db, sql`INSERT INTO avisos_enviados (clave) VALUES (${clave}) ON CONFLICT DO NOTHING RETURNING clave`));

/**
 * Arma los comentarios del día de la persona, si todavía no se armaron y hay algo anotado en la semana. Devuelve
 * cuántos guardó (0 si ya estaban, si no hay datos o si la IA no está).
 */
export async function comentarDia(db: Db, p: { id: number; nombre: string; zona_horaria: string }, idioma: Idioma, ahora = new Date()): Promise<number> {
  if (!hayIa()) return 0;
  const hoy = diaDePatty(ahora, p.zona_horaria);
  const desde = sumarDias(hoy, -(DIAS_MIRADOS - 1));
  const anotado = await filas<{ fecha: string; hora: string; que: string; categoria: string; valor: number | null; unidad: string | null; intensidad: number | null; nota: string | null }>(
    db,
    sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, to_char(r.inicio AT TIME ZONE ${p.zona_horaria}, 'HH24:MI') AS hora, c.nombre AS que,
               k.nombre AS categoria, r.valor::float AS valor, r.unidad, r.intensidad, r.nota
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.origen IN ('manual', 'ia') AND r.fecha BETWEEN ${desde} AND ${hoy}
        ORDER BY r.inicio DESC LIMIT ${MAX_FILAS}`,
  );
  if (!anotado.length) return 0;
  if (!(await primeraVez(db, `comentarios|${p.id}|${hoy}`))) return 0;

  const anteriores = await filas<{ texto: string }>(
    db,
    sql`SELECT texto FROM comentarios WHERE persona_id = ${p.id} AND fecha >= ${sumarDias(hoy, -14)} ORDER BY fecha DESC LIMIT 30`,
  );
  const perfil = perfilTexto(
    (await una<Persona>(db, sql`SELECT to_char(nacimiento, 'YYYY-MM-DD') AS nacimiento, sexo, altura_cm, peso_kg, condiciones FROM personas WHERE id = ${p.id}`))!,
  );
  const lengua = idioma === 'en' ? 'English' : 'castellano rioplatense (voseo)';
  const r = await pedirJson<{ comentarios: Array<{ emoji: string; texto: string }> }>({
    sistema:
      `Sos Patty, una app amiga que acompaña a una persona que anota su día (comidas, sueño, actividad, ánimo, molestias). ` +
      `Todavía no hay patrones firmes: tu tarea es mostrarle que tenés en cuenta lo que te cuenta. Escribí de 1 a ${MAX_COMENTARIOS} ` +
      `comentarios cortos (máximo 140 letras cada uno), en ${lengua}, cálidos y concretos, basados SOLO en lo que anotó: ` +
      `reconocé hábitos buenos ("¡qué bien que comas huevo seguido, es muy nutritivo!"), celebrá lo que hace por sí o por otros ` +
      `("genial que saques a los perros, de paso caminás un poco"), notá repeticiones o cambios ("ya van 3 días durmiendo más de 7 horas"), ` +
      `o mostrá curiosidad amable por algo que se repite ("el café de la tarde se repite: después contame cómo dormís"). ` +
      `Nunca retes ni hagas sentir culpa, no des diagnósticos ni consejos médicos, no inventes datos ni números que no estén. ` +
      `Mencioná cosas reales de su semana. No repitas ideas de los comentarios anteriores. Un emoji que acompañe cada uno. ` +
      `Hoy es ${hoy}.`,
    texto:
      `Persona: ${p.nombre}${perfil ? ` (${perfil})` : ''}.\n\n` +
      `Lo anotado del ${desde} al ${hoy} (lo más nuevo primero):\n` +
      anotado.map((x) => `${x.fecha} ${x.hora} · ${x.categoria}: ${x.que}${x.valor !== null ? ` ${x.valor}${x.unidad ? ' ' + x.unidad : ''}` : ''}${x.intensidad !== null ? ` (${x.intensidad}/10)` : ''}${x.nota ? ` · "${x.nota}"` : ''}`).join('\n') +
      (anteriores.length ? `\n\nComentarios que ya le hiciste (no los repitas):\n${anteriores.map((a) => `- ${a.texto}`).join('\n')}` : ''),
    esquema: {
      type: 'object',
      properties: {
        comentarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: { emoji: { type: 'string' }, texto: { type: 'string' } },
            required: ['emoji', 'texto'],
            additionalProperties: false,
          },
        },
      },
      required: ['comentarios'],
      additionalProperties: false,
    },
    esfuerzo: 'low',
    maxTokens: 2000,
  });
  const lista = r.comentarios.filter((c) => c.texto.trim()).slice(0, MAX_COMENTARIOS);
  for (const c of lista) {
    await db.execute(
      sql`INSERT INTO comentarios (persona_id, fecha, emoji, texto) VALUES (${p.id}, ${hoy}, ${c.emoji.trim().slice(0, 8) || '🦉'}, ${c.texto.trim().slice(0, 280)})`,
    );
  }
  return lista.length;
}
