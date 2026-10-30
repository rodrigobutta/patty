// Lo que avisan las apps del teléfono: los conteos por hora (y que mandarlos de nuevo no duplica), lo que se calcula
// para los patrones, y los pedidos, viajes y entrenamientos que llegan de los avisos: cómo se juntan, cómo se anotan
// y cómo se unen con lo que ya estaba anotado.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { nocheDe } from '../src/avisos/telefono.js';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { diaDePatty } from '../src/lib/fechas.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

const ZONA = 'America/Argentina/Buenos_Aires';
const MIN = 60000;
const HORA = 60 * MIN;

/** Una hora redonda de hace `h` horas. */
const haceHoras = (h: number) => {
  const t = Date.now() - h * HORA;
  return t - (t % HORA);
};

async function conApp() {
  const base = await conAdmin();
  const f = await base.ana.post(`/api/personas/${base.personaId}/fuentes`, { tipo: 'telefono', nombre: 'App de Android' });
  const app = new Cliente();
  app.headers.Authorization = `Bearer ${f.body.token}`;
  return { ...base, app };
}

async function medido(personaId: number, concepto: string): Promise<Record<string, number>> {
  const l = await obtenerDb().execute(
    sql`SELECT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.valor FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
        WHERE m.persona_id = ${personaId} AND c.nombre = ${concepto} ORDER BY m.fecha`,
  );
  return Object.fromEntries([...l].map((x) => [x.fecha as string, Number(x.valor)]));
}

