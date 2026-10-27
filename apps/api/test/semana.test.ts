import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { lunesDe } from '../src/ia/resumirSemana.js';
import { resumirSemanas } from '../src/patrones/noche.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => {
  usarClientePrueba(null);
  usarEnvioPrueba(null);
});

describe('resumen de la semana', () => {
  it('el domingo a las 20 lo arma una vez, lo guarda con los números y el búho avisa', async () => {
    expect(lunesDe('2026-10-25')).toBe('2026-10-19');
    expect(lunesDe('2026-10-19')).toBe('2026-10-19');
    const { ana, personaId, categorias } = await conAdmin();
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: '2026-10-22T12:00:00Z' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: '2026-10-23T18:00:00Z', intensidad: 5 });
    const pedidos: any[] = [];
    const crear = async (p: any) => {
      pedidos.push(p);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ titulo: 'Una semana tranquila', texto: 'Anotaste 2 días.', destacados: [{ emoji: '☕', texto: 'Café' }], sugerencias: ['Probá caminar'] }) }] };
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    const db = obtenerDb();
    expect(await resumirSemanas(db, new Date('2026-10-25T21:00:00Z'))).toBe(0); // las 18: todavía no
    expect(await resumirSemanas(db, new Date('2026-10-25T23:05:00Z'))).toBe(1); // domingo 20:05 en Buenos Aires
    expect(await resumirSemanas(db, new Date('2026-10-25T23:20:00Z'))).toBe(0); // una vez
    expect(pedidos[0].messages[0].content).toContain('molestias: 1');
    expect(enviados[0]).toMatchObject({ titulo: '🦉 Tu semana', cuerpo: 'Una semana tranquila', datos: { tipo: 'semana' } });
    const l = (await ana.get(`/api/semanas?persona=${personaId}`)).body;
    expect(l[0]).toMatchObject({ semana: '2026-10-19', titulo: 'Una semana tranquila', numeros: { dias_anotados: 2, molestias: 1 } });
  });
});

describe('¿qué pasó antes?', () => {
  it('para una molestia arma lo de las 72 h previas y unas líneas, una vez; se ve en el registro', async () => {
    const { contextosPendientes } = await import('../src/patrones/noche.js');
    const { sql } = await import('drizzle-orm');
    const { ana, personaId, categorias } = await conAdmin();
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Salame', categoria_id: categorias.comida, inicio: '2026-10-26T15:00:00Z' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: '2026-10-23T15:00:00Z' }); // más de 72 h antes
    const dolor = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de panza', categoria_id: categorias.sintoma, inicio: '2026-10-26T20:00:00Z', intensidad: 6 })).body;
    const crear = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ texto: 'Antes comiste salame.' }) }] });
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    const db = obtenerDb();
    expect(await contextosPendientes(db)).toBe(0); // recién anotado: espera un minuto
    await db.execute(sql`UPDATE registros SET creado = now() - interval '5 minutes' WHERE persona_id = ${personaId}`);
    expect(await contextosPendientes(db)).toBe(1);
    expect(await contextosPendientes(db)).toBe(0);
    const c = (await ana.get(`/api/registros/${dolor.id}/contexto`)).body;
    expect(c.texto).toBe('Antes comiste salame.');
    expect(c.items.map((x: any) => x.texto)).toEqual(['Salame']);
  });
});
