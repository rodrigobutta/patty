import { caraSegun } from './cara';
import { svgMascota } from './dibujo';

describe('la cara de la mascota', () => {
  it('contenta si anotó hoy, esperando hasta dos días, triste después o si nunca anotó', () => {
    expect(caraSegun('2026-10-24', '2026-10-24')).toBe('feliz');
    expect(caraSegun('2026-10-23', '2026-10-24')).toBe('espera');
    expect(caraSegun('2026-10-22', '2026-10-24')).toBe('espera');
    expect(caraSegun('2026-10-21', '2026-10-24')).toBe('triste');
    expect(caraSegun(null, '2026-10-24')).toBe('triste');
  });

  it('dibuja un SVG distinto para cada cara', () => {
    const caras = new Set((['feliz', 'espera', 'triste'] as const).map((c) => svgMascota(c)));
    expect(caras.size).toBe(3);
    expect(svgMascota('feliz', { lado: 48 })).toMatch(/^<svg [^>]*width="48"/);
  });
});
