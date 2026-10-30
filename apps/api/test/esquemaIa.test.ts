import { describe, expect, it } from 'vitest';
import { ESQUEMA_HIPOTESIS } from '../src/ia/hipotesis.js';
import { ESQUEMA } from '../src/ia/interpretar.js';

/** Cuántos parámetros aceptan más de un tipo (anyOf o una lista de tipos), que es lo que Anthropic limita. */
function uniones(x: unknown): number {
  if (Array.isArray(x)) return x.reduce((n: number, y) => n + uniones(y), 0);
  if (!x || typeof x !== 'object') return 0;
  const o = x as Record<string, unknown>;
  const propia = Array.isArray(o.anyOf) || Array.isArray(o.type) ? 1 : 0;
  return propia + Object.values(o).reduce((n: number, y) => n + uniones(y), 0);
}

describe('el esquema de lo que se cuenta con la voz', () => {
  it('no pasa el límite de Anthropic de 16 parámetros con null (si no, la IA contesta 400)', () => {
    expect(uniones(ESQUEMA)).toBeLessThanOrEqual(16);
  });
});

describe('el esquema de las hipótesis', () => {
  it('no pasa el límite de Anthropic: ningún parámetro acepta null', () => {
    expect(uniones(ESQUEMA_HIPOTESIS)).toBe(0);
  });
});
