import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

/** Un cliente de Anthropic falso que responde siempre `respuesta` y guarda lo que se le pidió. */
function falso(respuesta: unknown) {
  const pedidos: any[] = [];
  const crear = async (p: any) => {
    pedidos.push(p);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(respuesta) }] };
  };
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
  return pedidos;
}

describe('texto libre con IA', () => {
  it('propone registros reusando los conceptos que ya existen, sin guardar nada', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const tomate = (await ana.post('/api/conceptos', { nombre: 'Tomate', categoria_id: categorias.comida })).body.concepto;
    const pedidos = falso({
      registros: [
        { categoria: 'comida', concepto: 'tomate', tipo_valor: 'evento', fecha: '2026-10-24', hora: '13:00', duracion_min: null, valor: null, unidad: null, intensidad: null, nota: 'en ensalada' },
        { categoria: 'sintoma', concepto: 'Dolor de cabeza', tipo_valor: 'intensidad', fecha: '2026-10-24', hora: '18:30', duracion_min: null, valor: null, unidad: null, intensidad: 4, nota: null },
        { categoria: 'inventada', concepto: 'X', tipo_valor: 'evento', fecha: '2026-10-24', hora: '10:00', duracion_min: null, valor: null, unidad: null, intensidad: null, nota: null },
      ],
      dudas: [],
    });
    const r = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'almorcé ensalada de tomate y a la tarde me dolió la cabeza' });
    expect(r.status).toBe(200);
    expect(r.body.registros).toHaveLength(2);
    expect(r.body.registros[0]).toMatchObject({ concepto_id: tomate.id, concepto_nombre: 'Tomate', nuevo: false, inicio: '2026-10-24T16:00:00.000Z', nota: 'en ensalada' });
    expect(r.body.registros[1]).toMatchObject({ concepto_id: null, concepto_nombre: 'Dolor de cabeza', nuevo: true, intensidad: 4 });
    expect(pedidos[0].model).toBe('claude-opus-5-5');
    expect(pedidos[0].messages[0].content).toContain('- comida: Tomate');
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-24`)).body).toEqual([]);

    // la persona revisa y guarda: el concepto nuevo se crea en ese momento
    const g = await ana.post('/api/registros/varios', { registros: r.body.registros });
    expect(g.status).toBe(201);
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-24`)).body.map((x: any) => x.origen)).toEqual(['ia', 'ia']);
  });

  it('lo de otro día va a ese día, con la duración; y sabe qué día se estaba mirando', async () => {
    const { ana, personaId } = await conAdmin();
    const pedidos = falso({
      registros: [
        { categoria: 'otro', concepto: 'Cumpleaños', tipo_valor: 'duracion', fecha: '2026-10-23', hora: '21:00', duracion_min: 180, valor: null, unidad: null, intensidad: null, nota: null },
        { categoria: 'comida', concepto: 'Pizza', tipo_valor: 'evento', fecha: '2026-10-23', hora: '21:30', duracion_min: null, valor: null, unidad: null, intensidad: null, nota: null },
      ],
      dudas: [],
    });
    const r = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'ayer a la noche fui a un cumpleaños, comí pizza y estuvimos 3 horas', fecha: '2026-10-22' });
    expect(r.body.registros[0]).toMatchObject({ concepto_nombre: 'Cumpleaños', inicio: '2026-10-24T00:00:00.000Z', fin: '2026-10-24T03:00:00.000Z', valor: 180 });
    expect(pedidos[0].messages[0].content).toContain('está mirando el día');
    expect(pedidos[0].messages[0].content).toMatch(/2026-10-22/);
    const g = await ana.post('/api/registros/varios', { registros: r.body.registros });
    expect(g.body.map((x: any) => x.fecha)).toEqual(['2026-10-23', '2026-10-23']);
  });
});
