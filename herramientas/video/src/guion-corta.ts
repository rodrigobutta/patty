// La versión corta para TikTok y Reels (unos 20 segundos): un gancho, cómo se anota y lo que descubre, todo rápido.
// Otra voz de mujer (public/voz/corta, `npm run voz -- corta`), un poco más acelerada. Sale como historia-corta.mp4.
import type { Escena } from './guion';

export const ESCENAS_CORTA: Escena[] = [
  {
    clave: 'gancho',
    texto: '¿Te duele la panza y no sabés por qué?',
    pantallas: [],
    cara: 'triste',
    titulo: '¿Por qué?',
    globitos: ['Me duele la panza', 'Otra vez'],
  },
  {
    clave: 'foto',
    texto: 'Le sacás una foto a lo que comés…',
    pantallas: [{ video: 'foto.webm', desde: 0.6, velocidad: 1.8 }],
    cara: 'feliz',
    titulo: 'Una foto',
    globitos: ['Milanesa con papas fritas', 'Frito'],
    globitosDesde: 1.2,
  },
  {
    clave: 'tocar',
    texto: 'contás cómo te sentís con un toque…',
    pantallas: [{ video: 'tocar.webm', desde: 0.4, velocidad: 1.6 }],
    cara: 'feliz',
    titulo: 'Un toque',
    globitos: ['Muy bien'],
  },
  {
    clave: 'patron',
    texto: 'y Patty te avisa: frito, calor y período… al otro día, panza.',
    pantallas: [{ img: 'patron.webp' }],
    cara: 'espera',
    titulo: '¡Lo descubrió!',
    globitos: ['Frito', 'Calor', 'Período', '→ Panza'],
    globitosAlTitulo: true,
  },
  {
    clave: 'final',
    texto: 'Patty. Pedí tu invitación en patty punto today.',
    pantallas: [],
    cara: 'feliz',
    titulo: 'patty.today',
  },
];

/** Escenas más cortas y sin pausa entre una y otra. */
export const RITMO_CORTA = { minimo: 1.6, respiro: 0.05 };
