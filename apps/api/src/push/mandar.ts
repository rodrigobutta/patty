// Mandar un aviso a un teléfono y dejarlo anotado en el historial del usuario (lo mira la administración para saber qué
// le dice Patty a cada uno). Si el teléfono ya no existe, se olvida.
import { sql } from 'drizzle-orm';
import { apodoDe, sumarApodo } from 'shared';

export { sumarApodo };
import { una, type Db, type Tx } from '../db/client.js';
import { enviarAviso, type Aviso } from './firebase.js';

export async function mandarAviso(db: Db | Tx, d: { id: number; token: string }, aviso: Aviso): Promise<'ok' | 'invalido' | 'error'> {
  let a = aviso;
  if (a.conApodo) {
    const u = await una<{ nombre: string; apodo: string | null }>(db, sql`SELECT u.nombre, u.apodo FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id WHERE d.id = ${d.id}`);
    a = { ...a, cuerpo: u ? sumarApodo(a.cuerpo, apodoDe(u.nombre, u.apodo)) : a.cuerpo };
  }
  const r = await enviarAviso(d.token, a);
  const persona = Number(a.datos?.persona_id) || null;
  try {
    // Un mismo aviso a dos teléfonos del mismo usuario queda una sola vez.
    await db.execute(
      sql`INSERT INTO avisos_historial (usuario_id, persona_id, tipo, titulo, cuerpo, resultado)
          SELECT d.usuario_id, ${persona}, ${a.datos?.tipo ?? null}, ${a.titulo}, ${a.cuerpo}, ${r} FROM dispositivos d
          WHERE d.id = ${d.id} AND NOT EXISTS (
            SELECT 1 FROM avisos_historial h WHERE h.usuario_id = d.usuario_id AND h.titulo = ${a.titulo} AND h.cuerpo = ${a.cuerpo}
              AND h.creado > now() - interval '2 minutes')`,
    );
  } catch (e) {
    console.error('No se pudo anotar el aviso en el historial:', e instanceof Error ? e.message : e);
  }
  if (r === 'invalido') await db.execute(sql`DELETE FROM dispositivos WHERE id = ${d.id}`);
  return r;
}
