import { describe, expect, it } from 'vitest';
import { diasDelCiclo, estacionDe, fasesPorDia, periodosDe, resumenCiclo, type RespuestaCiclo } from 'shared';

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

describe('el calendario del ciclo', () => {
  // Tres períodos con el fin confirmado: 29/8 (4 días), 26/9 (5 días, del 26 al 30) y 24/10 (4 días, cruza al 27).
  const dias = ['2026-08-29', '2026-09-26', '2026-10-24'];
  const fines = ['2026-09-01', '2026-09-30', '2026-10-27'];

  it('un fin confirmado cierra y estira el período, aunque no se hayan anotado todos los días', () => {
    expect(periodosDe(dias, fines).map((p) => [p.inicio, p.fin, p.dias, p.terminado])).toEqual([
      ['2026-08-29', '2026-09-01', 4, true],
      ['2026-09-26', '2026-09-30', 5, true],
      ['2026-10-24', '2026-10-27', 4, true],
    ]);
    // Un fin que no tiene un período que haya empezado hasta 14 días antes no cuenta.
    expect(periodosDe(['2026-10-01'], ['2026-10-20'])[0]).toMatchObject({ fin: '2026-10-01', terminado: false });
  });

  it('usa el promedio de sus ciclos y de sus períodos, y lo dice cuando son los típicos', () => {
    const r = resumenCiclo(dias, '2026-11-03', { fines });
    expect(r).toMatchObject({ duracion_ciclo: 28, duracion_periodo: 4, ciclos: 2, tipico_ciclo: false, tipico_periodo: false, ciclo_min: 28, ciclo_max: 28, regular: true, proxima: '2026-11-21' });
    expect(r.historial).toEqual([
      { inicio: '2026-08-29', ciclo: 28, periodo: 4 },
      { inicio: '2026-09-26', ciclo: 28, periodo: 5 },
      { inicio: '2026-10-24', ciclo: null, periodo: 4 },
    ]);
    const solo = resumenCiclo(['2026-10-24'], '2026-10-25');
    expect(solo).toMatchObject({ tipico_ciclo: true, tipico_periodo: true, duracion_ciclo: 28, duracion_periodo: 5, en_periodo: true });
  });

  it('pinta noviembre: lo anotado de octubre no se ve, la próxima es estimada y la ventana fértil cruza el cambio de mes', () => {
    const r = resumenCiclo(dias, '2026-11-03', { fines });
    const nov = diasDelCiclo(r, '2026-11-01', '2026-11-30');
    const dia = (f: string) => nov.find((d) => d.fecha === f);
    expect(nov.every((d) => d.fecha >= '2026-11-01' && d.fecha <= '2026-11-30')).toBe(true);
    expect(nov.some((d) => d.periodo === 'confirmado')).toBe(false);
    // Ovulación del ciclo actual: 14 días antes del 21/11 = 7/11; fértiles del 2 al 8 (y el 30, del ciclo que sigue).
    expect(dia('2026-11-07')).toMatchObject({ ovulacion: true, fertil: true });
    expect(nov.filter((d) => d.fertil).map((d) => d.fecha)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-30']);
    // La del ciclo siguiente (próxima el 19/12, ovulación el 5/12) empieza el 30/11 y sigue en diciembre.
    expect(diasDelCiclo(r, '2026-12-01', '2026-12-15').filter((d) => d.fertil).map((d) => d.fecha)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
    expect(dia('2026-11-16')?.premenstrual).toBe(true);
    expect(dia('2026-11-21')).toMatchObject({ proxima: true, periodo: 'estimado' });
    expect(nov.filter((d) => d.periodo === 'estimado').map((d) => d.fecha)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    // Octubre: lo anotado (del 24 al 27, con el fin) es confirmado; el ciclo que terminó tiene su ovulación estimada.
    const oct = diasDelCiclo(r, '2026-10-01', '2026-10-31');
    expect(oct.filter((d) => d.periodo === 'confirmado').map((d) => d.fecha)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(oct.find((d) => d.fecha === '2026-10-24')).toMatchObject({ inicio: true });
    expect(oct.find((d) => d.fecha === '2026-10-27')).toMatchObject({ fin: true });
    expect(oct.find((d) => d.fecha === '2026-10-10')?.ovulacion).toBe(true);
  });

  it('un período recién empezado: lo que falta es estimado, y del 30/12 sigue en enero', () => {
    const r = resumenCiclo(['2026-12-30'], '2026-12-30');
    const d = diasDelCiclo(r, '2026-12-01', '2027-01-31');
    expect(d.filter((x) => x.periodo === 'confirmado').map((x) => x.fecha)).toEqual(['2026-12-30']);
    expect(d.filter((x) => x.periodo === 'estimado' && x.fecha < '2027-01-10').map((x) => x.fecha)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    expect(r.proxima).toBe('2027-01-27');
    expect(d.find((x) => x.fecha === '2027-01-27')?.proxima).toBe(true);
  });

  it('"todavía no" corre la próxima dos días y no pregunta hasta entonces; si se atrasa mucho, sugiere consultarlo', () => {
    const base = resumenCiclo(dias, '2026-11-21', { fines });
    expect(base.pregunta).toEqual({ tipo: 'inicio', estimada: '2026-11-21' });
    const respuestas: RespuestaCiclo[] = [{ tipo: 'todavia_no', referencia: '2026-10-24', fecha: '2026-11-21' }];
    const r = resumenCiclo(dias, '2026-11-22', { fines, respuestas });
    expect(r).toMatchObject({ pregunta: null, proxima: '2026-11-23', proxima_calculada: '2026-11-21', atraso: 1, faltan: 1 });
    // En el calendario, la próxima estimada se corre (y la anterior ya no aparece).
    const cal = diasDelCiclo(r, '2026-11-01', '2026-11-30');
    expect(cal.find((d) => d.fecha === '2026-11-21')?.proxima).toBe(false);
    expect(cal.find((d) => d.fecha === '2026-11-23')?.proxima).toBe(true);
    expect(resumenCiclo(dias, '2026-11-23', { fines, respuestas }).pregunta).toMatchObject({ tipo: 'inicio' });
    // Una respuesta de otro ciclo no corre nada.
    expect(resumenCiclo(dias, '2026-11-22', { fines, respuestas: [{ ...respuestas[0], referencia: '2026-09-26' }] }).pregunta).toMatchObject({ tipo: 'inicio' });
    const tarde = resumenCiclo(dias, '2026-12-06', { fines });
    expect(tarde.atraso).toBe(15);
    expect(tarde.consultar).toContain('atraso');
    // Estando atrasada, la próxima estimada se muestra desde hoy, no en el pasado.
    expect(diasDelCiclo(tarde, '2026-12-01', '2026-12-31').find((d) => d.proxima)?.fecha).toBe('2026-12-06');
  });

  it('pregunta si terminó cuando pasaron los días que suele durar, y "todavía sigue" espera dos días', () => {
    const conActual = [...dias, '2026-11-21', '2026-11-22'];
    expect(resumenCiclo(conActual, '2026-11-22', { fines }).pregunta).toBeNull();
    expect(resumenCiclo(conActual, '2026-11-24', { fines }).pregunta).toEqual({ tipo: 'fin', inicio: '2026-11-21', ultimo: '2026-11-22' });
    const sigue: RespuestaCiclo[] = [{ tipo: 'sigue', referencia: '2026-11-21', fecha: '2026-11-24' }];
    expect(resumenCiclo(conActual, '2026-11-25', { fines, respuestas: sigue }).pregunta).toBeNull();
    expect(resumenCiclo(conActual, '2026-11-26', { fines, respuestas: sigue }).pregunta).toMatchObject({ tipo: 'fin' });
    const cerrado = resumenCiclo(conActual, '2026-11-26', { fines: [...fines, '2026-11-24'] });
    expect(cerrado).toMatchObject({ pregunta: null, en_periodo: false });
    expect(cerrado.periodos.at(-1)).toMatchObject({ inicio: '2026-11-21', fin: '2026-11-24', dias: 4, terminado: true });
  });

  it('ciclos muy distintos entre sí: irregulares y para comentar con el médico', () => {
    const r = resumenCiclo(['2026-05-01', '2026-05-23', '2026-07-01', '2026-07-24', '2026-08-30'], '2026-09-05');
    expect(r).toMatchObject({ regular: false, ciclo_min: 22, ciclo_max: 39 });
    expect(r.consultar).toEqual(expect.arrayContaining(['irregular', 'largos']));
    expect(resumenCiclo(dias, '2026-11-03', { fines }).consultar).toEqual([]);
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
