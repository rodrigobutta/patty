import { describe, expect, it } from 'vitest';
import type { TendenciaDia } from 'shared';
import { hebra, metricasConDatos, minimoDias, normalizar, resumenDe, METRICAS, textoDelDia, textoValor } from './tendencias';

const dia = (fecha: string, d: Partial<TendenciaDia> = {}): TendenciaDia => ({ fecha, animo: null, sueno: null, pasos: null, ejercicio: null, pantalla: null, temperatura: null, pulso: null, malestares: null, nombres_malestares: [], ...d });
const metrica = (c: string) => METRICAS.find((m) => m.clave === c)!;

describe('normalizar para dibujar', () => {
  it('lleva de lo más bajo a lo más alto del período, y lo que no hay sigue sin haber', () => {
    expect(normalizar([2000, null, 4000, 3000])).toEqual([0, null, 1, 0.5]);
  });
  it('con escala fija no estira: un ánimo de 10 todos los días queda arriba, no al medio', () => {
    expect(normalizar([10, 10], [1, 10])).toEqual([1, 1]);
    expect(normalizar([1, 5.5], [1, 10])).toEqual([0, 0.5]);
  });
  it('si todo vale lo mismo, al medio (sin dividir por cero)', () => {
    expect(normalizar([7, 7, null])).toEqual([0.5, 0.5, null]);
  });
});

describe('qué se dibuja', () => {
  it('solo lo que tiene días suficientes, y no un dato suelto', () => {
    const dias = [dia('2026-10-26', { animo: 8, sueno: 7, pasos: 100 }), dia('2026-10-27', { animo: 6, sueno: 6 }), ...['28', '29', '30', '31'].map((d) => dia(`2026-10-${d}`)), dia('2026-11-01')];
    expect(metricasConDatos(dias).map((m) => m.clave)).toEqual(['animo', 'sueno']);
  });
  it('en el mes pide más días que en la semana', () => {
    expect(minimoDias(7)).toBe(2);
    expect(minimoDias(30)).toBe(4);
    const mes = Array.from({ length: 30 }, (_, i) => dia(`f${i}`, { sueno: i < 3 ? 7 : null }));
    expect(metricasConDatos(mes)).toEqual([]);
  });
  it('sin nada, nada', () => {
    expect(metricasConDatos([dia('2026-11-01')])).toEqual([]);
  });
});

describe('los valores se leen con su unidad real', () => {
  it('cada cosa en lo suyo', () => {
    expect(textoValor('sueno', 7.5)).toBe('7 h 30 min');
    expect(textoValor('sueno', 8)).toBe('8 h');
    expect(textoValor('pasos', 8432)).toBe('8.432 pasos');
    expect(textoValor('ejercicio', 45)).toBe('45 min');
    expect(textoValor('pantalla', 200)).toBe('3 h 20 min');
    expect(textoValor('temperatura', 18.5)).toBe('18,5 °C');
    expect(textoValor('pulso', 62)).toBe('62 lpm');
    expect(textoValor('animo', 7.5)).toBe('7,5 /10');
    expect(textoValor('malestares', 1)).toBe('1 malestar');
  });
  it('el día dice cómo se sintió y qué le dolió; sin dato, nada', () => {
    expect(textoDelDia('animo', dia('x', { animo: 9 }))).toMatch(/^9 \/10 · /);
    expect(textoDelDia('malestares', dia('x', { malestares: 2, nombres_malestares: ['Dolor de cabeza', 'Cansancio'] }))).toBe('Dolor de cabeza, Cansancio');
    expect(textoDelDia('pasos', dia('x'))).toBeNull();
  });
  it('el resumen promedia lo que se mide, y cuenta días de lo que no pasa siempre', () => {
    const dias = [dia('a', { sueno: 7, ejercicio: 30 }), dia('b', { sueno: 8 }), dia('c')];
    expect(resumenDe(metrica('sueno'), dias)).toBe('7 h 30 min');
    expect(resumenDe(metrica('ejercicio'), dias)).toBe('en 1 día');
  });
});

describe('las hebras', () => {
  it('se cortan donde falta un día, y un día suelto queda como punto', () => {
    const p = (x: number) => ({ x, y: x });
    const { caminos, sueltos } = hebra([p(1), p(2), null, p(4), null, p(6), p(7)]);
    expect(caminos).toHaveLength(2);
    expect(sueltos).toEqual([p(4)]);
    expect(caminos[0].startsWith('M1.0 1.0 C')).toBe(true);
  });
});
