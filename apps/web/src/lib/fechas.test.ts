import { hoyEn, instanteDelDia, instanteLocal, sumarDias } from './fechas';

describe('fechas', () => {
  it('hora local a instante, también en la madrugada del día de Patty', () => {
    expect(instanteLocal('2026-10-24', '13:00', 'America/Argentina/Buenos_Aires')).toBe('2026-10-24T16:00:00.000Z');
    // 1:30 "del 24" es la madrugada del 25
    expect(instanteDelDia('2026-10-24', '01:30', 'America/Argentina/Buenos_Aires')).toBe('2026-10-25T04:30:00.000Z');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(hoyEn('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
