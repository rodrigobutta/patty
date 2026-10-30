// La versión del servidor (la de su package.json), para anotarla con los errores.
import { readFileSync } from 'node:fs';

export const VERSION: string = (() => {
  // En desarrollo corre de src/lib y compilado de dist/src/lib: el package.json queda a dos o a tres niveles.
  for (const ruta of ['../../package.json', '../../../package.json']) {
    try {
      return (JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8')) as { version: string }).version;
    } catch {
      /* se prueba el siguiente */
    }
  }
  return 'dev';
})();
