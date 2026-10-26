import { describe, expect, it } from 'vitest';
import { caraSegun, esDeNoche } from './cara';

const a = (h: number, m = 0) => new Date(2026, 9, 26, h, m);

describe('la cara de la noche', () => {
  it('tiene sueño desde la hora de dormir hasta las 6', () => {
    expect(esDeNoche(null, a(23, 30))).toBe(true);
    expect(esDeNoche(null, a(22, 0))).toBe(false);
    expect(esDeNoche(22 * 60, a(22, 30))).toBe(true);
    expect(esDeNoche(30, a(0, 10))).toBe(false); // se acuesta 0:30
    expect(esDeNoche(30, a(1, 0))).toBe(true);
    expect(esDeNoche(30, a(15, 0))).toBe(false);
    expect(caraSegun('2026-10-26', '2026-10-26', null, a(2, 0))).toBe('dormida');
    expect(caraSegun('2026-10-26', '2026-10-26', null, a(12, 0))).toBe('feliz');
  });
});
