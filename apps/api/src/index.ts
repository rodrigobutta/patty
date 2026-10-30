// Arranque del servidor: migraciones, datos iniciales y HTTP.
import { serve } from '@hono/node-server';
import { crearApp } from './app.js';
import { config } from './config.js';
import { obtenerDb } from './db/client.js';
import { aplicarMigraciones } from './db/migrar.js';
import { inicializar } from './inicializar.js';
import { arrancarPatronesDeNoche } from './patrones/noche.js';
import { arrancarRecordatorios } from './push/recordatorios.js';
import { arrancarVersionApp } from './push/versionApp.js';
import { recalcularSiCambio } from './routes/ubicacion.js';

const db = obtenerDb();
// El servidor de la administración (MODO=admin) no migra ni corre los procesos: de eso se encarga el de la app.
if (config.modo !== 'admin') {
  await aplicarMigraciones(db);
  await inicializar(db);
  arrancarRecordatorios(db);
  arrancarPatronesDeNoche(db);
  arrancarVersionApp(db);
  // Los viajes se cuentan distinto desde la 1.20.1 (puntos cada ~150 m, sin contar los paseos): se recalculan una vez.
  void recalcularSiCambio(db, 'viajes-sin-saltos-3').catch((e) => console.error('Recalcular ubicación:', e));
}

serve({ fetch: crearApp().fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Patty (${config.modo}) funcionando en http://localhost:${info.port}`);
});
