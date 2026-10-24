import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

const hora = 3600000;

describe('remedios y tomas', () => {
  it('cada 8 h por 5 días: 15 tomas; marcar tomada deja el registro, salteada no, y deshacer vuelve a pendiente', async () => {
    const { ana, personaId } = await conAdmin();
    const inicio = '2026-10-20T17:30:00.000Z'; // 14:30 en Buenos Aires
    const t = await ana.post('/api/tratamientos', {
      persona_id: personaId,
      concepto_nombre: 'paracetamol',
      dosis: 1,
      unidad: 'g',
      cada_horas: 8,
      inicio,
      fin: new Date(Date.parse(inicio) + 5 * 24 * hora).toISOString(),
      motivo: 'anginas',
    });
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({ remedio: 'Paracetamol', total: 15, tomadas: 0, cada_horas: 8 });

    // El día de Patty 2026-10-21 (de 5 a 5): 06:30, 14:30 y 22:30.
    const dia = await ana.get(`/api/tratamientos/tomas?persona=${personaId}&fecha=2026-10-21`);
    expect(dia.body.map((x: any) => x.programada)).toEqual(['2026-10-21T09:30:00.000Z', '2026-10-21T17:30:00.000Z', '2026-10-22T01:30:00.000Z']);
    expect(dia.body.every((x: any) => x.estado === null)).toBe(true);

    const m = await ana.post(`/api/tratamientos/${t.body.id}/tomas`, { programada: '2026-10-21T17:30:00.000Z', estado: 'tomada', inicio: '2026-10-21T17:40:00.000Z' });
    expect(m.status).toBe(201);
    expect(m.body.registro).toMatchObject({ concepto: 'Paracetamol', valor: 1, unidad: 'g', origen: 'recordatorio', fecha: '2026-10-21' });
    await ana.post(`/api/tratamientos/${t.body.id}/tomas`, { programada: '2026-10-21T09:30:00.000Z', estado: 'salteada' });
    expect((await ana.post(`/api/tratamientos/${t.body.id}/tomas`, { programada: '2026-10-21T10:00:00.000Z', estado: 'tomada' })).status).toBe(400);

    const despues = (await ana.get(`/api/tratamientos/tomas?persona=${personaId}&fecha=2026-10-21`)).body;
    expect(despues.map((x: any) => x.estado)).toEqual(['salteada', 'tomada', null]);
    expect(despues[1].tomada).toBe('2026-10-21T17:40:00.000Z');
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-21`)).body).toHaveLength(1);
    expect((await ana.get(`/api/tratamientos?persona=${personaId}`)).body[0].tomadas).toBe(1);

    // Deshacer: se borra el registro y vuelve a estar sin marcar.
    await ana.del(`/api/tratamientos/${t.body.id}/tomas?programada=2026-10-21T17:30:00.000Z`);
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-21`)).body).toHaveLength(0);
    expect((await ana.get(`/api/tratamientos/tomas?persona=${personaId}&fecha=2026-10-21`)).body[1].estado).toBe(null);
  });

  it('a horario fijo y sin fin: las próximas tomas para los avisos; terminar las corta', async () => {
    const { ana, personaId } = await conAdmin();
    const t = await ana.post('/api/tratamientos', {
      persona_id: personaId,
      concepto_nombre: 'Vitamina D',
      dosis: 1,
      unidad: 'comprimido',
      horarios: ['9:00', '21:00'],
      inicio: new Date(Date.now() - hora).toISOString(),
    });
    expect(t.body).toMatchObject({ horarios: ['09:00', '21:00'], total: null, activo: true });
    expect(t.body.proxima).toBeTruthy();
    const prox = (await ana.get('/api/tratamientos/proximas?horas=48')).body;
    expect(prox.length).toBeGreaterThanOrEqual(3);
    expect(prox.length).toBeLessThanOrEqual(4);
    expect(prox[0]).toMatchObject({ remedio: 'Vitamina D', persona_id: personaId, estado: null });

    const f = await ana.post(`/api/tratamientos/${t.body.id}/terminar`);
    expect(f.body).toMatchObject({ activo: false, proxima: null });
    expect((await ana.get('/api/tratamientos/proximas?horas=48')).body).toEqual([]);
    // cuando haga falta: no tiene tomas programadas
    const prn = await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Ibuprofeno', dosis: 400, unidad: 'mg', inicio: new Date().toISOString() });
    expect(prn.body).toMatchObject({ total: null, proxima: null, activo: true, horarios: [], cada_horas: null });
  });

  it('anotar el remedio a mano cuenta como la toma programada más cercana', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const t = await ana.post('/api/tratamientos', {
      persona_id: personaId,
      concepto_nombre: 'Amoxicilina',
      dosis: 500,
      unidad: 'mg',
      cada_horas: 12,
      inicio: '2026-10-20T11:00:00.000Z',
      fin: '2026-10-27T11:00:00.000Z',
    });
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: t.body.concepto_id, categoria_id: categorias.medicacion, inicio: '2026-10-21T12:10:00.000Z', valor: 500 });
    const dia = (await ana.get(`/api/tratamientos/tomas?persona=${personaId}&fecha=2026-10-21`)).body;
    expect(dia.map((x: any) => x.estado)).toEqual(['tomada', null]);
    // lejos de cualquier toma (más de 3 h): no se vincula
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: t.body.concepto_id, inicio: '2026-10-22T05:00:00.000Z' });
    expect((await ana.get(`/api/tratamientos/tomas?persona=${personaId}&fecha=2026-10-22`)).body.map((x: any) => x.estado)).toEqual([null, null]);
  });

  it('valida y solo quien puede anotar a la persona', async () => {
    const { ana, personaId } = await conAdmin();
    expect((await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'X', horarios: ['25:00'] })).status).toBe(400);
    expect((await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'X', cada_horas: 0.1 })).status).toBe(400);
    expect((await ana.post('/api/tratamientos', { persona_id: personaId, inicio: new Date().toISOString() })).status).toBe(400);
    await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', clave: 'secreta1', rol: 'editor' });
    const { Cliente } = await import('./ayudas.js');
    const beto = new Cliente();
    await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta1' });
    expect((await beto.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'X', inicio: new Date().toISOString() })).status).toBe(404);
    expect((await beto.get('/api/tratamientos/proximas')).body).toEqual([]);
  });

  it('contarlo: «paracetamol 1 g cada 8 horas por 5 días» se propone como tratamiento', async () => {
    const { ana, personaId } = await conAdmin();
    const pedidos: any[] = [];
    const crear = async (p: any) => {
      pedidos.push(p);
      return {
        stop_reason: 'end_turn',
        content: [{
          type: 'text',
          text: JSON.stringify({
            registros: [],
            tratamientos: [{ remedio: 'Paracetamol', dosis: 1, unidad: 'g', cada_horas: 8, horarios: [], primera_fecha: '2026-10-24', primera_hora: '14:30', dias: 5, motivo: 'anginas' }],
            dudas: [],
          }),
        }],
      };
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    const r = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'tengo anginas y el médico me dijo paracetamol 1 g cada 8 horas por 5 días' });
    expect(r.status).toBe(200);
    expect(r.body.tratamientos[0]).toMatchObject({
      concepto_nombre: 'Paracetamol',
      nuevo: true,
      dosis: 1,
      unidad: 'g',
      cada_horas: 8,
      inicio: '2026-10-24T17:30:00.000Z',
      fin: '2026-10-29T17:30:00.000Z',
      motivo: 'anginas',
    });
    const g = await ana.post('/api/tratamientos', r.body.tratamientos[0]);
    expect(g.body.total).toBe(15);
  });
});