describe('cuántos avisos y mensajes', () => {
  it('suma por día, la noche va al día en que termina, y mandar de nuevo una hora la reemplaza', async () => {
    const { ana, app, personaId } = await conApp();
    // Una hora de la tarde de anteayer (17 h de Buenos Aires = 20 UTC), y la noche que sigue (23 h y 2 h).
    const tarde = Date.parse(`${diaDePatty(new Date(Date.now() - 2 * 86400000), ZONA)}T20:00:00Z`);
    const noche1 = tarde + 6 * HORA; // 23 h
    const noche2 = tarde + 9 * HORA; // 2 h del día siguiente
    const conteos = [
      { paquete: 'com.whatsapp', app: 'WhatsApp', hora: tarde, n: 10, sonoras: 8, apagada: 2, mensajes: 9 },
      { paquete: 'com.google.android.gm', app: 'Gmail', hora: tarde + 5 * MIN, n: 3, sonoras: 0, apagada: 0, mensajes: 0 },
      { paquete: 'com.whatsapp', app: 'WhatsApp', hora: noche1, n: 2, sonoras: 2, apagada: 2, mensajes: 2 },
      { paquete: 'com.instagram.android', app: 'Instagram', hora: noche2, n: 4, sonoras: 1, apagada: 4, mensajes: 0 },
      // Lo que no sirve se saltea (sin paquete, del futuro, vacío).
      { app: 'X', hora: tarde, n: 1 },
      { paquete: 'com.x', hora: Date.now() + 5 * HORA, n: 1 },
      { paquete: 'com.y', hora: tarde, n: 0, mensajes: 0 },
    ];
    const r = await app.post('/api/ingesta/avisos', { conteos, eventos: [] });
    expect(r.status).toBe(200);
    expect(r.body.conteos).toBe(4);
    // Mandar de nuevo lo mismo no duplica.
    await app.post('/api/ingesta/avisos', { conteos });
    const dia = diaDePatty(new Date(tarde), ZONA);
    const manana = diaDePatty(new Date(noche2 + 5 * HORA), ZONA);
    expect(nocheDe(noche1, ZONA)).toBe(manana);
    expect(nocheDe(noche2, ZONA)).toBe(manana);
    expect(nocheDe(tarde, ZONA)).toBeNull();

    // El día de Patty va de 5 a 5: la 1 y las 2 de la mañana son del día anterior.
    expect(await medido(personaId, 'Notificaciones')).toEqual({ [dia]: 19 });
    expect(await medido(personaId, 'Mensajes recibidos')).toEqual({ [dia]: 11 });
    // De noche, las que sonaron (pueden despertar), en el día en que termina la noche.
    expect(await medido(personaId, 'Notificaciones de noche')).toEqual({ [manana]: 3 });

    // La hora en curso llega de nuevo con más: se reemplaza, no se suma.
    await app.post('/api/ingesta/avisos', { conteos: [{ ...conteos[0], n: 12, mensajes: 11 }] });
    expect((await medido(personaId, 'Notificaciones'))[dia]).toBe(21);
    expect((await medido(personaId, 'Mensajes recibidos'))[dia]).toBe(13);

    // El detalle del Día: por hora, por app y los mensajes por servicio.
    const d = (await ana.get(`/api/avisos/dia?persona=${personaId}&fecha=${dia}`)).body;
    expect(d.notificaciones.total).toBe(21);
    expect(d.notificaciones.por_hora[17]).toBe(15);
    expect(d.notificaciones.por_hora[23]).toBe(2);
    expect(d.notificaciones.apps[0]).toEqual({ app: 'WhatsApp', n: 14 });
    expect(d.mensajes).toEqual({ total: 13, apps: [{ app: 'WhatsApp', n: 13 }] });
    const dm = (await ana.get(`/api/avisos/dia?persona=${personaId}&fecha=${manana}`)).body;
    expect(dm.notificaciones).toBeNull();

    // Entran a los patrones como cualquier medición.
    const serie = await obtenerDb().execute(
      sql`SELECT c.nombre, k.clave, k.rol FROM serie_diaria s JOIN conceptos c ON c.id = s.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE s.persona_id = ${personaId} ORDER BY c.nombre`,
    );
    expect([...serie].map((x) => [x.nombre, x.clave, x.rol])).toEqual([
      ['Mensajes recibidos', 'comunicacion', 'causa'],
      ['Notificaciones', 'pantalla', 'causa'],
      ['Notificaciones de noche', 'pantalla', 'causa'],
    ]);

    // Nunca se guarda el texto: la tabla no tiene dónde.
    const cols = await obtenerDb().execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'avisos_conteos'`);
    expect([...cols].map((x) => x.column_name).sort()).toEqual(['apagada', 'app', 'fecha', 'fuente_id', 'hora', 'id', 'mensajes', 'n', 'paquete', 'persona_id', 'sonoras']);

    // Borrar todo.
    expect((await ana.del(`/api/avisos?persona=${personaId}`)).status).toBe(200);
    expect(await medido(personaId, 'Notificaciones')).toEqual({});
    expect((await ana.get(`/api/avisos/dia?persona=${personaId}&fecha=${dia}`)).body).toEqual({ notificaciones: null, mensajes: null });
  });

  it('sin token de una fuente no entra', async () => {
    await conAdmin();
    expect((await new Cliente().post('/api/ingesta/avisos', { conteos: [] })).status).toBe(401);
  });
});

describe('ejercicio de los avisos', () => {
  it('se anota solo, una vez, con los minutos y los km', async () => {
    const { ana, app, personaId } = await conApp();
    const fin = haceHoras(3);
    const correr = { tipo: 'ejercicio', app: 'strava', evento: 'terminado', instante: fin, deporte: 'correr', km: 5.2, minutos: 28, texto: 'nunca se manda' };
    const r = await app.post('/api/ingesta/avisos', { eventos: [correr] });
    expect(r.body.anotados).toBe(1);
    // El mismo aviso otra vez (o la app que lo repite un rato después) no anota otra.
    expect((await app.post('/api/ingesta/avisos', { eventos: [correr, { ...correr, instante: fin + 5 * MIN }] })).body.anotados).toBe(0);
    const dia = diaDePatty(new Date(fin - 28 * MIN), ZONA);
    const l = (await ana.get(`/api/registros?persona=${personaId}&desde=${dia}&hasta=${dia}`)).body;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ concepto: 'Correr', valor: 28, unidad: 'min', nota: '5,2 km · Strava', origen: 'aviso' });
    expect(Date.parse(l[0].inicio)).toBe(fin - 28 * MIN);
    // Ningún dato raro llega a la base.
    const d = await obtenerDb().execute(sql`SELECT datos FROM avisos_detectados WHERE persona_id = ${personaId}`);
    expect(JSON.stringify([...d])).not.toContain('nunca se manda');
  });

  it('si ya estaba anotado (a mano o la caminata del reloj), no se anota de nuevo', async () => {
    const { ana, app, personaId, categorias } = await conApp();
    const fin = haceHoras(5);
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Fútbol', categoria_id: categorias.actividad, inicio: new Date(fin - 60 * MIN).toISOString(), valor: 60 });
    const r = await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'ejercicio', app: 'garmin', evento: 'terminado', instante: fin, deporte: 'gym', minutos: 50 }] });
    expect(r.body.anotados).toBe(0);

    // La caminata que salió de los pasos del reloj (Health Connect).
    const otra = haceHoras(9);
    const fecha = new Date(otra).toLocaleDateString('en-CA', { timeZone: ZONA });
    await ana.post('/api/actividad/caminatas', { persona_id: personaId, dias: [{ fecha, caminatas: [{ inicio: new Date(otra - 40 * MIN).toISOString(), fin: new Date(otra).toISOString() }] }] });
    const c = await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'ejercicio', app: 'samsunghealth', evento: 'terminado', instante: otra + 2 * MIN, deporte: 'caminata', minutos: 40 }] });
    expect(c.body.anotados).toBe(0);
    const estados = await obtenerDb().execute(sql`SELECT estado, datos->'duplicado' AS dup FROM avisos_detectados WHERE persona_id = ${personaId} ORDER BY inicio`);
    expect([...estados].map((x) => [x.estado, typeof x.dup])).toEqual([
      ['descartado', 'string'],
      ['descartado', 'object'],
    ]);
    // Lo que no se reconoce (una app o un deporte que no existen) no entra.
    expect((await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'ejercicio', app: 'otra', evento: 'terminado', instante: otra }, { tipo: 'nada', app: 'strava' }] })).body.eventos).toBe(0);
  });
});

describe('comida pedida', () => {
  it('los avisos del mismo pedido son uno; Patty pregunta qué fue y lo anota como delivery', async () => {
    const { ana, app, personaId, categorias } = await conApp();
    const sale = Date.now() - 2 * HORA;
    const llega = sale + 25 * MIN;
    await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'pedido', app: 'pedidosya', evento: 'en_camino', instante: sale }] });
    await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'pedido', app: 'pedidosya', evento: 'entregado', instante: llega }, { tipo: 'pedido', app: 'pedidosya', evento: 'en_camino', instante: sale }] });
    let p = (await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body;
    expect(p.pendientes).toHaveLength(1);
    expect(p.pendientes[0]).toMatchObject({ tipo: 'pedido', app: 'PedidosYa', inicio: new Date(llega).toISOString() });

    const r = await ana.post(`/api/avisos/${p.pendientes[0].id}`, { que: 'Pizza' });
    expect(r.status).toBe(200);
    expect(r.body.registro).toMatchObject({ concepto: 'Pizza', donde: 'delivery', categoria_id: categorias.comida });
    expect(Date.parse(r.body.registro.inicio)).toBe(llega);
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);
    // El aviso que llega de nuevo no vuelve a preguntar.
    await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'pedido', app: 'pedidosya', evento: 'entregado', instante: llega }] });
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);

    // Otro pedido, anotado por su cuenta como comida pedida (con la foto o contándolo): tampoco pregunta. Y lo que más
    // pide se ofrece para contestar con un toque.
    const otro = Date.now() - 26 * HORA;
    await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'pedido', app: 'rappi', evento: 'entregado', instante: otro }] });
    p = (await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body;
    expect(p.pendientes.map((x: any) => x.app)).toEqual(['Rappi']);
    expect(p.comidas).toEqual(['Pizza']);
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Sushi', categoria_id: categorias.comida, inicio: new Date(otro + 10 * MIN).toISOString(), donde: 'delivery' });
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);

    // «No pedí» lo saca.
    const tercero = Date.now() - 4 * HORA;
    await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'pedido', app: 'ubereats', evento: 'entregado', instante: tercero }] });
    const [t] = (await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes;
    await ana.post(`/api/avisos/${t.id}`, { descartar: true });
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);
  });

  it('un pedido que recién salió todavía no se pregunta', async () => {
    const { ana, app, personaId } = await conApp();
    await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'pedido', app: 'pedidosya', evento: 'en_camino', instante: Date.now() - 5 * MIN }] });
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);
  });
});

describe('viajes en apps', () => {
  it('se unen con el viaje que vio la ubicación (ya marcado «en Uber») o, si no hay, Patty pregunta', async () => {
    const { ana, app, personaId } = await conApp();
    // Un viaje en auto de ~5 km, un punto por km cada 3 minutos.
    const sube = haceHoras(4) + 10 * MIN;
    const puntos = Array.from({ length: 6 }, (_, i) => ({ lat: -34.6 - i * 0.01, lon: -58.4, instante: new Date(sube + i * 3 * MIN).toISOString() }));
    expect((await ana.post('/api/ubicacion', { persona_id: personaId, puntos })).status).toBeLessThan(300);
    await app.post('/api/ingesta/avisos', {
      eventos: [
        { tipo: 'viaje', app: 'uber', evento: 'llegando', instante: sube - 4 * MIN },
        { tipo: 'viaje', app: 'uber', evento: 'terminado', instante: sube + 16 * MIN },
      ],
    });
    const fecha = diaDePatty(new Date(sube), ZONA);
    const v = (await ana.get(`/api/ubicacion/viajes?persona=${personaId}&fecha=${fecha}`)).body;
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ modo: 'taxi', app: 'Uber' });
    expect(v[0].pista).toContain('En Uber');
    // Ese no se pregunta aparte: va en «¿Cómo fue tu viaje?».
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);
    // Al contarlo, la app queda en la nota.
    await ana.post('/api/ubicacion/viajes', { persona_id: personaId, inicio: v[0].inicio, fin: v[0].fin, minutos: v[0].minutos, km: v[0].km, modo: 'taxi', como: 'tranquilo', app: 'Uber' });
    const reg = (await ana.get(`/api/registros?persona=${personaId}&desde=${fecha}&hasta=${fecha}`)).body;
    expect(reg[0]).toMatchObject({ concepto: 'Viaje en taxi' });
    expect(reg[0].nota).toContain('en Uber');

    // Un viaje en Cabify sin ubicación: Patty pregunta, y al contestar queda el viaje en taxi con sus minutos.
    const otro = haceHoras(28);
    await app.post('/api/ingesta/avisos', {
      eventos: [
        { tipo: 'viaje', app: 'cabify', evento: 'llegando', instante: otro },
        { tipo: 'viaje', app: 'cabify', evento: 'en_viaje', instante: otro + 5 * MIN },
        { tipo: 'viaje', app: 'cabify', evento: 'terminado', instante: otro + 30 * MIN },
      ],
    });
    const [p] = (await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes;
    expect(p).toMatchObject({ tipo: 'viaje', app: 'Cabify', minutos: 30, inicio: new Date(otro).toISOString() });
    expect((await ana.post(`/api/avisos/${p.id}`, { como: 'pesado' })).status).toBe(200);
    const f2 = diaDePatty(new Date(otro), ZONA);
    const r2 = (await ana.get(`/api/registros?persona=${personaId}&desde=${f2}&hasta=${f2}`)).body;
    expect(r2.map((x: any) => x.concepto).sort()).toEqual(['Viaje en taxi', 'Viaje pesado']);
    expect(r2.find((x: any) => x.concepto === 'Viaje en taxi')).toMatchObject({ valor: 30, nota: 'en Cabify' });
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);
  });

  it('solo el aviso de que llega el auto, sin que termine: se pregunta recién un rato después', async () => {
    const { ana, app, personaId } = await conApp();
    await app.post('/api/ingesta/avisos', { eventos: [{ tipo: 'viaje', app: 'didi', evento: 'llegando', instante: Date.now() - 10 * MIN }] });
    expect((await ana.get(`/api/avisos/pendientes?persona=${personaId}`)).body.pendientes).toEqual([]);
  });
});
