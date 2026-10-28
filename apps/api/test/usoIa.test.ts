import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

describe('uso de la IA', () => {
  it('cada pedido queda anotado con sus tokens; al llegar al límite del día, un error claro; el admin cambia el plan', async () => {
    const { ana, personaId } = await conAdmin();
    const crear = async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: 'text', text: JSON.stringify({ registros: [], tratamientos: [], dudas: [] }) }] });
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    const db = obtenerDb();
    const id = (await ana.get('/api/sesion')).body.usuario.id;
    // Ana pasa a editora con un plan propio: 1 por día para contar.
    await db.execute(sql`UPDATE usuarios SET rol = 'editor' WHERE id = ${id}`);
    await db.execute(sql`UPDATE usuarios SET plan = 'gratis', limites = '{"contar": 1}'::jsonb WHERE id = ${id}`);
    expect((await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'comí fideos' })).status).toBe(200);
    const no = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'y un café' });
    expect(no.status).toBe(429);
    expect(no.body.error).toBe('Llegaste al límite de hoy para «Contarle a Patty» (1 por día). Mañana se renueva.');
    expect((await ana.get('/api/uso-ia')).body).toMatchObject({ plan: 'gratis', limites: { contar: 1, foto: 15 }, hoy: { contar: 1 } });
    const [fila] = [...(await db.execute(sql`SELECT usuario_id, tipo, entrada, salida FROM uso_ia`))] as any[];
    expect(fila).toMatchObject({ usuario_id: id, tipo: 'contar', entrada: 1000, salida: 200 });

    // De vuelta admin: cambia el plan (sin límites propios) y ve cuánto gasta cada uno.
    await db.execute(sql`UPDATE usuarios SET rol = 'admin' WHERE id = ${id}`);
    expect((await ana.put(`/api/admin/usuarios/${id}/plan`, { plan: 'plus' })).status).toBe(200);
    const u = (await ana.get('/api/admin/uso-ia')).body.usuarios.find((x: any) => x.id === id);
    expect(u).toMatchObject({ plan: 'plus', limites: null, efectivos: { contar: 150 }, hoy: { contar: 1 }, pedidos_mes: 1, tokens_mes: 1200 });
    expect(u.costo_mes).toBeGreaterThan(0);
  });
});
