// Las alergias declaradas: se guardan, chocan con lo que se anota, llegan a la IA; y los chips propios de "¿Algo puntual?".
import type Anthropic from '@anthropic-ai/sdk';
import { perfilTexto } from 'shared';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { ESQUEMA } from '../src/ia/interpretar.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

function falso(respuesta: unknown) {
  const pedidos: any[] = [];
  const crear = async (p: any) => {
    pedidos.push(p);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(respuesta) }] };
  };
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
  return pedidos;
}

const ALERGIAS = [
  { tipo: 'estacional', nombre: '', estacion: 'primavera' },
  { tipo: 'alimento', nombre: 'Maní' },
  { tipo: 'alimento', nombre: 'Mariscos' },
  { tipo: 'medicamento', nombre: 'Penicilina' },
  { tipo: 'animal', nombre: 'Gatos' },
];
const REGISTRO = { tipo_valor: 'evento', fecha: '2026-10-24', hora: '13:00', duracion_min: null, valor: null, unidad: null, intensidad: null, nota: null };
const inicio = '2026-10-24T16:00:00.000Z';

describe('declarar alergias', () => {
  it('se guardan revisadas, llegan con la persona y se pueden sacar', async () => {
    const { ana, personaId } = await conAdmin();
    const r = await ana.put(`/api/personas/${personaId}`, {
      alergias: [...ALERGIAS, { tipo: 'alimento', nombre: 'maní' }, { tipo: 'alimento', nombre: '   ' }, { tipo: 'cualquiera', nombre: 'x' }, { tipo: 'estacional', estacion: 'nunca' }],
    });
    expect(r.status).toBe(200);
    const p = (await ana.get('/api/personas')).body.find((x: any) => x.id === personaId);
    expect(p.alergias).toHaveLength(5);
    expect(p.alergias).toContainEqual({ tipo: 'alimento', nombre: 'maní' });
    await ana.put(`/api/personas/${personaId}`, { alergias: [] });
    expect((await ana.get('/api/personas')).body.find((x: any) => x.id === personaId).alergias).toEqual([]);
  });

  it('rechaza demasiadas o muy largas', async () => {
    const { ana, personaId } = await conAdmin();
    expect((await ana.put(`/api/personas/${personaId}`, { alergias: [{ tipo: 'otra', nombre: 'x'.repeat(81) }] })).status).toBe(400);
    expect((await ana.put(`/api/personas/${personaId}`, { alergias: Array.from({ length: 31 }, (_, i) => ({ tipo: 'otra', nombre: `a${i}` })) })).status).toBe(400);
  });
});

describe('lo anotado que choca con una alergia', () => {
  it('avisa al anotar una comida o un remedio, sin dejar de guardarlo', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.put(`/api/personas/${personaId}`, { alergias: ALERGIAS });
    const comida = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Barrita de maní', categoria_id: categorias.comida, inicio });
    expect(comida.status).toBe(201);
    expect(comida.body.id).toBeTruthy();
    expect(comida.body.avisos_alergia).toEqual([{ que: 'Barrita de maní', alergia: 'Maní' }]);
    // Lo que trae adentro una alergia conocida.
    const rabas = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Rabas', categoria_id: categorias.comida, inicio });
    expect(rabas.body.avisos_alergia?.[0].alergia).toBe('Mariscos');
    const remedio = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Amoxidal', categoria_id: categorias.medicacion, inicio });
    expect(remedio.body.avisos_alergia).toEqual([{ que: 'Amoxidal', alergia: 'Penicilina' }]);
    // La nota también cuenta.
    const nota = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Helado', categoria_id: categorias.comida, inicio, nota: 'con maní' });
    expect(nota.body.avisos_alergia).toHaveLength(1);
  });

  it('no avisa de más: otra categoría, "sin", otra persona o sin alergias', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const sin = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Maní', categoria_id: categorias.comida, inicio });
    expect(sin.body.avisos_alergia).toBeUndefined();
    await ana.put(`/api/personas/${personaId}`, { alergias: ALERGIAS });
    for (const [nombre, cat] of [['Dolor de maní', categorias.sintoma], ['Gatos', categorias.comida], ['Amoxidal', categorias.comida], ['Helado', categorias.comida]] as const) {
      const r = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: nombre, categoria_id: cat, inicio, ...(cat === categorias.sintoma ? { intensidad: 3 } : {}) });
      expect(r.status).toBe(201);
      expect(r.body.avisos_alergia).toBeUndefined();
    }
    const dicho = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Alfajor', categoria_id: categorias.comida, inicio, nota: 'sin maní' });
    expect(dicho.body.avisos_alergia).toBeUndefined();
  });

  it('en varios y en un remedio programado; lo ya visto al revisar no se repite', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.put(`/api/personas/${personaId}`, { alergias: ALERGIAS });
    const lista = [
      { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio },
      { persona_id: personaId, concepto_nombre: 'Maní', categoria_id: categorias.comida, inicio },
    ];
    const varios = await ana.post('/api/registros/varios', { registros: lista });
    expect(varios.status).toBe(201);
    expect(varios.body[0].avisos_alergia).toBeUndefined();
    expect(varios.body[1].avisos_alergia).toHaveLength(1);
    const visto = await ana.post('/api/registros/varios', { registros: lista, alergia_vista: true });
    expect(visto.body.some((x: any) => x.avisos_alergia)).toBe(false);
    const t = await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Penicilina', inicio, cada_horas: 8 });
    expect(t.status).toBe(201);
    expect(t.body.avisos_alergia).toEqual([{ que: 'Penicilina', alergia: 'Penicilina' }]);
    const otro = await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Vitamina D', inicio, cada_horas: 24 });
    expect(otro.body.avisos_alergia).toBeUndefined();
    // Cambiar la dosis no vuelve a avisar.
    const cambio = await ana.put(`/api/tratamientos/${t.body.id}`, { dosis: 2 });
    expect(cambio.status).toBe(200);
    expect(cambio.body.avisos_alergia).toBeUndefined();
  });

  it('avisa si se corrige lo anotado a algo que choca, y no si se cambia otra cosa', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.put(`/api/personas/${personaId}`, { alergias: ALERGIAS });
    const r = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Barrita', categoria_id: categorias.comida, inicio });
    const c = await ana.put(`/api/registros/${r.body.id}`, { concepto_nombre: 'Barrita de maní', categoria_id: categorias.comida, inicio });
    expect(c.status).toBe(200);
    expect(c.body.avisos_alergia).toHaveLength(1);
    const n = await ana.put(`/api/registros/${r.body.id}`, { inicio, nota: 'rica' });
    expect(n.body.avisos_alergia).toBeUndefined();
  });
});

