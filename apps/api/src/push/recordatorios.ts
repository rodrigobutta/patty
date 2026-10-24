// Los recordatorios de remedios que manda el servidor. El teléfono programa los suyos para la semana siguiente cada vez
// que se abre la app (con botones para contestar sin abrirla) y avisa hasta cuándo los tiene (`avisos_hasta`). Lo que
// queda después de eso (un crónico y una semana sin abrir Patty) lo manda el servidor por push: a la hora de la toma y,
// si no se marcó, a la media hora. Corre cada minuto.
import { sql } from 'drizzle-orm';
import { dosisTexto } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { diaDePatty, fechaLocal, localAInstante } from '../lib/fechas.js';
import { COLUMNAS, DESDE, tomasDe, type Fila } from '../routes/tratamientos.js';
import { enviarAviso, pushDisponible, type Aviso } from './firebase.js';

const INSISTIR_MIN = 30;
/** A la hora sin marcar, se les avisa a quienes supervisan. */
const AVISAR_SUPERVISOR_MIN = 60;
/** A esta hora (de la persona), si no anotó nada en el día, se les avisa a quienes supervisan. */
const HORA_SIN_ANOTAR = '21:00';
/** Hasta cuánto tarde se manda un aviso que no se pudo mandar a tiempo (el servidor se reinició, por ejemplo). */
const TOLERANCIA_MIN = 10;

interface Dispositivo {
  id: number;
  token: string;
  avisos_hasta: string | null;
}

/**
 * Los teléfonos de quienes anotan a la persona (los recordatorios) o de quienes la supervisan (los avisos de que algo
 * se olvidó). Los administradores ven todo, pero solo reciben avisos de las personas que son suyas.
 */
function dispositivosDe(db: Db, personaId: number, supervisores: boolean) {
  return filas<Dispositivo>(
    db,
    sql`SELECT d.id, d.token, d.avisos_hasta FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id
        WHERE u.activo AND EXISTS (SELECT 1 FROM accesos pu WHERE pu.persona_id = ${personaId} AND pu.usuario_id = u.id
                                   AND pu.por_supervision = ${supervisores})`,
  );
}

/** Manda un aviso a un teléfono una sola vez por `clave` (aunque haya varios servidores o se revise dos veces). */
export async function avisarUnaVez(db: Db, d: Dispositivo, clave: string, a: Aviso): Promise<boolean> {
  const nuevo = await una(db, sql`INSERT INTO avisos_enviados (clave) VALUES (${`${clave}|${d.id}`}) ON CONFLICT DO NOTHING RETURNING clave`);
  if (!nuevo) return false;
  const r = await enviarAviso(d.token, a);
  if (r === 'invalido') await db.execute(sql`DELETE FROM dispositivos WHERE id = ${d.id}`);
  return r === 'ok';
}

