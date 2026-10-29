// La historia de Sofía: lo que dice la voz en cada escena y qué se ve. La voz se genera con `npm run voz` (ElevenLabs)
// y queda en public/voz/<clave>.mp3, con su duración en public/voz/duraciones.json; sin voz, cada escena dura lo que
// tarda leerla en voz alta, más o menos.

export type Pantalla = { img: string; video?: string };

export interface Escena {
  clave: string;
  /** Lo que dice la voz (y los subtítulos). */
  texto: string;
  /** Una o dos pantallas de la app (de apps/web/public/presentacion). Sin pantallas: el búho solo. */
  pantallas: Pantalla[];
  /** La cara del búho que acompaña. */
  cara: 'feliz' | 'espera' | 'triste' | 'dormida' | 'manana';
  /** Un título corto que queda grande al costado (opcional). */
  titulo?: string;
}

export const ESCENAS: Escena[] = [
  {
    clave: 'sofia',
    texto: 'Ella es Sofía. Duerme mal, le duele la cabeza seguido… y no sabe bien por qué.',
    pantallas: [],
    cara: 'triste',
    titulo: '¿Por qué me siento así?',
  },
  {
    clave: 'tocar',
    texto: 'Con Patty, anotar es un toque: cómo se siente, un café, lo que almorzó.',
    pantallas: [{ img: 'dia.webp', video: 'tocar.webm' }],
    cara: 'feliz',
    titulo: 'Anotar es un toque',
  },
  {
    clave: 'voz',
    texto: 'O se lo cuenta con la voz, como a una amiga, y Patty lo ordena solita.',
    pantallas: [{ img: 'contar.webp', video: 'voz.webm' }],
    cara: 'feliz',
    titulo: 'Contalo como te salga',
  },
  {
    clave: 'solo',
    texto: 'El resto lo junta sola: cómo durmió, los pasos, el clima y por dónde anduvo.',
    pantallas: [{ img: 'widgets.webp' }, { img: 'mapa.webp' }],
    cara: 'manana',
    titulo: 'Y lo demás, solo',
  },
  {
    clave: 'patron',
    texto: 'Y un día le avisa: “Los días que tomás café después de las cinco, dormís peor”.',
    pantallas: [{ img: 'patrones.webp', video: 'descubrir.webm' }],
    cara: 'espera',
    titulo: 'Lo que va junto, a la vista',
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
/** Un respiro entre escena y escena (segundos). */
export const RESPIRO = 0.5;

/** Cuántos segundos dura cada escena: lo que dura su voz, o lo que lleva leerla. */
export function duraciones(voz: Record<string, number> | null): number[] {
  return ESCENAS.map((e) => {
    const s = voz?.[e.clave] ?? e.texto.split(/\s+/).length / 2.6;
    return Math.max(3, s) + RESPIRO;
  });
}
