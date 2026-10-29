import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { sumarDias } from '../src/lib/fechas.js';
import { baseLimpia, Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

describe('sesión', () => {
  beforeEach(baseLimpia);

  it('el primer usuario se crea una sola vez y queda como administrador', async () => {
    const c = new Cliente();
    expect((await c.get('/api/sesion')).body).toMatchObject({ configurar: true, usuario: null });
    const r = await c.post('/api/configurar', { usuario: 'ana', nombre: 'Ana', clave: 'secreta1' });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect((await c.get('/api/sesion')).body.usuario).toMatchObject({ usuario: 'ana', rol: 'admin' });
    expect((await new Cliente().post('/api/configurar', { usuario: 'otro', nombre: 'Otro', clave: 'secreta1' })).status).toBe(400);
  });

  it('entrar, salir y el token Bearer para la app', async () => {
    await new Cliente().post('/api/configurar', { usuario: 'ana', nombre: 'Ana', clave: 'secreta1' });
    const c = new Cliente();
    expect((await c.post('/api/entrar', { usuario: 'ana', clave: 'mal' })).status).toBe(401);
    const r = await c.post('/api/entrar', { usuario: 'ANA', clave: 'secreta1' });
    expect(r.status).toBe(200);
    const app = new Cliente();
    app.headers.Authorization = `Bearer ${r.body.token}`;
    expect((await app.get('/api/personas')).status).toBe(200);
    await c.post('/api/salir');
    expect((await c.get('/api/personas')).status).toBe(401);
    expect((await app.get('/api/personas')).status).toBe(401); // era la misma sesión
  });
});

describe('conceptos: sugerir y crear al escribir', () => {
  it('busca sin tildes, por prefijo, por palabra y parecidos; crear dos veces da el mismo', async () => {
    const { ana, categorias } = await conAdmin();
    const a = await ana.post('/api/conceptos', { nombre: '  tomate ', categoria_id: categorias.comida });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ nuevo: true, concepto: { nombre: 'Tomate', tipo_valor: 'evento' } });
    const b = await ana.post('/api/conceptos', { nombre: 'TOMÁTE', categoria_id: categorias.comida });
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ nuevo: false, concepto: { id: a.body.concepto.id } });
    await ana.post('/api/conceptos', { nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma });
    await ana.post('/api/conceptos', { nombre: 'Salsa de tomate', categoria_id: categorias.comida });

    const buscar = async (q: string, cat?: number) =>
      (await ana.get(`/api/conceptos/buscar?q=${encodeURIComponent(q)}${cat ? `&categoria=${cat}` : ''}`)).body.map((s: any) => s.nombre);
    expect(await buscar('tom')).toEqual(['Tomate', 'Salsa de tomate']);
    expect(await buscar('tomates')).toContain('Tomate');
    expect(await buscar('cabeza')).toEqual(['Dolor de cabeza']);
    expect(await buscar('dolr de cabesa')).toEqual(['Dolor de cabeza']);
    expect(await buscar('tom', categorias.sintoma)).toEqual([]);
    expect(await buscar('100%')).toEqual([]);
    // la intensidad la hereda de la categoría
    const dolor = (await ana.get(`/api/conceptos/buscar?q=cabeza`)).body[0];
    expect(dolor.tipo_valor).toBe('intensidad');
  });

  it('renombrar deja el nombre viejo como alias, y unir pasa todo al otro', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const t1 = (await ana.post('/api/conceptos', { nombre: 'Tomate', categoria_id: categorias.comida })).body.concepto;
    const t2 = (await ana.post('/api/conceptos', { nombre: 'Tomates', categoria_id: categorias.comida })).body.concepto;
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: t2.id });
    expect((await ana.post(`/api/conceptos/${t2.id}/unir`, { en: t1.id })).status).toBe(200);
    const r = (await ana.get(`/api/registros?persona=${personaId}`)).body;
    expect(r.map((x: any) => x.concepto_id)).toEqual([t1.id]);
    const s = (await ana.get('/api/conceptos/buscar?q=tomates')).body;
    expect(s[0]).toMatchObject({ id: t1.id });
    expect(s.find((x: any) => x.id === t2.id)).toBeUndefined();
    // escribir el nombre unido encuentra el concepto que quedó
    const otra = await ana.post('/api/conceptos', { nombre: 'tomates', categoria_id: categorias.comida });
    expect(otra.body).toMatchObject({ nuevo: false, concepto: { id: t1.id } });

    await ana.put(`/api/conceptos/${t1.id}`, { nombre: 'Tomate perita' });
    expect((await ana.post('/api/conceptos', { nombre: 'Tomate', categoria_id: categorias.comida })).body.concepto.id).toBe(t1.id);
  });
});

