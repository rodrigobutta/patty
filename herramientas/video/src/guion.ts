// La historia de Sofía: lo que dice la voz en cada escena y qué se ve. La voz se genera con `npm run voz` (ElevenLabs)
// y queda en public/voz/<clave>.mp3, con su duración en public/voz/duraciones.json; sin voz, cada escena dura lo que
// tarda leerla en voz alta, más o menos. Las tomas de la app salen de `node capturar.mjs` (public/tomas).

/** Una pantalla de la app: una captura, o un video (de public/tomas). */
export type Pantalla = { img?: string; video?: string; desde?: number };

/** Un acercamiento a una parte de la pantalla, a la mitad de la escena (x, y: el centro, de 0 a 1; escala). */
export type Zoom = { x: number; y: number; escala: number };

export interface Escena {
  clave: string;
  /** Lo que dice la voz (y los subtítulos). */
  texto: string;
  /** Una o dos pantallas de la app. Sin pantallas: el búho solo, grande. */
  pantallas: Pantalla[];
  /** La cara del búho que acompaña. */
  cara: 'feliz' | 'espera' | 'triste' | 'dormida' | 'manana';
  /** El título grande de la escena. */
  titulo: string;
  /** Los globitos que van apareciendo alrededor (lo que anota o lo que junta Patty). */
  globitos?: string[];
  zoom?: Zoom;
}

export const ESCENAS: Escena[] = [
  {
    clave: 'sofia',
    texto: 'Ella es Sofía. Duerme mal, le duele la panza seguido… y no sabe por qué.',
    pantallas: [],
    cara: 'triste',
    titulo: '¿Por qué me siento así?',
    globitos: ['Dormí mal', 'Me duele la panza', 'Sin energía'],
  },
  {
    clave: 'tocar',
    texto: 'Con Patty, contar cómo se siente es un toque.',
    pantallas: [{ video: 'tocar.webm' }],
    cara: 'feliz',
    titulo: 'Un toque',
    globitos: ['¿Cómo te sentís?', 'Muy bien'],
  },
  {
    clave: 'voz',
    texto: 'Le cuenta su día con la voz, como a una amiga, y Patty lo ordena solita.',
    pantallas: [{ video: 'voz.webm', desde: 1.5 }],
    cara: 'feliz',
    titulo: 'Con la voz',
    globitos: ['Café con tostadas', 'Ensalada con pollo', 'Caminata 30 min'],
  },
  {
    clave: 'foto',
    texto: 'Le saca una foto al plato, y Patty sabe qué comió.',
    pantallas: [{ video: 'foto.webm', desde: 1 }],
    cara: 'feliz',
    titulo: 'Con una foto',
    globitos: ['Milanesa con papas fritas', 'Porción grande', 'Frito'],
  },
  {
    clave: 'solo',
    texto: 'El resto lo junta sola: el sueño, los pasos, el clima y sus viajes.',
    pantallas: [{ video: 'dia.webm', desde: 0.6 }, { img: 'mapa.webp' }],
    cara: 'manana',
    titulo: 'Y lo demás, solo',
    globitos: ['7 h 30 min de sueño', '5.776 pasos', '23° y sol', '1 viaje'],
  },
  {
    clave: 'patron',
    texto: 'Y un día le avisa: “cuando comés frito, a la tarde te duele la panza”.',
    pantallas: [{ img: 'patron.webp' }],
    cara: 'espera',
    titulo: '¡Lo descubrió!',
    globitos: ['Comida frita', 'Dolor de panza a la tarde'],
    zoom: { x: 0.5, y: 0.2, escala: 1.18 },
  },
  {
    clave: 'final',
    texto: '¡Ahora Sofía sabe qué le hace bien! Probá Patty gratis en patty punto today.',
    pantallas: [],
    cara: 'feliz',
    titulo: 'patty.today',
  },
];

export const FPS = 30;
/** Cuánto se pisan dos escenas en la transición (cuadros). */
export const TRANSICION = 14;

/** Cuántos segundos dura cada escena: lo que dura su voz (más un respiro), o lo que lleva leerla. */
export function duraciones(voz: Record<string, number> | null): number[] {
  return ESCENAS.map((e) => {
    const s = voz?.[e.clave] ?? e.texto.split(/\s+/).length / 2.6;
    return Math.max(2.8, s) + 0.35 + TRANSICION / FPS;
  });
}
