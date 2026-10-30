// Los componentes de lo que se come: qué se estima de cada comida para buscar patrones entre comidas distintas ("los días con
// mucha sal → dolor de cabeza") sin ser una app de dieta. Se ve en dos lados, siempre como una estimación: en los patrones, relativo a
// lo habitual de la persona; y en el widget Comida del Día (componentes/delDia.ts), con su valor y sin metas ni juicios.
//
// Son 16, no todos los nutrientes: los de la tabla (USDA) que suelen aparecer en lo que la gente cuenta que le cae mal, y unos
// pocos que las tablas casi no traen y estima la IA por plato (de 0 a 3). Cada uno suma pruebas al motor: lo que no sirve para
// un patrón (vitaminas, minerales sueltos, colesterol) queda afuera a propósito.
import { normalizar } from 'shared';

export const COMPONENTES = [
  // De la tabla: se calculan de los ingredientes.
  { clave: 'calorias', concepto: 'Días con muchas calorías', piso: 300, de: 'tabla', unidad: 'kcal' },
  { clave: 'grasa', concepto: 'Días con mucha grasa', piso: 10, de: 'tabla', unidad: 'g' },
  { clave: 'grasa_saturada', concepto: 'Días con mucha grasa saturada', piso: 4, de: 'tabla', unidad: 'g' },
  { clave: 'azucar', concepto: 'Días con mucha azúcar', piso: 10, de: 'tabla', unidad: 'g' },
  { clave: 'harinas', concepto: 'Días con muchas harinas', piso: 20, de: 'tabla', unidad: 'g' },
  { clave: 'fibra', concepto: 'Días con mucha fibra', piso: 5, de: 'tabla', unidad: 'g' },
  { clave: 'proteina', concepto: 'Días con mucha proteína', piso: 20, de: 'tabla', unidad: 'g' },
  /** En miligramos de sodio. */
  { clave: 'sal', concepto: 'Días con mucha sal', piso: 500, de: 'tabla', unidad: 'mg' },
  { clave: 'alcohol', concepto: 'Días con mucho alcohol', piso: 10, de: 'tabla', unidad: 'g' },
  { clave: 'cafeina', concepto: 'Días con mucha cafeína', piso: 40, de: 'tabla', unidad: 'mg' },
  // Las tablas casi no los traen: los estima la IA por plato, de 0 (nada) a 3 (mucho).
  { clave: 'lactosa', concepto: 'Días con mucha lactosa', piso: 1.5, de: 'ia', unidad: null },
  { clave: 'gluten', concepto: 'Días con mucho gluten', piso: 1.5, de: 'ia', unidad: null },
  { clave: 'fodmap', concepto: 'Días con muchos FODMAP', piso: 2, de: 'ia', unidad: null },
  { clave: 'histamina', concepto: 'Días con mucha histamina', piso: 2, de: 'ia', unidad: null },
  { clave: 'picante', concepto: 'Días con mucho picante', piso: 1.5, de: 'ia', unidad: null },
  { clave: 'ultraprocesado', concepto: 'Días con muchos ultraprocesados', piso: 2, de: 'ia', unidad: null },
] as const;

export type ClaveComponente = (typeof COMPONENTES)[number]['clave'];
export const CLAVES_TABLA = COMPONENTES.filter((c) => c.de === 'tabla').map((c) => c.clave);
export const CLAVES_IA = COMPONENTES.filter((c) => c.de === 'ia').map((c) => c.clave);
export type Componentes = Partial<Record<ClaveComponente, number>>;

/** De lo poco, solo importa la fibra ("días con poca fibra → constipación"): el resto no le dice nada a nadie. */
export const POCOS = [{ clave: 'fibra', concepto: 'Días con poca fibra' }] as const;

/** Estos conceptos no se anotan: entran solos a los patrones. No se le sugieren a nadie al escribir. */
export const CONCEPTOS_COMPONENTES = [...COMPONENTES.map((c) => c.concepto), ...POCOS.map((c) => c.concepto)];
export const CONCEPTOS_COMPONENTES_NORM = CONCEPTOS_COMPONENTES.map(normalizar);

/** La categoría (ConceptoInfo.categoria) con que llegan al motor. */
export const CATEGORIA_COMPONENTE = 'componente';

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'al', 'a', 'con', 'y', 'e', 'en', 'mi', 'the', 'of', 'with', 'and']);

/** Una palabra en singular, sin pensar demasiado: panes → pan, tomates → tomate, alfajores → alfajor. */
function singular(p: string): string {
  if (p.length <= 3 || !p.endsWith('s')) return p;
  if (p.endsWith('es') && p.length > 4 && 'lnrd'.includes(p[p.length - 3])) return p.slice(0, -2);
  return p.slice(0, -1);
}

/**
 * La clave de una comida en la tabla compartida: sin tildes ni mayúsculas, en singular y sin las palabras que no dicen nada.
 * "Empanadas de Carne" y "empanada carne" son la misma; "café sin azúcar" no es "café".
 */
export function claveAlimento(nombre: string): string {
  return normalizar(nombre)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p && !VACIAS.has(p))
    .map(singular)
    .join(' ');
}