describe('registros', () => {
  it('crea el concepto al vuelo, calcula el día local y valida la intensidad', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    // 01:30 UTC del 25 es 22:30 del 24 en Buenos Aires
    const r = await ana.post('/api/registros', {
      persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: '2026-10-25T01:30:00Z', intensidad: 4,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ fecha: '2026-10-24', intensidad: 4 });
    const sin = await ana.post('/api/registros', { persona_id: personaId, concepto_id: r.body.concepto_id });
    expect(sin.status).toBe(400);
    expect(sin.body.error).toMatch(/intensidad/);
    expect((await ana.post('/api/registros', { persona_id: personaId, concepto_id: r.body.concepto_id, intensidad: 11 })).status).toBe(400);

    const lev = (await ana.get(`/api/conceptos/buscar?q=me levante`)).body[0];
    const h = await ana.post('/api/registros', { persona_id: personaId, concepto_id: lev.id, inicio: '2026-10-24T10:10:00Z' });
    expect(h.body.valor).toBe(7 * 60 + 10); // 7:10 en Buenos Aires
    // la madrugada cuenta para la noche anterior: 1:30 del 25 en Buenos Aires es del día 24
    const ac = (await ana.get(`/api/conceptos/buscar?q=me acoste`)).body[0];
    const noche = await ana.post('/api/registros', { persona_id: personaId, concepto_id: ac.id, inicio: '2026-10-25T04:30:00Z' });
    expect(noche.body).toMatchObject({ fecha: '2026-10-24', valor: 90 });

    const dia = (await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-24`)).body;
    expect(dia.map((x: any) => x.concepto)).toEqual(['Me levanté', 'Dolor de cabeza', 'Me acosté']);
    await ana.del(`/api/registros/${r.body.id}`);
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-24`)).body).toHaveLength(2);
  });

  it('otro usuario no ve a la persona, y un lector no puede anotar', async () => {
    const { ana, personaId } = await conAdmin();
    await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', clave: 'secreta2', rol: 'lector' });
    const beto = new Cliente();
    await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta2' });
    expect((await beto.get('/api/personas')).body).toEqual([]);
    expect((await beto.get(`/api/registros?persona=${personaId}`)).status).toBe(404);
    expect((await beto.post('/api/personas', { nombre: 'X' })).status).toBe(403);
  });
});

describe('dictar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('manda el audio a OpenAI y devuelve el texto; sin clave, avisa', async () => {
    const { ana } = await conAdmin();
    const sin = await ana.pedirCrudo('POST', '/api/voz', new Uint8Array([1, 2, 3]), 'audio/webm');
    expect(sin.status).toBe(503);
    process.env.OPENAI_API_KEY = 'clave-de-prueba';
    try {
      const pedidos: Array<{ url: string; modelo: unknown }> = [];
      vi.stubGlobal('fetch', async (url: string, init: { body: FormData }) => {
        pedidos.push({ url, modelo: init.body.get('model') });
        return new Response(JSON.stringify({ text: ' Desayuné café con tostadas. ' }), { headers: { 'Content-Type': 'application/json' } });
      });
      const r = await ana.pedirCrudo('POST', '/api/voz', new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ texto: 'Desayuné café con tostadas.' });
      expect(pedidos).toEqual([{ url: 'https://api.openai.com/v1/audio/transcriptions', modelo: 'gpt-4o-transcribe' }]);
      expect((await ana.pedirCrudo('POST', '/api/voz', new Uint8Array([1]), 'video/avi')).status).toBe(415);
      expect((await ana.get('/api/sesion')).body.voz).toBe(true);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});

describe('cantidad de un concepto', () => {
  it('se pregunta una vez: al elegir la unidad (o decir que no) queda decidido', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const r = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Huevos revueltos', categoria_id: categorias.comida, valor: 2, unidad: 'unidades' });
    expect(r.status).toBe(201);
    let c = (await ana.get(`/api/conceptos/buscar?q=huevos`)).body[0];
    expect(c).toMatchObject({ nombre: 'Huevos revueltos', cantidad_decidida: false });
    c = (await ana.put(`/api/conceptos/${r.body.concepto_id}`, { tipo_valor: 'cantidad', unidad: 'unidades' })).body;
    expect(c).toMatchObject({ tipo_valor: 'cantidad', unidad: 'unidades', cantidad_decidida: true });
    expect(r.body).toMatchObject({ valor: 2, unidad: 'unidades' });
  });
});

