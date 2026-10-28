// La versión del servidor (la de su package.json), para anotarla con los errores.
import { readFileSync } from 'node:fs';

export const VERSION: string = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  } catch {
    return 'dev';
  }
})();
