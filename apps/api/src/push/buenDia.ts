// El buen día: a la mañana, apenas llega el sueño de anoche (lo manda el teléfono desde Health Connect o Salud, con
// Patty abierta o sola en segundo plano), Patty arma el resumen de la noche (si no estaba) y les manda un aviso a
// quienes anotan a la persona: "Rodri, dormiste 7 h 12 min (nota 8). Tocá para ver tu noche." Uno por día y por
// persona. Cada uno lo apaga en Más → Avisos (usuarios.avisar_buen_dia). No es un proceso que corre solo: lo dispara
// la ingesta cuando trae las horas de sueño, sin hacer esperar la respuesta.
import { sql } from 'drizzle-orm';
import { esIdioma, normalizar, traducir, type Idioma } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { resumenGuardado, resumirNoche } from '../ia/resumirNoche.js';
import { fechaLocal, minutosDelDia } from '../lib/fechas.js';
import { hayEnvio, type Aviso } from './firebase.js';
import { avisarUnaVez } from './recordatorios.js';

/** La mañana, en la hora de la persona: desde las 5 y antes de las 13. */
export const BUEN_DIA_DESDE = 5;
export const BUEN_DIA_HASTA = 13;
export const HORAS_DE_SUENO = 'Horas de sueño';

/** Si en lo que llegó a la ingesta vienen las horas de sueño de alguna noche. */
export const traeSueno = (lista: unknown[]): boolean =>
  lista.some((m) => typeof (m as { concepto?: unknown } | null)?.concepto === 'string' && normalizar((m as { concepto: string }).concepto) === normalizar(HORAS_DE_SUENO));

/** "7 h 12 min", "8 h", "45 min". */
export function duracionSueno(horas: number): string {
  const minutos = Math.round(horas * 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

export function avisoBuenDia(personaId: number, noche: string, horas: number, calidad: number | null, i: Idioma): Aviso {
  const x = { duracion: duracionSueno(horas), nota: calidad ?? '' };
  return {
    titulo: traducir(i, '☀️ Buen día'),
    cuerpo: calidad !== null ? traducir(i, 'Dormiste {duracion} (nota {nota}). Tocá para ver tu noche.', x) : traducir(i, 'Dormiste {duracion}. Tocá para ver tu noche.', x),
    datos: { tipo: 'buen_dia', persona_id: String(personaId), fecha: noche },
    etiqueta: `buen-dia|${personaId}`,
    conApodo: true,
  };
}

/**
 * Si es la mañana de la persona y ya llegó su noche (las horas de sueño de hoy), el aviso de buen día a los teléfonos
 * de quienes la anotan y no lo apagaron, una sola vez por día. Devuelve cuántos avisos mandó.
 */
export async function mandarBuenDia(db: Db, personaId: number, ahora = new Date()): Promise<number> {
  if (!hayEnvio()) return 0;
  const p = await una<{ id: number; nombre: string; zona_horaria: string }>(db, sql`SELECT id, nombre, zona_horaria FROM personas WHERE id = ${personaId}`);
  if (!p) return 0;
  const hora = Math.floor(minutosDelDia(ahora, p.zona_horaria) / 60);
  if (hora < BUEN_DIA_DESDE || hora >= BUEN_DIA_HASTA) return 0;
  // El sueño va al día calendario en que uno se despierta (la ingesta lo guarda con la fecha de las 0:00).
  const hoy = fechaLocal(ahora, p.zona_horaria);
  const clave = `buen-dia|${p.id}|${hoy}`;
  const sueno = await una<{ horas: number | null }>(
    db,
    sql`SELECT max(m.valor)::float AS horas FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
        WHERE m.persona_id = ${p.id} AND m.fecha = ${hoy} AND c.nombre = ${HORAS_DE_SUENO}`,
  );
  if (!sueno?.horas) return 0;
  const telefonos = await filas<{ id: number; token: string; avisos_hasta: string | null; idioma: string }>(
    db,
    sql`SELECT d.id, d.token, d.avisos_hasta, u.idioma FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id
        WHERE u.activo AND u.avisar_buen_dia
          AND EXISTS (SELECT 1 FROM accesos a WHERE a.persona_id = ${p.id} AND a.usuario_id = u.id AND NOT a.por_supervision)
          AND NOT EXISTS (SELECT 1 FROM avisos_enviados e WHERE e.clave = ${clave} || '|' || d.id)`,
  );
  if (!telefonos.length) return 0;
  // Uno solo arma el resumen aunque lleguen dos ingestas juntas (la app abierta y la de segundo plano).
  if (!(await una(db, sql`INSERT INTO avisos_enviados (clave) VALUES (${`${clave}|resumen`}) ON CONFLICT DO NOTHING RETURNING clave`))) return 0;
  const idiomaDe = (d: { idioma?: string | null }): Idioma => (esIdioma(d.idioma) ? d.idioma : 'es');
  // La nota sale del resumen de la IA; sin IA (o si falla), el aviso va igual, con las horas.
  let calidad: number | null = null;
  try {
    calidad = (await resumirNoche(db, p, hoy, idiomaDe(telefonos[0])))?.calidad ?? null;
  } catch (e) {
    console.error('Buen día, resumen de la noche:', e instanceof Error ? e.message : e);
    calidad = (await resumenGuardado(db, p.id, hoy).catch(() => null))?.calidad ?? null;
  }
  let enviados = 0;
  for (const d of telefonos) {
    if (await avisarUnaVez(db, d, clave, avisoBuenDia(p.id, hoy, sueno.horas, calidad, idiomaDe(d)))) enviados++;
  }
  return enviados;
}

let enCurso: Promise<unknown> = Promise.resolve();

/** Lo dispara la ingesta sin esperarlo (la IA puede tardar unos segundos): la respuesta sale enseguida. */
export function buenDiaDespues(db: Db, personaId: number): void {
  const p = mandarBuenDia(db, personaId).catch((e) => console.error('Buen día:', e instanceof Error ? e.message : e));
  enCurso = Promise.all([enCurso, p]);
}

/** Para las pruebas: espera a que terminen los buenos días disparados por la ingesta. */
export const esperarBuenDia = (): Promise<unknown> => enCurso;
