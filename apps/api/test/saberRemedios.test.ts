// Lo que Patty sabe de lo que se toma. La IA está siempre falsa en estas pruebas: acá se prueba qué se le pide, qué se hace con lo que
// contesta y qué se le muestra a la persona, no lo que contestaría de verdad.
import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { AVISO_COBERTURA, AVISO_DECIDE_EL_MEDICO, AVISO_INFORMACION_GENERAL, AVISO_URGENTE, esTextoSeguro, FOTO_NO_LEIDA, INTERACCION_TAMBIEN_TOMAS, NO_SE_DE_ESTE_REMEDIO, PODRIA_REVISAR, textoSenal, TODAVIA_AVERIGUANDO, traducir } from 'shared';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, filas, obtenerDb, una } from '../src/db/client.js';
import { armarContexto } from '../src/ia/contexto.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { ESQUEMA_ENVASE, ESQUEMA_SABERES, SISTEMA_ENVASE, SISTEMA_SABERES } from '../src/ia/saberRemedios.js';
import { diaDePatty, sumarDias } from '../src/lib/fechas.js';
import { correrHipotesis } from '../src/patrones/hipotesis.js';
import { calcularCobertura, DIAS_MINIMOS } from '../src/remedios/cobertura.js';
import { REGLA_SALUD_IA, saludParaIa } from '../src/remedios/contextoIa.js';
import { claveRemedio, esElMismoSintoma, limpiarSaber, saberesPendientes } from '../src/remedios/saberes.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

const hora = 3600000;
const ZONA = 'America/Argentina/Buenos_Aires';
const haceHoras = (h: number) => new Date(Date.now() - h * hora).toISOString();

function falso(contestar: (p: any) => unknown) {
  const pedidos: any[] = [];
  const crear = async (p: any) => {
    pedidos.push(p);
    return { stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: JSON.stringify(contestar(p)) }] };
  };
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
  return pedidos;
}

const IBUPROFENO = {
  reconocido: true,
  tipo: 'medicamento',
  efectos: [
    { nombre: 'Dolor de panza', nombre_en: 'Stomach ache', sinonimos: ['dolor de estómago', 'acidez', 'stomach pain'], urgente: false },
    { nombre: 'Materia fecal negra', nombre_en: 'Black stools', sinonimos: ['caca negra', 'black stool'], urgente: true },
  ],
  interacciones: [{ con: 'Enalapril', con_en: 'Enalapril', detalle: 'Puede disminuir su efecto sobre la presión.', detalle_en: 'It may lessen its effect on blood pressure.' }],
  contenido: [],
};
/** Lo que contesta la IA según lo que le preguntan: conoce el ibuprofeno y la vitamina D, y nada más. */
function iaQueConoce() {
  return falso((p) => ({
    remedios: String(p.messages[0].content)
      .split('\n')
      .map((l) => {
        const [i, ...n] = l.split('. ');
        const nombre = n.join('. ');
        if (nombre === 'ibuprofeno') return { indice: Number(i), ...IBUPROFENO };
        if (nombre === 'vitamina d')
          return { indice: Number(i), reconocido: true, tipo: 'suplemento', efectos: [{ nombre: 'Náuseas', nombre_en: 'Nausea', sinonimos: ['nausea'], urgente: false }], interacciones: [], contenido: [{ nutriente: 'vitamina_d', nombre: 'Vitamina D', cantidad: 0, unidad: '' }] };
        return { indice: Number(i), reconocido: false, tipo: 'no_se', efectos: [], interacciones: [], contenido: [] };
      }),
  }));
}

describe('de qué remedio se habla', () => {
  it('la clave no depende de la dosis ni de cómo se escriba, y no borra lo que nombra', () => {
    expect(claveRemedio('Ibuprofeno 400 mg')).toBe('ibuprofeno');
    expect(claveRemedio('IBUPROFENO 400')).toBe('ibuprofeno');
    expect(claveRemedio('ibuprofeno 600mg comprimidos')).toBe('ibuprofeno');
    expect(claveRemedio('Omega 3')).toBe('omega 3');
    expect(claveRemedio('Vitamina B12')).toBe('vitamina b12');
    expect(claveRemedio('Vitamina D 1000 UI')).toBe('vitamina d');
  });

  it('un síntoma coincide con un efecto si tiene todas sus palabras, y lo genérico solo no alcanza', () => {
    expect(esElMismoSintoma('Dolor de cabeza', 'dolor de cabeza')).toBe(true);
    expect(esElMismoSintoma('Dolor de cabeza fuerte', 'Dolor de cabeza')).toBe(true);
    expect(esElMismoSintoma('Me duele la cabeza', 'Dolor de cabeza')).toBe(true);
    expect(esElMismoSintoma('Náuseas', 'Nausea')).toBe(true);
    expect(esElMismoSintoma('Mareos', 'mareo')).toBe(true);
    expect(esElMismoSintoma('Dolor de panza', 'Dolor de cabeza')).toBe(false);
    expect(esElMismoSintoma('Dolor de panza', 'Dolor')).toBe(false);
    expect(esElMismoSintoma('Dolor', 'Dolor de cabeza')).toBe(false);
  });
});

