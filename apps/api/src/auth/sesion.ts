// Sesiones: un token al azar que va en la cookie "sesion" (web) o en "Authorization: Bearer" (app con Capacitor).
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { RolUsuario, Usuario } from 'shared';
import { una, type Tx } from '../db/client.js';
import { sesiones } from '../db/schema.js';
import { ErrorApi } from '../lib/errores.js';

export const DURACION_SESION = 60 * 86400;

export function tokenDeCookie(cookie: string | undefined | null): string | null {
  if (!cookie) return null;
  for (const parte of cookie.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0 || parte.slice(0, i).trim() !== 'sesion') continue;
    return parte.slice(i + 1).trim().replace(/^"(.*)"$/, '$1') || null;
  }
  return null;
}

export function tokenDePedido(cookie: string | undefined, authorization: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  return m ? m[1] : tokenDeCookie(cookie);
}

export function cookieSesion(token: string, maxAge: number, https: boolean): string {
  return `sesion=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
}

export async function usuarioDeToken(tx: Tx, token: string | null): Promise<Usuario | null> {
  if (!token) return null;
  const u = await una<Usuario & { reciente: boolean }>(
    tx,
    sql`SELECT u.id, u.usuario, u.nombre, u.rol, u.email, u.idioma,
               (u.ultimo_acceso IS NOT NULL AND u.ultimo_acceso > now() - interval '5 minutes') AS reciente
        FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = ${token} AND s.vence > now() AND u.activo`,
  );
  if (!u) return null;
  // Para la administración: cuándo usó la app por última vez (como mucho una escritura cada 5 minutos).
  if (!u.reciente) await tx.execute(sql`UPDATE usuarios SET ultimo_acceso = now() WHERE id = ${u.id}`);
  const { reciente, ...usuario } = u;
  void reciente;
  return usuario;
}

/** Crea una sesión y devuelve el token. */
export async function iniciarSesion(tx: Tx, usuarioId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await tx.execute(sql`DELETE FROM sesiones WHERE vence < now()`);
  await tx.insert(sesiones).values({ token, usuario_id: usuarioId, vence: new Date(Date.now() + DURACION_SESION * 1000).toISOString() });
  return token;
}

export async function cerrarSesion(tx: Tx, token: string | null): Promise<void> {
  if (token) await tx.delete(sesiones).where(sql`token = ${token}`);
}

/** Exige un rol mínimo: lector < editor < admin. */
export function exigirRol(u: Usuario, rol: RolUsuario): void {
  const nivel = { lector: 0, editor: 1, admin: 2 } as const;
  if (nivel[u.rol] >= nivel[rol]) return;
  throw new ErrorApi(rol === 'admin' ? 'Solo un administrador puede hacer esto.' : 'Tu usuario es de solo lectura.', 403);
}
