import { describe, expect, it } from 'vitest';
import { caraSegun, esDeNoche } from './cara';
import { svgMascota } from './dibujo';

const a = (h: number, m = 0) => new Date(2026, 9, 26, h, m);
const mediodia = a(12);

describe('la cara de la mascota', () => {
  it('contenta si anotó hoy, esperando hasta dos días, triste después o si nunca anotó', () => {
    expect(caraSegun('2026-10-24', '2026-10-24', null, mediodia)).toBe('feliz');
    expect(caraSegun('2026-10-23', '2026-10-24', null, mediodia)).toBe('espera');
    expect(caraSegun('2026-10-22', '2026-10-24', null, mediodia)).toBe('espera');
    expect(caraSegun('2026-10-21', '2026-10-24', null, mediodia)).toBe('triste');
    expect(caraSegun(null, '2026-10-24', null, mediodia)).toBe('triste');
  });

  it('tiene sueño desde la hora de dormir hasta las 6', () => {
    expect(esDeNoche(null, a(23, 30))).toBe(true);
    expect(esDeNoche(null, a(22, 0))).toBe(false);
    expect(esDeNoche(22 * 60, a(22, 30))).toBe(true);
    expect(esDeNoche(30, a(0, 10))).toBe(false); // se acuesta 0:30
    expect(esDeNoche(30, a(1, 0))).toBe(true);
    expect(esDeNoche(30, a(15, 0))).toBe(false);
    expect(caraSegun('2026-10-26', '2026-10-26', null, a(2, 0))).toBe('dormida');
  });

  it('dibuja un SVG distinto para cada cara', () => {
    const caras = new Set((['feliz', 'espera', 'triste', 'enojada', 'dormida'] as const).map((c) => svgMascota(c)));
    expect(caras.size).toBe(5);
    expect(svgMascota('feliz', { lado: 48 })).toMatch(/^<svg [^>]*width="48"/);
  });
});