describe('ingesta desde dispositivos', () => {
  it('con el token de la fuente, sin duplicar si se manda dos veces', async () => {
    const { ana, personaId } = await conAdmin();
    const f = await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'reloj', nombre: 'Reloj' });
    expect(f.body.token).toMatch(/^patty_/);
    const reloj = new Cliente();
    reloj.headers.Authorization = `Bearer ${f.body.token}`;
    const lote = {
      mediciones: [
        { concepto: 'pasos', inicio: '2026-10-24T03:00:00Z', valor: 8000 },
        { concepto: 'Pulso en reposo', unidad: 'lpm', inicio: '2026-10-24T03:00:00Z', valor: 61 },
        { concepto: 'pasos', inicio: '2026-10-24T03:00:00Z', valor: 8123 },
      ],
    };
    expect((await reloj.post('/api/ingesta', lote)).body).toMatchObject({ ok: true, recibidas: 3 });
    expect((await reloj.post('/api/ingesta', lote)).status).toBe(200);
    const { obtenerDb } = await import('../src/db/client.js');
    const { sql } = await import('drizzle-orm');
    const m = await obtenerDb().execute(sql`SELECT c.nombre, m.valor, to_char(m.fecha, 'YYYY-MM-DD') AS fecha FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id ORDER BY c.nombre`);
    expect([...m]).toEqual([
      { nombre: 'Pasos', valor: 8123, fecha: '2026-10-24' },
      { nombre: 'Pulso en reposo', valor: 61, fecha: '2026-10-24' },
    ]);
    const malo = new Cliente();
    malo.headers.Authorization = 'Bearer patty_' + createHash('sha256').update('x').digest('hex');
    expect((await malo.post('/api/ingesta', lote)).status).toBe(401);

    // Lo que llegó solo se ve en el día, resumido por fuente y concepto.
    const dia = await ana.get(`/api/registros/automaticos?persona=${personaId}&fecha=2026-10-24`);
    expect(dia.body).toEqual([
      expect.objectContaining({ fuente: 'Reloj', tipo_fuente: 'reloj', concepto: 'Pasos', cantidad: 1, suma: 8123 }),
      expect.objectContaining({ fuente: 'Reloj', concepto: 'Pulso en reposo', unidad: 'lpm', suma: 61, minimo: 61, maximo: 61 }),
    ]);
    expect((await ana.get(`/api/registros/automaticos?persona=${personaId}&fecha=2026-10-23`)).body).toEqual([]);
  });
});

