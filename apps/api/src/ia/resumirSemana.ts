// El resumen de la semana (lunes a domingo) que arma Patty el domingo a la noche: los números de la semana comparados con
// la anterior (sueño, pasos, caminatas, viajes, ánimo, molestias, lo que más se anotó) y, con eso, la IA escribe un
// título, unas líneas, lo que se destacó y 1 o 2 cosas para probar la semana que viene. Se guarda por persona y semana.
import { sql } from 'drizzle-orm';
import { COMO_ME_SENTI, COMO_ME_SIENTO, type Idioma } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { sumarDias } from '../lib/fechas.js';
import { objetivosDe, progreso, TIPOS_OBJETIVO, type TipoObjetivo } from '../lib/objetivos.js';
import { hayIa, pedirJson } from './cliente.js';

export interface ResumenSemana {
  semana: string;
  titulo: string;
  texto: string;
  destacados: Array<{ emoji: string; texto: string }>;
  sugerencias: string[];
  numeros: Record<string, number | null>;
}

/** El lunes de la semana de `fecha` (AAAA-MM-DD). */
export function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return sumarDias(fecha, -((dia + 6) % 7));
}

const r1 = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

/** Los números de una semana (de `lunes` a `lunes + 6`). */
export async function numerosDeSemana(db: Db, personaId: number, lunes: string): Promise<Record<string, number | null>> {
  const hasta = sumarDias(lunes, 6);
  const med = async (concepto: string, como: 'avg' | 'sum') =>
    (await una<{ v: number | null }>(
      db,
      sql`SELECT ${como === 'avg' ? sql`avg(x.v)` : sql`sum(x.v)`}::float AS v FROM (
            SELECT m.fecha, sum(m.valor) AS v FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
            WHERE m.persona_id = ${personaId} AND c.nombre = ${concepto} AND m.fecha BETWEEN ${lunes} AND ${hasta} GROUP BY m.fecha) x`,
    ))?.v ?? null;
  const animo = await una<{ v: number | null; n: number }>(
    db,
    sql`SELECT avg(r.intensidad)::float AS v, count(*)::int AS n FROM registros r JOIN conceptos c ON c.id = r.concepto_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI})
          AND r.intensidad IS NOT NULL AND r.fecha BETWEEN ${lunes} AND ${hasta}`,
  );
  const molestias = await una<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'sintoma' AND r.fecha BETWEEN ${lunes} AND ${hasta}`,
  );
  const dias = await una<{ n: number }>(
    db,
    sql`SELECT count(DISTINCT fecha)::int AS n FROM registros WHERE persona_id = ${personaId} AND borrado IS NULL AND origen IN ('manual', 'ia') AND fecha BETWEEN ${lunes} AND ${hasta}`,
  );
  return {
    dias_anotados: dias?.n ?? 0,
    sueno_horas: r1(await med('Horas de sueño', 'avg')),
    sueno_calidad: r1(await med('Calidad del sueño', 'avg')),
    pasos: r1(await med('Pasos', 'avg')),
    caminatas_min: r1(await med('Caminata', 'sum')),
    viajes: r1(await med('Viajes', 'sum')),
    km: r1(await med('Km recorridos', 'sum')),
    pantalla_min: r1(await med('Tiempo de pantalla', 'avg')),
    reuniones_h: r1(await med('Horas de reuniones', 'sum')),
    animo: r1(animo?.v),
    molestias: molestias?.n ?? 0,
  };
}

/** Arma el resumen de la semana que empieza `lunes`, si todavía no está y hubo algo anotado. */
export async function resumirSemana(db: Db, p: { id: number; nombre: string }, lunes: string, idioma: Idioma): Promise<ResumenSemana | null> {
  const ya = await una<ResumenSemana>(
    db,
    sql`SELECT to_char(semana, 'YYYY-MM-DD') AS semana, titulo, texto, destacados, sugerencias, numeros FROM resumen_semana WHERE persona_id = ${p.id} AND semana = ${lunes}`,
  );
  if (ya || !hayIa()) return ya;
  const numeros = await numerosDeSemana(db, p.id, lunes);
  if (!numeros.dias_anotados) return null;
  const antes = await numerosDeSemana(db, p.id, sumarDias(lunes, -7));
  const hasta = sumarDias(lunes, 6);
  const top = await filas<{ que: string; categoria: string; veces: number; intensidad: number | null }>(
    db,
    sql`SELECT c.nombre AS que, k.nombre AS categoria, count(*)::int AS veces, avg(r.intensidad)::float AS intensidad
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${lunes} AND ${hasta}
          AND c.nombre NOT IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI})
        GROUP BY c.nombre, k.nombre ORDER BY veces DESC LIMIT 40`,
  );
  const comentarios = await filas<{ texto: string }>(
    db,
    sql`SELECT texto FROM comentarios WHERE persona_id = ${p.id} AND fecha BETWEEN ${lunes} AND ${hasta}`,
  );
  // Los objetivos que se había propuesto para esta semana: cuántos días los cumplió (se cierran acá).
  const objetivosSemana = await objetivosDe(db, p.id, lunes, ['aceptado']);
  const logros = [];
  for (const o of objetivosSemana) {
    const x = await progreso(db, o, hasta);
    await db.execute(sql`UPDATE objetivos SET logrados = ${x.cumplidos} WHERE id = ${o.id}`);
    logros.push(`- ${o.texto}: ${x.cumplidos} de ${o.meta_dias} días`);
  }
  const lengua = idioma === 'en' ? 'English' : 'castellano rioplatense (voseo)';
  const fila = (k: string) => `${k}: ${numeros[k] ?? '—'} (semana anterior: ${antes[k] ?? '—'})`;
  const r = await pedirJson<{
    titulo: string;
    texto: string;
    destacados: Array<{ emoji: string; texto: string }>;
    sugerencias: string[];
    objetivos?: Array<{ texto: string; emoji: string; tipo: TipoObjetivo; concepto: string | null; valor: number | null; meta_dias: number }>;
  }>({
    sistema:
      `Sos Patty, una app amiga que acompaña a una persona que anota su día. Es domingo a la noche: armale el resumen de su ` +
      `semana en ${lengua}. Un título corto y simpático (máximo 50 letras); un texto de 3 a 5 oraciones que cuente cómo fue ` +
      `la semana comparada con la anterior (sueño, movimiento, reuniones de trabajo, ánimo, molestias, lo que se repitió), juntando varios datos; ` +
      `de 2 a 4 destacados (emoji + una frase corta, lo bueno primero); y 1 o 2 sugerencias concretas y amables para probar ` +
      `la semana que viene, basadas en lo que se ve. Sin diagnósticos ni consejos médicos, sin culpa, sin inventar datos. ` +
      `Si se había propuesto objetivos para esta semana, comentá cómo le fue (celebrá lo logrado, sin culpa por lo que no). ` +
      `Además, 1 o 2 objetivos suaves y medibles para la semana que viene (en "objetivos"), alcanzables y basados en sus ` +
      `datos: texto corto ("Caminar 3 días"), un emoji, cuántos días de los 7 (meta_dias) y cómo se mide (tipo): ` +
      `"concepto" = anotar ese concepto (exactamente un nombre de "Lo más anotado", o "Caminata"), "sin_concepto" = días ` +
      `sin ese concepto, "sueno_min" = dormir al menos valor horas, "pasos_min" = al menos valor pasos, "pantalla_max" = ` +
      `como mucho valor minutos de pantalla. Solo uses sueño, pasos o pantalla si hay números de eso.`,
    texto:
      `Persona: ${p.nombre}. Semana del ${lunes} al ${hasta}.\n\nNúmeros (por día; minutos donde dice _min):\n` +
      ['dias_anotados', 'sueno_horas', 'sueno_calidad', 'pasos', 'caminatas_min', 'viajes', 'km', 'pantalla_min', 'reuniones_h', 'animo', 'molestias'].map(fila).join('\n') +
      `\n\nLo más anotado (veces · intensidad promedio si tiene):\n${top.map((x) => `${x.categoria}: ${x.que} · ${x.veces}${x.intensidad !== null ? ` · ${Math.round(x.intensidad)}/10` : ''}`).join('\n') || '(nada)'}` +
      (logros.length ? `\n\nObjetivos que se propuso para esta semana (días cumplidos):\n${logros.join('\n')}` : '') +
      (comentarios.length ? `\n\nLo que ya le comentaste en la semana (no lo repitas igual):\n${comentarios.map((c) => `- ${c.texto}`).join('\n')}` : ''),
    esquema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        texto: { type: 'string' },
        destacados: { type: 'array', items: { type: 'object', properties: { emoji: { type: 'string' }, texto: { type: 'string' } }, required: ['emoji', 'texto'], additionalProperties: false } },
        sugerencias: { type: 'array', items: { type: 'string' } },
        objetivos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              texto: { type: 'string' },
              emoji: { type: 'string' },
              tipo: { type: 'string', enum: TIPOS_OBJETIVO },
              concepto: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              valor: { anyOf: [{ type: 'number' }, { type: 'null' }] },
              meta_dias: { type: 'integer' },
            },
            required: ['texto', 'emoji', 'tipo', 'concepto', 'valor', 'meta_dias'],
            additionalProperties: false,
          },
        },
      },
      required: ['titulo', 'texto', 'destacados', 'sugerencias', 'objetivos'],
      additionalProperties: false,
    },
    esfuerzo: 'low',
    maxTokens: 2500,
  });
  const res: ResumenSemana = {
    semana: lunes,
    titulo: r.titulo.trim().slice(0, 80),
    texto: r.texto.trim().slice(0, 1200),
    destacados: r.destacados.slice(0, 4).map((d) => ({ emoji: d.emoji.trim().slice(0, 8) || '🦉', texto: d.texto.trim().slice(0, 200) })),
    sugerencias: r.sugerencias.slice(0, 2).map((x) => x.trim().slice(0, 240)),
    numeros,
  };
  await db.execute(
    sql`INSERT INTO resumen_semana (persona_id, semana, titulo, texto, destacados, sugerencias, numeros)
        VALUES (${p.id}, ${lunes}, ${res.titulo}, ${res.texto}, ${JSON.stringify(res.destacados)}::jsonb, ${JSON.stringify(res.sugerencias)}::jsonb, ${JSON.stringify(numeros)}::jsonb)
        ON CONFLICT (persona_id, semana) DO NOTHING`,
  );
  // Los objetivos propuestos para la semana que viene (la persona los acepta o no desde el resumen).
  const proxima = sumarDias(lunes, 7);
  if (!(await objetivosDe(db, p.id, proxima, ['propuesto', 'aceptado', 'descartado'])).length) {
    for (const o of (r.objetivos ?? []).slice(0, 2)) {
      const conConcepto = o.tipo === 'concepto' || o.tipo === 'sin_concepto';
      if (!TIPOS_OBJETIVO.includes(o.tipo) || (conConcepto ? !o.concepto?.trim() : !(o.valor && o.valor > 0))) continue;
      await db.execute(
        sql`INSERT INTO objetivos (persona_id, semana, texto, emoji, tipo, concepto, valor, meta_dias)
            VALUES (${p.id}, ${proxima}, ${o.texto.trim().slice(0, 80)}, ${o.emoji.trim().slice(0, 8) || '🎯'}, ${o.tipo},
                    ${conConcepto ? o.concepto!.trim() : null}, ${conConcepto ? null : o.valor}, ${Math.min(7, Math.max(1, Math.round(o.meta_dias)))})`,
      );
    }
  }
  return res;
}
