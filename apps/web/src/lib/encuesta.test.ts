import { esHoraDeEncuesta } from './encuesta';

const a = (h: number, m = 0) => new Date(2026, 9, 24, h, m);

describe('encuesta de la noche', () => {
  it('se pregunta desde la hora elegida hasta las 5 de la mañana', () => {
    const c = { activa: true, hora: '22:00' };
    expect(esHoraDeEncuesta(a(21, 59), c)).toBe(false);
    expect(esHoraDeEncuesta(a(22, 0), c)).toBe(true);
    expect(esHoraDeEncuesta(a(2, 30), c)).toBe(true);
    expect(esHoraDeEncuesta(a(5, 0), c)).toBe(false);
    expect(esHoraDeEncuesta(a(23), { activa: false, hora: '22:00' })).toBe(false);
  });
});
