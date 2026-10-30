// Arranque del servidor: migraciones, datos iniciales y HTTP.
import { serve } from '@hono/node-server';
import { appWorker, crearApp } from './app.js';
import { config } from './config.js';
import { obtenerDb } from './db/client.js';
import { aplicarMigraciones } from './db/migrar.js';
import { inicializar } from './inicializar.js';
import { arrancarPatronesDeNoche } from './patrones/noche.js';
import { arrancarRecordatorios } from './push/recordatorios.js';
import { arrancarVersionApp } from './push/versionApp.js';
import { recalcularSiCambio } from './routes/ubicacion.js';

const db = obtenerDb();
const modo = config.modo;
// Las migraciones y los datos iniciales, en el servidor que atiende la app (los otros arrancan con la base ya al día).
if (modo === 'completo' || modo === 'app') {
  await aplicarMigraciones(db);
  await inicializar(db);
}
// Los procesos que corren solos, en un único servidor (el worker, o el completo): así nada se corre dos veces y la app
// solo atiende pedidos.
if (modo === 'completo' || modo === 'worker') {
  arrancarRecordatorios(db);
  arrancarPatronesDeNoche(db);
  arrancarVersionApp(db);
  // Los viajes se cuentan distinto desde la 1.20.1 (puntos cada ~150 m, sin contar los paseos): se recalculan una vez.
  void recalcularSiCambio(db, 'puntos-seguidos-1').catch((e) => console.error('Recalcular ubicación:', e));
}

serve({ fetch: (modo === 'worker' ? appWorker() : crearApp()).fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Patty (${config.modo}) funcionando en http://localhost:${info.port}`);
});
