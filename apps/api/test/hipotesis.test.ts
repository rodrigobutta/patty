import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { cerrarDb, filas, obtenerDb, una } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { sumarDias } from '../src/lib/fechas.js';
import { correrHipotesis } from '../src/patrones/hipotesis.js';
import { analizarDeNoche } from '../src/patrones/noche.js';
import { azar } from './sinteticos.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

// El día en Argentina: el mismo cálculo que noche.test.ts.
const hoy = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

const HIPOTESIS = (fecha: string) => ({
  tipo: 'cambio', causa: 'Mate', causa_modo: 'presente', efecto: 'Dolor de cabeza', efecto_modo: 'presente', sentido: 'baja', causa_despues: 'sube',
  desfase_dias: 0, fecha_desde: fecha, fecha_hasta: '', razon: 'Desde que tomás mate parece que te duele menos la cabeza.',
});
const AL_AZAR = { tipo: 'relacion', causa: 'Pizza', causa_modo: 'presente', efecto: 'Dolor de cabeza', efecto_modo: 'presente', sentido: 'sube', causa_despues: 'sube', desfase_dias: 9, fecha_desde: '', fecha_hasta: '', razon: 'La pizza te cae mal.' };
const INVENTADA = { ...AL_AZAR, causa: 'Unicornio' };

/** 400 días: desde la mitad aparece el mate y baja el dolor de cabeza; la pizza va al azar. */
async function preparar(categoriasDe = conAdmin) {
  const { ana, personaId, categorias } = await categoriasDe();
  const db = obtenerDb();
  const concepto = async (nombre: string, categoria_id: number) => (await ana.post('/api/conceptos', { nombre, categoria_id })).body.concepto.id as number;
  const mate = await concepto('Mate', categorias.bebida);
  const dolor = await concepto('Dolor de cabeza', categorias.sintoma);
  const pizza = await concepto('Pizza', categorias.comida);
  const r = azar(11);
  const fin = hoy();
  const corte = sumarDias(fin, -200);
  const valores: string[] = [];
  const fila = (c: number, f: string, h: string, intensidad = 'NULL') => `(${personaId}, ${c}, '${f}T${h}:00:00Z', '${f}', ${intensidad})`;
  for (let d = 400; d >= 1; d--) {
    const f = sumarDias(fin, -d);
    if (f >= corte && r() < 0.8) valores.push(fila(mate, f, '12'));
    if (r() < 0.35) valores.push(fila(pizza, f, '13'));
    if (r() < (f >= corte ? 0.1 : 0.5)) valores.push(fila(dolor, f, '20', '3'));
    valores.push(fila(pizza, f, '13').replace(`${pizza},`, `${await aparte(ana, categorias)},`));
  }
  await db.execute(sql.raw(`INSERT INTO registros (persona_id, concepto_id, inicio, fecha, intensidad) VALUES ${valores.join(',')}`));
  return { ana, personaId, db, corte, mate, dolor, pizza, p: { id: personaId, nombre: 'Rodrigo', zona_horaria: 'America/Argentina/Buenos_Aires', rol: 'dueno' as const }, hasta: fin };
}

// Algo de todos los días, para que cada día cuente como anotado.
let agua: number | null = null;
async function aparte(ana: Cliente, categorias: Record<string, number>) {
  if (agua === null) agua = (await ana.post('/api/conceptos', { nombre: 'Agua', categoria_id: categorias.bebida })).body.concepto.id as number;
  return agua;
}

function ia(respuestas: () => unknown) {
  const pedidos: string[] = [];
  const crear = async (p: { messages: Array<{ content: string }> }) => {
    pedidos.push(p.messages[0].content);
    const r = respuestas();
    if (r instanceof Error) throw r;
    return { stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: 'text', text: JSON.stringify(r) }] };
  };
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
  return pedidos;
}

