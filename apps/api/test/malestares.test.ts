import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { seguirMalestares } from '../src/patrones/malestares.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('malestares con duración', () => {
  it('el malestar del momento queda abierto; Patty pregunta si sigue, y "ya se me pasó" lo cierra con su fin', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const ahora = Date.now();
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, intensidad: 6, inicio: new Date(ahora - 3 * 3600000).toISOString() })).body;
    // Uno de ayer (contado después) no queda abierto, ni lo que no es un malestar.
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de panza', categoria_id: categorias.sintoma, intensidad: 4, inicio: new Date(ahora - 30 * 3600000).toISOString() });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: new Date(ahora - 3600000).toISOString() });
    expect((await ana.get(`/api/registros/abiertos?persona=${personaId}`)).body.map((x: any) => x.concepto)).toEqual(['Dolor de cabeza']);

    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    const db = obtenerDb();
    // A las 15 de Buenos Aires (de día): pregunta; enseguida no vuelve a preguntar.
    const tarde = new Date(new Date().toISOString().slice(0, 10) + 'T18:00:00Z');
    // Para que el malestar tenga 3 horas a esa hora, se corre el inicio.
    await db.execute(sql`UPDATE registros SET inicio = ${new Date(tarde.getTime() - 3 * 3600000).toISOString()} WHERE id = ${r.id}`);
    expect(await seguirMalestares(db, tarde)).toBe(1);
    expect(await seguirMalestares(db, new Date(tarde.getTime() + 60000))).toBe(0);
    expect(enviados[0]).toMatchObject({ titulo: '🦉 ¿Seguís con dolor de cabeza?', datos: { tipo: 'malestar' } });
    expect(enviados[0].acciones?.map((a) => a.titulo)).toEqual(['Ya se me pasó', 'Sigo igual', 'Peor']);
    // De noche no pregunta.
    expect(await seguirMalestares(db, new Date(tarde.getTime() + 8 * 3600000))).toBe(0);

    expect((await ana.post(`/api/registros/${r.id}/seguir`, { estado: 'igual' })).status).toBe(200);
    const fin = (await ana.post(`/api/registros/${r.id}/seguir`, { estado: 'paso' })).body;
    expect(fin.fin).not.toBeNull();
    expect((await ana.get(`/api/registros/abiertos?persona=${personaId}`)).body).toEqual([]);
  });
});

describe('remedios para un malestar', () => {
  it('con un malestar abierto, Patty lo pasa a la IA; el remedio queda unido y el malestar muestra sus remedios', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const ahora = Date.now();
    const dolor = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, intensidad: 6, inicio: new Date(ahora - 3600000).toISOString() })).body;
    const pedidos: any[] = [];
    const crear = async (p: any) => {
      pedidos.push(p);
      const r = { registros: [{ categoria: 'medicacion', concepto: 'Ibuprofeno', tipo_valor: 'evento', fecha: '2026-10-24', hora: '14:00', duracion_min: null, valor: 600, unidad: 'mg', intensidad: null, nota: null, para_malestar: 'dolor de cabeza' }], dudas: [] };
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(r) }] };
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    const r = (await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'me tomé un ibuprofeno 600 para la cabeza' })).body;
    usarClientePrueba(null);
    expect(pedidos[0].messages[0].content).toContain('Malestares que tiene abiertos ahora');
    expect(pedidos[0].messages[0].content).toContain('- Dolor de cabeza, desde las');
    expect(r.registros[0]).toMatchObject({ para_registro_id: dolor.id, para: 'dolor de cabeza' });

    const remedio = (await ana.post('/api/registros', { ...r.registros[0], inicio: new Date().toISOString() })).body;
    expect(remedio).toMatchObject({ para_registro_id: dolor.id, para: 'Dolor de cabeza' });
    const abiertos = (await ana.get(`/api/registros/abiertos?persona=${personaId}`)).body;
    expect(abiertos[0].remedios.map((x: any) => x.concepto)).toEqual(['Ibuprofeno']);
    // No se puede unir a un registro que no es un malestar.
    const cafe = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida })).body;
    expect((await ana.put(`/api/registros/${remedio.id}`, { para_registro_id: cafe.id })).body.para_registro_id).toBeNull();
  });
});
