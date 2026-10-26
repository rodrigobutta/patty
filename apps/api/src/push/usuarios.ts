// Mandar un aviso push a todos los teléfonos de un usuario (y olvidar los que ya no existen).
import { sql } from 'drizzle-orm';
import { esIdioma, type Idioma } from 'shared';
import { filas, una, type Db, type Tx } from '../db/client.js';
import type { Aviso } from './firebase.js';
import { mandarAviso } from './mandar.js';

/**
 * Devuelve a cuántos teléfonos llegó. Sin Firebase o sin teléfonos, 0 (no es un error). Si el aviso es una función,
 * se arma en el idioma de la app del usuario.
 */
export async function avisarAUsuario(db: Db | Tx, usuarioId: number, a: Aviso | ((idioma: Idioma) => Aviso)): Promise<number> {
  const lista = await filas<{ id: number; token: string }>(db, sql`SELECT id, token FROM dispositivos WHERE usuario_id = ${usuarioId}`);
  if (!lista.length) return 0;
  let aviso: Aviso;
  if (typeof a === 'function') {
    const u = await una<{ idioma: string }>(db, sql`SELECT idioma FROM usuarios WHERE id = ${usuarioId}`);
    aviso = a(esIdioma(u?.idioma) ? u.idioma : 'es');
  } else aviso = a;
  let ok = 0;
  for (const d of lista) {
    if ((await mandarAviso(db, d, aviso)) === 'ok') ok++;
  }
  return ok;
}
