// La versión corta para TikTok y Reels (unos 15 segundos): lo de todos los días, cómo se anota y lo que un día te
// avisa, todo rápido.
// Otra voz de mujer (public/voz/corta, `npm run voz -- corta`), un poco más acelerada. Sale como historia-corta.mp4.
import type { Escena } from './guion';

export const ESCENAS_CORTA: Escena[] = [
  {
    clave: 'gancho',
    texto: 'Cada día le contás a Patty cómo va tu día.',
    pantallas: [],
    cara: 'feliz',
    titulo: 'Cada día',
    globitos: ['Lo que comés', 'Cómo dormís', 'Cómo te sentís'],
  },
  {
    clave: 'foto',
    texto: 'Una foto al plato…',
    pantallas: [{ video: 'foto.webm', desde: 0.6, velocidad: 1.8 }],
    cara: 'feliz',
    titulo: 'Una foto',
    globitos: ['Milanesa con papas fritas', 'Frito'],
    globitosDesde: 1.2,
  },
  {
    clave: 'tocar',
    texto: 'un toque para decir cómo estás…',
    pantallas: [{ video: 'tocar.webm', desde: 0.4, velocidad: 1.6 }],
    cara: 'feliz',
    titulo: 'Un toque',
    globitos: ['Muy bien'],
  },
  {
    clave: 'patron',
    texto: 'Y un día, Patty te avisa: frito, calor y período… al otro día, panza.',
    pantallas: [{ img: 'patron.webp' }],
    cara: 'espera',
    titulo: '¡Lo descubrió!',
    globitos: ['Frito', 'Calor', 'Período', '→ Panza'],
    globitosAlTitulo: true,
  },
  {
    clave: 'final',
    texto: 'Patty. Descubrí qué te hace bien.',
    pantallas: [],
    cara: 'feliz',
    titulo: 'patty.today',
  },
];

/** Escenas más cortas y sin pausa entre una y otra. */
export const RITMO_CORTA = { minimo: 1.6, respiro: 0.05 };
