// Tele, música y podcasts: buscar un título para elegir su tapa, traer la tapa para la imagen de compartir y lo que
// sonó en el teléfono cada día.
import { Hono } from 'hono';
import { esTapaValida, esTipoMedio, sePantalla } from 'shared';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { esFecha } from '../lib/fechas.js';
import type { Env } from '../lib/http.js';
import { borrarEscuchas, sesionesDelDia } from '../medios/escuchas.js';
import { buscarMedios, generoDeItunes } from '../medios/itunes.js';

/** Las últimas tapas traídas, en memoria (las imágenes de compartir piden siempre las mismas). */
const TAPAS = new Map<string, { tipo: string; datos: ArrayBuffer }>();
const MAX_TAPAS = 60;

/**
 * La tapa, con CORS abierto: la imagen para compartir se dibuja en un canvas y, si la tapa viniera de otro sitio sin
 * CORS, el canvas quedaría "manchado" y no se podría exportar. Sin sesión (un <img> no manda el token de la app), pero
 * solo trae imágenes de iTunes (mzstatic.com): no sirve para pedir otra cosa.
 */
export const rutasMediosPublico = new Hono<Env>().get('/tapa', async (c) => {
  const u = c.req.query('u') ?? '';
  if (!esTapaValida(u)) throw new ErrorApi('Esa tapa no es de iTunes.', 400);
  let t = TAPAS.get(u);
  if (!t) {
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    const tipo = r?.headers.get('Content-Type') ?? '';
    if (!r?.ok || !tipo.startsWith('image/')) throw new ErrorApi('No se pudo traer la tapa.', 502);
    const datos = await r.arrayBuffer();
    if (datos.byteLength > 3_000_000) throw new ErrorApi('No se pudo traer la tapa.', 502);
    t = { tipo, datos };
    TAPAS.set(u, t);
    if (TAPAS.size > MAX_TAPAS) TAPAS.delete(TAPAS.keys().next().value!);
  }
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'public, max-age=604800, immutable');
  c.header('Content-Type', t.tipo);
  return c.body(t.datos);
});

export const rutasMedios = new Hono<Env>()
  // ?tipo=pelicula&q=duna: hasta 6 títulos con su tapa, año y género (el de la película o serie, como los de Patty).
  .get('/buscar', async (c) => {
    const tipo = c.req.query('tipo');
    if (!esTipoMedio(tipo)) throw new ErrorApi('¿Qué tipo de cosa buscás?');
    const l = await buscarMedios(c.var.db, tipo, c.req.query('q') ?? '');
    return c.json(sePantalla(tipo) ? l.map((x) => ({ ...x, genero: generoDeItunes(x.genero) })) : l);
  })
  // Lo que sonó o se miró en el teléfono ese día, en sesiones (para el Día).
  .get('/escuchas', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const fecha = c.req.query('fecha');
    if (!esFecha(fecha)) throw new ErrorApi('Falta el día.');
    const sesiones = await sesionesDelDia(c.var.db, p.id, fecha);
    // El género de la música, por los artistas que más sonaron en cada sesión (la búsqueda queda guardada un mes).
    for (const s of sesiones) {
      if (s.tipo !== 'musica') continue;
      const minutos = new Map<string, number>();
      for (const x of s.pistas) if (x.artista) minutos.set(x.artista, (minutos.get(x.artista) ?? 0) + x.minutos);
      const artistas = [...minutos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a);
      const generos: string[] = [];
      for (const a of artistas) {
        const g = generoDeItunes((await buscarMedios(c.var.db, 'musica', a).catch(() => []))[0]?.genero);
        if (g && !generos.includes(g)) generos.push(g);
      }
      s.generos = generos;
    }
    return c.json(sesiones);
  })
  .delete('/escuchas', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), true);
    await c.var.db.transaction((tx) => borrarEscuchas(tx, p.id));
    return c.json({ ok: true });
  });
