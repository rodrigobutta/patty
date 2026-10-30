import { describe, expect, it } from 'vitest';
import { normalizar } from 'shared';
import { sumarDias } from '../src/lib/fechas.js';
import { armarPerfil, PERFIL_MAX } from '../src/patrones/perfil.js';
import type { ConceptoInfo, FilaDiaria } from '../src/patrones/motor.js';
import { conCambio, DESDE, historia } from './sinteticos.js';

describe('el perfil de una persona', () => {
  it('nunca pasa el tope, ni con diez años y 500 conceptos', () => {
    const d = historia(3650, 500);
    const t = performance.now();
    const p = armarPerfil(d.filas, d.conceptos, d.desde, d.hasta);
    expect(p.texto.length).toBeLessThanOrEqual(PERFIL_MAX);
    expect(p.texto.length).toBeGreaterThan(PERFIL_MAX * 0.5);
    expect(p.total).toBeGreaterThan(p.listados);
    expect(performance.now() - t).toBeLessThan(5000);
  });

  it('tampoco con nombres larguísimos, y con un tope más chico', () => {
    const d = historia(1500, 300);
    const conceptos = d.conceptos.map((c) => ({ ...c, nombre: `${'Nombre muy largo '.repeat(40)}${c.id}` }));
    expect(armarPerfil(d.filas, conceptos, d.desde, d.hasta).texto.length).toBeLessThanOrEqual(PERFIL_MAX);
    expect(armarPerfil(d.filas, d.conceptos, d.desde, d.hasta, 5000).texto.length).toBeLessThanOrEqual(5000);
  });

  it('lista solo lo que se puede proponer: todos los nombres aparecen en el texto y primero lo que se siente', () => {
    const d = historia(1500, 300);
    const p = armarPerfil(d.filas, d.conceptos, d.desde, d.hasta);
    expect(p.nombres.size).toBe(p.listados);
    const lineas = p.texto.split('\n').filter((l) => l.includes(' | ') && !l.startsWith('CONCEPTOS'));
    for (const l of lineas) expect(p.nombres.has(normalizar(l.split(' | ')[0]))).toBe(true);
    // Solo habla de conceptos listados.
    const noListado = d.conceptos.find((c) => !p.nombres.has(normalizar(c.nombre)));
    if (noListado) expect(p.texto).not.toMatch(new RegExp(`${noListado.nombre}\\b`));
    expect(lineas[0]).toContain('| efecto |');
  });

  it('muestra los cambios: cuándo empezó algo y cuándo bajó otra cosa, con su fecha', () => {
    const d = conCambio(700, 350);
    const p = armarPerfil(d.filas, d.conceptos, d.desde, d.hasta);
    expect(p.texto).toContain('CAMBIOS BRUSCOS');
    expect(p.texto).toMatch(/\d{4}-\d{2}-\d{2} Mate: empieza a aparecer/);
    const linea = p.texto.split('\n').find((l) => / Dolor de cabeza: de /.test(l))!;
    expect(linea).toBeTruthy();
    // El corte que encuentra cae a menos de dos semanas del de verdad.
    const fecha = linea.split(' ')[0];
    expect(Math.abs(Date.parse(fecha) - Date.parse(d.fecha)) / 86400000).toBeLessThanOrEqual(14);
    expect(p.texto).toContain('POR MES');
    expect(p.texto).toContain('POR SEMANA');
    expect(p.texto).toContain('LO QUE MÁS SE REPITE');
    expect(p.texto).toContain('DÍAS ANOTADOS POR DÍA DE SEMANA');
  });

  it('marca lo que paró, la semana rara, y dice los modos del motor', () => {
    const conceptos: ConceptoInfo[] = [
      { id: 1, nombre: 'Tomate', tipo_valor: 'evento', rol: 'causa', categoria: 'comida' },
      { id: 2, nombre: 'Pasos', tipo_valor: 'medida', rol: 'ambos', categoria: 'actividad' },
      { id: 3, nombre: 'Acostarme', tipo_valor: 'hora', rol: 'ambos', categoria: 'sueno' },
    ];
    const filas: FilaDiaria[] = [];
    for (let d = 0; d < 400; d++) {
      const fecha = sumarDias(DESDE, d);
      const hora = Date.parse(`${fecha}T12:00:00Z`);
      if (d < 200 && d % 2 === 0) filas.push({ fecha, concepto_id: 1, veces: 1, suma: null, promedio: null, intensidad: null, primera: hora });
      const pasos = d >= 300 && d < 307 ? 30000 : 8000 + (d % 5) * 100;
      filas.push({ fecha, concepto_id: 2, veces: 1, suma: pasos, promedio: pasos, intensidad: null, primera: null });
      // Dando la vuelta a la medianoche: 23:30 y 00:30.
      const min = d % 2 ? 23 * 60 + 30 : 30;
      filas.push({ fecha, concepto_id: 3, veces: 1, suma: min, promedio: min, intensidad: null, primera: hora });
    }
    const p = armarPerfil(filas, conceptos, DESDE, sumarDias(DESDE, 399));
    expect(p.texto).toMatch(/Tomate: última vez/);
    expect(p.texto).toMatch(/día \S+ Pasos: 30000/);
    expect(p.texto).toMatch(/Pasos \| medida \| ambos \| alto,bajo/);
    // El promedio de 23:30 y 00:30 es medianoche, no el mediodía.
    expect(p.texto).toMatch(/Acostarme \|.*habitual (23:30|00:00|00:30)/);
  });

  it('no se rompe sin nada, con pocos días, ni sin causas', () => {
    expect(armarPerfil([], [], DESDE, DESDE).nombres.size).toBe(0);
    const d = historia(20, 5);
    expect(armarPerfil(d.filas, d.conceptos, d.desde, d.hasta).texto.length).toBeGreaterThan(0);
  });
});
