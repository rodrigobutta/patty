// Arranque del servidor: migraciones, datos iniciales y HTTP.
import { serve } from '@hono/node-server';
import { crearApp } from './app.js';
import { config } from './config.js';
import { obtenerDb } from './db/client.js';
import { aplicarMigraciones } from './db/migrar.js';
import { inicializar } from './inicializar.js';
import { arrancarPatronesDeNoche } from './patrones/noche.js';
import { arrancarRecordatorios } from './push/recordatorios.js';
import { recalcularSiCambio } from './routes/ubicacion.js';

const db = obtenerDb();
await aplicarMigraciones(db);
await inicializar(db);
arrancarRecordatorios(db);
arrancarPatronesDeNoche(db);
// Los viajes se cuentan distinto desde la 1.20.1 (puntos cada ~150 m, sin contar los paseos): se recalculan una vez.
void recalcularSiCambio(db, 'viajes-sin-saltos-3').catch((e) => console.error('Recalcular ubicación:', e));

serve({ fetch: crearApp().fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Patty funcionando en http://localhost:${info.port}`);
});
