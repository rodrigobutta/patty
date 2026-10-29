// Lo que se mira y se escucha: tele (canal de aire, noticias, películas, series, deportes), música y podcasts.
// Se anota como un registro de duración («Tele» en «Pantalla y redes», «Escuchar música» o «Podcast» en «Música y
// podcasts») con el detalle en `datos.medio` (qué tipo, en qué canal o servicio, el género, el título, la tapa…). Con
// ese detalle se arman conceptos que entran a los patrones sin sumar renglones al Día («Tele: Terror», «Tele en
// Netflix», «Música: Rock»), así Patty puede encontrar cosas como "los días que mirás terror dormís peor".
// Acá no se importa de index.ts (lo exporta él: sería circular).

/** Los registros principales. «Tele» es el de siempre (ver TELE en index.ts). */
export const MUSICA = 'Escuchar música';
export const PODCAST = 'Podcast';
/** Lo que llega solo del teléfono (lo que sonaba o se miraba en Spotify, YouTube, Netflix…): minutos por sesión. */
export const MUSICA_AUTO = 'Música escuchada';
export const PODCAST_AUTO = 'Podcasts escuchados';
export const VIDEO_AUTO = 'Series y videos en el teléfono';
export const CONCEPTOS_ESCUCHA = [MUSICA_AUTO, PODCAST_AUTO, VIDEO_AUTO];

export const TIPOS_MEDIO = ['tele', 'noticias', 'pelicula', 'serie', 'deporte', 'musica', 'podcast'] as const;
export type TipoMedio = (typeof TIPOS_MEDIO)[number];
export const esTipoMedio = (x: unknown): x is TipoMedio => TIPOS_MEDIO.includes(x as TipoMedio);
/** Si se mira (va en «Pantalla y redes», como la tele) o se escucha. */
export const sePantalla = (t: TipoMedio) => t !== 'musica' && t !== 'podcast';

/** El detalle de algo que se miró o escuchó. Todo opcional menos el tipo. */
export interface Medio {
  tipo: TipoMedio;
  /** El tipo de tele tal como se eligió ("Documentales", "Chimentos"): ver TIPOS_DE_TELE. */
  contenido?: string | null;
  /** Canal, plataforma o app: TN, Netflix, Spotify, Radio. */
  servicio?: string | null;
  genero?: string | null;
  /** La película, la serie, el disco o el tema, el programa. */
  titulo?: string | null;
  anio?: number | null;
  /** La tapa o el póster (de iTunes, 600 x 600). */
  tapa?: string | null;
  artista?: string | null;
  album?: string | null;
  deporte?: string | null;
  equipo?: string | null;
  itunes_id?: number | null;
}

/** Lo que devuelve la búsqueda de títulos (iTunes) para elegir la tapa. */
export interface ResultadoMedio {
  itunes_id: number;
  tipo: TipoMedio;
  titulo: string;
  artista: string | null;
  anio: number | null;
  genero: string | null;
  tapa: string | null;
}

export const GENEROS_PANTALLA = ['Comedia', 'Drama', 'Acción', 'Terror', 'Suspenso', 'Romántica', 'Ciencia ficción', 'Animada', 'Documental', 'Aventura', 'Policial', 'Infantil'];
export const DEPORTES = ['Fútbol', 'Tenis', 'Básquet', 'Rugby', 'Fórmula 1', 'Vóley', 'Boxeo', 'Golf'];
export const GENEROS_MUSICA = ['Rock', 'Rock nacional', 'Pop', 'Cumbia', 'Folklore', 'Tango', 'Jazz', 'Clásica', 'Electrónica', 'Reggaetón', 'Trap', 'Cuarteto'];
export const SERVICIOS_MUSICA = ['Spotify', 'YouTube Music', 'Radio', 'Apple Music', 'Deezer', 'Vinilo o CD'];
/** Las plataformas donde se mira algo que no es canal de aire (para preguntar el género y el título). */
export const SERVICIOS_STREAMING = ['Netflix', 'Disney+', 'Prime Video', 'Max', 'YouTube', 'Flow', 'Paramount+', 'Apple TV+', 'Mubi'];