describe('progreso hacia los patrones', () => {
  it('cuenta días anotados y días con cómo se sintió; el avance llega a 1 con 14 y 7', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    for (let i = 0; i < 3; i++) {
      const dia = `2026-10-${String(20 + i).padStart(2, '0')}T15:00:00.000Z`;
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Agua', categoria_id: categorias.bebida, inicio: dia, valor: 1 });
    }
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: '2026-10-21T18:00:00.000Z', intensidad: 4 });
    const p = (await ana.get(`/api/progreso?persona=${personaId}`)).body;
    expect(p).toEqual({ dias: 3, dias_efecto: 1, minimo: 14, minimo_efecto: 7 });
    const { avanceProgreso } = await import('shared');
    expect(avanceProgreso(p).nivel).toBe(0);
    expect(avanceProgreso({ ...p, dias: 14, dias_efecto: 7 })).toMatchObject({ nivel: 1, avance: 0 });
    expect(avanceProgreso({ ...p, dias: 22, dias_efecto: 7 }).avance).toBeCloseTo(0.5);
    expect(avanceProgreso({ ...p, dias: 90, dias_efecto: 30 })).toMatchObject({ nivel: 3, avance: 1, siguiente: null });
  });
});

describe('estadísticas', () => {
  it('lo que más se anotó, ánimo, sueño y los días de un concepto para el calendario', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const hoy = new Date();
    const hace = (d: number, h = 15) => new Date(hoy.getTime() - d * 86400000).toISOString().slice(0, 10) + `T${String(h).padStart(2, '0')}:00:00.000Z`;
    const huevo = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Huevo', categoria_id: categorias.comida, inicio: hace(1), valor: 2, unidad: 'unidades' })).body;
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: huevo.concepto_id, inicio: hace(3), valor: 1, unidad: 'unidades' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: hace(2), intensidad: 6 });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Cómo me siento', categoria_id: categorias.animo, inicio: hace(2), intensidad: 7 });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Me acosté', categoria_id: categorias.sueno, inicio: hace(2, 3) }); // 00:00 AR
    const e = (await ana.get(`/api/estadisticas?persona=${personaId}&dias=30`)).body;
    expect(e.dias_anotados).toBeGreaterThanOrEqual(3);
    expect(e.top[0]).toMatchObject({ concepto: 'Huevo', dias: 2, veces: 2, suma: 3 });
    expect(e.top.some((t: any) => t.concepto === 'Cómo me siento')).toBe(false);
    expect(e.animo).toEqual([7]);
    expect(e.dolores).toMatchObject([{ concepto: 'Dolor de cabeza', dias: 1 }]);
    expect(e.sueno.acoste).toBe(0);
    const s = (await ana.get(`/api/estadisticas/concepto?persona=${personaId}&concepto=${huevo.concepto_id}`)).body;
    expect(s.concepto.nombre).toBe('Huevo');
    expect(s.dias.map((d: any) => d.suma)).toEqual([1, 2]);
  });
});
