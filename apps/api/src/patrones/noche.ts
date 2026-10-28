// Los patrones se buscan solos: a las 4 de la mañana (hora de cada persona) el servidor corre el análisis de quienes
// anotaron algo en los últimos días, así nadie espera a que termine al tocar "Buscar patrones" y Patrones abre con lo
// último. A las 9, si apareció algo nuevo, el búho avisa. Corre cada minuto; cada cosa se hace una sola vez por día.
import { sql } from 'drizzle-orm';
import { esIdioma, traducir, type Idioma } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { diaDePatty, minutosDelDia, sumarDias } from '../lib/fechas.js';
import { hayEnvio, type Aviso } from '../push/firebase.js';
import { avisarUnaVez, dispositivosDe } from '../push/recordatorios.js';
import { comentarDia } from '../ia/comentar.js';
import { armarContexto, pendientes } from '../ia/contexto.js';
import { resumirNoche } from '../ia/resumirNoche.js';
import { lunesDe, resumirSemana } from '../ia/resumirSemana.js';
import { analizarPersona } from './analizar.js';
import { correr, registrarError } from '../lib/salud.js';
import { guardarFueraDeLoNormal } from './fueraDeLoNormal.js';
import { avisarSeguimientos } from './seguimientos.js';
import { seguirMalestares } from './malestares.js';
import { sugerirFinDeActividades } from './actividades.js';
import { sugerirPaseos } from './paseos.js';
import { DIAS_MINIMOS } from './motor.js';

const HORA_ANALISIS = 4;
const HORA_AVISO = 9;
/** Los comentarios del día (ia/comentar.ts) se arman temprano, ya con el día nuevo empezado. */
const HORA_COMENTARIOS = 6;
/** El resumen de la noche (ia/resumirNoche.ts), cuando ya se suele haber sincronizado el reloj. */
const HORA_RESUMEN_NOCHE = 10;
/** Lo que se sale de lo normal (patrones/fueraDeLoNormal.ts), después del resumen de la noche (ya con el sueño). */
const HORA_FUERA_DE_LO_NORMAL = 11;
/** El domingo a esta hora se arma el resumen de la semana y el búho avisa. */
const HORA_SEMANA = 20;
/** Solo se analiza a quien anotó algo en estos últimos días (si no, no cambió nada desde la última vez). */
const DIAS_ACTIVO = 3;

interface PersonaNoche {
  id: number;
  nombre: string;
  zona_horaria: string;
  idioma: string | null;
}

const enHora = (ahora: Date, zona: string, hora: number) => Math.floor(minutosDelDia(ahora, zona) / 60) === hora;

/** Una sola vez por `clave` (aunque haya varios servidores o se revise dos veces). */
const primeraVez = async (db: Db, clave: string) =>
  Boolean(await una(db, sql`INSERT INTO avisos_enviados (clave) VALUES (${clave}) ON CONFLICT DO NOTHING RETURNING clave`));

/** Corre el análisis de las personas a las que les toca ahora. Devuelve cuántas analizó. */
export async function analizarDeNoche(db: Db, ahora = new Date()): Promise<number> {
  const lista = await filas<PersonaNoche>(
    db,
    sql`SELECT p.id, p.nombre, p.zona_horaria,
               (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id
                WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
        FROM personas p
        WHERE EXISTS (SELECT 1 FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL
                      AND r.creado > ${ahora.toISOString()}::timestamptz - make_interval(days => ${DIAS_ACTIVO}))`,
  );
  let n = 0;
  for (const p of lista) {
    if (!enHora(ahora, p.zona_horaria, HORA_ANALISIS)) continue;
    // A las 4 todavía es "ayer" para Patty: el análisis llega hasta el último día completo.
    const hasta = diaDePatty(ahora, p.zona_horaria);
    const desde = sumarDias(hasta, -179);
    const dias = await una<{ n: number }>(
      db,
      sql`SELECT count(DISTINCT fecha)::int AS n FROM registros WHERE persona_id = ${p.id} AND borrado IS NULL AND fecha BETWEEN ${desde} AND ${hasta}`,
    );
    if ((dias?.n ?? 0) < DIAS_MINIMOS) continue;
    if (!(await primeraVez(db, `patrones|${p.id}|${hasta}`))) continue;
    try {
      const idioma: Idioma = esIdioma(p.idioma) ? p.idioma : 'es';
      const r = await analizarPersona(db, { id: p.id, nombre: p.nombre, zona_horaria: p.zona_horaria, rol: 'dueno' }, { desde, hasta, idioma, ia: true, origen: 'noche' });
      console.log(`Patrones de noche: ${p.nombre} (${p.id}), ${r.hallazgos.length} hallazgos, ${r.nuevos.length} nuevos.`);
      n++;
    } catch (e) {
      console.error(`Patrones de noche: falló el análisis de la persona ${p.id}:`, e instanceof Error ? e.message : e);
      void registrarError(db, { origen: 'proceso', mensaje: e instanceof Error ? e.message : String(e), detalle: e instanceof Error ? e.stack ?? null : null, donde: `Patrones de noche: falló el análisis de la persona ${p.id}` });
    }
  }
  return n;
}

