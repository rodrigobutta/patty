// Datos armados para las pruebas de toda la historia: azar repetible, sin base de datos.
import { sumarDias } from '../src/lib/fechas.js';
import type { ConceptoInfo, FilaDiaria } from '../src/patrones/motor.js';

export const azar = (semilla: number) => {
  let s = semilla;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

export const DESDE = '2021-01-04';

const fila = (fecha: string, concepto_id: number, extra: Partial<FilaDiaria> = {}): FilaDiaria => ({ fecha, concepto_id, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${fecha}T12:00:00Z`), ...extra });

/** `dias` días con cosas al azar (todas independientes), más lo que agregue `mas`. */
export function historia(dias: number, conceptos: number, semilla = 42) {
  const r = azar(semilla);
  const lista: ConceptoInfo[] = [];
  const filas: FilaDiaria[] = [];
  for (let c = 1; c <= conceptos; c++) {
    const sintoma = c % 7 === 0;
    const medida = c % 11 === 0;
    lista.push({ id: c, nombre: `Concepto ${c}`, tipo_valor: medida ? 'medida' : sintoma ? 'intensidad' : c % 3 === 0 ? 'cantidad' : 'evento', rol: sintoma ? 'efecto' : medida ? 'ambos' : 'causa', categoria: sintoma ? 'sintoma' : medida ? 'actividad' : 'comida' });
    const prob = medida ? 0.9 : 0.03 + r() * r() * 0.5;
    const inicio = r() < 0.3 ? Math.floor(r() * dias * 0.7) : 0;
    for (let d = inicio; d < dias; d++) {
      if (r() > prob) continue;
      const fecha = sumarDias(DESDE, d);
      const v = medida ? 20 + r() * 10 : c % 3 === 0 ? 1 + Math.floor(r() * 4) : null;
      filas.push(fila(fecha, c, { suma: v, promedio: v, intensidad: sintoma ? 1 + Math.floor(r() * 5) : null, primera: medida ? null : Date.parse(`${fecha}T12:00:00Z`) + r() * 3e7 }));
    }
  }
  return { filas, conceptos: lista, desde: DESDE, hasta: sumarDias(DESDE, dias - 1), dias };
}

/**
 * Una persona con un cambio plantado: desde el día `corte` empieza el mate (1) y baja el dolor de cabeza (2). El café (3) y la
 * pizza (4) van al azar todo el tiempo.
 */
export function conCambio(dias: number, corte: number, semilla = 7, antes = 0.5, despues = 0.1) {
  const r = azar(semilla);
  const conceptos: ConceptoInfo[] = [
    { id: 1, nombre: 'Mate', tipo_valor: 'evento', rol: 'causa', categoria: 'bebida' },
    { id: 2, nombre: 'Dolor de cabeza', tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' },
    { id: 3, nombre: 'Café', tipo_valor: 'evento', rol: 'causa', categoria: 'bebida' },
    { id: 4, nombre: 'Pizza', tipo_valor: 'evento', rol: 'causa', categoria: 'comida' },
  ];
  const filas: FilaDiaria[] = [];
  for (let d = 0; d < dias; d++) {
    const f = sumarDias(DESDE, d);
    if (d >= corte && r() < 0.8) filas.push(fila(f, 1));
    if (r() < (d >= corte ? despues : antes)) filas.push(fila(f, 2, { intensidad: 3 }));
    if (r() < 0.6) filas.push(fila(f, 3));
    if (r() < 0.3) filas.push(fila(f, 4));
  }
  return { filas, conceptos, desde: DESDE, hasta: sumarDias(DESDE, dias - 1), fecha: sumarDias(DESDE, corte) };
}
