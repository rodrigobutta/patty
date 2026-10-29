// La versión de la app de Android que se baja de la web (el APK firmado en GitHub Releases, ver /descargar/android).
// Cada hora se fija si hay una versión nueva publicada; si la hay, la guarda (así la app muestra el cartel para
// bajarla) y les avisa a quienes tienen una más vieja. También se puede cargar a mano desde la administración.
import { sql } from 'drizzle-orm';
import { compararVersiones, type VersionApp } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { hayEnvio, type Aviso } from './firebase.js';
import { mandarAviso } from './mandar.js';

const ULTIMA = 'https://api.github.com/repos/rodrigobutta/patty/releases/latest';
/** Lo que abre el aviso: siempre baja el APK de la última versión. */
export const DESCARGA = 'https://patty.today/descargar/android';
const CADA = 60 * 60 * 1000;

/** Un aviso a los usuarios pedidos (o a todos, con null), en todos sus teléfonos. */
export async function avisarA(db: Db, usuarios: number[] | null, aviso: Aviso): Promise<{ enviados: number; telefonos: number }> {
  if (!hayEnvio()) throw new ErrorApi('El servidor todavía no tiene Firebase configurado.');
  const lista = await filas<{ id: number; token: string }>(
    db,
    sql`SELECT d.id, d.token FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id AND u.activo
        WHERE ${usuarios === null} OR d.usuario_id IN (${sql.join((usuarios?.length ? usuarios : [0]).map((x) => sql`${x}`), sql`, `)})`,
  );
  let enviados = 0;
  for (const d of lista) {
    if ((await mandarAviso(db, d, aviso)) === 'ok') enviados++;
  }
  return { enviados, telefonos: lista.length };
}

/** Los usuarios con la app de Android más vieja que `version` (o tan vieja que no la cuenta). */
export async function desactualizados(db: Db, version: string): Promise<number[]> {
  const l = await filas<{ usuario_id: number; app: string | null }>(
    db,
    sql`SELECT DISTINCT ON (i.usuario_id) i.usuario_id, i.estado->'version'->>'app' AS app FROM instalaciones i
        JOIN usuarios u ON u.id = i.usuario_id AND u.activo WHERE i.plataforma = 'android' ORDER BY i.usuario_id, i.actualizado DESC`,
  );
  return l.filter((x) => !x.app || compararVersiones(x.app, version) < 0).map((x) => x.usuario_id);
}

export async function guardarVersionApp(db: Db, valor: VersionApp): Promise<void> {
  await db.execute(sql`INSERT INTO ajustes (clave, valor) VALUES ('version_app', ${JSON.stringify(valor)}::jsonb)
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, creado = now()`);
}

/** El aviso de versión nueva: al tocarlo se abre el link para bajarla. */
export const avisoVersion = (version: string, url: string): Aviso => ({
  titulo: '📲 Hay una versión nueva de Patty',
  cuerpo: `Ya está la ${version}. Tocá para bajarla e instalarla.`,
  datos: { tipo: 'version', url, cara: 'feliz' },
});

/** La última versión publicada en GitHub ("v1.55.0" → "1.55.0"), o null si no se pudo saber. */
async function ultimaPublicada(): Promise<string | null> {
  try {
    const r = await fetch(ULTIMA, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Patty' }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const { tag_name: tag } = (await r.json()) as { tag_name?: string };
    const v = tag?.replace(/^v/, '');
    return v && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Si hay una versión publicada más nueva que la guardada: la guarda y avisa a quienes tienen una más vieja. */
export async function revisarVersionApp(db: Db): Promise<void> {
  const v = await ultimaPublicada();
  if (!v) return;
  const actual = (await una<{ valor: VersionApp }>(db, sql`SELECT valor FROM ajustes WHERE clave = 'version_app'`))?.valor;
  if (actual && compararVersiones(actual.version, v) >= 0) return;
  await guardarVersionApp(db, { version: v, url: DESCARGA });
  const viejos = await desactualizados(db, v);
  // La primera vez (sin versión guardada) no se avisa: la gente bajó la app hace poco.
  if (actual && viejos.length && hayEnvio()) await avisarA(db, viejos, avisoVersion(v, DESCARGA));
  console.log(`Versión de la app de Android: ${v} (${viejos.length} con una más vieja)`);
}

export function arrancarVersionApp(db: Db): void {
  const revisar = () => void revisarVersionApp(db).catch((e) => console.error('Versión de la app:', e));
  setTimeout(revisar, 30_000);
  setInterval(revisar, CADA);
}