const hhmm = (iso: string, zona: string) => new Intl.DateTimeFormat('es-AR', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** Revisa las tomas de los últimos minutos y manda los avisos que falten. Devuelve cuántos mandó. */
export async function revisarTomas(db: Db, ahora = new Date()): Promise<number> {
  const desde = new Date(ahora.getTime() - (AVISAR_SUPERVISOR_MIN + TOLERANCIA_MIN) * 60000);
  const lista = await filas<Fila>(
    db,
    sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.borrado IS NULL AND t.terminado IS NULL AND (t.fin IS NULL OR t.fin > ${desde.toISOString()})
        AND (cardinality(t.horarios) > 0 OR t.cada_horas IS NOT NULL)
        AND EXISTS (SELECT 1 FROM dispositivos)`,
  );
  if (!lista.length) return 0;
  const porId = new Map(lista.map((t) => [t.id, t]));
  const tomas = (await tomasDe(db, lista, desde, new Date(ahora.getTime() + 1000))).filter((t) => t.estado === null);
  let enviados = 0;
  const propios = new Map<number, Dispositivo[]>();
  const deSupervisores = new Map<number, Dispositivo[]>();
  for (const t of tomas) {
    if (!propios.has(t.persona_id)) {
      propios.set(t.persona_id, await dispositivosDe(db, t.persona_id, false));
      deSupervisores.set(t.persona_id, await dispositivosDe(db, t.persona_id, true));
    }
    const programada = Date.parse(t.programada);
    const tr = porId.get(t.tratamiento_id)!;
    const hora = hhmm(t.programada, tr.zona);
    const que = `${t.remedio}${t.dosis !== null || t.unidad ? ' ' + dosisTexto(t.dosis, t.unidad) : ''}`;
    const datos = { tipo: 'toma', tratamiento_id: String(t.tratamiento_id), programada: t.programada, persona_id: String(t.persona_id) };
    const momentos = [
      { cuando: programada, tipo: 'hora', supervisores: false, aviso: { titulo: `💊 ${que}`, cuerpo: `Es la hora de la toma de las ${hora}.` } },
      { cuando: programada + INSISTIR_MIN * 60000, tipo: 'insistir', supervisores: false, aviso: { titulo: `¿Tomaste ${t.remedio}?`, cuerpo: `La de las ${hora} todavía no está marcada.` } },
      {
        cuando: programada + AVISAR_SUPERVISOR_MIN * 60000,
        tipo: 'supervisor',
        supervisores: true,
        aviso: { titulo: `💊 ${tr.persona_nombre} no marcó ${t.remedio}`, cuerpo: `La toma de las ${hora} sigue sin marcar. Podés mandarle un aviso desde Patty.` },
      },
    ];
    for (const m of momentos) {
      // Solo lo que ya tocaba (con un margen, por si el servidor estuvo caído un rato).
      if (m.cuando > ahora.getTime() || m.cuando < ahora.getTime() - TOLERANCIA_MIN * 60000) continue;
      for (const d of (m.supervisores ? deSupervisores : propios).get(t.persona_id)!) {
        // Si el teléfono ya lo tiene programado por su cuenta, no se repite.
        if (!m.supervisores && d.avisos_hasta && Date.parse(d.avisos_hasta) >= m.cuando) continue;
        if (await avisarUnaVez(db, d, `toma|${t.tratamiento_id}|${t.programada}|${m.tipo}`, { ...m.aviso, datos, canal: 'remedios' })) enviados++;
      }
    }
  }
  return enviados;
}

/** A la noche, a quienes supervisan: si la persona no anotó nada en todo el día. Devuelve cuántos avisos mandó. */
export async function revisarDiasSinAnotar(db: Db, ahora = new Date()): Promise<number> {
  const personas = await filas<{ id: number; nombre: string; zona: string }>(
    db,
    sql`SELECT DISTINCT p.id, p.nombre, p.zona_horaria AS zona FROM personas p JOIN accesos a ON a.persona_id = p.id AND a.por_supervision`,
  );
  let enviados = 0;
  for (const p of personas) {
    const hoy = fechaLocal(ahora, p.zona);
    const desde = localAInstante(hoy, HORA_SIN_ANOTAR, p.zona).getTime();
    if (ahora.getTime() < desde || ahora.getTime() > desde + TOLERANCIA_MIN * 60000) continue;
    const dia = diaDePatty(ahora, p.zona);
    if (await una(db, sql`SELECT 1 AS x FROM registros WHERE persona_id = ${p.id} AND fecha = ${dia} AND borrado IS NULL LIMIT 1`)) continue;
    for (const d of await dispositivosDe(db, p.id, true)) {
      const aviso = { titulo: `📝 ${p.nombre} no anotó nada hoy`, cuerpo: 'Quizás le venga bien un aviso para que le cuente a Patty cómo fue su día.', datos: { tipo: 'sin_anotar', persona_id: String(p.id) } };
      if (await avisarUnaVez(db, d, `sinanotar|${p.id}|${dia}`, aviso)) enviados++;
    }
  }
  return enviados;
}

/** Arranca la revisión de cada minuto (si hay Firebase configurado). */
export function arrancarRecordatorios(db: Db): void {
  if (!pushDisponible()) {
    console.log('Sin FIREBASE_SERVICE_ACCOUNT: el servidor no manda avisos push.');
    return;
  }
  let vueltas = 0;
  const revisar = async () => {
    try {
      await revisarTomas(db);
      await revisarDiasSinAnotar(db);
      // Una vez por día, lo viejo se borra.
      if (vueltas++ % 1440 === 0) await db.execute(sql`DELETE FROM avisos_enviados WHERE enviado < now() - interval '30 days'`);
    } catch (e) {
      console.error('Error revisando recordatorios:', e);
    }
  };
  setInterval(revisar, 60000).unref();
  void revisar();
}