/** A las 6, los comentarios del día de quienes anotaron algo en la semana (los que aún no los tienen). */
export async function comentarDeManana(db: Db, ahora = new Date()): Promise<number> {
  const lista = await filas<PersonaNoche>(
    db,
    sql`SELECT p.id, p.nombre, p.zona_horaria,
               (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id
                WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
        FROM personas p
        WHERE EXISTS (SELECT 1 FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL AND r.origen IN ('manual', 'ia')
                      AND r.creado > ${ahora.toISOString()}::timestamptz - interval '7 days')`,
  );
  let n = 0;
  for (const p of lista) {
    if (!enHora(ahora, p.zona_horaria, HORA_COMENTARIOS)) continue;
    try {
      if (await comentarDia(db, p, esIdioma(p.idioma) ? p.idioma : 'es', ahora)) n++;
    } catch (e) {
      console.error(`Comentarios de la mañana: falló la persona ${p.id}:`, e instanceof Error ? e.message : e);
      void registrarError(db, { origen: 'proceso', mensaje: e instanceof Error ? e.message : String(e), detalle: e instanceof Error ? e.stack ?? null : null, donde: `Comentarios de la mañana: falló la persona ${p.id}` });
    }
  }
  return n;
}

/** A las 10, el resumen de la noche de quienes tienen datos de sueño de hoy y todavía no lo tienen. */
export async function resumirNochesDeHoy(db: Db, ahora = new Date()): Promise<number> {
  const lista = await filas<PersonaNoche>(
    db,
    sql`SELECT p.id, p.nombre, p.zona_horaria,
               (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id
                WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
        FROM personas p
        WHERE EXISTS (SELECT 1 FROM sueno_etapas s WHERE s.persona_id = p.id AND s.noche > ${ahora.toISOString()}::date - 2)`,
  );
  let n = 0;
  for (const p of lista) {
    if (!enHora(ahora, p.zona_horaria, HORA_RESUMEN_NOCHE)) continue;
    const hoy = diaDePatty(ahora, p.zona_horaria);
    if (!(await primeraVez(db, `resumen-noche|${p.id}|${hoy}`))) continue;
    try {
      if (await resumirNoche(db, p, hoy, esIdioma(p.idioma) ? p.idioma : 'es')) n++;
    } catch (e) {
      console.error(`Resumen de la noche: falló la persona ${p.id}:`, e instanceof Error ? e.message : e);
      void registrarError(db, { origen: 'proceso', mensaje: e instanceof Error ? e.message : String(e), detalle: e instanceof Error ? e.stack ?? null : null, donde: `Resumen de la noche: falló la persona ${p.id}` });
    }
  }
  return n;
}

