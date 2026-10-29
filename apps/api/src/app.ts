// La aplicación HTTP: la API en /api y la web compilada (STATIC_DIR) para todo lo demás.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { esIdioma, idiomaDe, traducir, type Idioma } from 'shared';
import { config } from './config.js';
import { obtenerDb } from './db/client.js';
import { registrarError } from './lib/salud.js';
import { conUso } from './lib/usoIa.js';
import { rutasErrores } from './routes/errores.js';
import { rutasBeta } from './routes/beta.js';
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
import { rutasFueraDeLoNormal } from './routes/fueraDeLoNormal.js';
import { rutasObjetivos } from './routes/objetivos.js';
import { rutasPreguntasConcepto } from './routes/preguntasConcepto.js';
import { rutasSeguimientos } from './routes/seguimientos.js';
import { rutasPaseos } from './routes/paseos.js';
import { rutasSueno } from './routes/sueno.js';
import { rutasActividad } from './routes/actividad.js';
import { rutasSemanas } from './routes/semanas.js';
import { rutasWidget } from './routes/widget.js';
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
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function archivo(ruta: string, rango?: string): Promise<Response | null> {
  try {
    if (!(await stat(ruta)).isFile()) return null;
  } catch {
    return null;
  }
  const ext = path.extname(ruta);
  // index.html y el service worker no se guardan en caché: así las versiones nuevas llegan enseguida. Lo de la
  // presentación (capturas y videos, sin hash en el nombre) se guarda un día.
  const cache =
    ext === '.html' || path.basename(ruta) === 'sw.js'
      ? 'no-cache'
      : ruta.includes(`${path.sep}presentacion${path.sep}`)
        ? 'public, max-age=86400'
        : 'public, max-age=31536000, immutable';
  const datos = await readFile(ruta);
  const headers: Record<string, string> = { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': cache, 'Accept-Ranges': 'bytes' };
  // Los videos se piden de a pedazos (Safari no los reproduce si no).
  const m = rango?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const total = datos.length;
    const desde = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    const hasta = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (desde >= total || desde > hasta) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    return new Response(datos.subarray(desde, hasta + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${desde}-${hasta}/${total}` } });
  }
  return new Response(datos, { headers });
}

/** El idioma de un pedido: el que manda la app (X-Idioma) o el del navegador. */
function idiomaDelPedido(x: string | undefined, accept: string | undefined): Idioma {
  return esIdioma(x) ? x : idiomaDe(accept);
}

/** El APK de la última versión (`gh release create vX.Y.Z patty.apk`). */
export const APK_ANDROID = 'https://github.com/rodrigobutta/patty/releases/latest/download/patty.apk';

export function crearApp(): Hono<Env> {
  const app = new Hono<Env>();

  app.onError((e, c) => {
    const idioma = idiomaDelPedido(c.req.header('X-Idioma'), c.req.header('Accept-Language'));
    if (e instanceof ErrorApi) return c.json({ error: traducir(idioma, e.plantilla, e.vars) }, e.status as 400);
    const codigo = codigoPg(e);
    if (codigo === '23505') return c.json({ error: traducir(idioma, 'Ya existe.') }, 409);
    if (codigo === '23503') return c.json({ error: traducir(idioma, 'Hace referencia a algo que no existe.') }, 400);
    console.error(e);
    void registrarError(c.var.db ?? obtenerDb(), {
      origen: 'servidor',
      mensaje: e instanceof Error ? e.message : String(e),
      detalle: e instanceof Error ? e.stack ?? null : null,
      donde: `${c.req.method} ${new URL(c.req.url).pathname}`,
      usuario_id: c.var.usuario?.id ?? null,
    });
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
  api.route('/', rutasErrores);
  api.route('/', rutasBeta);
  // Todo lo demás necesita una sesión.
  api.use('*', async (c, next) => {
    const u = await usuarioDeToken(c.var.db, c.var.token);
    if (!u) throw new ErrorApi('Tenés que entrar con tu usuario.', 401);
    c.set('usuario', u);
    // El idioma de la app, para los avisos que manda el servidor (solo cuando cambia).
    if (c.req.header('X-Idioma') && (u as { idioma?: string }).idioma !== c.var.idioma) {
      await c.var.db.execute(sql`UPDATE usuarios SET idioma = ${c.var.idioma} WHERE id = ${u.id}`);
    }
    // Los pedidos a la IA de acá en adelante quedan anotados a nombre de este usuario.
    await conUso({ usuarioId: u.id, tipo: 'otro' }, () => next());
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
  api.route('/fuera-de-lo-normal', rutasFueraDeLoNormal);
  api.route('/objetivos', rutasObjetivos);
  api.route('/preguntas-concepto', rutasPreguntasConcepto);
  api.route('/seguimientos', rutasSeguimientos);
  api.route('/paseos', rutasPaseos);
  api.route('/sueno', rutasSueno);
  api.route('/actividad', rutasActividad);
  api.route('/semanas', rutasSemanas);
  api.route('/widget', rutasWidget);
  api.all('*', () => {
    throw new ErrorApi('Ruta desconocida.', 404);
  });
  app.route('/api', api);

  // La app de Android, directo (sin Play Store por ahora): el APK firmado de la última versión, en GitHub Releases.
  app.get('/descargar/android', (c) => c.redirect(APK_ANDROID, 302));

  // La web: los archivos que existen, y si no, index.html (la app usa rutas con #).
  app.get('*', async (c) => {
    const base = config.staticDir;
    const pedido = path.normalize(path.join(base, decodeURIComponent(new URL(c.req.url).pathname)));
    if (!pedido.startsWith(base)) return c.json({ error: traducir(idiomaDelPedido(c.req.header('X-Idioma'), c.req.header('Accept-Language')), 'No encontrado.') }, 404);
    return (await archivo(pedido, c.req.header('Range'))) ?? (await archivo(path.join(base, 'index.html'))) ?? c.text('Patty: falta compilar la web (STATIC_DIR).', 404);
  });
  return app;
}
