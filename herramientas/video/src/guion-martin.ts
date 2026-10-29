// La historia de Martín: la misma app contada para hombres, con voz masculina. Va con sus propias voces en
// public/voz/martin (`npm run voz -- martin`) y sale como historia-martin.mp4. Lo que descubre es real en los datos de
// ejemplo: dormir poco → dolor de cabeza, y caminar → mejor ánimo.
import type { Escena } from './guion';

export const ESCENAS_MARTIN: Escena[] = [
  {
    clave: 'martin',
    texto: 'Él es Martín. Se levanta cansado, le duele la cabeza seguido… y no sabe bien por qué.',
    pantallas: [],
    cara: 'triste',
    titulo: '¿Por qué ando así?',
    globitos: ['Dormí mal', 'Dolor de cabeza', 'Sin pilas'],
  },
  {
    clave: 'tocar',
    texto: 'Con Patty, contarle cómo te sentís es un toque.',
    pantallas: [{ video: 'tocar.webm' }],
    cara: 'feliz',
    titulo: 'Un toque',
    globitos: ['¿Cómo te sentís?', 'Muy bien'],
  },
  {
    clave: 'voz',
    texto: 'Le cuenta el día con la voz, en diez segundos, y Patty lo ordena solo.',
    pantallas: [{ video: 'voz.webm', desde: 1.5 }],
    cara: 'feliz',
    titulo: 'Con la voz',
    globitos: ['Café con tostadas', 'Ensalada con pollo', 'Caminata 30 min'],
  },
  {
    clave: 'foto',
    texto: 'O le saca una foto al plato: Patty reconoce qué es, la porción y si es frito… y con un toque, queda anotado.',
    pantallas: [{ video: 'foto.webm', desde: 0.3, velocidad: 1.2 }],
    cara: 'feliz',
    titulo: 'Con una foto',
    globitos: ['Milanesa con papas fritas', 'Porción grande', 'Frito'],
    globitosDesde: 2.7,
    globitosHasta: 5.4,
  },
  {
    clave: 'solo',
    texto: 'El resto lo junta solo: el sueño del reloj, los pasos, el clima y sus viajes.',
    pantallas: [{ video: 'dia.webm', desde: 0.6 }, { img: 'mapa.webp' }],
    cara: 'manana',
    titulo: 'Y lo demás, solo',
    globitos: ['7 h 30 min de sueño', '5.980 pasos', '18° y lluvia', '1 viaje'],
  },
  {
    clave: 'patron',
    texto: 'Y un día Patty le avisa algo que él nunca había notado: cuando duerme menos de seis horas le duele la cabeza, y los días que camina anda mucho mejor.',
    pantallas: [{ img: 'patron-sueno.webp' }],
    cara: 'espera',
    titulo: '¡Lo descubrió!',
    globitos: ['Menos de 6 h de sueño → Dolor de cabeza', 'Caminar → Mejor ánimo'],
    globitosAlTitulo: true,
  },
  {
    clave: 'final',
    texto: 'Ahora Martín sabe qué cambiar. Probá Patty gratis en patty punto today.',
    pantallas: [],
    cara: 'feliz',
    titulo: 'patty.today',
  },
];
