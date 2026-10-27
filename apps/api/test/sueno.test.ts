import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { filas, obtenerDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { cerrarDb } from '../src/db/client.js';
import { despertarRepetido, type EtapaNoche } from '../src/patrones/despertares.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

/** Una noche de 23:00 a 7:00 con un despertar a `desp` (minutos desde las 0 del día anterior) de `dura` minutos. */
const noche = (fecha: string, desp: number | null, dura = 15): EtapaNoche[] => {
  const inicio = 23 * 60;
  const fin = 31 * 60;
  if (desp === null) return [{ noche: fecha, desde: inicio, minutos: fin - inicio, etapa: 'ligero' }];
  return [
    { noche: fecha, desde: inicio, minutos: desp - inicio, etapa: 'profundo' },
    { noche: fecha, desde: desp, minutos: dura, etapa: 'despierto' },
    { noche: fecha, desde: desp + dura, minutos: fin - desp - dura, etapa: 'ligero' },
  ];
};

describe('despertares que se repiten', () => {
  it('3 noches cerca de las 4 → pregunta; 2 o despertares cortos → no', () => {
    const r = despertarRepetido([...noche('2026-10-20', 28 * 60 + 5), ...noche('2026-10-21', 28 * 60 + 20), ...noche('2026-10-22', 27 * 60 + 55), ...noche('2026-10-23', null)]);
    expect(r).toEqual({ hora: '04:05', noches: 3, miradas: 4 });
    expect(despertarRepetido([...noche('2026-10-20', 28 * 60), ...noche('2026-10-21', 28 * 60)])).toBeNull();
    expect(despertarRepetido([...noche('2026-10-20', 28 * 60, 2), ...noche('2026-10-21', 28 * 60, 2), ...noche('2026-10-22', 28 * 60, 2)])).toBeNull();
  });

  it('las etapas de cada noche se guardan (reemplazando la noche) y se leen', async () => {
    const { ana, personaId } = await conAdmin();
    const etapas = [
      { inicio: '2026-10-26T02:00:00Z', fin: '2026-10-26T05:00:00Z', etapa: 'profundo' },
      { inicio: '2026-10-26T05:00:00Z', fin: '2026-10-26T05:20:00Z', etapa: 'despierto' },
      { inicio: '2026-10-26T05:20:00Z', fin: '2026-10-26T10:00:00Z', etapa: 'ligero' },
      { inicio: 'x', fin: 'y', etapa: 'profundo' },
    ];
    expect((await ana.post('/api/sueno/etapas', { persona_id: personaId, noches: [{ noche: '2026-10-26', etapas }] })).body).toEqual({ ok: true, etapas: 3 });
    await ana.post('/api/sueno/etapas', { persona_id: personaId, noches: [{ noche: '2026-10-26', etapas: etapas.slice(0, 2) }] });
    const r = (await ana.get(`/api/sueno/noche?persona=${personaId}&fecha=2026-10-26`)).body;
    expect(r.map((x: any) => x.etapa)).toEqual(['profundo', 'despierto']);
  });
});

describe('resumen de la noche', () => {
  it('la IA lo arma una vez, se guarda por noche y la nota entra como «Calidad del sueño»', async () => {
    const { ana, personaId } = await conAdmin();
    const pedidos: any[] = [];
    const crear = async (p: any) => {
      pedidos.push(p);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ texto: 'Dormiste 8 horas, con un despertar a las 2.', calidad: 7 }) }] };
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    expect((await ana.get(`/api/sueno/resumen?persona=${personaId}&fecha=2026-10-26`)).body).toBeNull(); // sin datos, nada
    await ana.post('/api/sueno/etapas', { persona_id: personaId, noches: [{ noche: '2026-10-26', etapas: [
      { inicio: '2026-10-26T02:00:00Z', fin: '2026-10-26T05:00:00Z', etapa: 'profundo' },
      { inicio: '2026-10-26T05:00:00Z', fin: '2026-10-26T05:10:00Z', etapa: 'despierto' },
      { inicio: '2026-10-26T05:10:00Z', fin: '2026-10-26T10:00:00Z', etapa: 'ligero' },
    ] }] });
    const r = (await ana.get(`/api/sueno/resumen?persona=${personaId}&fecha=2026-10-26`)).body;
    expect(r).toEqual({ noche: '2026-10-26', texto: 'Dormiste 8 horas, con un despertar a las 2.', calidad: 7 });
    expect(pedidos[0].messages[0].content).toContain('02:00–02:10 despierto');
    await ana.get(`/api/sueno/resumen?persona=${personaId}&fecha=2026-10-26`);
    expect(pedidos).toHaveLength(1);
    const m = await filas<{ valor: number }>(obtenerDb(), sql`SELECT m.valor FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id WHERE m.persona_id = ${personaId} AND c.nombre = 'Calidad del sueño'`);
    expect(m.map((x) => x.valor)).toEqual([7]);
  });
});

describe('caminatas', () => {
  it('se guardan por día (reemplazando el día) y se leen con su hora', async () => {
    const { ana, personaId } = await conAdmin();
    const dia = { fecha: '2026-10-26', caminatas: [{ inicio: '2026-10-26T13:00:00Z', fin: '2026-10-26T13:25:00Z', pasos: 2500 }, { inicio: 'x', fin: 'y' }] };
    expect((await ana.post('/api/actividad/caminatas', { persona_id: personaId, dias: [dia] })).body).toEqual({ ok: true, caminatas: 1 });
    await ana.post('/api/actividad/caminatas', { persona_id: personaId, dias: [dia] });
    const l = (await ana.get(`/api/actividad/caminatas?persona=${personaId}&fecha=2026-10-26`)).body;
    expect(l).toHaveLength(1);
    expect(l[0].minutos).toBe(25);
  });
});
