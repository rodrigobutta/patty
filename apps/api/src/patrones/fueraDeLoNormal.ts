// Cuando algo se sale de lo normal de la persona: se compara lo de los últimos días con lo habitual de ella (las
// semanas anteriores), sin IA, con reglas simples y prudentes. Lo corre el job de la mañana (patrones/noche.ts); cada
// cosa se avisa a lo sumo una vez por semana y queda guardada (fuera_de_lo_normal) para el Día y el admin.
import { sql } from 'drizzle-orm';
import { COMO_ME_SENTI, COMO_ME_SIENTO, traducir, type Idioma } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { sumarDias } from '../lib/fechas.js';

export interface FueraDeLoNormal {
  clave: string;
  emoji: string;
  texto: string;
  datos: Record<string, number | string | null>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const prom = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
/** Para mostrar horas: "1,5 h" o "40 min". */
const horas = (h: number, i: Idioma) => (h >= 1 ? `${r1(h).toLocaleString(i === 'en' ? 'en' : 'es-AR')} h` : `${Math.round(h * 60)} min`);

/** Una medición sumada por día (Horas de sueño, Pasos, Tiempo de pantalla), entre dos fechas. */
async function porDia(db: Db, personaId: number, concepto: string, desde: string, hasta: string): Promise<Map<string, number>> {
  const l = await filas<{ fecha: string; v: number }>(
    db,
    sql`SELECT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, sum(m.valor)::float AS v FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
        WHERE m.persona_id = ${personaId} AND c.nombre = ${concepto} AND m.fecha BETWEEN ${desde} AND ${hasta} GROUP BY m.fecha`,
  );
  return new Map(l.map((x) => [x.fecha, x.v]));
}

/** Lo que se sale de lo normal hoy (`hoy` es el día de Patty). No guarda nada. */
export async function buscarFueraDeLoNormal(db: Db, personaId: number, hoy: string, i: Idioma): Promise<FueraDeLoNormal[]> {
  const res: FueraDeLoNormal[] = [];
  const dias = (desde: string, n: number) => Array.from({ length: n }, (_, k) => sumarDias(desde, k));

  // Sueño: las últimas 3 noches (la de hoy incluida: la noche es el día en que se despierta), cada una al menos 1 h
  // por debajo de lo habitual de las 4 semanas anteriores (con al menos 10 noches para comparar).
  const sueno = await porDia(db, personaId, 'Horas de sueño', sumarDias(hoy, -30), hoy);
  const ultimas = dias(sumarDias(hoy, -2), 3).map((f) => sueno.get(f));
  const antesSueno = dias(sumarDias(hoy, -30), 28).map((f) => sueno.get(f)).filter((x): x is number => x !== undefined && x > 2);
  if (antesSueno.length >= 10 && ultimas.every((x) => x !== undefined)) {
    const habitual = prom(antesSueno);
    const recientes = ultimas as number[];
    if (recientes.every((x) => x <= habitual - 1)) {
      const menos = habitual - prom(recientes);
      res.push({
        clave: 'sueno',
        emoji: '😴',
        texto: traducir(i, 'Hace 3 noches que dormís menos de lo habitual: {menos} menos por noche (solés dormir {habitual}).', { menos: horas(menos, i), habitual: horas(habitual, i) }),
        datos: { recientes: r1(prom(recientes)), habitual: r1(habitual) },
      });
    }
  }

  // Pasos: los últimos 3 días completos, en promedio menos de la mitad de lo habitual (y lo habitual, de verdad: 3000+).
  const pasos = await porDia(db, personaId, 'Pasos', sumarDias(hoy, -31), sumarDias(hoy, -1));
  const pasosRec = dias(sumarDias(hoy, -3), 3).map((f) => pasos.get(f)).filter((x): x is number => x !== undefined);
  const pasosAntes = dias(sumarDias(hoy, -31), 28).map((f) => pasos.get(f)).filter((x): x is number => x !== undefined && x > 0);
  if (pasosRec.length === 3 && pasosAntes.length >= 10) {
    const habitual = prom(pasosAntes);
    const reciente = prom(pasosRec);
    if (habitual >= 3000 && reciente < habitual * 0.5) {
      res.push({
        clave: 'pasos',
        emoji: '🚶',
        texto: traducir(i, 'Estos últimos 3 días caminaste bastante menos que siempre: unos {reciente} pasos por día, cuando solés hacer {habitual}.', {
          reciente: Math.round(reciente / 100) * 100,
          habitual: Math.round(habitual / 100) * 100,
        }),
        datos: { reciente: Math.round(reciente), habitual: Math.round(habitual) },
      });
    }
  }

  // Pantalla: los últimos 3 días completos, en promedio un 50% más que lo habitual (y al menos una hora más).
  const pantalla = await porDia(db, personaId, 'Tiempo de pantalla', sumarDias(hoy, -31), sumarDias(hoy, -1));
  const pantRec = dias(sumarDias(hoy, -3), 3).map((f) => pantalla.get(f)).filter((x): x is number => x !== undefined);
  const pantAntes = dias(sumarDias(hoy, -31), 28).map((f) => pantalla.get(f)).filter((x): x is number => x !== undefined);
  if (pantRec.length === 3 && pantAntes.length >= 10) {
    const habitual = prom(pantAntes);
    const reciente = prom(pantRec);
    if (reciente > habitual * 1.5 && reciente - habitual >= 60) {
      res.push({
        clave: 'pantalla',
        emoji: '📱',
        texto: traducir(i, 'Estos días estás usando más el teléfono: {reciente} por día, cuando solés usarlo {habitual}.', { reciente: horas(reciente / 60, i), habitual: horas(habitual / 60, i) }),
        datos: { reciente: Math.round(reciente), habitual: Math.round(habitual) },
      });
    }
  }

  // Ánimo: el promedio de los últimos 5 días (con al menos 3 respuestas) 2 puntos o más por debajo de lo habitual.
  const animo = await filas<{ reciente: boolean; v: number }>(
    db,
    sql`SELECT r.fecha > ${sumarDias(hoy, -5)} AS reciente, r.intensidad::float AS v
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI})
          AND r.intensidad IS NOT NULL AND r.fecha BETWEEN ${sumarDias(hoy, -40)} AND ${hoy}`,
  );
  const animoRec = animo.filter((x) => x.reciente).map((x) => x.v);
  const animoAntes = animo.filter((x) => !x.reciente).map((x) => x.v);
  if (animoRec.length >= 3 && animoAntes.length >= 8 && prom(animoRec) <= prom(animoAntes) - 2) {
    res.push({
      clave: 'animo',
      emoji: '💜',
      texto: traducir(i, 'Estos últimos días tu ánimo viene más bajo que de costumbre. Si querés, contame qué está pasando: a veces ayuda verlo anotado.'),
      datos: { reciente: r1(prom(animoRec)), habitual: r1(prom(animoAntes)) },
    });
  }

  // Molestias: una misma molestia 3 días o más en la última semana, y al menos el doble que su semana habitual de las
  // 8 anteriores.
  const molestias = await filas<{ concepto_id: number; nombre: string; recientes: number; antes: number }>(
    db,
    sql`SELECT c.id AS concepto_id, c.nombre,
               count(DISTINCT r.fecha) FILTER (WHERE r.fecha > ${sumarDias(hoy, -7)})::int AS recientes,
               count(DISTINCT r.fecha) FILTER (WHERE r.fecha <= ${sumarDias(hoy, -7)})::int AS antes
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'sintoma' AND r.fecha BETWEEN ${sumarDias(hoy, -62)} AND ${hoy}
        GROUP BY c.id, c.nombre`,
  );
  const desde = await una<{ primera: string | null }>(db, sql`SELECT to_char(min(fecha), 'YYYY-MM-DD') AS primera FROM registros WHERE persona_id = ${personaId} AND borrado IS NULL`);
  // Las semanas que de verdad se vienen anotando (para no comparar contra semanas en las que no se usaba la app).
  const semanasAntes = desde?.primera ? Math.min(8, Math.max(0, (Date.parse(sumarDias(hoy, -7)) - Date.parse(desde.primera)) / (7 * 86400000))) : 0;
  if (semanasAntes >= 2) {
    for (const m of molestias) {
      const habitual = m.antes / semanasAntes;
      if (m.recientes >= 3 && m.recientes >= habitual * 2) {
        res.push({
          clave: `sintoma:${m.concepto_id}`,
          emoji: '🤕',
          texto: traducir(i, 'Esta semana anotaste {que} {n} días, más que de costumbre. Si sigue así o te preocupa, consultalo con un profesional.', { que: traducir(i, m.nombre).toLowerCase(), n: m.recientes }),
          datos: { recientes: m.recientes, habitual: r1(habitual) },
        });
      }
    }
  }
  return res;
}

/** Busca y guarda lo nuevo (lo que no se avisó en los últimos 7 días). Devuelve lo guardado. */
export async function guardarFueraDeLoNormal(db: Db, personaId: number, hoy: string, i: Idioma): Promise<Array<FueraDeLoNormal & { id: number }>> {
  const hechos: Array<FueraDeLoNormal & { id: number }> = [];
  for (const x of await buscarFueraDeLoNormal(db, personaId, hoy, i)) {
    const ya = await una(db, sql`SELECT 1 FROM fuera_de_lo_normal WHERE persona_id = ${personaId} AND clave = ${x.clave} AND fecha > ${sumarDias(hoy, -7)}`);
    if (ya) continue;
    const r = await una<{ id: number }>(
      db,
      sql`INSERT INTO fuera_de_lo_normal (persona_id, fecha, clave, emoji, texto, datos) VALUES (${personaId}, ${hoy}, ${x.clave}, ${x.emoji}, ${x.texto}, ${JSON.stringify(x.datos)}::jsonb)
          ON CONFLICT DO NOTHING RETURNING id`,
    );
    if (r) hechos.push({ ...x, id: r.id });
  }
  return hechos;
}
