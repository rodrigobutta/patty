// Idiomas de Patty. El texto en castellano es la clave: `traducir('en', 'Anotar')` busca "Anotar" en el diccionario de
// inglés y, si no está, devuelve el original (así nada queda vacío mientras falte traducir algo). Las variables van
// entre llaves: `traducir('en', 'Hace {n} días', { n: 3 })`. Los diccionarios están en i18n/<idioma>/.
import { EN } from './i18n/en/index.js';

export type Idioma = 'es' | 'en';
export const IDIOMAS: Array<{ clave: Idioma; nombre: string }> = [
  { clave: 'es', nombre: 'Español' },
  { clave: 'en', nombre: 'English' },
];

const DICCIONARIOS: Record<Idioma, Record<string, string> | null> = { es: null, en: EN };

export const esIdioma = (x: unknown): x is Idioma => x === 'es' || x === 'en';

/** El idioma de un "es-AR", "en-US", "pt-BR"…: los que Patty tiene, o castellano. */
export function idiomaDe(etiqueta: string | null | undefined): Idioma {
  const base = (etiqueta ?? '').toLowerCase().split(/[-_,;]/)[0];
  return esIdioma(base) ? base : 'es';
}

export function traducir(idioma: Idioma, texto: string, vars?: Record<string, string | number>): string {
  const d = DICCIONARIOS[idioma];
  const base = (d && d[texto]) || texto;
  return vars ? base.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : base;
}