/** El tipo de tele elegido (TIPOS_DE_TELE) como tipo de medio. */
export function tipoMedioDeTele(tipoTele: string | null | undefined): TipoMedio {
  switch (tipoTele) {
    case 'Películas':
      return 'pelicula';
    case 'Series':
      return 'serie';
    case 'Deportes':
      return 'deporte';
    case 'Noticias':
      return 'noticias';
    default:
      return 'tele';
  }
}
const TELE_DE_TIPO: Partial<Record<TipoMedio, string>> = { pelicula: 'Películas', serie: 'Series', deporte: 'Deportes', noticias: 'Noticias' };

/** Si conviene preguntar el género y el título: una película, una serie, o lo que sea en una plataforma. */
export const llevaTitulo = (m: Pick<Medio, 'tipo' | 'servicio'>) =>
  m.tipo === 'pelicula' || m.tipo === 'serie' || m.tipo === 'musica' || m.tipo === 'podcast' || (m.tipo === 'tele' && SERVICIOS_STREAMING.includes(m.servicio ?? ''));

/** El registro principal de cada tipo: «Tele», «Escuchar música» o «Podcast». */
export const conceptoDelMedio = (t: TipoMedio) => (t === 'musica' ? MUSICA : t === 'podcast' ? PODCAST : 'Tele');
/** La categoría donde va: la tele en «Pantalla y redes»; la música y los podcasts, en la suya. */
export const categoriaDelMedio = (t: TipoMedio) => (sePantalla(t) ? 'pantalla' : 'musica');

export const musicaCon = (genero: string) => `Música: ${genero}`;

/**
 * Los conceptos con los que un medio entra a los patrones (la vista serie_diaria los suma con los minutos del
 * registro): el tipo y el canal como siempre («Tele: Películas», «Tele en Netflix»), el género («Tele: Terror»), el
 * deporte y el equipo; en la música, el género («Música: Rock»). Los títulos no: son demasiados para que se repitan.
 */
export function conceptosDelMedio(m: Medio): string[] {
  const l: string[] = [];
  if (sePantalla(m.tipo)) {
    const contenido = m.contenido || TELE_DE_TIPO[m.tipo];
    for (const x of [contenido, m.genero, m.deporte, m.equipo]) if (x) l.push(`Tele: ${x}`);
    if (m.servicio) l.push(`Tele en ${m.servicio}`);
  } else if (m.tipo === 'musica' && m.genero) l.push(musicaCon(m.genero));
  return [...new Set(l)];
}

const txt = (x: unknown, max = 80) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ').slice(0, max) : '') || null;

/** Valida lo que llega (de la app o de la IA): textos cortos, año razonable y tapas solo de iTunes. */
export function limpiarMedio(x: unknown): Medio | null {
  const d = x as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !esTipoMedio(d.tipo)) return null;
  const anio = Number(d.anio);
  const tapa = txt(d.tapa, 400);
  const id = Number(d.itunes_id);
  const m: Medio = {
    tipo: d.tipo,
    contenido: txt(d.contenido, 40),
    servicio: txt(d.servicio, 40),
    genero: txt(d.genero, 40),
    titulo: txt(d.titulo, 120),
    anio: Number.isInteger(anio) && anio > 1880 && anio < 2200 ? anio : null,
    tapa: tapa && esTapaValida(tapa) ? tapa : null,
    artista: txt(d.artista, 80),
    album: txt(d.album, 120),
    deporte: txt(d.deporte, 40),
    equipo: txt(d.equipo, 40),
    itunes_id: Number.isInteger(id) && id > 0 ? id : null,
  };
  // Sin nulos de más: queda chico en la base.
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null && v !== undefined)) as unknown as Medio;
}

/** Las tapas vienen de iTunes (mzstatic.com): es lo único que se guarda y lo único que la API trae para compartir. */
export function esTapaValida(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)mzstatic\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** La tapa más grande: iTunes da 100x100 y se puede pedir otro tamaño cambiando el nombre. */
export const tapaGrande = (url: string, lado = 600) => url.replace(/\/\d+x\d+(bb)?(-\d+)?\.(jpg|png|webp)$/, `/${lado}x${lado}bb.$3`);

// ---- Lo que suena en el teléfono ----