describe('clima automático', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Open-Meteo de mentira: devuelve las horas pedidas con valores fijos y cuenta las consultas. */
  function openMeteo() {
    const pedidos: URL[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      const url = new URL(u);
      pedidos.push(url);
      const desde = Date.parse(url.searchParams.get('start_hour') + ':00Z');
      const hasta = Date.parse(url.searchParams.get('end_hour') + ':00Z');
      const time: string[] = [];
      for (let t = desde; t <= hasta; t += 3600000) time.push(new Date(t).toISOString().slice(0, 13) + ':00');
      const n = (v: number | null) => time.map(() => v);
      const hourly = url.hostname.startsWith('air-quality')
        ? { time, us_aqi: n(42) }
        : { time, temperature_2m: n(21.4), relative_humidity_2m: n(68), precipitation: n(0.2), surface_pressure: n(null), wind_speed_10m: n(12), cloud_cover: n(50), visibility: n(24000), sunshine_duration: n(1800) };
      return new Response(
        JSON.stringify({ hourly }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    return pedidos;
  }

  it('guarda temperatura, humedad y lluvia de la hora, una sola vez por hora, sin guardar la ubicación', async () => {
    const { ana, personaId } = await conAdmin();
    const pedidos = openMeteo();
    const hace10 = new Date(Date.now() - 10 * 60000).toISOString();
    const r = await ana.post('/api/clima', { persona_id: personaId, lat: -34.60372, lon: -58.38159, inicios: [hace10, hace10] });
    expect(r.status).toBe(200);
    expect(r.body.nuevas).toBe(8); // la presión vino vacía: no se guarda
    expect(pedidos.map((u) => u.hostname)).toEqual(['api.open-meteo.com', 'air-quality-api.open-meteo.com']);
    expect(pedidos[0].searchParams.get('latitude')).toBe('-34.60');
    expect(pedidos[0].searchParams.get('longitude')).toBe('-58.38');

    // Otra cosa anotada en la misma hora: ya está, no se vuelve a consultar.
    expect((await ana.post('/api/clima', { persona_id: personaId, lat: -34.6, lon: -58.4, inicios: [hace10] })).body.nuevas).toBe(0);
    expect(pedidos).toHaveLength(2);
    // Lo anotado hace días no lleva clima (la ubicación de ahora no sirve).
    const viejo = new Date(Date.now() - 5 * 86400000).toISOString();
    expect((await ana.post('/api/clima', { persona_id: personaId, lat: -34.6, lon: -58.4, inicios: [viejo] })).body.nuevas).toBe(0);
    expect(pedidos).toHaveLength(2);

    const { obtenerDb } = await import('../src/db/client.js');
    const { sql } = await import('drizzle-orm');
    const m = await obtenerDb().execute(
      sql`SELECT c.nombre, cat.clave AS categoria, m.valor, m.unidad, f.nombre AS fuente FROM mediciones m
          JOIN conceptos c ON c.id = m.concepto_id JOIN categorias cat ON cat.id = c.categoria_id JOIN fuentes f ON f.id = m.fuente_id
          WHERE f.nombre = 'Clima automático' ORDER BY c.nombre`,
    );
    expect([...m]).toEqual([
      { nombre: 'Calidad del aire', categoria: 'clima', valor: 42, unidad: 'AQI', fuente: 'Clima automático' },
      { nombre: 'Humedad', categoria: 'clima', valor: 68, unidad: '%', fuente: 'Clima automático' },
      { nombre: 'Lluvia', categoria: 'clima', valor: 0.2, unidad: 'mm', fuente: 'Clima automático' },
      { nombre: 'Minutos de sol', categoria: 'clima', valor: 30, unidad: 'min', fuente: 'Clima automático' },
      { nombre: 'Nubosidad', categoria: 'clima', valor: 50, unidad: '%', fuente: 'Clima automático' },
      { nombre: 'Temperatura', categoria: 'clima', valor: 21.4, unidad: '°C', fuente: 'Clima automático' },
      { nombre: 'Viento', categoria: 'clima', valor: 12, unidad: 'km/h', fuente: 'Clima automático' },
      { nombre: 'Visibilidad', categoria: 'clima', valor: 24, unidad: 'km', fuente: 'Clima automático' },
    ]);
    // Entra en el día de la persona, como lo demás que se anota.
    const dia = await ana.get(`/api/personas/${personaId}/fuentes`);
    expect(dia.body.map((f: any) => f.nombre)).toEqual(['Clima automático', 'Clima del día']);
    // Y el resumen del día: máxima, horas de sol, horas con lluvia…
    const resumen = await obtenerDb().execute(
      sql`SELECT c.nombre, m.valor FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id JOIN fuentes f ON f.id = m.fuente_id
          WHERE f.nombre = 'Clima del día' ORDER BY c.nombre`,
    );
    expect([...resumen]).toEqual(
      expect.arrayContaining([
        { nombre: 'Temperatura máxima', valor: 21.4 },
        { nombre: 'Horas de sol', valor: 0.5 },
        { nombre: 'Horas con lluvia', valor: 1 },
        { nombre: 'Lluvia del día', valor: 0.2 },
        { nombre: 'Calidad del aire media', valor: 42 },
      ]),
    );
  });

  it('valida la ubicación, el permiso y avisa si el servicio falla', async () => {
    const { ana, personaId } = await conAdmin();
    expect((await ana.post('/api/clima', { persona_id: personaId, lat: 200, lon: 0 })).status).toBe(400);
    vi.stubGlobal('fetch', async () => new Response('caído', { status: 503 }));
    expect((await ana.post('/api/clima', { persona_id: personaId, lat: -34.6, lon: -58.4 })).status).toBe(502);
    expect((await new Cliente().post('/api/clima', { persona_id: personaId, lat: -34.6, lon: -58.4 })).status).toBe(401);
  });
});

describe('ubicación y lugares', () => {
  // Anteayer al mediodía de Buenos Aires (15 h UTC), así la prueba no depende de a qué hora se corre.
  const FECHA = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const hace = (min: number) => new Date(Date.parse(`${FECHA}T15:00:00Z`) - min * 60000).toISOString();

  it('guarda un punto solo al moverse más de 1 km o cambiar de lugar, y calcula viajes y estadías', async () => {
    const { ana, personaId } = await conAdmin();
    const casa = await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'casa', lat: -34.6, lon: -58.4 });
    expect(casa.status).toBe(201);
    expect(casa.body).toMatchObject({ nombre: 'Casa', radio_m: 150 });
    expect((await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Casa', lat: 0, lon: 0 })).status).toBe(409);
    const sup = (await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Supermercado Coto', lat: -34.62, lon: -58.4, radio_m: 200 })).body;

    const r = await ana.post('/api/ubicacion', {
      persona_id: personaId,
      puntos: [
        { lat: -34.600012345, lon: -58.4, instante: hace(50) },
        { lat: -34.6003, lon: -58.4, instante: hace(45) }, // sigue en casa: no se guarda
        { lat: -34.6201, lon: -58.4001, instante: hace(30) }, // el súper
        { lat: -34.6, lon: -58.4, instante: hace(5) }, // de vuelta
      ],
    });
    expect(r.body).toMatchObject({ ok: true, guardados: 3, lugar: 'Casa' });
    // Lo mismo otra vez no agrega nada.
    expect((await ana.post('/api/ubicacion', { persona_id: personaId, puntos: [{ lat: -34.6, lon: -58.4, instante: hace(5) }] })).body.guardados).toBe(0);

    const dia = (await ana.get(`/api/ubicacion/dia?persona=${personaId}&fecha=${FECHA}`)).body;
    expect(dia).toMatchObject({ fecha: FECHA, puntos: 3, viajes: 2, km: 4.5 });
    expect(dia.estadias.map((e: any) => [e.lugar, e.minutos])).toEqual([['Casa', 20], ['Supermercado Coto', 25], ['Casa', 0]]);

    const { obtenerDb } = await import('../src/db/client.js');
    const { sql } = await import('drizzle-orm');
    const db = obtenerDb();
    // Las coordenadas se guardan redondeadas (~10 m).
    expect([...(await db.execute(sql`SELECT lat FROM puntos ORDER BY instante LIMIT 1`))][0]).toEqual({ lat: -34.6 });
    const med = async () =>
      [...(await db.execute(sql`SELECT c.nombre, m.valor, cat.clave AS categoria FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
          JOIN categorias cat ON cat.id = c.categoria_id ORDER BY m.inicio, c.nombre`))].map((x: any) => `${x.categoria}:${x.nombre}=${x.valor}`);
    expect(await med()).toEqual(['lugar:Km recorridos=4.5', 'lugar:Viajes=2', 'lugar:Casa=20', 'lugar:Supermercado Coto=25', 'lugar:Casa=0']);

    // Al cambiar los lugares se recalcula: sin el súper, las estadías en casa quedan y la del súper se va.
    expect((await ana.del(`/api/ubicacion/lugares/${sup.id}`)).status).toBe(200);
    expect(await med()).toEqual(['lugar:Km recorridos=4.5', 'lugar:Viajes=2', 'lugar:Casa=20', 'lugar:Casa=0']);
    // Renombrar un lugar renombra su concepto.
    const ren = await ana.put(`/api/ubicacion/lugares/${casa.body.id}`, { nombre: 'Mi casa', radio_m: 300 });
    expect(ren.body).toMatchObject({ nombre: 'Mi casa', radio_m: 300 });

    // Borrar el historial: se van los puntos y lo calculado; los lugares quedan.
    expect((await ana.del(`/api/ubicacion?persona=${personaId}`)).status).toBe(200);
    expect(await med()).toEqual([]);
    expect((await ana.get(`/api/ubicacion/lugares?persona=${personaId}`)).body.map((l: any) => l.nombre)).toEqual(['Mi casa']);
  });

  it('un atajo del teléfono manda la ubicación con el token de una fuente', async () => {
    const { ana, personaId } = await conAdmin();
    const f = await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'telefono', nombre: 'Atajo iPhone' });
    const atajo = new Cliente();
    atajo.headers.Authorization = `Bearer ${f.body.token}`;
    expect((await atajo.post('/api/ingesta/ubicacion', { lat: -34.6, lon: -58.4 })).body).toMatchObject({ ok: true, guardados: 1, lugar: null });
    expect((await new Cliente().post('/api/ingesta/ubicacion', { lat: -34.6, lon: -58.4 })).status).toBe(401);
    expect((await atajo.post('/api/ingesta/ubicacion', { lat: 100, lon: 0 })).status).toBe(400);
  });

  it('solo quien puede anotar a la persona', async () => {
    const { personaId } = await conAdmin();
    const otro = new Cliente();
    expect((await otro.post('/api/ubicacion', { persona_id: personaId, puntos: [] })).status).toBe(401);
  });
});

describe('análisis de patrones', () => {
  it('de punta a punta: encuentra el patrón, lo guarda y respeta lo que confirma la persona', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const tomate = (await ana.post('/api/conceptos', { nombre: 'Tomate', categoria_id: categorias.comida })).body.concepto.id;
    const cafe = (await ana.post('/api/conceptos', { nombre: 'Café', categoria_id: categorias.bebida })).body.concepto.id;
    const dolor = (await ana.post('/api/conceptos', { nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma })).body.concepto.id;
    const desde = '2026-06-01';
    const conTomate = (i: number) => i % 3 === 0;
    for (let i = 0; i < 45; i++) {
      const dia = sumarDias(desde, i);
      await ana.post('/api/registros', { persona_id: personaId, concepto_id: cafe, inicio: `${dia}T11:00:00Z`, valor: 1 });
      if (conTomate(i)) await ana.post('/api/registros', { persona_id: personaId, concepto_id: tomate, inicio: `${dia}T16:00:00Z` });
      if ((i >= 2 && conTomate(i - 2)) || i === 10) {
        await ana.post('/api/registros', { persona_id: personaId, concepto_id: dolor, inicio: `${dia}T21:00:00Z`, intensidad: 3 });
      }
    }
    const r = await ana.post('/api/analisis', { persona_id: personaId, desde, hasta: sumarDias(desde, 44), ia: false });
    expect(r.status).toBe(200);
    expect(r.body.dias).toBe(45);
    const h = r.body.hallazgos[0];
    expect(h).toMatchObject({ causa: 'Tomate', efecto: 'Dolor de cabeza', desfase_dias: 2, estado: 'nuevo' });
    expect(h.explicacion).toMatch(/a los dos días/);

    await ana.put(`/api/hallazgos/${h.id}`, { estado: 'confirmado' });
    const otra = await ana.post('/api/analisis', { persona_id: personaId, desde, hasta: sumarDias(desde, 44), ia: false });
    expect(otra.body.hallazgos[0]).toMatchObject({ id: h.id, estado: 'confirmado' });
    expect((await ana.get(`/api/hallazgos?persona=${personaId}`)).body[0].estado).toBe('confirmado');

    // Qué patrones buscar: sin los efectos a los dos o tres días, el del tomate no se muestra ni se vuelve a buscar.
    expect((await ana.put(`/api/personas/${personaId}`, { patrones: { desfases_largos: 'no' } })).status).toBe(400);
    expect((await ana.put(`/api/personas/${personaId}`, { patrones: { desfases_largos: false, otra: true } })).status).toBe(200);
    expect((await ana.get('/api/personas')).body.find((p: { id: number }) => p.id === personaId).patrones).toEqual({ desfases_largos: false });
    expect((await ana.get(`/api/hallazgos?persona=${personaId}`)).body.some((x: { id: number }) => x.id === h.id)).toBe(false);
    const sin = await ana.post('/api/analisis', { persona_id: personaId, desde, hasta: sumarDias(desde, 44), ia: false });
    expect(sin.body.hallazgos.every((x: { desfase_dias: number }) => x.desfase_dias <= 1)).toBe(true);
    // Prendido otra vez, vuelve (con lo que la persona había dicho).
    await ana.put(`/api/personas/${personaId}`, { patrones: { desfases_largos: true } });
    expect((await ana.get(`/api/hallazgos?persona=${personaId}`)).body[0]).toMatchObject({ id: h.id, estado: 'confirmado' });
  });

  it('ir a un lugar con nombre entra como causa: «Supermercado → dolor de cabeza al día siguiente»', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const cafe = (await ana.post('/api/conceptos', { nombre: 'Café', categoria_id: categorias.bebida })).body.concepto.id;
    const dolor = (await ana.post('/api/conceptos', { nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma })).body.concepto.id;
    await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Casa', lat: -34.6, lon: -58.4 });
    await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Supermercado', lat: -34.62, lon: -58.4 });
    // Los puntos se guardan hasta 90 días: 40 días que terminan anteayer.
    const hasta = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const desde = sumarDias(hasta, -39);
    const alSuper = (i: number) => i % 3 === 0;
    for (let i = 0; i < 40; i++) {
      const dia = sumarDias(desde, i);
      await ana.post('/api/registros', { persona_id: personaId, concepto_id: cafe, inicio: `${dia}T11:00:00Z`, valor: 1 });
      const puntos = [{ lat: -34.6, lon: -58.4, instante: `${dia}T12:00:00Z` }];
      if (alSuper(i)) puntos.push({ lat: -34.62, lon: -58.4, instante: `${dia}T14:00:00Z` }, { lat: -34.6, lon: -58.4, instante: `${dia}T15:00:00Z` });
      await ana.post('/api/ubicacion', { persona_id: personaId, puntos });
      if ((i >= 1 && alSuper(i - 1)) || i === 10) {
        await ana.post('/api/registros', { persona_id: personaId, concepto_id: dolor, inicio: `${dia}T21:00:00Z`, intensidad: 3 });
      }
    }
    const r = await ana.post('/api/analisis', { persona_id: personaId, desde, hasta, ia: false });
    expect(r.body.dias).toBe(40);
    // En estos datos ir al súper es lo único que suma viajes y km: los tres salen igual de fuertes.
    const h = r.body.hallazgos.find((x: any) => x.causa === 'Supermercado');
    expect(h).toMatchObject({ causa_modo: 'presente', efecto: 'Dolor de cabeza', desfase_dias: 1 });
    expect(h.q_valor).toBeLessThan(0.01);
  });

  it('con pocos días avisa que falta', async () => {
    const { ana, personaId } = await conAdmin();
    const r = await ana.post('/api/analisis', { persona_id: personaId, ia: false });
    expect(r.body.hallazgos).toEqual([]);
    expect(r.body.resumen).toMatch(/Todavía hay 0 días/);
  });
});