describe('la tabla compartida de saberes', () => {
  it('pregunta una sola vez por nombre, solo con el nombre, y no guarda nada de la persona', async () => {
    const { ana, personaId } = await conAdmin();
    await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Ibuprofeno 400 mg', dosis: 400, unidad: 'mg', cada_horas: 8, inicio: haceHoras(5), motivo: 'rodilla de Rodrigo', nota: 'me lo dio la doctora Pérez' });
    const db = obtenerDb();
    const pedidos = iaQueConoce();
    expect(await saberesPendientes(db)).toBe(1);
    expect(pedidos).toHaveLength(1);
    const enviado = JSON.stringify(pedidos[0].messages);
    expect(enviado).toContain('ibuprofeno');
    for (const dato of ['Rodrigo', 'rodilla', 'Pérez', 'Perez', '400']) expect(enviado).not.toContain(dato);

    // Otra persona, otra forma de escribirlo: no se vuelve a pagar.
    const otra = (await ana.post('/api/personas', { nombre: 'Beto' })).body.id;
    await ana.post('/api/tratamientos', { persona_id: otra, concepto_nombre: 'IBUPROFENO', cada_horas: 8, inicio: haceHoras(1) });
    expect(await saberesPendientes(db)).toBe(0);
    expect(pedidos).toHaveLength(1);
    expect((await ana.get(`/api/remedios/vigilados?persona=${otra}`)).body[0].estado).toBe('conocido');

    const columnas = await filas<{ column_name: string }>(db, sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'saberes_remedio'`);
    const nombres = columnas.map((c) => c.column_name);
    for (const c of ['persona_id', 'usuario_id', 'creado_por', 'motivo', 'dosis', 'nota']) expect(nombres).not.toContain(c);
  });

  it('lo que la IA no reconoce queda como que no se sabe, sin inventar (aunque mande algo)', async () => {
    const { ana, personaId } = await conAdmin();
    await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Pastillita mágica', cada_horas: 8, inicio: haceHoras(5) });
    falso(() => ({ remedios: [{ indice: 0, reconocido: false, tipo: 'no_se', efectos: [{ nombre: 'Inventado', nombre_en: 'Made up', sinonimos: [], urgente: false }], interacciones: [], contenido: [] }] }));
    await saberesPendientes(obtenerDb());
    const v = (await ana.get(`/api/remedios/vigilados?persona=${personaId}`)).body[0];
    expect(v).toMatchObject({ nombre: 'Pastillita mágica', estado: 'desconocido', efectos: [], interacciones: [] });
    expect(limpiarSaber({ indice: 0, reconocido: false, tipo: 'medicamento', efectos: IBUPROFENO.efectos, interacciones: IBUPROFENO.interacciones, contenido: [] })).toMatchObject({ estado: 'desconocido', efectos: [], interacciones: [] });
  });

  it('sin IA queda pendiente y todo lo demás anda; con la IA fallando se reintenta más tarde', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Ibuprofeno', cada_horas: 8, inicio: haceHoras(5) });
    const db = obtenerDb();
    expect(await saberesPendientes(db)).toBe(0);
    expect((await ana.get(`/api/remedios/vigilados?persona=${personaId}`)).body[0]).toMatchObject({ clave: 'ibuprofeno', estado: 'pendiente', efectos: [] });
    const r = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de panza', categoria_id: categorias.sintoma, inicio: haceHoras(1), intensidad: 4 });
    expect(r.status).toBe(201);
    expect((await ana.get(`/api/remedios/senales?persona=${personaId}&registro=${r.body.id}`)).body).toEqual([]);

    const crear = async () => {
      throw new Error('se cayó');
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    expect(await saberesPendientes(db)).toBe(0);
    const s = await una<{ estado: string; intentos: number; error: string }>(db, sql`SELECT estado, intentos, error FROM saberes_remedio WHERE clave = 'ibuprofeno'`);
    expect(s).toMatchObject({ estado: 'pendiente', intentos: 1, error: 'se cayó' });
    // No se vuelve a intentar enseguida.
    const pedidos = iaQueConoce();
    await saberesPendientes(db);
    expect(pedidos).toHaveLength(0);
  });

  it('saca lo que se sale de los límites, aunque lo mande la IA', () => {
    const s = limpiarSaber({
      indice: 0,
      reconocido: true,
      tipo: 'medicamento',
      efectos: [
        { nombre: 'Mareos', nombre_en: 'Dizziness', sinonimos: [], urgente: false },
        { nombre: 'Dejá de tomarlo si te marea', nombre_en: 'Stop taking it if dizzy', sinonimos: [], urgente: false },
      ],
      interacciones: [
        { con: 'Alcohol', con_en: 'Alcohol', detalle: 'Puede aumentar la somnolencia.', detalle_en: 'It may increase drowsiness.' },
        { con: 'Warfarina', con_en: 'Warfarin', detalle: 'Hay que bajar la dosis.', detalle_en: 'Reduce the dose.' },
        { con: 'Aspirina', con_en: 'Aspirin', detalle: 'Suspendé uno de los dos.', detalle_en: 'Stop one of them.' },
        { con: 'Hierro', con_en: 'Iron', detalle: 'Conviene comprar un suplemento.', detalle_en: 'Buy a supplement.' },
      ],
      contenido: [],
    });
    expect(s.efectos.map((e) => e.nombre)).toEqual(['Mareos']);
    expect(s.interacciones.map((i) => i.con)).toEqual(['Alcohol']);
  });
});

describe('lo que se vigila y lo que se señala', () => {
  async function conIbuprofeno() {
    const x = await conAdmin();
    const t = await x.ana.post('/api/tratamientos', { persona_id: x.personaId, concepto_nombre: 'Ibuprofeno', dosis: 400, unidad: 'mg', cada_horas: 8, inicio: haceHoras(48) });
    iaQueConoce();
    await saberesPendientes(obtenerDb());
    return { ...x, tratamiento: t.body.id as number, concepto: t.body.concepto_id as number };
  }
  const sintoma = (x: { ana: Cliente; personaId: number; categorias: Record<string, number> }, nombre: string, inicio: string) =>
    x.ana.post('/api/registros', { persona_id: x.personaId, concepto_nombre: nombre, categoria_id: x.categorias.sintoma, inicio, intensidad: 5 });
  const senales = async (x: { ana: Cliente; personaId: number }, id: number) => (await x.ana.get(`/api/remedios/senales?persona=${x.personaId}&registro=${id}`)).body;

  it('muestra los efectos del remedio y señala el síntoma que coincide, en el día y en el síntoma', async () => {
    const x = await conIbuprofeno();
    const v = (await x.ana.get(`/api/remedios/vigilados?persona=${x.personaId}`)).body[0];
    expect(v).toMatchObject({ nombre: 'Ibuprofeno', estado: 'conocido', tratamiento_ids: [x.tratamiento] });
    // Lo urgente, primero.
    expect(v.efectos).toEqual([{ nombre: 'Materia fecal negra', urgente: true }, { nombre: 'Dolor de panza', urgente: false }]);

    const r = await sintoma(x, 'Dolor de estómago', haceHoras(1));
    const s = await senales(x, r.body.id);
    expect(s).toMatchObject([{ registro_id: r.body.id, remedio: 'Ibuprofeno', efecto: 'Dolor de panza', urgente: false, clave: 'ibuprofeno' }]);
    expect((await x.ana.get(`/api/remedios/senales?persona=${x.personaId}&fecha=${r.body.fecha}`)).body).toHaveLength(1);
    // Lo que no coincide no se señala.
    expect(await senales(x, (await sintoma(x, 'Dolor de rodilla', haceHoras(1))).body.id)).toEqual([]);
    // En inglés, el efecto en inglés.
    x.ana.headers['X-Idioma'] = 'en';
    expect(await senales(x, r.body.id)).toMatchObject([{ efecto: 'Stomach ache' }]);
  });

  it('lo urgente se señala como urgente, y el texto manda a consultar sin sugerir cambiar nada', async () => {
    const x = await conIbuprofeno();
    const r = await sintoma(x, 'Caca negra', haceHoras(1));
    const [s] = await senales(x, r.body.id);
    expect(s).toMatchObject({ urgente: true, efecto: 'Materia fecal negra' });
    expect(textoSenal(s)).toContain('consultar');
    expect(textoSenal(s)).toContain('guardia');
    expect(esTextoSeguro(textoSenal(s))).toBe(true);
    expect(esTextoSeguro(textoSenal(s, 'en'))).toBe(true);
  });

  it('no señala lo que apareció antes de empezar, ni si lo toma justamente para eso', async () => {
    const x = await conIbuprofeno();
    expect(await senales(x, (await sintoma(x, 'Dolor de panza', haceHoras(60))).body.id)).toEqual([]);

    // Con el motivo igual al síntoma: es por eso que lo toma.
    const y = await conAdmin();
    await y.ana.post('/api/tratamientos', { persona_id: y.personaId, concepto_nombre: 'Ibuprofeno', cada_horas: 8, inicio: haceHoras(48), motivo: 'dolor de panza' });
    iaQueConoce();
    await saberesPendientes(obtenerDb());
    expect(await senales(y, (await sintoma(y, 'Dolor de panza', haceHoras(1))).body.id)).toEqual([]);
  });

  it('un remedio "cuando haga falta" cuenta solo si se tomó, y no si se tomó para ese malestar', async () => {
    const x = await conAdmin();
    const prn = await x.ana.post('/api/tratamientos', { persona_id: x.personaId, concepto_nombre: 'Ibuprofeno', inicio: haceHoras(200) });
    iaQueConoce();
    await saberesPendientes(obtenerDb());
    const r1 = await sintoma(x, 'Dolor de panza', haceHoras(5));
    expect(await senales(x, r1.body.id)).toEqual([]);
    // Lo tomó para ese malestar: el mismo síntoma no se le atribuye.
    await x.ana.post('/api/registros', { persona_id: x.personaId, concepto_id: prn.body.concepto_id, inicio: haceHoras(4), para_registro_id: r1.body.id });
    expect(await senales(x, (await sintoma(x, 'Dolor de panza', haceHoras(1))).body.id)).toEqual([]);
    // Y otro efecto de lo mismo, sí.
    const negra = await sintoma(x, 'Materia fecal negra', haceHoras(1));
    expect(await senales(x, negra.body.id)).toMatchObject([{ urgente: true }]);
  });

  it('un remedio anotado suelto cuenta 72 horas; después no', async () => {
    const x = await conAdmin();
    const m = await x.ana.post('/api/registros', { persona_id: x.personaId, concepto_nombre: 'Ibuprofeno', categoria_id: x.categorias.medicacion, inicio: haceHoras(100) });
    expect(m.status).toBe(201);
    iaQueConoce();
    await saberesPendientes(obtenerDb());
    expect(await senales(x, (await sintoma(x, 'Dolor de panza', haceHoras(90))).body.id)).toHaveLength(1);
    expect(await senales(x, (await sintoma(x, 'Dolor de panza', haceHoras(1))).body.id)).toEqual([]);
  });

  it('"no tiene que ver" no se vuelve a señalar, y solo para esa persona', async () => {
    const x = await conIbuprofeno();
    const r = await sintoma(x, 'Dolor de panza', haceHoras(1));
    const [s] = await senales(x, r.body.id);
    expect((await x.ana.post('/api/remedios/senales/apartar', { persona_id: x.personaId, concepto_id: s.concepto_id, clave: s.clave })).status).toBe(200);
    expect(await senales(x, r.body.id)).toEqual([]);
    // Nadie de afuera ve nada ni aparta nada.
    await x.ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', clave: 'secreta1', rol: 'editor' });
    const beto = new Cliente();
    await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta1' });
    expect((await beto.get(`/api/remedios/senales?persona=${x.personaId}&registro=${r.body.id}`)).status).toBe(404);
    expect((await beto.get(`/api/remedios/vigilados?persona=${x.personaId}`)).status).toBe(404);
    expect((await beto.get(`/api/suplementos?persona=${x.personaId}`)).status).toBe(404);
    expect((await beto.post('/api/remedios/senales/apartar', { persona_id: x.personaId, concepto_id: s.concepto_id, clave: s.clave })).status).toBe(404);
  });

  it('marca la interacción cuando también toma lo otro', async () => {
    const x = await conIbuprofeno();
    let v = (await x.ana.get(`/api/remedios/vigilados?persona=${x.personaId}`)).body[0];
    expect(v.interacciones[0]).toMatchObject({ con: 'Enalapril', tambien_toma: false });
    await x.ana.post('/api/tratamientos', { persona_id: x.personaId, concepto_nombre: 'Enalapril 10 mg', horarios: ['09:00'], inicio: haceHoras(5) });
    v = (await x.ana.get(`/api/remedios/vigilados?persona=${x.personaId}`)).body.find((r: any) => r.clave === 'ibuprofeno');
    expect(v.interacciones[0]).toMatchObject({ con: 'Enalapril', tambien_toma: true });
  });
});

describe('vitaminas y suplementos', () => {
  it('por nombre usa lo típico, marcado como de la IA, y corregirlo queda como lo dijo la persona', async () => {
    const { ana, personaId } = await conAdmin();
    const s = await ana.post('/api/suplementos', { persona_id: personaId, nombre: 'Vitamina D' });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ nombre: 'Vitamina D', clave: 'vitamina d', fuente: 'sin_dato', contenido: [], activo: true });
    iaQueConoce();
    await saberesPendientes(obtenerDb());
    const [a] = (await ana.get(`/api/suplementos?persona=${personaId}`)).body;
    expect(a).toMatchObject({ fuente: 'ia', contenido: [{ nutriente: 'vitamina_d', cantidad: null, unidad: null }] });
    const c = await ana.put(`/api/suplementos/${a.id}`, { contenido: [{ nutriente: 'vitamina_d', nombre: 'Vitamina D', cantidad: 1000, unidad: 'UI' }] });
    expect(c.body).toMatchObject({ fuente: 'persona', corregido: true, contenido: [{ cantidad: 1000, unidad: 'UI' }] });
    expect((await ana.post(`/api/suplementos/${a.id}/terminar`)).body).toMatchObject({ activo: false });
    expect((await ana.del(`/api/suplementos/${a.id}`)).status).toBe(200);
    expect((await ana.get(`/api/suplementos?persona=${personaId}`)).body).toEqual([]);
  });

  it('por foto: lee el envase sin guardar nada, queda marcado que salió de la foto y se puede corregir', async () => {
    const { ana, personaId } = await conAdmin();
    const pedidos = falso(() => ({ reconocido: true, nombre: 'Supradyn', contenido: [{ nutriente: 'vitamina_c', nombre: 'Vitamina C', cantidad: 180, unidad: 'mg' }, { nutriente: 'otro', nombre: 'Coenzima Q10', cantidad: 0, unidad: 'mg' }] }));
    const l = await ana.post('/api/suplementos/leer-foto', { persona_id: personaId, imagen: 'data:image/jpeg;base64,QUJD', tipo: 'image/jpeg' });
    expect(l.status).toBe(200);
    expect(l.body).toEqual({ reconocido: true, nombre: 'Supradyn', contenido: [{ nutriente: 'vitamina_c', nombre: 'Vitamina C', cantidad: 180, unidad: 'mg' }, { nutriente: 'otro', nombre: 'Coenzima Q10', cantidad: null, unidad: null }] });
    expect(pedidos[0].messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg', data: 'QUJD' } });
    // Leer no guarda.
    expect((await ana.get(`/api/suplementos?persona=${personaId}`)).body).toEqual([]);
    const s = await ana.post('/api/suplementos', { persona_id: personaId, nombre: l.body.nombre, contenido: l.body.contenido, origen: 'foto' });
    expect(s.body).toMatchObject({ fuente: 'foto', corregido: false });
    const c = await ana.put(`/api/suplementos/${s.body.id}`, { contenido: [{ nutriente: 'vitamina_c', nombre: 'Vitamina C', cantidad: 200, unidad: 'mg' }] });
    expect(c.body).toMatchObject({ fuente: 'persona', corregido: true });
    // Revisado y cambiado antes de guardar: también es de la persona.
    const d = await ana.post('/api/suplementos', { persona_id: personaId, nombre: 'Otro', contenido: l.body.contenido, origen: 'foto', corregido: true });
    expect(d.body).toMatchObject({ fuente: 'persona', corregido: true });
  });

  it('si no se lee el envase dice que no pudo, sin inventar; sin IA se puede cargar a mano', async () => {
    const { ana, personaId } = await conAdmin();
    falso(() => ({ reconocido: false, nombre: 'Algo', contenido: [{ nutriente: 'hierro', nombre: 'Hierro', cantidad: 5, unidad: 'mg' }] }));
    const l = await ana.post('/api/suplementos/leer-foto', { persona_id: personaId, imagen: 'QUJD' });
    expect(l.body).toEqual({ reconocido: false, nombre: '', contenido: [] });
    usarClientePrueba(null);
    expect((await ana.post('/api/suplementos/leer-foto', { persona_id: personaId, imagen: 'QUJD' })).status).toBe(503);
    const a = await ana.post('/api/suplementos', { persona_id: personaId, nombre: 'Hierro', contenido: [{ nutriente: 'hierro', nombre: 'Hierro', cantidad: 65, unidad: 'mg' }] });
    expect(a.body).toMatchObject({ fuente: 'persona', contenido: [{ nutriente: 'hierro', cantidad: 65 }] });
    expect((await ana.post('/api/suplementos', { persona_id: personaId, nombre: '  ' })).status).toBe(400);
  });

  it('un suplemento también tiene efectos que se señalan', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.post('/api/suplementos', { persona_id: personaId, nombre: 'Vitamina D 1000 UI' });
    iaQueConoce();
    await saberesPendientes(obtenerDb());
    expect((await ana.get(`/api/remedios/vigilados?persona=${personaId}`)).body[0]).toMatchObject({ clave: 'vitamina d', estado: 'conocido', suplemento_ids: [expect.any(Number)] });
    const r = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Náuseas', categoria_id: categorias.sintoma, inicio: new Date().toISOString(), intensidad: 3 });
    expect((await ana.get(`/api/remedios/senales?persona=${personaId}&registro=${r.body.id}`)).body).toMatchObject([{ remedio: 'Vitamina D 1000 UI', efecto: 'Náuseas' }]);
  });
});

describe('lo que cubre y lo que podría faltar', () => {
  const hasta = '2026-10-30';
  const dias = (n: number, nombre: string, ingredientes: string[] = []) => Array.from({ length: n }, (_, i) => ({ fecha: sumarDias(hasta, -i), nombre, ingredientes }));
  const de = (c: ReturnType<typeof calcularCobertura>, clave: string) => c.nutrientes.find((n) => n.clave === clave)!;

  it('con pocos días anotados no dice nada de la comida, pero sí de lo que toma', () => {
    const c = calcularCobertura(dias(DIAS_MINIMOS - 1, 'Bife'), [{ nombre: 'Hierro', contenido: [{ nutriente: 'hierro', nombre: 'Hierro', cantidad: 65, unidad: 'mg' }], fuente: 'foto' }], '2026-10-01', hasta);
    expect(c.suficiente).toBe(false);
    expect(de(c, 'vitamina_b12').estado).toBe('sin_dato');
    expect(de(c, 'hierro')).toMatchObject({ estado: 'toma', toma: [{ nombre: 'Hierro', cantidad: 65, fuente: 'foto' }] });
    expect(c.nutrientes.some((n) => n.estado === 'poco')).toBe(false);
  });

  it('mira nombres e ingredientes, y lo que aparece poco queda como poco', () => {
    const c = calcularCobertura([...dias(20, 'Bife con ensalada'), ...dias(15, 'Licuado', ['leche', 'bananas'])], [], '2026-10-01', hasta);
    expect(c.dias_con_comida).toBe(20);
    expect(de(c, 'vitamina_b12')).toMatchObject({ estado: 'comida', dias: 20 });
    expect(de(c, 'calcio').alimentos).toEqual(['Licuado']);
    expect(de(c, 'magnesio').estado).toBe('comida'); // banana
    expect(de(c, 'omega_3')).toMatchObject({ estado: 'poco', dias: 0 });
  });

  it('el endpoint junta suplementos y tratamientos por su nombre', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.post('/api/suplementos', { persona_id: personaId, nombre: 'Calcio', contenido: [{ nutriente: 'calcio', nombre: 'Calcio', cantidad: 500, unidad: 'mg' }] });
    await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Vitamina D', horarios: ['09:00'], inicio: haceHoras(5) });
    const hoy = diaDePatty(new Date(), ZONA);
    for (let i = 0; i < 12; i++) await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Bife', categoria_id: categorias.comida, inicio: new Date(`${sumarDias(hoy, -i)}T16:00:00Z`).toISOString() });
    const c = (await ana.get(`/api/remedios/cobertura?persona=${personaId}`)).body;
    expect(c.dias_con_comida).toBe(12);
    expect(c.nutrientes.find((n: any) => n.clave === 'calcio')).toMatchObject({ estado: 'toma' });
    expect(c.nutrientes.find((n: any) => n.clave === 'vitamina_d')).toMatchObject({ estado: 'toma' });
    expect(c.nutrientes.find((n: any) => n.clave === 'hierro')).toMatchObject({ estado: 'comida', alimentos: ['Bife'] });
    expect(c.nutrientes.find((n: any) => n.clave === 'omega_3')).toMatchObject({ estado: 'poco' });
  });
});

describe('el contexto de la IA y los patrones', () => {
  async function preparado() {
    const x = await conAdmin();
    await x.ana.post('/api/tratamientos', { persona_id: x.personaId, concepto_nombre: 'Ibuprofeno', cada_horas: 8, inicio: haceHoras(48) });
    await x.ana.post('/api/suplementos', { persona_id: x.personaId, nombre: 'Calcio', contenido: [{ nutriente: 'calcio', nombre: 'Calcio', cantidad: 500, unidad: 'mg' }] });
    await x.ana.post('/api/tratamientos', { persona_id: x.personaId, concepto_nombre: 'Pastillita mágica', cada_horas: 24, inicio: haceHoras(48) });
    iaQueConoce();
    await saberesPendientes(obtenerDb());
    return x;
  }

  it('resume lo que toma, sus efectos, lo que contiene y lo que no se sabe', async () => {
    const x = await preparado();
    const texto = await saludParaIa(obtenerDb(), x.personaId, diaDePatty(new Date(), ZONA));
    expect(texto).toContain('Ibuprofeno: efectos posibles: Materia fecal negra, Dolor de panza');
    expect(texto).toContain('Pastillita mágica: no se sabe');
    expect(texto).toContain('Calcio 500 mg');
  });

  it('sin nada que contar queda vacío, y las preguntas siguen igual', async () => {
    const { personaId } = await conAdmin();
    expect(await saludParaIa(obtenerDb(), personaId, '2026-10-30')).toBe('');
  });

  it('llega a las preguntas y a "qué pasó antes", siempre con la regla', async () => {
    const x = await preparado();
    const r = await x.ana.post('/api/registros', { persona_id: x.personaId, concepto_nombre: 'Dolor de panza', categoria_id: x.categorias.sintoma, inicio: haceHoras(1), intensidad: 5 });
    const pedidos = falso((p) => (p.output_config.format.schema.properties.concepto_ids ? { concepto_ids: [r.body.concepto_id], desde: '', hasta: '' } : p.output_config.format.schema.properties.fechas ? { respuesta: 'Puede tener relación.', fechas: [] } : { texto: 'Puede tener relación con el ibuprofeno; hablalo con tu médico.' }));
    await x.ana.post('/api/preguntar', { persona_id: x.personaId, pregunta: '¿Por qué me duele la panza?' });
    const respuesta = pedidos[pedidos.length - 1];
    expect(respuesta.system).toContain(REGLA_SALUD_IA);
    expect(respuesta.messages[0].content).toContain('Ibuprofeno: efectos posibles');

    await armarContexto(obtenerDb(), r.body.id, ZONA, 'es');
    const ctx = pedidos[pedidos.length - 1];
    expect(ctx.system).toContain(REGLA_SALUD_IA);
    expect(ctx.messages[0].content).toContain('coincide con un efecto posible de: Ibuprofeno');
  });

  it('lo que coincide con un efecto se prueba como hipótesis aun sin IA, y lo mide el motor', async () => {
    const x = await conAdmin();
    const db = obtenerDb();
    const concepto = async (nombre: string, categoria_id: number) => (await x.ana.post('/api/conceptos', { nombre, categoria_id })).body.concepto.id as number;
    const ibu = await concepto('Ibuprofeno', x.categorias.medicacion);
    const dolor = await concepto('Dolor de panza', x.categorias.sintoma);
    const agua = await concepto('Agua', x.categorias.bebida);
    const hasta = diaDePatty(new Date(), ZONA);
    const valores: string[] = [];
    const fila = (c: number, f: string, h: string, i = 'NULL') => `(${x.personaId}, ${c}, '${f}T${h}:00:00Z', '${f}', ${i})`;
    // 120 días: la mitad con ibuprofeno a la mañana y, casi siempre esos días, dolor de panza a la noche.
    for (let d = 120; d >= 1; d--) {
      const f = sumarDias(hasta, -d);
      valores.push(fila(agua, f, '11'));
      if (d % 2 === 0) valores.push(fila(ibu, f, '12'));
      if (d % 2 === 0 && d % 10 !== 0) valores.push(fila(dolor, f, '20', '4'));
      if (d % 2 === 1 && d % 15 === 0) valores.push(fila(dolor, f, '20', '4'));
    }
    await db.execute(sql.raw(`INSERT INTO registros (persona_id, concepto_id, inicio, fecha, intensidad) VALUES ${valores.join(',')}`));
    await db.execute(sql`INSERT INTO saberes_remedio (clave, estado, efectos) VALUES ('ibuprofeno', 'conocido', ${JSON.stringify(IBUPROFENO.efectos)}::jsonb)`);
    const p = { id: x.personaId, nombre: 'Rodrigo', zona_horaria: ZONA, rol: 'dueno' as const };
    const r = await correrHipotesis(db, p, { hasta, idioma: 'es', forzar: true });
    expect(r.ia).toBe('sin_ia');
    expect(r.confirmadas.concat(r.rechazadas as any).map((c) => `${c.causa}→${c.efecto}`)).toContain('Ibuprofeno→Dolor de panza');
    const h = await una<{ razon: string; estado: string }>(db, sql`SELECT razon, estado FROM hipotesis WHERE causa_id = ${ibu} AND efecto_id = ${dolor}`);
    expect(h?.razon).toContain('figura entre los efectos posibles de Ibuprofeno');
    expect(h?.razon).toContain('generada con IA');
    expect(h?.estado).toBe('confirmada');
    // Si la persona dijo que no tiene que ver, no se vuelve a probar.
    await db.execute(sql`DELETE FROM hipotesis WHERE persona_id = ${x.personaId}`);
    await db.execute(sql`DELETE FROM hallazgos WHERE persona_id = ${x.personaId}`);
    await db.execute(sql`INSERT INTO senales_apartadas (persona_id, concepto_id, clave) VALUES (${x.personaId}, ${dolor}, 'ibuprofeno')`);
    const r2 = await correrHipotesis(db, p, { hasta, idioma: 'es', forzar: true });
    expect(r2.confirmadas).toEqual([]);
  });
});

describe('los límites', () => {
  const FIJOS = [AVISO_COBERTURA, AVISO_DECIDE_EL_MEDICO, AVISO_INFORMACION_GENERAL, AVISO_URGENTE, FOTO_NO_LEIDA, INTERACCION_TAMBIEN_TOMAS, NO_SE_DE_ESTE_REMEDIO, PODRIA_REVISAR, TODAVIA_AVERIGUANDO];

  it('el revisor de textos agarra lo que no se puede decir, en los dos idiomas', () => {
    for (const mal of ['Dejá de tomar el ibuprofeno', 'Dejá el remedio', 'Suspendé el tratamiento', 'Bajá la dosis', 'Conviene ajustar la dosis', 'Podés reducir la medicación', 'No lo tomes más', 'Cambiá de remedio', 'Comprá un suplemento de hierro', 'Stop taking it', 'Reduce your dose', 'Adjust the dose', 'Buy some vitamin D'])
      expect(esTextoSeguro(mal), mal).toBe(false);
    for (const bien of ['Puede dar dolor de panza.', 'Hablalo con tu médico.', 'Puede aumentar la somnolencia.', 'It may increase drowsiness.', 'Talk to your doctor.']) expect(esTextoSeguro(bien), bien).toBe(true);
  });

  it('los textos fijos respetan los límites y están traducidos', () => {
    for (const x of FIJOS) {
      expect(esTextoSeguro(x), x).toBe(true);
      const en = traducir('en', x);
      expect(en, x).not.toBe(x);
      expect(esTextoSeguro(en), en).toBe(true);
    }
    for (const u of [true, false]) {
      for (const i of ['es', 'en'] as const) {
        const s = textoSenal({ remedio: 'Ibuprofeno', efecto: 'Dolor de panza', urgente: u }, i);
        expect(s).not.toMatch(/\{\w+\}/);
        expect(esTextoSeguro(s), s).toBe(true);
      }
    }
    // Siempre como posibilidad, y frente a un efecto, el médico.
    expect(textoSenal({ remedio: 'X', efecto: 'Y', urgente: false })).toMatch(/puede tener relación/i);
    expect(textoSenal({ remedio: 'X', efecto: 'Y', urgente: false })).toMatch(/tu médico/);
    expect(textoSenal({ remedio: 'X', efecto: 'Y', urgente: true })).toMatch(/médico/);
    expect(AVISO_INFORMACION_GENERAL).toMatch(/generada con IA/);
    expect(AVISO_INFORMACION_GENERAL).toMatch(/no un diagnóstico/);
    expect(PODRIA_REVISAR).toMatch(/Podría valer la pena revisar con tu médico/);
    expect(PODRIA_REVISAR).not.toMatch(/suplement|compr/i);
    expect(NO_SE_DE_ESTE_REMEDIO).toMatch(/No tengo información/);
  });

  it('los prompts dicen los límites, y no piden nada de la persona', () => {
    for (const frase of ['información general', 'No inventes', 'reconocido en false', 'Nunca un diagnóstico', 'Nunca sugieras dejar', 'su dosis', 'nunca recomiendes comprar', 'urgente', 'nunca instrucciones'])
      expect(SISTEMA_SABERES, frase).toContain(frase);
    for (const frase of ['Solo lo que se lee', 'no inventes', 'reconocido en false', 'No copies datos de personas', 'No indiques cuánto tomar', 'nunca instrucciones'])
      expect(SISTEMA_ENVASE, frase).toContain(frase);
    for (const frase of ['nunca como un diagnóstico', 'Nunca sugieras dejar, cambiar ni ajustar', 'comprar o empezar un suplemento', 'su médico']) expect(REGLA_SALUD_IA, frase).toContain(frase);
    const propiedades = Object.keys((ESQUEMA_SABERES.properties.remedios.items as { properties: object }).properties);
    expect(propiedades).toEqual(['indice', 'reconocido', 'tipo', 'efectos', 'interacciones', 'contenido']);
    expect(JSON.stringify(ESQUEMA_SABERES)).not.toMatch(/dosis_|recomendacion|consejo/);
    expect(JSON.stringify(ESQUEMA_ENVASE)).toContain('Solo lo que se lee');
  });
});
