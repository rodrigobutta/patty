// Mandar un aviso push a todos los teléfonos de un usuario (y olvidar los que ya no existen).
import { sql } from 'drizzle-orm';
import { filas, type Db, type Tx } from '../db/client.js';
import { enviarAviso, type Aviso } from './firebase.js';

/** Devuelve a cuántos teléfonos llegó. Sin Firebase o sin teléfonos, 0 (no es un error). */
export async function avisarAUsuario(db: Db | Tx, usuarioId: number, a: Aviso): Promise<number> {
  const lista = await filas<{ id: number; token: string }>(db, sql`SELECT id, token FROM dispositivos WHERE usuario_id = ${usuarioId}`);
  let ok = 0;
  for (const d of lista) {
    const r = await enviarAviso(d.token, a);
    if (r === 'ok') ok++;
    if (r === 'invalido') await db.execute(sql`DELETE FROM dispositivos WHERE id = ${d.id}`);
  }
  return ok;
}