describe('borrar y deshacer', () => {
  it('un registro borrado se puede restaurar', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Agua', categoria_id: categorias.bebida, inicio: '2026-10-21T15:00:00.000Z' })).body;
    await ana.del(`/api/registros/${r.id}`);
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-21`)).body).toHaveLength(0);
    expect((await ana.post(`/api/registros/${r.id}/restaurar`)).status).toBe(200);
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-21`)).body).toHaveLength(1);
    expect((await ana.post(`/api/registros/${r.id}/restaurar`)).status).toBe(404);
  });
});

describe('idioma', () => {
  it('con X-Idioma: en, los errores llegan en inglés (también los que llevan datos)', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    expect((await ana.get('/api/no-existe')).body.error).toBe('Ruta desconocida.');
    ana.headers['X-Idioma'] = 'en';
    expect((await ana.get('/api/no-existe')).body.error).toBe('Unknown route.');
    const r = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: 'mañana' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('inicio: invalid date.');
  });
});

describe('dónde se comió', () => {
  it('casera, afuera o delivery con el lugar; entra a la serie diaria y se sugiere después', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Pizza', categoria_id: categorias.comida, inicio: '2026-10-21T23:00:00.000Z', donde: 'afuera', lugar: 'Kentucky' })).body;
    expect(r).toMatchObject({ donde: 'afuera', lugar: 'Kentucky' });
    // solo con el lugar, es afuera
    const s = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Sushi', categoria_id: categorias.comida, inicio: '2026-10-22T23:00:00.000Z', lugar: 'Sushi Club' })).body;
    expect(s).toMatchObject({ donde: 'afuera', lugar: 'Sushi Club' });
    // a una bebida o comida casera no se le guarda lugar
    const c = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Guiso', categoria_id: categorias.comida, inicio: '2026-10-22T15:00:00.000Z', donde: 'casa', lugar: 'X' })).body;
    expect(c).toMatchObject({ donde: 'casa', lugar: null });
    // a un dolor no
    const d = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, intensidad: 3, donde: 'afuera' })).body;
    expect(d.donde).toBeNull();
    const db = (await import('../src/db/client.js')).obtenerDb();
    const { sql } = await import('drizzle-orm');
    const serie = await db.execute(sql`SELECT k.nombre FROM serie_diaria s JOIN conceptos k ON k.id = s.concepto_id WHERE s.persona_id = ${personaId} AND s.fecha = '2026-10-21'`);
    expect([...serie].map((x: any) => x.nombre).sort()).toEqual(['Comida afuera', 'Comida en Kentucky', 'Pizza']);
    // cambiarlo: pasa a delivery sin lugar
    await ana.put(`/api/registros/${r.id}`, { inicio: r.inicio, donde: 'delivery', lugar: null });
    const lista = (await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-21`)).body;
    expect(lista[0]).toMatchObject({ donde: 'delivery', lugar: null });
    expect((await ana.get(`/api/registros/lugares-comida?persona=${personaId}`)).body.map((x: any) => x.lugar)).toEqual(['Sushi Club']);
  });

  it('preguntas configuradas: se guardan, y lo contestado entra a la serie como "Café · Azúcar"', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const q = await ana.post('/api/preguntas-concepto', { persona_id: personaId, concepto: 'Café', pregunta: '¿Con qué?', opciones: ['Azúcar', 'Leche', 'Solo'], varias: true });
    expect(q.status).toBe(201);
    expect((await ana.post('/api/preguntas-concepto', { persona_id: personaId, concepto: 'Té', pregunta: '¿?', opciones: ['Uno'] })).status).toBe(400);
    expect((await ana.get(`/api/preguntas-concepto?persona=${personaId}`)).body).toMatchObject([{ concepto: 'Café', opciones: ['Azúcar', 'Leche', 'Solo'], varias: true, activa: true }]);
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: '2026-10-21T12:00:00.000Z', detalles: [{ pregunta: '¿Con qué?', respuestas: ['Azúcar', 'Leche'] }] })).body;
    expect(r.detalles).toEqual([{ pregunta: '¿Con qué?', respuestas: ['Azúcar', 'Leche'] }]);
    const db = (await import('../src/db/client.js')).obtenerDb();
    const { sql } = await import('drizzle-orm');
    const serie = async () =>
      [...(await db.execute(sql`SELECT k.nombre FROM serie_diaria s JOIN conceptos k ON k.id = s.concepto_id WHERE s.persona_id = ${personaId} AND s.fecha = '2026-10-21'`))].map((x: any) => x.nombre).sort();
    expect(await serie()).toEqual(['Café', 'Café · Azúcar', 'Café · Leche']);
    await ana.put(`/api/registros/${r.id}`, { inicio: r.inicio, detalles: [{ pregunta: '¿Con qué?', respuestas: ['Solo'] }] });
    expect(await serie()).toEqual(['Café', 'Café · Solo']);
    expect((await ana.del(`/api/preguntas-concepto/${q.body.id}`)).status).toBe(200);
  });

  it('cómo era el plato: porción y tipos entran a la serie diaria, junto con dónde', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Milanesa con papas fritas', categoria_id: categorias.comida, inicio: '2026-10-21T23:00:00.000Z', donde: 'casa', porcion: 'grande', tipos: ['frito', 'proteina', 'nada'] })).body;
    expect(r).toMatchObject({ donde: 'casa', porcion: 'grande', tipos: ['frito', 'proteina'] });
    const db = (await import('../src/db/client.js')).obtenerDb();
    const { sql } = await import('drizzle-orm');
    const serie = async () =>
      [...(await db.execute(sql`SELECT k.nombre FROM serie_diaria s JOIN conceptos k ON k.id = s.concepto_id WHERE s.persona_id = ${personaId} AND s.fecha = '2026-10-21'`))].map((x: any) => x.nombre).sort();
    expect(await serie()).toEqual(['Comida casera', 'Comida frita', 'Con proteína', 'Milanesa con papas fritas', 'Porción grande']);
    // corregirlo: mediana y con verdura (la mediana no suma concepto); dónde no se toca
    await ana.put(`/api/registros/${r.id}`, { inicio: r.inicio, porcion: 'mediana', tipos: ['verdura'] });
    expect(await serie()).toEqual(['Comida casera', 'Con verdura', 'Milanesa con papas fritas']);
    // a una bebida no se le guarda
    const b = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Coca', categoria_id: categorias.bebida, tipos: ['dulce'] })).body;
    expect(b).toMatchObject({ porcion: null, tipos: [] });
  });
});