/** El domingo a las 20, el resumen de la semana de quienes anotaron algo, con un aviso del búho. */
export async function resumirSemanas(db: Db, ahora = new Date()): Promise<number> {
  const lista = await filas<PersonaNoche>(
    db,
    sql`SELECT p.id, p.nombre, p.zona_horaria,
               (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id
                WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
        FROM personas p
        WHERE EXISTS (SELECT 1 FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL AND r.origen IN ('manual', 'ia')
                      AND r.creado > ${ahora.toISOString()}::timestamptz - interval '7 days')`,
  );
  let n = 0;
  for (const p of lista) {
    if (!enHora(ahora, p.zona_horaria, HORA_SEMANA)) continue;
    const hoy = diaDePatty(ahora, p.zona_horaria);
    if (new Date(`${hoy}T12:00:00Z`).getUTCDay() !== 0) continue;
    const lunes = lunesDe(hoy);
    if (!(await primeraVez(db, `semana|${p.id}|${lunes}`))) continue;
    try {
      const idioma: Idioma = esIdioma(p.idioma) ? p.idioma : 'es';
      const r = await resumirSemana(db, p, lunes, idioma);
      if (!r) continue;
      n++;
      if (!hayEnvio()) continue;
      for (const d of await dispositivosDe(db, p.id, false)) {
        const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
        await avisarUnaVez(db, d, `aviso-semana|${p.id}|${lunes}`, {
          titulo: traducir(i, '🦉 Tu semana'),
          cuerpo: r.titulo,
          datos: { tipo: 'semana', persona_id: String(p.id), cara: 'feliz' },
          etiqueta: `semana|${p.id}`,
        });
      }
    } catch (e) {
      console.error(`Resumen de la semana: falló la persona ${p.id}:`, e instanceof Error ? e.message : e);
      void registrarError(db, { origen: 'proceso', mensaje: e instanceof Error ? e.message : String(e), detalle: e instanceof Error ? e.stack ?? null : null, donde: `Resumen de la semana: falló la persona ${p.id}` });
    }
  }
  return n;
}

/** A las 11, lo que se sale de lo normal de cada persona activa; si hay algo nuevo, el búho avisa. */
export async function revisarFueraDeLoNormal(db: Db, ahora = new Date()): Promise<number> {
  const lista = await filas<PersonaNoche>(
    db,
    sql`SELECT p.id, p.nombre, p.zona_horaria,
               (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id
                WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
        FROM personas p
        WHERE EXISTS (SELECT 1 FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL AND r.origen IN ('manual', 'ia')
                      AND r.creado > ${ahora.toISOString()}::timestamptz - interval '14 days')`,
  );
  let n = 0;
  for (const p of lista) {
    if (!enHora(ahora, p.zona_horaria, HORA_FUERA_DE_LO_NORMAL)) continue;
    const hoy = diaDePatty(ahora, p.zona_horaria);
    if (!(await primeraVez(db, `fuera|${p.id}|${hoy}`))) continue;
    try {
      const hechos = await guardarFueraDeLoNormal(db, p.id, hoy, esIdioma(p.idioma) ? p.idioma : 'es');
      if (!hechos.length) continue;
      n += hechos.length;
      if (!hayEnvio()) continue;
      for (const d of await dispositivosDe(db, p.id, false)) {
        const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
        await avisarUnaVez(db, d, `aviso-fuera|${p.id}|${hoy}`, {
          titulo: traducir(i, '🦉 Algo distinto estos días'),
          cuerpo: hechos.length > 1 ? `${hechos[0].texto} ${traducir(i, '(y {n} más)', { n: hechos.length - 1 })}` : hechos[0].texto,
          datos: { tipo: 'fuera', persona_id: String(p.id), cara: 'espera' },
          etiqueta: `fuera|${p.id}`,
        });
      }
    } catch (e) {
      console.error(`Fuera de lo normal: falló la persona ${p.id}:`, e instanceof Error ? e.message : e);
      void registrarError(db, { origen: 'proceso', mensaje: e instanceof Error ? e.message : String(e), detalle: e instanceof Error ? e.stack ?? null : null, donde: `Fuera de lo normal: falló la persona ${p.id}` });
    }
  }
  return n;
}

