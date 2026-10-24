import { createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
    expect(h.explicacion).toMatch(/2 días después/);

    await ana.put(`/api/hallazgos/${h.id}`, { estado: 'confirmado' });
    const otra = await ana.post('/api/analisis', { persona_id: personaId, desde, hasta: sumarDias(desde, 44), ia: false });
    expect(otra.body.hallazgos[0]).toMatchObject({ id: h.id, estado: 'confirmado' });
    expect((await ana.get(`/api/hallazgos?persona=${personaId}`)).body[0].estado).toBe('confirmado');
  });

  it('con pocos días avisa que falta', async () => {
    const { ana, personaId } = await conAdmin();
    const r = await ana.post('/api/analisis', { persona_id: personaId, ia: false });
    expect(r.body.hallazgos).toEqual([]);
    expect(r.body.resumen).toMatch(/Todavía hay 0 días/);
  });
});