describe('hipótesis de Patty', () => {
  beforeEach(() => {
    agua = null;
  });

  it('lo plantado pasa y queda en Patrones con su origen; lo inventado se descarta; lo falso se rechaza y no se vuelve a proponer', async () => {
    const x = await preparar();
    const pedidos = ia(() => ({ hipotesis: [HIPOTESIS(x.corte), AL_AZAR, INVENTADA] }));
    const r = await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' });
    expect(r.ia).toBe('ok');
    expect(r.perfil_caracteres).toBeGreaterThan(100);
    expect(r.propuestas).toBe(3);
    expect(r.descartadas).toMatchObject([{ causa: 'Unicornio', motivo: 'concepto_desconocido' }]);
    expect(r.confirmadas).toMatchObject([{ causa: 'Mate', efecto: 'Dolor de cabeza', tipo: 'cambio' }]);
    expect(r.rechazadas).toMatchObject([{ causa: 'Pizza', motivo: expect.any(String) }]);
    expect(r.nuevos.length).toBe(1);
    // El prompt no lleva el nombre de la persona y sí lo que anotó.
    expect(pedidos[0]).toContain('Mate');
    expect(pedidos[0]).not.toContain('Rodrigo');

    const lista = (await x.ana.get(`/api/hallazgos?persona=${x.personaId}`)).body as any[];
    const h = lista.find((y) => y.origen === 'hipotesis');
    expect(h).toMatchObject({ causa: 'Mate', efecto: 'Dolor de cabeza', fecha_desde: x.corte, fecha_hasta: null, desfase_dias: 0, estado: 'nuevo' });
    expect(h.explicacion).toContain('Desde que tomás mate');
    expect(h.prob_con).toBeLessThan(h.prob_sin);
    expect(h.q_valor).toBeLessThanOrEqual(0.05);

    // El análisis de todos los días no se lleva lo que salió de una hipótesis.
    expect((await x.ana.post('/api/analisis', { persona_id: x.personaId, ia: false })).status).toBe(200);
    expect(((await x.ana.get(`/api/hallazgos?persona=${x.personaId}`)).body as any[]).some((y) => y.origen === 'hipotesis')).toBe(true);

    // Otra corrida: la IA recibe lo rechazado; si insiste, no se vuelve a probar. Lo confirmado se vuelve a medir.
    const r2 = await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es', forzar: true });
    expect(pedidos[1]).toContain('YA SE PROBÓ Y NO DIO');
    expect(pedidos[1]).toContain('Pizza (presente) → Dolor de cabeza (presente), 9 días');
    expect(r2.repetidas).toBe(2);
    expect(r2.confirmadas.length).toBe(1);
    expect(r2.rechazadas).toEqual([]);
    expect(r2.nuevos).toEqual([]);
    const guardadas = await filas<{ estado: string }>(x.db, sql`SELECT estado FROM hipotesis WHERE persona_id = ${x.personaId} ORDER BY estado`);
    expect(guardadas.map((g) => g.estado)).toEqual(['confirmada', 'rechazada']);
  });

  it('como mucho una vez por semana', async () => {
    const x = await preparar();
    const pedidos = ia(() => ({ hipotesis: [] }));
    expect((await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' })).ia).toBe('ok');
    expect((await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' })).sin_correr).toBe('ya_esta_semana');
    expect(pedidos.length).toBe(1);
  });

  it('si la IA falla, el análisis de la noche queda igual, y lo ya confirmado se sigue midiendo', async () => {
    const x = await preparar();
    const pedidos = ia(() => new Error('se cayó todo'));
    const noche = new Date(`${x.hasta}T07:10:00Z`);
    expect(await analizarDeNoche(x.db, noche)).toBe(1);
    expect(pedidos.length).toBeGreaterThan(0);
    const a = await una<{ origen: string }>(x.db, sql`SELECT origen FROM analisis WHERE persona_id = ${x.personaId}`);
    expect(a?.origen).toBe('noche');

    ia(() => ({ hipotesis: [HIPOTESIS(x.corte)] }));
    await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es', forzar: true });
    ia(() => new Error('de nuevo'));
    const r = await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es', forzar: true });
    expect(r).toMatchObject({ ia: 'fallo', error: 'de nuevo' });
    expect(r.confirmadas.length).toBe(1);
  });

  it('sin IA ni se intenta', async () => {
    const x = await preparar();
    expect((await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' })).ia).toBe('sin_ia');
  });

  it('con el interruptor apagado no le pide nada a la IA y lo que había no se muestra; con pocos días, tampoco corre', async () => {
    const x = await preparar();
    ia(() => ({ hipotesis: [HIPOTESIS(x.corte)] }));
    await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' });
    expect(((await x.ana.get(`/api/hallazgos?persona=${x.personaId}`)).body as any[]).some((y) => y.origen === 'hipotesis')).toBe(true);

    expect((await x.ana.put(`/api/personas/${x.personaId}`, { patrones: { hipotesis: false } })).status).toBe(200);
    const pedidos = ia(() => ({ hipotesis: [] }));
    expect((await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es', forzar: true })).sin_correr).toBe('apagado');
    expect(pedidos).toEqual([]);
    expect(((await x.ana.get(`/api/hallazgos?persona=${x.personaId}`)).body as any[]).some((y) => y.origen === 'hipotesis')).toBe(false);

    await x.ana.put(`/api/personas/${x.personaId}`, { patrones: { hipotesis: true } });
    expect((await correrHipotesis(x.db, x.p, { hasta: sumarDias(x.hasta, -380), idioma: 'es', forzar: true })).sin_correr).toBe('pocos_datos');
  });

  it('respeta lo que la persona opinó: lo que marcó como sin sentido no vuelve, ni con otra fecha', async () => {
    const x = await preparar();
    ia(() => ({ hipotesis: [HIPOTESIS(x.corte)] }));
    const r = await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' });
    const id = r.nuevos[0];
    expect((await x.ana.put(`/api/hallazgos/${id}`, { estado: 'descartado' })).status).toBe(200);

    const pedidos = ia(() => ({ hipotesis: [HIPOTESIS(sumarDias(x.corte, 7))] }));
    const r2 = await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es', forzar: true });
    expect(pedidos[0]).toContain('LA PERSONA DIJO QUE ES OBVIO');
    expect(r2.descartadas).toMatchObject([{ motivo: 'la_persona_lo_aparto' }]);
    expect(r2.nuevos).toEqual([]);
    const lista = await filas<{ estado: string }>(x.db, sql`SELECT estado FROM hallazgos WHERE persona_id = ${x.personaId} AND origen = 'hipotesis'`);
    expect(lista.map((l) => l.estado)).toEqual(['descartado']);
  });

  it('si ya no le queda IA hoy en su plan, no la usa', async () => {
    const x = await preparar();
    await x.db.execute(sql`UPDATE usuarios SET rol = 'editor', limites = '{"analisis": 0}'::jsonb`);
    const pedidos = ia(() => ({ hipotesis: [] }));
    expect((await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' })).ia).toBe('limite');
    expect(pedidos).toEqual([]);
  });

  it('lo nuevo entra en el aviso de la mañana y lo pedido queda anotado a nombre del dueño', async () => {
    const x = await preparar();
    ia(() => ({ hipotesis: [HIPOTESIS(x.corte)] }));
    await x.ana.post('/api/analisis', { persona_id: x.personaId, ia: false });
    const r = await correrHipotesis(x.db, x.p, { hasta: x.hasta, idioma: 'es' });
    const a = await una<{ nuevos: number[] }>(x.db, sql`SELECT nuevos FROM analisis WHERE persona_id = ${x.personaId} ORDER BY creado DESC LIMIT 1`);
    expect(a?.nuevos).toContain(r.nuevos[0]);
    const uso = await filas<{ tipo: string; usuario_id: number | null }>(x.db, sql`SELECT tipo, usuario_id FROM uso_ia`);
    expect(uso).toMatchObject([{ tipo: 'hipotesis', usuario_id: expect.any(Number) }]);
  });

  it('para probarlo a mano: la administración ve el perfil sin gastar, y lo corre sin esperar a la semana', async () => {
    const x = await preparar();
    const pedidos = ia(() => ({ hipotesis: [HIPOTESIS(x.corte)] }));
    const ver = await x.ana.get(`/api/admin/hipotesis/${x.personaId}`);
    expect(ver.status).toBe(200);
    expect(ver.body.perfil).toContain('CONCEPTOS');
    expect(ver.body.perfil).not.toContain('Rodrigo');
    expect(pedidos).toEqual([]);
    for (let i = 0; i < 2; i++) expect((await x.ana.post(`/api/admin/hipotesis/${x.personaId}`)).status).toBe(200);
    expect(pedidos.length).toBe(2);
    expect((await x.ana.get(`/api/admin/hipotesis/${x.personaId}`)).body.hipotesis).toMatchObject([{ causa: 'Mate', estado: 'confirmada' }]);
    const beto = new Cliente();
    expect((await beto.get(`/api/admin/hipotesis/${x.personaId}`)).status).toBe(401);
  });

  it('el análisis mira toda la historia, no solo un año', async () => {
    const x = await preparar();
    await x.db.execute(sql.raw(`INSERT INTO registros (persona_id, concepto_id, inicio, fecha) VALUES (${x.personaId}, ${x.pizza}, '${sumarDias(x.hasta, -1200)}T12:00:00Z', '${sumarDias(x.hasta, -1200)}')`));
    const r = await x.ana.post('/api/analisis', { persona_id: x.personaId, ia: false });
    expect(r.status).toBe(200);
    expect(r.body.desde).toBe(sumarDias(x.hasta, -1200));
    expect(r.body.hasta >= x.hasta).toBe(true);
  });
});
