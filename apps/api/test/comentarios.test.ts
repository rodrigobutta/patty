import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

describe('comentarios de Patty', () => {
  it('arma los del día con lo anotado en la semana, una sola vez, y se pueden marcar', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const pedidos: any[] = [];
    const crear = async (p: any) => {
      pedidos.push(p);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ comentarios: [{ emoji: '🥚', texto: '¡Qué bien que comas huevo seguido!' }, { emoji: '🐕', texto: 'Genial que saques a los perros.' }] }) }] };
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    // Sin nada anotado, no se arma nada (ni se gasta la IA).
    expect((await ana.get(`/api/comentarios?persona=${personaId}&hoy=1`)).body).toEqual([]);
    expect(pedidos).toHaveLength(0);
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Huevo', categoria_id: categorias.comida, inicio: new Date(Date.now() - 3600000).toISOString() });
    const l = (await ana.get(`/api/comentarios?persona=${personaId}&hoy=1`)).body;
    expect(l.map((c: any) => c.texto)).toEqual(['¡Qué bien que comas huevo seguido!', 'Genial que saques a los perros.']);
    expect(pedidos[0].messages[0].content).toContain('Huevo');
    // La segunda vez en el día no se vuelve a pedir.
    await ana.get(`/api/comentarios?persona=${personaId}&hoy=1`);
    expect(pedidos).toHaveLength(1);
    expect((await ana.put(`/api/comentarios/${l[0].id}`, { estado: 'gusta' })).status).toBe(200);
    expect((await ana.get(`/api/comentarios?persona=${personaId}`)).body[0].estado).toBe('gusta');
  });
});
