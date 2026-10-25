// El idioma de la app: el que se eligió en Más o, si no, el del teléfono. `t("Anotar")` devuelve el texto en ese
// idioma (el castellano es la clave; ver packages/shared/src/i18n). Cambiar el idioma recarga la app.
import { idiomaDe, traducir, traducirDato, type Idioma } from 'shared';

const CLAVE = 'idioma';

/** Lo elegido: un idioma, o 'auto' (el del teléfono). */
export function idiomaElegido(): Idioma | 'auto' {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'es' || v === 'en' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let actual: Idioma = idiomaElegido() === 'auto' ? idiomaDe(navigator.language) : (idiomaElegido() as Idioma);
export const idioma = (): Idioma => actual;

export function ponerIdioma(i: Idioma | 'auto'): void {
  try {
    if (i === 'auto') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, i);
  } catch {
    /* sin almacenamiento */
  }
  actual = i === 'auto' ? idiomaDe(navigator.language) : i;
  location.reload();
}

/**
 * El texto en el idioma de la app. Sirve también para nombres de datos (categorías, conceptos del sistema, "Tele en TN",
 * "Uso de Instagram"); lo que escribió la persona queda igual.
 */
export const t = (texto: string, vars?: Record<string, string | number>): string =>
  vars ? traducir(actual, texto, vars) : traducirDato(texto, actual);

/** Para Intl (fechas, números): "es-AR" o "en-US". */
export const locale = (): string => (actual === 'en' ? 'en-US' : 'es-AR');

document.documentElement.lang = actual;
