import { describe, expect, it } from 'vitest';
import { rutinasDe, type AnotadoRutina } from '../src/patrones/rutinas.js';

const a = (fecha: string, concepto_id: number, nombre: string, minutos: number, valor: number | null = null): AnotadoRutina => ({
  fecha, concepto_id, nombre, categoria_id: 1, minutos, valor, unidad: valor ? 'taza' : null,
});

describe('rutinas', () => {
  it('diaria: 2 de los últimos 3 días, con la hora de siempre; no si ya se anotó hoy', () => {
    const r = rutinasDe([a('2026-10-26', 1, 'Café', 9 * 60), a('2026-10-25', 1, 'Café', 9 * 60 + 20, 2), a('2026-10-20', 2, 'Huevo', 8 * 60)], '2026-10-27');
    expect(r).toEqual([{ concepto_id: 1, nombre: 'Café', categoria_id: 1, tipo: 'diaria', hora: '09:20', valor: null, unidad: null, veces: 2 }]);
    expect(rutinasDe([a('2026-10-26', 1, 'Café', 540), a('2026-10-25', 1, 'Café', 540), a('2026-10-27', 1, 'Café', 540)], '2026-10-27')).toEqual([]);
  });

  it('semanal: el mismo día de la semana en 2 de las últimas 3 semanas (fútbol los martes)', () => {
    const r = rutinasDe([a('2026-10-20', 3, 'Fútbol', 20 * 60), a('2026-10-13', 3, 'Fútbol', 20 * 60 + 30)], '2026-10-27');
    expect(r[0]).toMatchObject({ nombre: 'Fútbol', tipo: 'semanal', veces: 2 });
    expect(rutinasDe([a('2026-10-20', 3, 'Fútbol', 1200)], '2026-10-27')).toEqual([]);
  });
});
