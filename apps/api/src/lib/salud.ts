// La salud de Patty, para el admin: los errores (del servidor, de la app y de los procesos que corren solos) y el estado
// de cada proceso. Cuando algo falla, a los administradores les llega un aviso (como mucho uno por hora por cosa).
import { sql } from 'drizzle-orm';
import { esIdioma, traducir, type Idioma } from 'shared';
import { filas, type Db } from '../db/client.js';
import { hayEnvio } from '../push/firebase.js';
import { avisarUnaVez } from '../push/recordatorios.js';
import { VERSION } from './version.js';

export interface ErrorNuevo {
  origen: 'servidor' | 'app' | 'proceso';
  mensaje: string;
  detalle?: string | null;
  donde?: string | null;
  usuario_id?: number | null;
  version?: string | null;
}

/** Guarda un error (sin romper nada si no se puede) y avisa a los administradores. */
export async function registrarError(db: Db, e: ErrorNuevo): Promise<void> {
  try {
    await db.execute(
      sql`INSERT INTO errores (origen, mensaje, detalle, donde, usuario_id, version)
          VALUES (${e.origen}, ${e.mensaje.slice(0, 500)}, ${e.detalle?.slice(0, 4000) ?? null}, ${e.donde?.slice(0, 200) ?? null}, ${e.usuario_id ?? null}, ${e.version?.slice(0, 40) ?? VERSION})`,
    );
    // Los de la app solo se miran en el admin (hay muchos que son del teléfono); los del servidor y los procesos avisan.
    if (e.origen !== 'app') await avisarAdmins(db, `error|${e.origen}|${e.donde ?? ''}|${e.mensaje.slice(0, 60)}`, e);
  } catch (x) {
    console.error('No se pudo guardar el error:', x instanceof Error ? x.message : x);
  }
}

async function avisarAdmins(db: Db, clave: string, e: ErrorNuevo): Promise<void> {
  if (!hayEnvio()) return;
  const hora = new Date().toISOString().slice(0, 13);
  const dispositivos = await filas<{ id: number; token: string; avisos_hasta: string | null; idioma: string | null }>(
    db,
    sql`SELECT d.id, d.token, d.avisos_hasta, u.idioma FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id WHERE u.activo AND u.rol = 'admin'`,
  );
  for (const d of dispositivos) {
    const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
    await avisarUnaVez(db, { ...d, idioma: d.idioma ?? undefined }, `${clave}|${hora}`, {
      titulo: e.origen === 'proceso' ? traducir(i, '⚠️ Falló un proceso: {que}', { que: e.donde ?? '' }) : traducir(i, '⚠️ Error del servidor'),
      cuerpo: `${e.donde && e.origen !== 'proceso' ? `${e.donde}: ` : ''}${e.mensaje}`.slice(0, 200),
      datos: { tipo: 'salud' },
      etiqueta: 'salud',
    }).catch(() => {});
  }
}

/**
 * Corre un proceso y anota cómo le fue (cuándo, cuánto tardó, cuántas cosas procesó, si falló). Si falla, el error se
 * guarda y se sigue con los demás.
 */
export async function correr(db: Db, nombre: string, f: () => Promise<number | void>): Promise<void> {
  const inicio = Date.now();
  let ok = true;
  let error: string | null = null;
  let n = 0;
  try {
    n = (await f()) ?? 0;
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
    console.error(`Proceso ${nombre}:`, e);
    await registrarError(db, { origen: 'proceso', mensaje: error, detalle: e instanceof Error ? e.stack ?? null : null, donde: nombre });
  }
  const ms = Date.now() - inicio;
  await db
    .execute(
      sql`INSERT INTO procesos (nombre, ultimo_inicio, ultima_duracion_ms, ultimo_ok, ultimo_error, ultimo_trabajo, corridas, fallas, procesados)
          VALUES (${nombre}, ${new Date(inicio).toISOString()}, ${ms}, ${ok}, ${error}, ${n > 0 ? new Date(inicio).toISOString() : null}, 1, ${ok ? 0 : 1}, ${n})
          ON CONFLICT (nombre) DO UPDATE SET ultimo_inicio = excluded.ultimo_inicio, ultima_duracion_ms = excluded.ultima_duracion_ms,
            ultimo_ok = excluded.ultimo_ok, ultimo_error = coalesce(excluded.ultimo_error, procesos.ultimo_error),
            ultimo_trabajo = coalesce(excluded.ultimo_trabajo, procesos.ultimo_trabajo),
            corridas = procesos.corridas + 1, fallas = procesos.fallas + excluded.fallas, procesados = procesos.procesados + excluded.procesados`,
    )
    .catch(() => {});
}
