// pnpm --filter api ejemplo — crea la persona "Ejemplo" con 60 días de datos inventados, para probar la app y el
// análisis. Tiene escondidos dos patrones: tomate → dolor de cabeza 2 días después, y acostarse tarde → poca energía
// al día siguiente. Se puede correr varias veces (borra y vuelve a crear a "Ejemplo").
import { sql } from 'drizzle-orm';
import { cerrarDb, obtenerDb, una } from '../src/db/client.js';
import { aplicarMigraciones } from '../src/db/migrar.js';
import { personas, registros } from '../src/db/schema.js';
import { inicializar } from '../src/inicializar.js';
import { diaDePatty, localAInstante, minutosDelDia, sumarDias } from '../src/lib/fechas.js';
import { obtenerOCrearConcepto } from '../src/routes/conceptos.js';

const db = obtenerDb();
await aplicarMigraciones(db);
await inicializar(db);
const ZONA = 'America/Argentina/Buenos_Aires';

let semilla = 42;
const azar = () => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
};

await db.transaction(async (tx) => {
  await tx.execute(sql`DELETE FROM personas WHERE nombre = 'Ejemplo'`);
  const [p] = await tx.insert(personas).values({ nombre: 'Ejemplo', zona_horaria: ZONA }).returning();
  // Que la vean todos los usuarios que ya existen.
  await tx.execute(sql`INSERT INTO persona_usuarios (persona_id, usuario_id, rol) SELECT ${p.id}, id, 'editor' FROM usuarios`);

  const cat = async (clave: string) => (await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = ${clave}`))!.id;
  const concepto = async (nombre: string, clave: string) => (await obtenerOCrearConcepto(tx, { nombre, categoriaId: await cat(clave) })).concepto.id;
  const c = {
    levante: await concepto('Me levanté', 'sueno'),
    acoste: await concepto('Me acosté', 'sueno'),
    cafe: await concepto('Café', 'bebida'),
    agua: await concepto('Agua', 'bebida'),
    tomate: await concepto('Tomate', 'comida'),
    pan: await concepto('Pan', 'comida'),
    pasta: await concepto('Pasta', 'comida'),
    caminar: await concepto('Caminar', 'actividad'),
    llamadas: await concepto('Llamadas', 'comunicacion'),
    cabeza: await concepto('Dolor de cabeza', 'sintoma'),
    energia: await concepto('Energía', 'animo'),
  };

  const hoy = diaDePatty(new Date(), ZONA);
  const tomate: boolean[] = [];
  const tarde: boolean[] = [];
  const filas: Array<typeof registros.$inferInsert> = [];
  const anotar = (dia: string, concepto: number, hora: string, extra: Partial<typeof registros.$inferInsert> = {}) => {
    const inicio = localAInstante(dia, hora, ZONA);
    filas.push({ persona_id: p.id, concepto_id: concepto, inicio: inicio.toISOString(), fecha: diaDePatty(inicio, ZONA), origen: 'ejemplo', ...extra });
  };
  const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  for (let i = 0; i < 60; i++) {
    const dia = sumarDias(hoy, i - 59);
    const lev = 6 * 60 + 30 + Math.floor(azar() * 90);
    anotar(dia, c.levante, hhmm(lev), { valor: lev });
    anotar(dia, c.cafe, hhmm(lev + 15), { valor: 1 + Math.floor(azar() * 3), unidad: 'tazas' });
    anotar(dia, c.agua, '12:00', { valor: 2 + Math.floor(azar() * 6), unidad: 'vasos' });
    tomate[i] = azar() < 0.3;
    if (tomate[i]) anotar(dia, c.tomate, '13:15');
    if (azar() < 0.5) anotar(dia, c.pan, '13:20');
    if (azar() < 0.3) anotar(dia, c.pasta, '21:00');
    if (azar() < 0.5) anotar(dia, c.caminar, '18:00', { valor: 20 + Math.floor(azar() * 40) });
    anotar(dia, c.llamadas, '20:00', { valor: Math.floor(azar() * 8) });
    if (azar() < (i >= 2 && tomate[i - 2] ? 0.75 : 0.1)) anotar(dia, c.cabeza, '17:00', { intensidad: 2 + Math.floor(azar() * 5) });
    const energiaBaja = i >= 1 && tarde[i - 1] ? azar() < 0.8 : azar() < 0.15;
    anotar(dia, c.energia, '16:00', { intensidad: energiaBaja ? 2 + Math.floor(azar() * 2) : 6 + Math.floor(azar() * 4) });
    tarde[i] = azar() < 0.35;
    const acoste = tarde[i] ? 25 * 60 + Math.floor(azar() * 90) : 22 * 60 + 30 + Math.floor(azar() * 60);
    const diaAcoste = acoste >= 24 * 60 ? sumarDias(dia, 1) : dia;
    if (diaAcoste <= hoy) anotar(diaAcoste, c.acoste, hhmm(acoste), { valor: minutosDelDia(localAInstante(diaAcoste, hhmm(acoste), ZONA), ZONA) });
  }
  await tx.insert(registros).values(filas);
  await tx.execute(sql`UPDATE conceptos SET usos = (SELECT count(*) FROM registros r WHERE r.concepto_id = conceptos.id)`);
  console.log(`Persona "Ejemplo" (id ${p.id}) con ${filas.length} registros en 60 días.`);
});
await cerrarDb();
