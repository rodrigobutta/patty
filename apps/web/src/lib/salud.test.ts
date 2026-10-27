import type { HealthSample } from '@capgo/capacitor-health';
import { horaComoNumero, resumenDeSueno } from './salud';

const sesion = (inicio: string, fin: string, etapas?: Array<[string, string, string]>): HealthSample => ({
  dataType: 'sleep',
  value: 0,
  unit: 'minute',
  startDate: inicio,
  endDate: fin,
  stages: etapas?.map(([s, e, stage]) => ({ startDate: s, endDate: e, stage: stage as 'deep', durationMinutes: (Date.parse(e) - Date.parse(s)) / 60000 })),
});

describe('el sueño de una noche', () => {
  it('suma lo dormido por etapas y saca la hora de dormir y de despertar de la noche principal', () => {
    const r = resumenDeSueno([
      sesion('2026-10-23T23:30:00', '2026-10-24T07:00:00', [
        ['2026-10-23T23:30:00', '2026-10-24T02:00:00', 'light'],
        ['2026-10-24T02:00:00', '2026-10-24T03:30:00', 'deep'],
        ['2026-10-24T03:30:00', '2026-10-24T04:00:00', 'awake'],
        ['2026-10-24T04:00:00', '2026-10-24T07:00:00', 'rem'],
      ]),
    ]);
    const v = Object.fromEntries(r.map((m) => [m.concepto, m.valor]));
    expect(v).toMatchObject({ 'Horas de sueño': 7, 'Hora de dormir': 23.5, 'Hora de despertar': 7, 'Sueño profundo': 90, 'Sueño REM': 180, 'Despierto en la noche': 30 });
  });

  it('sin etapas usa la duración, y si se durmió después de medianoche la hora queda como 24 + hora', () => {
    const r = resumenDeSueno([sesion('2026-10-24T01:00:00', '2026-10-24T08:00:00')]);
    const v = Object.fromEntries(r.map((m) => [m.concepto, m.valor]));
    expect(v).toEqual({ 'Horas de sueño': 7, 'Hora de dormir': 25, 'Hora de despertar': 8 });
    expect(horaComoNumero(new Date('2026-10-24T13:15:00'), true)).toBe(13.3);
    expect(resumenDeSueno([])).toEqual([]);
  });
});

describe('etapas de la noche', () => {
  it('cada etapa con su hora; sin etapas, la sesión entera como dormido', async () => {
    const { etapasDeLaNoche } = await import('./salud');
    const conEtapas = {
      startDate: '2026-10-26T02:00:00Z',
      endDate: '2026-10-26T10:00:00Z',
      stages: [
        { startDate: '2026-10-26T02:00:00Z', endDate: '2026-10-26T04:00:00Z', stage: 'deep', durationMinutes: 120 },
        { startDate: '2026-10-26T04:00:00Z', endDate: '2026-10-26T04:15:00Z', stage: 'awake', durationMinutes: 15 },
        { startDate: '2026-10-26T04:15:00Z', endDate: '2026-10-26T10:00:00Z', stage: 'light', durationMinutes: 345 },
      ],
    };
    expect(etapasDeLaNoche([conEtapas as never]).map((e) => e.etapa)).toEqual(['profundo', 'despierto', 'ligero']);
    expect(etapasDeLaNoche([{ startDate: '2026-10-26T02:00:00Z', endDate: '2026-10-26T10:00:00Z' } as never])).toEqual([
      { inicio: '2026-10-26T02:00:00Z', fin: '2026-10-26T10:00:00Z', etapa: 'dormido' },
    ]);
  });
});
