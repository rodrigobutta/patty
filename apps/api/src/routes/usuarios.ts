// Usuarios de la app (los administradores los crean) y la clave propia.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { RolUsuario } from 'shared';
import { claveOk, hashClave } from '../auth/claves.js';
import { verificarGoogle } from '../auth/google.js';
import { exigirRol } from '../auth/sesion.js';
import { filas, una, type Tx } from '../db/client.js';
import { usuarios } from '../db/schema.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';

const ROLES: RolUsuario[] = ['admin', 'editor', 'lector'];

export async function crearUsuario(tx: Tx, d: Record<string, unknown>, rol: unknown): Promise<{ id: number }> {
  const usuario = texto(d.usuario).toLowerCase();
  const nombre = texto(d.nombre);
  const clave = typeof d.clave === 'string' ? d.clave : '';
  const email = texto(d.email).toLowerCase() || null;
  if (!/^[a-z0-9._@-]{2,60}$/.test(usuario)) throw new ErrorApi('El usuario tiene que tener solo letras, números o . _ - @ (sin espacios).');
  if (!nombre) throw new ErrorApi('Poné el nombre de la persona.');
  if (clave.length < 6) throw new ErrorApi('La clave tiene que tener al menos 6 caracteres.');
  if (!ROLES.includes(rol as RolUsuario)) throw new ErrorApi('Rol inválido.');
  if (await una(tx, sql`SELECT 1 AS x FROM usuarios WHERE usuario = ${usuario}`)) throw new ErrorApi('Ya existe ese usuario.');
  if (email && (await una(tx, sql`SELECT 1 AS x FROM usuarios WHERE lower(email) = ${email}`))) {
    throw new ErrorApi('Ese email ya está asignado a otro usuario.');
  }
  const [f] = await tx
    .insert(usuarios)
    .values({ usuario, nombre, email, clave: await hashClave(clave), rol: rol as RolUsuario })
    .returning({ id: usuarios.id });
  return f;
}

export const rutasUsuarios = new Hono<Env>()
  // Vincular la cuenta de Google al usuario con el que se entró: queda su mail, y desde ahí puede entrar con Google.
  .post('/yo/google', async (c) => {
    const g = await verificarGoogle(texto((await cuerpo(c)).credential));
    const otro = await una<{ id: number }>(c.var.db, sql`SELECT id FROM usuarios WHERE lower(email) = ${g.email} AND id <> ${c.var.usuario.id}`);
    if (otro) throw new ErrorApi('La cuenta {email} ya es de otro usuario.', 409, { email: g.email });
    await c.var.db.execute(sql`UPDATE usuarios SET email = ${g.email} WHERE id = ${c.var.usuario.id}`);
    return c.json({ ok: true, email: g.email });
  })
  .get('/', async (c) => {
    exigirRol(c.var.usuario, 'admin');
    return c.json(await filas(c.var.db, sql`SELECT id, usuario, nombre, email, rol, activo, creado FROM usuarios ORDER BY nombre`));
  })
  .post('/', async (c) => {
    exigirRol(c.var.usuario, 'admin');
    const d = await cuerpo(c);
    return c.json(await crearUsuario(c.var.db, d, d.rol ?? 'editor'), 201);
  })
  .put('/:id', async (c) => {
    exigirRol(c.var.usuario, 'admin');
    const id = idParam(c);
    const d = await cuerpo(c);
    if (id === c.var.usuario.id && ((d.rol !== undefined && d.rol !== 'admin') || d.activo === false)) {
      throw new ErrorApi('No podés quitarte a vos mismo el rol de administrador ni desactivarte.');
    }
    const cambios: Partial<typeof usuarios.$inferInsert> = {};
    if (texto(d.nombre)) cambios.nombre = texto(d.nombre);
    if (ROLES.includes(d.rol as RolUsuario)) cambios.rol = d.rol as RolUsuario;
    if (typeof d.activo === 'boolean') cambios.activo = d.activo;
    if ('email' in d) cambios.email = texto(d.email).toLowerCase() || null;
    if (typeof d.clave === 'string' && d.clave) {
      if (d.clave.length < 6) throw new ErrorApi('La clave tiene que tener al menos 6 caracteres.');
      cambios.clave = await hashClave(d.clave);
    }
    const [u] = await c.var.db.update(usuarios).set(cambios).where(sql`id = ${id}`).returning({ id: usuarios.id });
    if (!u) throw new ErrorApi('No existe.', 404);
    if (cambios.activo === false) await c.var.db.execute(sql`DELETE FROM sesiones WHERE usuario_id = ${id}`);
    return c.json({ ok: true });
  })
  .get('/yo/preferencias', async (c) => {
    return c.json(await una(c.var.db, sql`SELECT avisar_sin_anotar FROM usuarios WHERE id = ${c.var.usuario.id}`));
  })
  .put('/yo/preferencias', async (c) => {
    // {avisar_sin_anotar}: lo que cada uno elige de los avisos que manda el servidor.
    const d = await cuerpo(c);
    if (typeof d.avisar_sin_anotar === 'boolean') {
      await c.var.db.execute(sql`UPDATE usuarios SET avisar_sin_anotar = ${d.avisar_sin_anotar} WHERE id = ${c.var.usuario.id}`);
    }
    return c.json(await una(c.var.db, sql`SELECT avisar_sin_anotar FROM usuarios WHERE id = ${c.var.usuario.id}`));
  })
  .post('/yo/clave', async (c) => {
    const d = await cuerpo(c);
    const f = await una<{ clave: string }>(c.var.db, sql`SELECT clave FROM usuarios WHERE id = ${c.var.usuario.id}`);
    if (!(await claveOk(d.actual, f?.clave))) throw new ErrorApi('La clave actual no es correcta.');
    if (typeof d.nueva !== 'string' || d.nueva.length < 6) throw new ErrorApi('La clave nueva tiene que tener al menos 6 caracteres.');
    await c.var.db.update(usuarios).set({ clave: await hashClave(d.nueva) }).where(sql`id = ${c.var.usuario.id}`);
    return c.json({ ok: true });
  });
