// El calendario del ciclo: marcar el primer día (también pasado), corregirlo o borrarlo, confirmar el fin, contestar
// "¿te vino?" y contarlo con la voz. Todo queda en los mismos registros que el Día.
import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => {
  vi.useRealTimers();
  usarClientePrueba(null);
});

/** El reloj en una hora de Buenos Aires (UTC-3). */
function ahora(fecha: string, hora = '12:00') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${fecha}T${hora}:00-03:00`));
}

const ciclo = async (ana: Awaited<ReturnType<typeof conAdmin>>['ana'], personaId: number) => (await ana.get(`/api/ciclo?persona=${personaId}`)).body;
const resumido = (periodos: any[]) => periodos.map((p) => [p.inicio, p.fin, p.dias, p.terminado]);

describe('el calendario del ciclo', () => {
  it('marca períodos pasados (con cuánto duraron, cruzando de mes), los corre de día y los borra', async () => {
    ahora('2026-11-03');
    const { ana, personaId } = await conAdmin();
    expect((await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: '2026-09-29', dias: 5 })).status).toBe(201);
    expect((await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: '2026-10-27', dias: 4 })).status).toBe(201);
    let c = await ciclo(ana, personaId);
    expect(resumido(c.periodos)).toEqual([
      ['2026-09-29', '2026-10-03', 5, true],
      ['2026-10-27', '2026-10-30', 4, true],
    ]);
    expect(c).toMatchObject({ hoy: '2026-11-03', duracion_ciclo: 28, ciclos: 1, tipico_ciclo: false, tipico_periodo: false, proxima: '2026-11-24', dia: 8, en_periodo: false });
    // Lo anotado son registros comunes: aparecen en el Día.
    const delDia = (await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-27&hasta=2026-10-30`)).body.map((r: any) => [r.fecha, r.concepto]);
    expect(delDia).toEqual([
      ['2026-10-27', 'Menstruación'],
      ['2026-10-30', 'Fin de la menstruación'],
    ]);

    // "Me equivoqué, fue el 26": se corre todo el período.
    expect((await ana.post('/api/ciclo/mover', { persona_id: personaId, inicio: '2026-10-27', fecha: '2026-10-26' })).status).toBe(200);
    c = await ciclo(ana, personaId);
    expect(resumido(c.periodos).at(-1)).toEqual(['2026-10-26', '2026-10-29', 4, true]);
    expect(c.proxima).toBe('2026-11-22');

    // Un día que todavía no llegó, o corrido más allá de hoy, no.
    expect((await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: '2026-11-04' })).status).toBe(400);
    expect((await ana.post('/api/ciclo/mover', { persona_id: personaId, inicio: '2026-10-26', fecha: '2026-11-02' })).status).toBe(400);
    expect((await ana.post('/api/ciclo/borrar', { persona_id: personaId, inicio: '2026-10-27' })).status).toBe(404);

    expect((await ana.post('/api/ciclo/borrar', { persona_id: personaId, inicio: '2026-10-26' })).status).toBe(200);
    c = await ciclo(ana, personaId);
    expect(resumido(c.periodos)).toEqual([['2026-09-29', '2026-10-03', 5, true]]);
    // Sin ciclos completos, la duración es la típica y lo dice.
    expect(c).toMatchObject({ ciclos: 0, tipico_ciclo: true, duracion_ciclo: 28, duracion_periodo: 5 });
  });

  it('el día va de 5 a 5: a las 3 de la mañana "hoy" todavía es el día anterior', async () => {
    ahora('2026-11-01', '03:30');
    const { ana, personaId, categorias } = await conAdmin();
    const c = await ciclo(ana, personaId);
    expect(c.hoy).toBe('2026-10-31');
    // El 1 de noviembre todavía no llegó para Patty.
    expect((await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: '2026-11-01' })).status).toBe(400);
    expect((await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: c.hoy })).status).toBe(201);
    // "Me vino hoy" desde la tarjeta (con la hora de ahora) cae en el mismo día: no se duplica el período.
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Menstruación', categoria_id: categorias.ciclo, intensidad: 4, inicio: new Date().toISOString() });
    const r = (await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-31`)).body;
    expect(r.map((x: any) => x.fecha)).toEqual(['2026-10-31', '2026-10-31']);
    const d = await ciclo(ana, personaId);
    expect(resumido(d.periodos)).toEqual([['2026-10-31', '2026-10-31', 1, false]]);
    expect(d).toMatchObject({ dia: 1, en_periodo: true, proxima: '2026-11-28' });
  });

  it('pregunta "¿te vino?" al llegar la fecha, "todavía no" la corre sin insistir, y después pregunta si terminó', async () => {
    ahora('2026-10-20');
    const { ana, personaId } = await conAdmin();
    for (const f of ['2026-08-04', '2026-09-01', '2026-09-29']) await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: f, dias: 4 });
    let c = await ciclo(ana, personaId);
    expect(c).toMatchObject({ proxima: '2026-10-27', ciclos: 2, regular: true, pregunta: null });

    ahora('2026-10-27');
    c = await ciclo(ana, personaId);
    expect(c.pregunta).toEqual({ tipo: 'inicio', estimada: '2026-10-27' });
    expect((await ana.post('/api/ciclo/respuesta', { persona_id: personaId, tipo: 'todavia_no' })).status).toBe(201);
    c = await ciclo(ana, personaId);
    expect(c).toMatchObject({ pregunta: null, proxima: '2026-10-29', proxima_calculada: '2026-10-27' });

    ahora('2026-10-28');
    expect((await ciclo(ana, personaId)).pregunta).toBeNull();
    ahora('2026-10-29');
    c = await ciclo(ana, personaId);
    expect(c).toMatchObject({ pregunta: { tipo: 'inicio' }, atraso: 2 });
    // "Vino otro día": ayer.
    await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: '2026-10-28' });
    c = await ciclo(ana, personaId);
    expect(c).toMatchObject({ pregunta: null, en_periodo: true, dia: 2, atraso: 0 });

    // Ya pasaron los días que suele durar y no anotó más: "¿ya terminó?".
    ahora('2026-11-01');
    c = await ciclo(ana, personaId);
    expect(c.pregunta).toEqual({ tipo: 'fin', inicio: '2026-10-28', ultimo: '2026-10-28' });
    await ana.post('/api/ciclo/respuesta', { persona_id: personaId, tipo: 'sigue' });
    expect((await ciclo(ana, personaId)).pregunta).toBeNull();
    ahora('2026-11-03');
    expect((await ciclo(ana, personaId)).pregunta).toMatchObject({ tipo: 'fin' });
    expect((await ana.post('/api/ciclo/fin', { persona_id: personaId, fecha: '2026-11-02' })).status).toBe(200);
    c = await ciclo(ana, personaId);
    expect(resumido(c.periodos).at(-1)).toEqual(['2026-10-28', '2026-11-02', 6, true]);
    expect(c).toMatchObject({ pregunta: null, en_periodo: false });
    // Solo las respuestas que existen.
    expect((await ana.post('/api/ciclo/respuesta', { persona_id: personaId, tipo: 'cualquiera' })).status).toBe(400);
  });

  it('"no me preguntes más" vale para ese ciclo', async () => {
    ahora('2026-10-27');
    const { ana, personaId } = await conAdmin();
    await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: '2026-09-29', dias: 5 });
    expect((await ciclo(ana, personaId)).pregunta).toMatchObject({ tipo: 'inicio' });
    await ana.post('/api/ciclo/respuesta', { persona_id: personaId, tipo: 'descartar_inicio' });
    ahora('2026-10-30');
    expect((await ciclo(ana, personaId)).pregunta).toBeNull();
  });
});

describe('el ciclo contado con la voz', () => {
  function falso(respuesta: unknown) {
    const pedidos: any[] = [];
    const crear = async (p: any) => {
      pedidos.push(p);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(respuesta) }] };
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    return pedidos;
  }
  const registro = (concepto: string, fecha: string, intensidad: number | null) => ({
    categoria: 'ciclo',
    concepto,
    tipo_valor: intensidad === null ? 'evento' : 'intensidad',
    fecha,
    hora: '12:00',
    duracion_min: null,
    valor: null,
    unidad: null,
    intensidad,
    nota: null,
  });
  /** Lo que haría la app: pedir la interpretación y guardar lo propuesto. */
  async function contar(ana: any, personaId: number, texto: string, propuesto: unknown[]) {
    const pedidos = falso({ registros: propuesto, tratamientos: [], dudas: [] });
    const r = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto });
    expect(r.status).toBe(200);
    expect((await ana.post('/api/registros/varios', { registros: r.body.registros })).status).toBe(201);
    return { pedidos, propuesta: r.body };
  }

  it('"me vino el martes" y "ya se me fue" marcan el inicio y el fin en el mismo calendario', async () => {
    ahora('2026-10-30');
    const { ana, personaId } = await conAdmin();
    const { pedidos, propuesta } = await contar(ana, personaId, 'me vino el martes', [registro('Menstruación', '2026-10-27', 6)]);
    // La IA sabe cómo anotar el inicio y el fin.
    expect(pedidos[0].system ?? JSON.stringify(pedidos[0])).toMatch(/Fin de la menstruación/);
    expect(propuesta.registros[0]).toMatchObject({ concepto_nombre: 'Menstruación', nuevo: false });
    let c = await ciclo(ana, personaId);
    expect(resumido(c.periodos)).toEqual([['2026-10-27', '2026-10-27', 1, false]]);

    const fin = await contar(ana, personaId, 'ya se me fue ayer', [registro('Fin de la menstruación', '2026-10-29', null)]);
    expect(fin.propuesta.registros[0]).toMatchObject({ concepto_nombre: 'Fin de la menstruación', nuevo: false });
    c = await ciclo(ana, personaId);
    expect(resumido(c.periodos)).toEqual([['2026-10-27', '2026-10-29', 3, true]]);

    // Si lo vuelve a contar con otro día, queda un solo fin: el último que dijo.
    await contar(ana, personaId, 'no, se me fue hoy', [registro('Fin de la menstruación', '2026-10-30', null)]);
    c = await ciclo(ana, personaId);
    expect(resumido(c.periodos)).toEqual([['2026-10-27', '2026-10-30', 4, true]]);
    const fines = (await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-27&hasta=2026-10-30`)).body.filter((r: any) => r.concepto === 'Fin de la menstruación');
    expect(fines).toHaveLength(1);
  });

  it('contesta "¿te vino?" con la voz: "sí, me vino" es hoy', async () => {
    ahora('2026-10-27');
    const { ana, personaId } = await conAdmin();
    await ana.post('/api/ciclo/inicio', { persona_id: personaId, fecha: '2026-09-29', dias: 5 });
    expect((await ciclo(ana, personaId)).pregunta).toMatchObject({ tipo: 'inicio' });
    await contar(ana, personaId, 'sí, me vino', [registro('Menstruación', '2026-10-27', 6)]);
    const c = await ciclo(ana, personaId);
    expect(c).toMatchObject({ pregunta: null, en_periodo: true, dia: 1, ciclos: 1, duracion_ciclo: 28 });
  });
});
