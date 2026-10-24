import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.js';

/** Carpeta drizzle/ con las migraciones (funciona desde src/ con tsx y desde dist/src/ compilado). */
export function carpetaMigraciones(): string {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const raiz = aqui.includes(`${path.sep}dist${path.sep}`) ? path.resolve(aqui, '..', '..', '..') : path.resolve(aqui, '..', '..');
  return path.join(raiz, 'drizzle');
}

export async function aplicarMigraciones(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: carpetaMigraciones() });
}
