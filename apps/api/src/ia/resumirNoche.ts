// Cómo fue la noche, según la IA: mira las etapas con su hora, cuánto durmió comparado con su semana y lo que anotó la
// tarde anterior y esa mañana, y escribe un resumen corto con una nota de calidad de 1 a 10. Se guarda por persona y por
// noche (resumen_noche) y la nota entra en los patrones como "Calidad del sueño" (una medición más).
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Idioma } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { localAInstante, sumarDias } from '../lib/fechas.js';
import { obtenerOCrearConcepto } from '../routes/conceptos.js';
import { hayIa, pedirJson } from './cliente.js';

export interface ResumenNoche {
  noche: string;
  texto: string;
  calidad: number;
}

const FUENTE = 'Patty (IA)';
export const CALIDAD_SUENO = 'Calidad del sueño';

/** El resumen guardado de esa noche (o null). */
export function resumenGuardado(db: Db, personaId: number, noche: string): Promise<ResumenNoche | null> {
  return una<ResumenNoche>(
    db,
    sql`SELECT to_char(noche, 'YYYY-MM-DD') AS noche, texto, calidad FROM resumen_noche WHERE persona_id = ${personaId} AND noche = ${noche}`,
  );
}

/** Arma el resumen de la noche que terminó `noche` si hay datos de sueño y todavía no está. Devuelve el guardado. */
export async function resumirNoche(db: Db, p: { id: number; nombre: string; zona_horaria: string }, noche: string, idioma: Idioma): Promise<ResumenNoche | null> {
  const ya = await resumenGuardado(db, p.id, noche);
  if (ya || !hayIa()) return ya;
  const hora = (iso: string) => new Intl.DateTimeFormat('es-AR', { timeZone: p.zona_horaria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const etapas = await filas<{ inicio: string; fin: string; etapa: string }>(
    db,
    sql`SELECT inicio, fin, etapa FROM sueno_etapas WHERE persona_id = ${p.id} AND noche = ${noche} ORDER BY inicio`,
  );
  const sueno = await filas<{ fecha: string; que: string; valor: number }>(
    db,
    sql`SELECT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, c.nombre AS que, avg(m.valor)::float AS valor
        FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
        WHERE m.persona_id = ${p.id} AND m.fecha BETWEEN ${sumarDias(noche, -7)} AND ${noche}
          AND c.nombre IN ('Horas de sueño', 'Sueño profundo', 'Sueño REM', 'Despierto en la noche', 'Pulso en reposo')
        GROUP BY m.fecha, c.nombre ORDER BY m.fecha`,
  );
  if (!etapas.length && !sueno.some((x) => x.fecha === noche)) return null;

  // Lo anotado desde la tarde anterior hasta el mediodía (cena tarde, café, alcohol, pantalla, cómo se levantó…).
  const anotado = await filas<{ cuando: string; que: string; valor: number | null; unidad: string | null; intensidad: number | null; nota: string | null }>(
    db,
    sql`SELECT r.inicio AS cuando, c.nombre AS que, r.valor::float AS valor, r.unidad, r.intensidad, r.nota
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id
        WHERE r.persona_id = ${p.id} AND r.borrado IS NULL
          AND r.inicio BETWEEN ${localAInstante(sumarDias(noche, -1), '15:00', p.zona_horaria).toISOString()}
                           AND ${localAInstante(noche, '12:00', p.zona_horaria).toISOString()}
        ORDER BY r.inicio LIMIT 60`,
  );
  const lengua = idioma === 'en' ? 'English' : 'castellano rioplatense (voseo)';
  const r = await pedirJson<{ texto: string; calidad: number }>({
    sistema:
      `Sos Patty, una app amiga que acompaña a una persona. Contale cómo fue su última noche en ${lengua}, en 2 o 3 oraciones ` +
      `cortas y cálidas: cuánto durmió y cómo se compara con su semana, cómo se repartieron las etapas (profundo, REM, ` +
      `despertares y a qué hora), y si algo de lo que anotó antes puede haber influido (cena tarde, café, alcohol, pantalla), ` +
      `sin afirmarlo como causa. Sin diagnósticos ni consejos médicos, sin inventar datos. Además, una nota de calidad del ` +
      `sueño de 1 (muy mala) a 10 (excelente) según duración, continuidad y etapas.`,
    texto:
      `Noche que terminó el ${noche}.\n\n` +
      (etapas.length
        ? `Etapas (hora local):\n${etapas.map((e) => `${hora(e.inicio)}–${hora(e.fin)} ${e.etapa}`).join('\n')}\n\n`
        : 'El reloj no mandó etapas.\n\n') +
      `Sueño de los últimos días (por día):\n${sueno.map((x) => `${x.fecha} · ${x.que}: ${Math.round(x.valor * 10) / 10}`).join('\n') || '(nada)'}\n\n` +
      `Lo anotado desde la tarde anterior hasta el mediodía:\n${
        anotado.map((a) => `${hora(a.cuando)} ${a.que}${a.valor !== null ? ` ${a.valor}${a.unidad ? ' ' + a.unidad : ''}` : ''}${a.intensidad !== null ? ` (${a.intensidad}/10)` : ''}${a.nota ? ` "${a.nota}"` : ''}`).join('\n') || '(nada)'
      }`,
    esquema: {
      type: 'object',
      properties: { texto: { type: 'string' }, calidad: { type: 'integer' } },
      required: ['texto', 'calidad'],
      additionalProperties: false,
    },
    esfuerzo: 'low',
    maxTokens: 1500,
  });
  const calidad = Math.min(10, Math.max(1, Math.round(r.calidad)));
  const texto = r.texto.trim().slice(0, 600);
  await db.execute(
    sql`INSERT INTO resumen_noche (persona_id, noche, texto, calidad) VALUES (${p.id}, ${noche}, ${texto}, ${calidad})
        ON CONFLICT (persona_id, noche) DO UPDATE SET texto = excluded.texto, calidad = excluded.calidad`,
  );
  await guardarCalidad(db, p.id, noche, calidad);
  return { noche, texto, calidad };
}

/** La nota como medición ("Calidad del sueño", de 1 a 10) del día en que se despertó: así la ven los patrones. */
async function guardarCalidad(db: Db, personaId: number, noche: string, calidad: number) {
  await db.transaction(async (tx) => {
    let fuente = await una<{ id: number }>(tx, sql`SELECT id FROM fuentes WHERE persona_id = ${personaId} AND tipo = 'otro' AND nombre = ${FUENTE}`);
    fuente ??= await una<{ id: number }>(
      tx,
      sql`INSERT INTO fuentes (persona_id, tipo, nombre, token_hash) VALUES (${personaId}, 'otro', ${FUENTE}, ${createHash('sha256').update(randomBytes(32)).digest('hex')}) RETURNING id`,
    );
    const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'sueno'`);
    if (!fuente || !cat) return;
    const { concepto } = await obtenerOCrearConcepto(tx, { nombre: CALIDAD_SUENO, categoriaId: cat.id, tipoValor: 'medida', unidad: null });
    await tx.execute(
      sql`INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fecha, valor)
          VALUES (${personaId}, ${concepto.id}, ${fuente.id}, ${`${noche}T12:00:00.000Z`}, ${noche}, ${calidad})
          ON CONFLICT (persona_id, concepto_id, inicio, fuente_id) DO UPDATE SET valor = excluded.valor`,
    );
  });
}