describe('las alergias en la IA', () => {
  it('al ordenar lo contado: las recibe, y marca lo que choca solo si es una alergia declarada', async () => {
    const { ana, personaId } = await conAdmin();
    await ana.put(`/api/personas/${personaId}`, { alergias: [{ tipo: 'alimento', nombre: 'Huevo' }, { tipo: 'alimento', nombre: 'Maní' }, { tipo: 'medicamento', nombre: 'Penicilina' }] });
    const pedidos = falso({
      registros: [{ categoria: 'comida', concepto: 'Tortilla de papas', ...REGISTRO }, { categoria: 'comida', concepto: 'Maní', ...REGISTRO }],
      tratamientos: [{ remedio: 'Penicilina', dosis: null, unidad: null, cada_horas: 8, horarios: [], primera_fecha: '2026-10-24', primera_hora: '13:00', dias: null, motivo: null }],
      alertas_alergia: [{ que: 'Tortilla de papas', alergia: 'huevo' }, { que: 'Algo', alergia: 'Una que no declaró' }],
      dudas: [],
    });
    const r = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'comí tortilla y maní' });
    expect(r.status).toBe(200);
    expect(pedidos[0].messages[0].content).toMatch(/Alergias que declaró la persona: huevo \(alimento\), maní \(alimento\), penicilina \(medicamento\)/);
    expect(r.body.alertas_alergia).toEqual(
      expect.arrayContaining([{ que: 'Tortilla de papas', alergia: 'Huevo' }, { que: 'Maní', alergia: 'Maní' }, { que: 'Penicilina', alergia: 'Penicilina' }]),
    );
    expect(r.body.alertas_alergia).toHaveLength(3);
  });

  it('sin alergias declaradas no le dice nada ni hay alertas', async () => {
    const { ana, personaId } = await conAdmin();
    const pedidos = falso({ registros: [{ categoria: 'comida', concepto: 'Maní', ...REGISTRO }], tratamientos: [], alertas_alergia: [{ que: 'Maní', alergia: 'Maní' }], dudas: [] });
    const r = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'comí maní' });
    expect(pedidos[0].messages[0].content).not.toContain('Alergias que declaró');
    expect(r.body.alertas_alergia).toEqual([]);
  });

  it('al preguntarle algo a Patty también las tiene en cuenta', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.put(`/api/personas/${personaId}`, { alergias: ALERGIAS });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: new Date().toISOString() });
    const pedidos = falso({ concepto_ids: [], desde: '', hasta: '', respuesta: 'Nada.', fechas: [] });
    const r = await ana.post('/api/preguntar', { persona_id: personaId, pregunta: '¿qué tomé?' });
    expect(r.status).toBe(200);
    expect(pedidos.at(-1).messages[0].content).toContain('Alergias que declaró la persona');
    expect(pedidos.at(-1).system?.[0]?.text ?? JSON.stringify(pedidos.at(-1).system)).toContain('ni recomiendes remedios');
  });

  it('el esquema pide las alertas y el perfil las nombra', () => {
    expect(ESQUEMA.required).toContain('alertas_alergia');
    expect(perfilTexto({ nacimiento: null, sexo: null, altura_cm: null, peso_kg: null, condiciones: [], alergias: [{ tipo: 'estacional', nombre: '', estacion: 'primavera' }, { tipo: 'alimento', nombre: 'Maní' }] })).toBe(
      'alergias: primaveral, maní (alimento)',
    );
  });
});

describe('los chips propios de "¿Algo puntual?"', () => {
  it('se agregan y se sacan, y los de Patty se pueden ocultar', async () => {
    const { ana, personaId } = await conAdmin();
    const r = await ana.put(`/api/personas/${personaId}`, {
      estados_puntuales: { propios: [{ nombre: 'Con mocos', emoji: '🤧' }, { nombre: 'con sueño', emoji: '😴' }, { nombre: '  ' }], ocultos: ['Con frío', 'Inventado'] },
    });
    expect(r.status).toBe(200);
    const p = (await ana.get('/api/personas')).body.find((x: any) => x.id === personaId);
    // El que ya trae Patty no se duplica; lo que no existe no se oculta.
    expect(p.estados_puntuales).toEqual({ propios: [{ nombre: 'Con mocos', emoji: '🤧' }], ocultos: ['Con frío'] });
    expect((await ana.put(`/api/personas/${personaId}`, { estados_puntuales: { propios: [{ nombre: 'x'.repeat(41) }] } })).status).toBe(400);
    expect((await ana.put(`/api/personas/${personaId}`, { estados_puntuales: 'cualquiera' })).status).toBe(400);
  });
});