/** Un tramo de algo que sonó o se miró en el teléfono (lo junta EscuchaService, en Android). */
export interface TramoEscucha {
  paquete: string;
  app: string;
  titulo: string;
  artista: string;
  album: string;
  /** Milisegundos. */
  inicio: number;
  fin: number;
}

export type TipoEscucha = 'musica' | 'podcast' | 'video';

const APPS_VIDEO = new Set([
  'com.netflix.mediaclient',
  'com.google.android.youtube',
  'com.google.android.apps.youtube.kids',
  'com.amazon.avod.thirdpartyclient',
  'com.disney.disneyplus',
  'com.wbd.stream',
  'com.hbo.hbonow',
  'com.cbs.app',
  'com.apple.atve.androidtv.appletv',
  'tv.twitch.android.app',
  'com.mubi',
  'tv.pluto.android',
  'com.google.android.videos',
]);
const APPS_PODCAST = new Set([
  'com.google.android.apps.podcasts',
  'au.com.shiftyjelly.pocketcasts',
  'fm.castbox.audiobook.radio.podcast',
  'com.bambuna.podcastaddict',
  'com.spreaker.android',
  'com.ivoox.app',
]);

/** Si lo que sonaba es música, un podcast o un video (serie, película, YouTube), por la app. */
export function tipoDeEscucha(paquete: string, app = ''): TipoEscucha {
  if (APPS_VIDEO.has(paquete) || /netflix|disney|prime video|hbo|\bmax\b|paramount|twitch|mubi|pluto|\bflow\b|^youtube$/i.test(app)) return 'video';
  if (APPS_PODCAST.has(paquete) || /podcast|ivoox|spreaker/i.test(app)) return 'podcast';
  return 'musica';
}

/** Una sesión de escucha: tramos seguidos del mismo tipo, sin cortes largos. */
export interface SesionEscucha {
  tipo: TipoEscucha;
  inicio: number;
  fin: number;
  /** Lo que sonó de verdad (sin los cortes del medio). */
  minutos: number;
  apps: string[];
  pistas: Array<{ titulo: string; artista: string; album: string; app: string; inicio: number; minutos: number }>;
}

/** Hasta cuánto corte (en minutos) se sigue en la misma sesión. */
export const CORTE_SESION_MIN = 10;

/**
 * Junta los tramos en sesiones: los del mismo tipo que empiezan a menos de CORTE_SESION_MIN del final de la sesión van
 * juntos (un disco entero es una sola cosa, no 12). Un mismo tema que sigue (por una pausa corta) suma a la pista.
 */
export function agruparEscuchas(tramos: TramoEscucha[], corteMin = CORTE_SESION_MIN): SesionEscucha[] {
  const orden = [...tramos].filter((x) => x.fin > x.inicio).sort((a, b) => a.inicio - b.inicio);
  const abiertas = new Map<TipoEscucha, SesionEscucha>();
  const listas: SesionEscucha[] = [];
  for (const x of orden) {
    const tipo = tipoDeEscucha(x.paquete, x.app);
    const min = (x.fin - x.inicio) / 60000;
    let s = abiertas.get(tipo);
    if (!s || x.inicio - s.fin > corteMin * 60000) {
      s = { tipo, inicio: x.inicio, fin: x.fin, minutos: 0, apps: [], pistas: [] };
      abiertas.set(tipo, s);
      listas.push(s);
    }
    s.fin = Math.max(s.fin, x.fin);
    s.minutos += min;
    if (!s.apps.includes(x.app)) s.apps.push(x.app);
    const ultima = s.pistas.at(-1);
    if (ultima && ultima.titulo === x.titulo && ultima.artista === x.artista) ultima.minutos += min;
    else s.pistas.push({ titulo: x.titulo, artista: x.artista, album: x.album, app: x.app, inicio: x.inicio, minutos: min });
  }
  return listas.map((s) => ({ ...s, minutos: Math.round(s.minutos * 10) / 10, pistas: s.pistas.map((p) => ({ ...p, minutos: Math.round(p.minutos * 10) / 10 })) }));
}

/** El concepto automático de cada tipo de sesión. */
export const conceptoDeEscucha = (t: TipoEscucha) => (t === 'video' ? VIDEO_AUTO : t === 'podcast' ? PODCAST_AUTO : MUSICA_AUTO);
