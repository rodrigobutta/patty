import { describe, expect, it } from 'vitest';
import { conUnidad, cuantos, dosisTexto } from 'shared';

describe('unidades en singular y plural', () => {
  it('concuerda con la cantidad, venga la unidad en singular o en plural', () => {
    expect(conUnidad(1, 'unidades')).toBe('1 unidad');
    expect(conUnidad(2, 'unidad')).toBe('2 unidades');
    expect(conUnidad(3, 'vaso')).toBe('3 vasos');
    expect(conUnidad(1, 'vasos')).toBe('1 vaso');
    expect(conUnidad(2, 'vez')).toBe('2 veces');
    expect(conUnidad(2, 'porción')).toBe('2 porciones');
    expect(conUnidad(1, 'sobres')).toBe('1 sobre');
    expect(conUnidad(500, 'mg')).toBe('500 mg');
    expect(conUnidad(1.5, 'litro')).toBe('1.5 litros');
    expect(conUnidad(2, null)).toBe('2');
    expect(dosisTexto(2, 'comprimido')).toBe('2 comprimidos');
    expect(dosisTexto(1, 'gotas')).toBe('1 gota');
  });
  it('pregunta con el género de la unidad', () => {
    expect(cuantos('unidad')).toBe('¿Cuántas unidades?');
    expect(cuantos('vasos')).toBe('¿Cuántos vasos?');
    expect(cuantos('porción')).toBe('¿Cuántas porciones?');
    expect(cuantos('empanada')).toBe('¿Cuántas empanadas?');
  });
});
