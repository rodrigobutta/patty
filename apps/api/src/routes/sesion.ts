// Entrar, salir, primer usuario y Google. Al entrar se devuelve también el token, para la app con Capacitor
// (que no puede usar la cookie de otro dominio); la web usa la cookie.
import { limitesDe } from 'shared';
import { usoDeHoy } from '../lib/usoIa.js';
import { setTimeout as esperar } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Sesion, VersionApp } from 'shared';
import { claveOk, hashClave } from '../auth/claves.js';
import { verificarGoogle } from '../auth/google.js';
import { cerrarSesion, cookieSesion, DURACION_SESION, iniciarSesion, usuarioDeToken } from '../auth/sesion.js';
import { config } from '../config.js';
import { una, type Tx } from '../db/client.js';
import { usuarios } from '../db/schema.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, esHttps, texto, type C, type Env } from '../lib/http.js';
import { vozDisponible } from './voz.js';
import { pushDisponible } from '../push/firebase.js';
import { iaDisponible } from '../ia/cliente.js';
import { crearUsuario } from './usuarios.js';

const hayUsuarios = async (tx: Tx) => Boolean(await una(tx, sql`SELECT 1 AS x FROM usuarios LIMIT 1`));

async function conSesion(c: C, usuarioId: number) {
  const token = await iniciarSesion(c.var.db, usuarioId);
  c.header('Set-Cookie', cookieSesion(token, DURACION_SESION, esHttps(c)));
  return c.json({ ok: true, token });
}

export const rutasSesion = new Hono<Env>()
  .get('/sesion', async (c) => {
    const s: Sesion = {
      configurar: !(await hayUsuarios(c.var.db)),
      usuario: await usuarioDeToken(c.var.db, c.var.token),
      google: config.googleClientId ?? null,
      analytics: config.analytics ?? null,
      ia: iaDisponible(),
      voz: vozDisponible(),
      push: pushDisponible(),
      app: (await una<{ valor: VersionApp }>(c.var.db, sql`SELECT valor FROM ajustes WHERE clave = 'version_app'`))?.valor ?? null,
    };
    return c.json(s);
  })
  .get('/uso-ia', async (c) => {
    // Lo mío: el plan, los límites de cada uso y cuánto usé hoy.
    const u = await usuarioDeToken(c.var.db, c.var.token);
    if (!u) throw new ErrorApi('Tenés que entrar con tu usuario.', 401);
    const fila = await una<{ plan: string; limites: Record<string, number> | null }>(c.var.db, sql`SELECT plan, limites FROM usuarios WHERE id = ${u.id}`);
    return c.json({ plan: fila?.plan ?? 'gratis', limites: limitesDe(fila?.plan, fila?.limites), hoy: await usoDeHoy(c.var.db, u.id), sinLimite: u.rol === 'admin' });
  })
  .post('/configurar', async (c) => {
    // El primer usuario es el administrador. El candado evita que dos pedidos simultáneos creen dos.
    const id = await c.var.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE usuarios IN EXCLUSIVE MODE`);
      if (await hayUsuarios(tx)) throw new ErrorApi('Ya hay usuarios creados.');
      return (await crearUsuario(tx, await cuerpo(c), 'admin')).id;
    });
    return conSesion(c, id);
  })
  .post('/entrar', async (c) => {
    const d = await cuerpo(c);
    const fila = await una<{ id: number; clave: string }>(
      c.var.db,
      sql`SELECT id, clave FROM usuarios WHERE lower(usuario) = lower(${texto(d.usuario)}) AND activo LIMIT 1`,
    );
    if (!fila || !(await claveOk(d.clave, fila.clave))) {
      await esperar(600);
      throw new ErrorApi('Usuario o clave incorrectos.', 401);
    }
    return conSesion(c, fila.id);
  })
  .post('/entrar-google', async (c) => {
    const g = await verificarGoogle(texto((await cuerpo(c)).credential));
    const fila = await una<{ id: number }>(c.var.db, sql`SELECT id FROM usuarios WHERE lower(email) = ${g.email} AND activo LIMIT 1`);
    if (fila) {
      // La foto puede haber cambiado en Google: se actualiza cada vez que entra.
      if (g.foto) await c.var.db.execute(sql`UPDATE usuarios SET foto = ${g.foto} WHERE id = ${fila.id}`);
      return conSesion(c, fila.id);
    }
    if (await una(c.var.db, sql`SELECT 1 AS x FROM usuarios WHERE lower(email) = ${g.email}`)) {
      throw new ErrorApi('La cuenta {email} está desactivada. Pedile a un administrador que la active.', 403, { email: g.email });
    }
    const id = await c.var.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE usuarios IN EXCLUSIVE MODE`);
      // Con Google cualquiera puede crearse la cuenta (ve solo lo suyo). El primero de todos queda como administrador.
      const rol = (await hayUsuarios(tx)) ? 'editor' : 'admin';
      const [n] = await tx
        .insert(usuarios)
        .values({ usuario: g.email, nombre: g.nombre, email: g.email, foto: g.foto, clave: await hashClave(randomBytes(16).toString('hex')), rol })
        .returning({ id: usuarios.id });
      return n.id;
    });
    return conSesion(c, id);
  })
  .post('/salir', async (c) => {
    await cerrarSesion(c.var.db, c.var.token);
    c.header('Set-Cookie', cookieSesion('', 0, esHttps(c)));
    return c.json({ ok: true });
  });
