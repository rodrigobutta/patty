// Tele, películas, series, deportes, música y podcasts (ver medios.ts): los datos, la carga, el Día, compartir y lo que
// suena en el teléfono. Acá no se puede importar de index.ts (es circular): las listas van escritas.

const GENEROS: Record<string, string> = {
  Comedia: 'Comedy',
  Drama: 'Drama',
  Acción: 'Action',
  Terror: 'Horror',
  Suspenso: 'Thriller',
  Romántica: 'Romance',
  'Ciencia ficción': 'Sci-fi',
  Animada: 'Animated',
  Documental: 'Documentary',
  Aventura: 'Adventure',
  Policial: 'Crime',
  Infantil: 'Kids',
  Fútbol: 'Football',
  Tenis: 'Tennis',
  Básquet: 'Basketball',
  Rugby: 'Rugby',
  'Fórmula 1': 'Formula 1',
  Vóley: 'Volleyball',
  Boxeo: 'Boxing',
  Golf: 'Golf',
};
const MUSICA: Record<string, string> = {
  Rock: 'Rock',
  'Rock nacional': 'Argentine rock',
  Pop: 'Pop',
  Cumbia: 'Cumbia',
  Folklore: 'Folk',
  Tango: 'Tango',
  Jazz: 'Jazz',
  Clásica: 'Classical',
  Electrónica: 'Electronic',
  Reggaetón: 'Reggaeton',
  Trap: 'Trap',
  Cuarteto: 'Cuarteto',
  Radio: 'Radio',
  'Vinilo o CD': 'Vinyl or CD',
};

export const MEDIOS: Record<string, string> = {
  ...GENEROS,
  ...MUSICA,
  ...Object.fromEntries(Object.entries(GENEROS).map(([es, en]) => [`Tele: ${es}`, `TV: ${en}`])),
  ...Object.fromEntries(Object.entries(MUSICA).map(([es, en]) => [`Música: ${es}`, `Music: ${en}`])),
  // Datos
  'Música y podcasts': 'Music and podcasts',
  'Escuchar música': 'Listening to music',
  Podcast: 'Podcast',
  'Música escuchada': 'Music listened',
  'Podcasts escuchados': 'Podcasts listened',
  'Series y videos en el teléfono': 'Shows and videos on the phone',
  // Servidor
  'Mandá una lista "escuchas" (hasta 3000 por vez).': 'Send an "escuchas" list (up to 3000 at a time).',
  'Esa tapa no es de iTunes.': 'That cover is not from iTunes.',
  'No se pudo traer la tapa.': 'Could not fetch the cover.',
  '¿Qué tipo de cosa buscás?': 'What kind of thing are you looking for?',
  'Falta el día.': 'The day is missing.',
};
