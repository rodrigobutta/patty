// De los ingredientes de una comida a sus componentes: las cuentas, sin IA ni base.
import { CLAVES_IA, CLAVES_TABLA, type Componentes } from './lista.js';

export interface IngredienteResuelto {
  nombre: string;
  gramos: number;
  /** tabla: sale de USDA. estimado: lo estimó la IA o se cargó a mano. sin_dato: no se sabe nada. */
  fuente: 'tabla' | 'estimado' | 'sin_dato';
  /** El id en la tabla, si salió de ahí. */
  ref: number | null;
  por100: Componentes;
}

/** Cuánto se le cree a cada fuente, por gramo. */
const CONFIANZA = { tabla: 0.9, estimado: 0.5, sin_dato: 0 } as const;

const redondear = (x: number) => Math.round(x * 100) / 100;

export function calcularComponentes(ingredientes: IngredienteResuelto[], niveles: Partial<Record<(typeof CLAVES_IA)[number], number>>): { componentes: Componentes; confianza: number; gramos: number } {
  const componentes: Componentes = {};
  let gramos = 0;
  let confianza = 0;
  for (const i of ingredientes) {
    gramos += i.gramos;
    confianza += i.gramos * CONFIANZA[i.fuente];
    for (const c of CLAVES_TABLA) {
      const v = i.por100[c];
      if (v) componentes[c] = (componentes[c] ?? 0) + (v * i.gramos) / 100;
    }
  }
  for (const c of CLAVES_TABLA) if (componentes[c] !== undefined) componentes[c] = redondear(componentes[c]!);
  for (const c of CLAVES_IA) {
    const v = niveles[c];
    if (v) componentes[c] = Math.min(3, Math.max(0, v));
  }
  return { componentes, confianza: gramos ? redondear(confianza / gramos) : 0, gramos: redondear(gramos) };
}
