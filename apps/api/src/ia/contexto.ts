// "¿Qué pasó antes?": para un dolor, una molestia o un "mal" anotado, lo de las 72 horas previas — lo anotado (comidas,
// bebidas, actividad, remedios, lugares, gente), la noche anterior, el clima de esos días, los pasos y la pantalla — y
// unas líneas de la IA que lo cuentan sin afirmar causas. Lo arma un job (patrones/noche.ts) al rato de anotarlo.
import { sql } from 'drizzle-orm';
import { COMO_ME_SENTI, COMO_ME_SIENTO, type Idioma } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { sumarDias } from '../lib/fechas.js';
import { hayIa, pedirJson } from './cliente.js';

const HORAS = 72;
/** Las intensidades de "cómo me siento" que cuentan como un mal momento (mal y muy mal). */
const MAL = 4;

export interface Contexto {
  texto: string | null;
  items: Array<{ cuando: string; emoji: string; texto: string }>;
}

/** Los registros que esperan su "¿qué pasó antes?" (molestias y malos momentos de los últimos 2 días). */
export function pendientes(db: Db, limite = 5) {
  return filas<{ id: number; persona_id: number; zona_horaria: string; idioma: string | null }>(
    db,
    sql`SELECT r.id, r.persona_id, p.zona_horaria,
               (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id
                WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        JOIN personas p ON p.id = r.persona_id
        WHERE r.borrado IS NULL AND r.creado > now() - interval '2 days' AND r.creado < now() - interval '1 minute'
          AND (k.clave = 'sintoma' OR (c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI}) AND r.intensidad <= ${MAL}))
          AND NOT EXISTS (SELECT 1 FROM contexto_registro x WHERE x.registro_id = r.id)
        ORDER BY r.creado LIMIT ${limite}`,
  );
}

export async function armarContexto(db: Db, registroId: number, zona: string, idioma: Idioma): Promise<Contexto | null> {
  const r = await una<{ persona_id: number; inicio: string; fecha: string; que: string; intensidad: number | null; nota: string | null }>(
    db,
    sql`SELECT r.persona_id, r.inicio, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, c.nombre AS que, r.intensidad, r.nota
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id WHERE r.id = ${registroId}`,
  );
  if (!r) return null;
  const hora = (iso: string) =>
    new Intl.DateTimeFormat('es-AR', { timeZone: zona, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const anotado = await filas<{ cuando: string; que: string; icono: string; valor: number | null; unidad: string | null; intensidad: number | null; nota: string | null }>(
    db,
    // Lo de tipo hora (Me levanté) guarda la hora como valor: ya se ve en cuándo, no se repite.
    sql`SELECT r.inicio AS cuando, c.nombre AS que, k.icono, CASE WHEN c.tipo_valor = 'hora' THEN NULL ELSE r.valor::float END AS valor, r.unidad, r.intensidad, r.nota
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${r.persona_id} AND r.borrado IS NULL AND r.id <> ${registroId}
          AND r.inicio < ${r.inicio} AND r.inicio > ${r.inicio}::timestamptz - make_interval(hours => ${HORAS})
          AND k.clave IN ('comida', 'bebida', 'actividad', 'medicacion', 'lugar', 'gente', 'otro', 'sintoma', 'animo', 'sueno', 'viaje')
        ORDER BY r.inicio DESC LIMIT 90`,
  );
  // Lo que llegó solo esos tres días (por día): sueño, pasos, caminatas, pantalla y el clima del día.
  const datos = await filas<{ fecha: string; que: string; valor: number; unidad: string | null }>(
    db,
    sql`SELECT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, c.nombre AS que, avg(m.valor)::float AS valor, max(m.unidad) AS unidad
        FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
        WHERE m.persona_id = ${r.persona_id} AND m.fecha BETWEEN ${sumarDias(r.fecha, -2)} AND ${r.fecha}
          AND c.nombre IN ('Horas de sueño', 'Calidad del sueño', 'Pasos', 'Caminata', 'Tiempo de pantalla', 'Temperatura máxima',
                           'Temperatura mínima', 'Lluvia del día', 'Cambio de presión', 'Humedad media', 'Viajes')
        GROUP BY m.fecha, c.nombre ORDER BY m.fecha`,
  );
  const items: Contexto['items'] = anotado.map((a) => ({
    cuando: new Date(a.cuando).toISOString(),
    emoji: a.icono,
    texto: `${a.que}${a.valor !== null ? ` ${Math.round(a.valor * 10) / 10}${a.unidad ? ' ' + a.unidad : ''}` : ''}${a.intensidad !== null ? ` (${a.intensidad}/10)` : ''}`,
  }));
  let texto: string | null = null;
  if (hayIa() && (anotado.length || datos.length)) {
    const lengua = idioma === 'en' ? 'English' : 'castellano rioplatense (voseo)';
    const x = await pedirJson<{ texto: string }>({
      sistema:
        `Sos Patty, una app que acompaña a una persona que anota su día. Anotó algo que le hizo mal y te pasamos lo de las ` +
        `${HORAS} horas anteriores. Contale en ${lengua}, en 2 o 3 oraciones cortas, qué pasó antes que pueda tener que ver ` +
        `(lo que comió o tomó, cómo durmió, el clima, si se movió poco o mucho, la pantalla), como posibilidades y nunca ` +
        `como causas seguras. Sin diagnósticos ni consejos médicos, sin inventar datos. Si no hay nada que llame la atención, decilo.`,
      texto:
        `Anotó: ${r.que}${r.intensidad !== null ? ` (${r.intensidad}/10)` : ''}${r.nota ? ` "${r.nota}"` : ''}, el ${hora(r.inicio)}.\n\n` +
        `Lo anotado antes (lo más cercano primero):\n${anotado.map((a) => `${hora(a.cuando)} · ${a.que}${a.valor !== null ? ` ${a.valor}${a.unidad ? ' ' + a.unidad : ''}` : ''}${a.intensidad !== null ? ` (${a.intensidad}/10)` : ''}${a.nota ? ` "${a.nota}"` : ''}`).join('\n') || '(nada)'}\n\n` +
        `Datos de esos días:\n${datos.map((d) => `${d.fecha} · ${d.que}: ${Math.round(d.valor * 10) / 10}${d.unidad ? ' ' + d.unidad : ''}`).join('\n') || '(nada)'}`,
      esquema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'], additionalProperties: false },
      esfuerzo: 'low',
      maxTokens: 1200,
    });
    texto = x.texto.trim().slice(0, 600);
  }
  await db.execute(
    sql`INSERT INTO contexto_registro (registro_id, persona_id, texto, items) VALUES (${registroId}, ${r.persona_id}, ${texto}, ${JSON.stringify(items)}::jsonb)
        ON CONFLICT (registro_id) DO UPDATE SET texto = excluded.texto, items = excluded.items`,
  );
  return { texto, items };
}
