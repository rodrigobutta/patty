// Arranque del servidor: migraciones, datos iniciales y HTTP.
import { serve } from '@hono/node-server';
import { crearApp } from './app.js';
import { config } from './config.js';
import { obtenerDb } from './db/client.js';
import { aplicarMigraciones } from './db/migrar.js';
import { inicializar } from './inicializar.js';
import { arrancarRecordatorios } from './push/recordatorios.js';

const db = obtenerDb();
await aplicarMigraciones(db);
await inicializar(db);
arrancarRecordatorios(db);

serve({ fetch: crearApp().fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Patty funcionando en http://localhost:${info.port}`);
});
