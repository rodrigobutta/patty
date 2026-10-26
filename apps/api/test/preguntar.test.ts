import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

/** Un cliente falso que contesta, en orden, cada una de `respuestas`. */
function falso(...respuestas: unknown[]) {
  const pedidos: any[] = [];
  const crear = async (p: any) => {
    pedidos.push(p);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(respuestas[pedidos.length - 1]) }] };
  };
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
  return pedidos;
}

describe('preguntale a Patty', () => {
  it('elige qué datos mirar, contesta con esos días y la pregunta queda para la administración', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const huevo = (await ana.post('/api/conceptos', { nombre: 'Huevo', categoria_id: categorias.comida })).body.concepto.id;
    const cafe = (await ana.post('/api/conceptos', { nombre: 'Café', categoria_id: categorias.bebida })).body.concepto.id;
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: huevo, inicio: '2026-10-20T12:00:00Z', valor: 2, nota: 'revueltos' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: huevo, inicio: '2026-10-23T12:00:00Z' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: cafe, inicio: '2026-10-23T11:00:00Z' });
    const pedidos = falso(
      { concepto_ids: [huevo, 99999], desde: '', hasta: '' },
      { respuesta: 'Comiste huevos el martes 20 y el viernes 23 de octubre.', fechas: ['2026-10-23', '2026-10-20', '1999-01-01'] },
    );
    const r = await ana.post('/api/preguntar', { persona_id: personaId, pregunta: '¿Cuándo comí huevos?' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ respuesta: 'Comiste huevos el martes 20 y el viernes 23 de octubre.', fechas: ['2026-10-23', '2026-10-20'], conceptos: [{ id: huevo, nombre: 'Huevo' }] });
    expect(pedidos[0].messages[0].content).toContain(`${huevo} | Huevo`);
    // Al segundo paso solo van los huevos (con la nota), no el café.
    expect(pedidos[1].messages[0].content).toContain('Huevo 2');
    expect(pedidos[1].messages[0].content).toContain('"revueltos"');
    expect(pedidos[1].messages[0].content).not.toContain('Café');
    expect((await ana.get(`/api/preguntar/ultimas?persona=${personaId}`)).body).toEqual(['¿Cuándo comí huevos?']);
    const uso = (await ana.get('/api/admin/uso?dias=7')).body;
    expect(uso.preguntas[0]).toMatchObject({ pregunta: '¿Cuándo comí huevos?', respuesta: 'Comiste huevos el martes 20 y el viernes 23 de octubre.' });
  });

  it('el tiempo de uso se suma por día y por pantalla', async () => {
    const { ana } = await conAdmin();
    const hoy = new Date().toISOString().slice(0, 10);
    await ana.post('/api/uso', { fecha: hoy, segundos: 0, pantalla: 'hoy', abrio: true, plataforma: 'android' });
    await ana.post('/api/uso', { fecha: hoy, segundos: 60, pantalla: 'hoy' });
    await ana.post('/api/uso', { fecha: hoy, segundos: 30, pantalla: 'patrones' });
    await ana.post('/api/uso', { fecha: hoy, segundos: 9999, pantalla: 'cualquiera' });
    expect((await ana.post('/api/uso', { fecha: 'ayer', segundos: 5 })).status).toBe(400);
    const { usuarios, pantallas } = (await ana.get('/api/admin/uso?dias=90')).body;
    expect(usuarios[0]).toMatchObject({ segundos: 690, dias: 1 });
    expect(Object.fromEntries(pantallas.map((p: any) => [p.pantalla, p.segundos]))).toEqual({ hoy: 60, patrones: 30, otra: 600 });
  });
});
