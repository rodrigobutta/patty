// Las tapas de películas, series, discos y podcasts: se buscan en la API de búsqueda de iTunes (gratis, sin clave).
// Cada búsqueda se guarda un mes en medios_cache (la misma no se repite) y, si iTunes no contesta, no pasa nada: se
// anota igual, sin tapa. La tienda de Argentina trae los títulos en castellano ("Duna", "Acción y Aventura"), pero
// casi no tiene series: esas se buscan en la de Estados Unidos. Los filtros `media` de iTunes a veces no devuelven
// nada, así que se busca sin filtro y se elige por el tipo de cada resultado.
import { sql } from 'drizzle-orm';
import { normalizar, tapaGrande, type ResultadoMedio, type TipoMedio } from 'shared';
import { una, type Db, type Tx } from '../db/client.js';

const URL_ITUNES = 'https://itunes.apple.com/search';
const DURA_CACHE_DIAS = 30;
const ESPERA_MS = 4000;

interface Item {
  wrapperType?: string;
  kind?: string;
  collectionType?: string;
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
}

interface Intento {
  params: Record<string, string>;
  sirve(x: Item): boolean;
  armar(x: Item): ResultadoMedio | null;
}

const anio = (x: Item) => (x.releaseDate ? Number(x.releaseDate.slice(0, 4)) || null : null);
const tapa = (x: Item) => (x.artworkUrl600 || x.artworkUrl100 ? tapaGrande((x.artworkUrl600 || x.artworkUrl100)!) : null);

/** Cómo se busca cada tipo: en qué tienda, con qué filtro y qué resultados sirven. */
function intentos(tipo: TipoMedio, q: string): Intento[] {
  const base = { term: q, limit: '15' };
  const pelicula = (pais: string): Intento => ({
    params: { ...base, country: pais },
    sirve: (x) => x.kind === 'feature-movie',
    armar: (x) => ({ itunes_id: x.trackId!, tipo: 'pelicula', titulo: x.trackName!, artista: x.artistName ?? null, anio: anio(x), genero: x.primaryGenreName ?? null, tapa: tapa(x) }),
  });
  const temporada = (pais: string): Intento => ({
    params: { ...base, country: pais, media: 'tvShow', entity: 'tvSeason' },
    sirve: (x) => x.collectionType === 'TV Season' || x.wrapperType === 'collection',
    // La serie es la "artista" de cada temporada: queda una por serie (la tapa, la de la temporada que vino primero).
    armar: (x) => ({ itunes_id: x.artistId ?? x.collectionId!, tipo: 'serie', titulo: x.artistName ?? x.collectionName!.replace(/,\s*(Season|Temporada).*$/i, ''), artista: null, anio: anio(x), genero: x.primaryGenreName ?? null, tapa: tapa(x) }),
  });
  switch (tipo) {
    case 'pelicula':
      return [pelicula('AR'), pelicula('US')];
    case 'serie':
    case 'tele':
      return [temporada('US'), temporada('AR')];
    case 'musica':
      return [
        {
          params: { ...base, country: 'AR', media: 'music', entity: 'album' },
          sirve: (x) => x.wrapperType === 'collection',
          armar: (x) => ({ itunes_id: x.collectionId!, tipo: 'musica', titulo: x.collectionName!, artista: x.artistName ?? null, anio: anio(x), genero: x.primaryGenreName ?? null, tapa: tapa(x) }),
        },
      ];
    case 'podcast':
      return [
        {
          params: { ...base, country: 'AR', media: 'podcast' },
          sirve: (x) => x.kind === 'podcast' || x.wrapperType === 'track',
          armar: (x) => ({ itunes_id: x.collectionId ?? x.trackId!, tipo: 'podcast', titulo: x.collectionName ?? x.trackName!, artista: x.artistName ?? null, anio: anio(x), genero: x.primaryGenreName ?? null, tapa: tapa(x) }),
        },
      ];
    default:
      return [];
  }
}

async function pedir(params: Record<string, string>): Promise<Item[]> {
  const r = await fetch(`${URL_ITUNES}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(ESPERA_MS) });
  if (!r.ok) throw new Error(`iTunes ${r.status}`);
  const d = (await r.json()) as { results?: Item[] };
  return Array.isArray(d.results) ? d.results : [];
}

/**
 * Busca un título en iTunes: hasta 6 resultados, el más probable primero. Nunca falla: sin conexión o con iTunes
 * caído devuelve una lista vacía (y no la guarda, así se vuelve a probar).
 */
export async function buscarMedios(db: Db | Tx, tipo: TipoMedio, texto: string): Promise<ResultadoMedio[]> {
  const q = texto.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (q.length < 2) return [];
  const clave = `${tipo}|${normalizar(q)}`;
  const guardado = await una<{ resultado: ResultadoMedio[] }>(
    db,
    sql`SELECT resultado FROM medios_cache WHERE clave = ${clave} AND creado > now() - make_interval(days => ${DURA_CACHE_DIAS})`,
  );
  if (guardado) return guardado.resultado;
  const lista: ResultadoMedio[] = [];
  let respondio = false;
  for (const i of intentos(tipo, q)) {
    try {
      const items = await pedir(i.params);
      respondio = true;
      for (const x of items.filter(i.sirve)) {
        const r = i.armar(x);
        if (r?.titulo && r.itunes_id && !lista.some((y) => y.itunes_id === r.itunes_id || (y.titulo === r.titulo && y.anio === r.anio))) lista.push(r);
      }
    } catch {
      /* iTunes no contestó: se prueba el siguiente */
    }
    if (lista.length) break;
  }
  const resultado = lista.slice(0, 6);
  if (respondio) {
    await db.execute(
      sql`INSERT INTO medios_cache (clave, resultado) VALUES (${clave}, ${JSON.stringify(resultado)}::jsonb)
          ON CONFLICT (clave) DO UPDATE SET resultado = excluded.resultado, creado = now()`,
    );
  }
  return resultado;
}

/**
 * El género de iTunes llevado a los de Patty cuando se parecen ("Acción y Aventura" → Acción, "Sci-Fi & Fantasy" →
 * Ciencia ficción); si no, queda el de iTunes tal cual (en la música, "Alternativa y rock en español").
 */
export function generoDeItunes(g: string | null | undefined): string | null {
  if (!g) return null;
  const n = normalizar(g);
  const tabla: Array<[RegExp, string]> = [
    [/terror|horror/, 'Terror'],
    [/ciencia ficcion|sci fi|science fiction|fantas/, 'Ciencia ficción'],
    [/accion|action/, 'Acción'],
    [/comedia|comedy/, 'Comedia'],
    [/suspenso|thriller|misterio|mystery/, 'Suspenso'],
    [/romant|romance/, 'Romántica'],
    [/anima|kids|infantil|famil/, 'Animada'],
    [/documental|documentar/, 'Documental'],
    [/policial|crime|crimen/, 'Policial'],
    [/aventura|adventure/, 'Aventura'],
    [/drama/, 'Drama'],
  ];
  return tabla.find(([r]) => r.test(n))?.[1] ?? g;
}
