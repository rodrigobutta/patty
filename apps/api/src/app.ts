// La aplicación HTTP: la API en /api y la web compilada (STATIC_DIR) para todo lo demás.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { esIdioma, idiomaDe, traducir, type Idioma } from 'shared';
import { config } from './config.js';
import { obtenerDb } from './db/client.js';
import { tokenDePedido, usuarioDeToken } from './auth/sesion.js';
import { codigoPg, ErrorApi } from './lib/errores.js';
import type { Env } from './lib/http.js';
import { rutasAdmin } from './routes/admin.js';
import { rutasCiclo } from './routes/ciclo.js';
import { rutasPuntos } from './routes/puntos.js';
import { rutasGente } from './routes/gente.js';
import { rutasClima } from './routes/clima.js';
import { rutasConceptos } from './routes/conceptos.js';
import { rutasDispositivos } from './routes/dispositivos.js';
import { rutasEstadisticas } from './routes/estadisticas.js';
import { rutasIngesta } from './routes/ingesta.js';
import { rutasPatrones } from './routes/patrones.js';
import { rutasPreguntar } from './routes/preguntar.js';
import { rutasComentarios } from './routes/comentarios.js';
import { rutasSueno } from './routes/sueno.js';
import { rutasActividad } from './routes/actividad.js';
import { rutasSemanas } from './routes/semanas.js';
import { rutasPersonas } from './routes/personas.js';
import { rutasRegistros } from './routes/registros.js';
import { rutasSesion } from './routes/sesion.js';
import { rutasSupervision } from './routes/supervision.js';
import { rutasTratamientos } from './routes/tratamientos.js';
import { rutasUbicacion } from './routes/ubicacion.js';
import { rutasUsuarios } from './routes/usuarios.js';
import { rutasVoz } from './routes/voz.js';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function archivo(ruta: string): Promise<Response | null> {
  try {
    if (!(await stat(ruta)).isFile()) return null;
  } catch {
    return null;
  }
  const ext = path.extname(ruta);
  // index.html y el service worker no se guardan en caché: así las versiones nuevas llegan enseguida.
  const cache = ext === '.html' || path.basename(ruta) === 'sw.js' ? 'no-cache' : 'public, max-age=31536000, immutable';
  return new Response(await readFile(ruta), { headers: { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': cache } });
}

/** El idioma de un pedido: el que manda la app (X-Idioma) o el del navegador. */
function idiomaDelPedido(x: string | undefined, accept: string | undefined): Idioma {
  return esIdioma(x) ? x : idiomaDe(accept);
}

export function crearApp(): Hono<Env> {
  const app = new Hono<Env>();

  app.onError((e, c) => {
    const idioma = idiomaDelPedido(c.req.header('X-Idioma'), c.req.header('Accept-Language'));
    if (e instanceof ErrorApi) return c.json({ error: traducir(idioma, e.plantilla, e.vars) }, e.status as 400);
    const codigo = codigoPg(e);
    if (codigo === '23505') return c.json({ error: traducir(idioma, 'Ya existe.') }, 409);
    if (codigo === '23503') return c.json({ error: traducir(idioma, 'Hace referencia a algo que no existe.') }, 400);
    console.error(e);
    return c.json({ error: traducir(idioma, 'Error inesperado del servidor.') }, 500);
  });

  const api = new Hono<Env>();
  api.use('*', async (c, next) => {
    c.set('db', obtenerDb());
    c.set('token', tokenDePedido(c.req.header('Cookie'), c.req.header('Authorization')));
    c.set('idioma', idiomaDelPedido(c.req.header('X-Idioma'), c.req.header('Accept-Language')));
    c.header('Cache-Control', 'no-store');
    await next();
  });
  // Sin usuario: sesión, entrar, primer usuario. La ingesta usa el token de cada fuente.
  api.route('/', rutasSesion);
  api.route('/ingesta', rutasIngesta);
  // Todo lo demás necesita una sesión.
  api.use('*', async (c, next) => {
    const u = await usuarioDeToken(c.var.db, c.var.token);
    if (!u) throw new ErrorApi('Tenés que entrar con tu usuario.', 401);
    c.set('usuario', u);
    // El idioma de la app, para los avisos que manda el servidor (solo cuando cambia).
    if (c.req.header('X-Idioma') && (u as { idioma?: string }).idioma !== c.var.idioma) {
      await c.var.db.execute(sql`UPDATE usuarios SET idioma = ${c.var.idioma} WHERE id = ${u.id}`);
    }
    await next();
  });
  api.route('/admin', rutasAdmin);
  api.route('/usuarios', rutasUsuarios);
  api.route('/personas', rutasPersonas);
  api.route('/conceptos', rutasConceptos);
  api.route('/registros', rutasRegistros);
  api.route('/tratamientos', rutasTratamientos);
  api.route('/clima', rutasClima);
  api.route('/ubicacion', rutasUbicacion);
  api.route('/voz', rutasVoz);
  api.route('/dispositivos', rutasDispositivos);
  api.route('/supervision', rutasSupervision);
  api.route('/estadisticas', rutasEstadisticas);
  api.route('/ciclo', rutasCiclo);
  api.route('/puntos', rutasPuntos);
  api.route('/gente', rutasGente);
  api.route('/', rutasPatrones);
  api.route('/', rutasPreguntar);
  api.route('/comentarios', rutasComentarios);
  api.route('/sueno', rutasSueno);
  api.route('/actividad', rutasActividad);
  api.route('/semanas', rutasSemanas);
  api.all('*', () => {
    throw new ErrorApi('Ruta desconocida.', 404);
  });
  app.route('/api', api);

  // La web: los archivos que existen, y si no, index.html (la app usa rutas con #).
  app.get('*', async (c) => {
    const base = config.staticDir;
    const pedido = path.normalize(path.join(base, decodeURIComponent(new URL(c.req.url).pathname)));
    if (!pedido.startsWith(base)) return c.json({ error: traducir(idiomaDelPedido(c.req.header('X-Idioma'), c.req.header('Accept-Language')), 'No encontrado.') }, 404);
    return (await archivo(pedido)) ?? (await archivo(path.join(base, 'index.html'))) ?? c.text('Patty: falta compilar la web (STATIC_DIR).', 404);
  });
  return app;
}
