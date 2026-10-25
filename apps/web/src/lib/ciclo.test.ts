import { describe, expect, it } from 'vitest';
import { estacionDe, fasesPorDia, periodosDe, resumenCiclo } from 'shared';

describe('ciclo menstrual', () => {
  const dias = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'];
  it('junta los días en períodos y promedia', () => {
    expect(periodosDe(dias).map((p) => [p.inicio, p.dias])).toEqual([['2026-08-01', 4], ['2026-08-29', 3], ['2026-09-26', 5]]);
    const r = resumenCiclo(dias, '2026-10-10');
    expect(r).toMatchObject({ duracion_ciclo: 28, duracion_periodo: 4, ciclos: 2, regular: true, dia: 15, en_periodo: false, proxima: '2026-10-24', ovulacion: '2026-10-10', fase: 'ovulatoria', faltan: 14 });
    expect(r.fertil_desde).toBe('2026-10-05');
  });
  it('fases de los días pasados, con los premenstruales', () => {
    const f = fasesPorDia(dias, '2026-08-01', '2026-09-30');
    expect(f.get('2026-08-02')).toEqual({ fase: 'menstrual', premenstrual: false });
    expect(f.get('2026-08-15')?.fase).toBe('ovulatoria');
    expect(f.get('2026-08-27')).toEqual({ fase: 'lutea', premenstrual: true });
  });
  it('sin datos no inventa', () => {
    expect(resumenCiclo([], '2026-10-10')).toMatchObject({ dia: null, proxima: null });
  });
});

describe('estaciones', () => {
  it('al revés en el hemisferio sur', () => {
    expect(estacionDe('2026-10-24', 'America/Argentina/Buenos_Aires')).toBe('primavera');
    expect(estacionDe('2026-10-24', 'Europe/Madrid')).toBe('otono');
    expect(estacionDe('2026-01-10', 'America/Argentina/Cordoba')).toBe('verano');
    expect(estacionDe('2026-12-21', 'America/New_York')).toBe('invierno');
  });
});
