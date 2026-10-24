// pnpm db:migrate — aplica las migraciones pendientes y sale.
import { cerrarDb, obtenerDb } from './client.js';
import { aplicarMigraciones } from './migrar.js';

await aplicarMigraciones(obtenerDb());
await cerrarDb();
console.log('Migraciones aplicadas.');