/** "¿Qué pasó antes?" de las molestias y los malos momentos recién anotados (unos pocos por vuelta). */
export async function contextosPendientes(db: Db): Promise<number> {
  let n = 0;
  for (const x of await pendientes(db)) {
    try {
      await armarContexto(db, x.id, x.zona_horaria, esIdioma(x.idioma) ? x.idioma : 'es');
      n++;
    } catch (e) {
      console.error(`¿Qué pasó antes? del registro ${x.id}:`, e instanceof Error ? e.message : e);
      void registrarError(db, { origen: 'proceso', mensaje: e instanceof Error ? e.message : String(e), detalle: e instanceof Error ? e.stack ?? null : null, donde: `¿Qué pasó antes? del registro ${x.id}` });
    }
  }
  return n;
}

/** El aviso del búho con lo mejor que apareció ("Encontré algo: …"). */
export function avisoDeHallazgo(personaId: number, explicacion: string, otros: number, i: Idioma): Aviso {
  const corto = explicacion.length > 160 ? `${explicacion.slice(0, 157).trimEnd()}…` : explicacion;
  return {
    titulo: traducir(i, '🦉 Encontré algo en tus datos'),
    cuerpo: otros > 0 ? `${corto} ${traducir(i, '(y {n} más en Patrones)', { n: otros })}` : corto,
    datos: { tipo: 'hallazgo', persona_id: String(personaId), cara: 'feliz' },
    etiqueta: `hallazgo|${personaId}`,
  };
}

/** A las 9, a quienes anotan a la persona, lo nuevo del análisis de la noche (si sigue sin confirmar ni descartar). */
export async function avisarHallazgosNuevos(db: Db, ahora = new Date()): Promise<number> {
  if (!hayEnvio()) return 0;
  const lista = await filas<{ analisis_id: number; persona_id: number; zona_horaria: string; nuevos: number[] }>(
    db,
    sql`SELECT DISTINCT ON (a.persona_id) a.id AS analisis_id, a.persona_id, p.zona_horaria, a.nuevos
        FROM analisis a JOIN personas p ON p.id = a.persona_id
        WHERE a.origen = 'noche' AND a.creado > ${ahora.toISOString()}::timestamptz - interval '12 hours'
        ORDER BY a.persona_id, a.creado DESC`,
  );
  let enviados = 0;
  for (const a of lista) {
    if (!a.nuevos.length || !enHora(ahora, a.zona_horaria, HORA_AVISO)) continue;
    const vigentes = await filas<{ explicacion: string }>(
      db,
      sql`SELECT explicacion FROM hallazgos WHERE id IN ${a.nuevos} AND estado = 'nuevo' AND explicacion IS NOT NULL ORDER BY puntaje DESC`,
    );
    if (!vigentes.length) continue;
    for (const d of await dispositivosDe(db, a.persona_id, false)) {
      const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
      if (await avisarUnaVez(db, d, `hallazgo|${a.analisis_id}`, avisoDeHallazgo(a.persona_id, vigentes[0].explicacion, vigentes.length - 1, i))) enviados++;
    }
  }
  return enviados;
}

/** Arranca la revisión de cada minuto. No pisa una vuelta con otra (un análisis con la IA puede tardar). */
export function arrancarPatronesDeNoche(db: Db): void {
  let corriendo = false;
  const revisar = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      // Cada proceso por separado: si uno falla, los demás corren igual, y queda anotado en el admin (Salud).
      await correr(db, 'Patrones de la noche', () => analizarDeNoche(db));
      await correr(db, 'Avisos de hallazgos', () => avisarHallazgosNuevos(db));
      await correr(db, 'Comentarios del día', () => comentarDeManana(db));
      await correr(db, 'Resumen de la noche', () => resumirNochesDeHoy(db));
      await correr(db, 'Resumen de la semana', () => resumirSemanas(db));
      await correr(db, 'Algo distinto estos días', () => revisarFueraDeLoNormal(db));
      await correr(db, 'Avisos de seguimientos', () => avisarSeguimientos(db));
      await correr(db, 'Malestares en curso', () => seguirMalestares(db));
      await correr(db, 'Actividades en curso', () => sugerirFinDeActividades(db));
      await correr(db, 'Paseos detectados', () => sugerirPaseos(db));
      await correr(db, '¿Qué pasó antes?', () => contextosPendientes(db));
    } finally {
      corriendo = false;
    }
  };
  setInterval(revisar, 60000).unref();
}
