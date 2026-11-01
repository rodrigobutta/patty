// Despertar a un teléfono que se quedó callado. Algunos Android matan a Patty varias veces por día y el seguimiento de la
// ubicación no vuelve hasta que algo lo levante: si un teléfono con el seguimiento prendido no da señales (ni un punto ni un
// latido, que manda cada 15 minutos), se le manda un mensaje silencioso de prioridad alta. No muestra nada ni queda en el
// historial de avisos: es para la app (AvisosPushService → VigiaUbicacion.asegurar), no para la persona.
// Solo a las apps que ya saben atenderlo (las que cuentan `vigia` en su estado). De noche también, pero más espaciado: un
// teléfono muerto a las 3 de la mañana suele estar quieto, aunque así no se pierde una vuelta a casa. Si no contesta después
// de varios intentos, se deja de insistir hasta que dé señales (o pase un día).
import { sql } from 'drizzle-orm';
import { filas, una, type Db } from '../db/client.js';
import { minutosDelDia } from '../lib/fechas.js';
import { enviarSilencioso, haySilencioso } from './firebase.js';

/** Tres vueltas de la alarma de 15 minutos sin saber nada. */
export const SILENCIO_MIN = 45;
export const CADA_MIN = 45;
export const CADA_DE_NOCHE_MIN = 120;
/** Hasta las 6 de la mañana, en la hora de la persona. */
const NOCHE_HASTA_HORA = 6;
export const INTENTOS_POR_DIA = 6;
/** Una instalación que no se abre hace tanto ya no se persigue. */
const INSTALACION_DIAS = 60;

const claveDe = (instalacion: string) => `despertar|${instalacion}|`;

/** Revisa los teléfonos callados y les manda el mensaje a los que corresponda. Devuelve a cuántos. */
export async function revisarDespertar(db: Db, ahora = new Date()): Promise<number> {
  if (!haySilencioso()) return 0;
  const lista = await filas<{ instalacion: string; dispositivo: number; token: string; actualizado: string; senal: string | null; zona: string | null }>(
    db,
    sql`SELECT i.id AS instalacion, d.id AS dispositivo, d.token, i.actualizado,
               (SELECT max(f.ultima_ubicacion) FROM fuentes f JOIN persona_usuarios pu ON pu.persona_id = f.persona_id AND pu.rol = 'dueno'
                WHERE pu.usuario_id = i.usuario_id) AS senal,
               (SELECT p.zona_horaria FROM personas p JOIN persona_usuarios pu ON pu.persona_id = p.id AND pu.rol = 'dueno'
                WHERE pu.usuario_id = i.usuario_id ORDER BY p.id LIMIT 1) AS zona
        FROM instalaciones i JOIN dispositivos d ON d.token = i.estado->>'token' AND d.usuario_id = i.usuario_id AND d.plataforma = 'android'
        JOIN usuarios u ON u.id = i.usuario_id AND u.activo
        WHERE i.plataforma = 'android' AND i.estado->'activos'->>'ubicacion' = 'true'
          AND jsonb_typeof(i.estado->'vigia') = 'object'
          AND COALESCE(i.estado->'permisos'->>'ubicacion', 'no') <> 'no'
          AND i.actualizado > ${ahora.toISOString()}::timestamptz - make_interval(days => ${INSTALACION_DIAS})`,
  );
  let enviados = 0;
  for (const x of lista) {
    // Abrir la app también cuenta: ahí arranca el seguimiento, y el reloj empieza a correr desde entonces.
    const senal = Math.max(Date.parse(x.actualizado), x.senal ? Date.parse(x.senal) : 0);
    if (ahora.getTime() - senal < SILENCIO_MIN * 60000) continue;
    const previos = await filas<{ creado: string }>(
      db,
      sql`SELECT creado FROM avisos_enviados WHERE clave LIKE ${`${claveDe(x.instalacion)}%`}
          AND creado > ${new Date(Math.max(senal, ahora.getTime() - 86400000)).toISOString()}::timestamptz ORDER BY creado DESC`,
    );
    if (previos.length >= INTENTOS_POR_DIA) continue;
    const hora = minutosDelDia(ahora, x.zona ?? 'America/Argentina/Buenos_Aires') / 60;
    const cada = hora < NOCHE_HASTA_HORA ? CADA_DE_NOCHE_MIN : CADA_MIN;
    if (previos.length && ahora.getTime() - Date.parse(previos[0].creado) < cada * 60000) continue;
    // Primero se anota: si dos vueltas se pisaran, sale uno solo.
    const clave = `${claveDe(x.instalacion)}${ahora.getTime()}`;
    if (!(await una(db, sql`INSERT INTO avisos_enviados (clave, creado) VALUES (${clave}, ${ahora.toISOString()}) ON CONFLICT DO NOTHING RETURNING clave`))) continue;
    const r = await enviarSilencioso(x.token, { tipo: 'despertar' });
    if (r === 'invalido') await db.execute(sql`DELETE FROM dispositivos WHERE id = ${x.dispositivo}`);
    if (r === 'ok') enviados++;
  }
  return enviados;
}
