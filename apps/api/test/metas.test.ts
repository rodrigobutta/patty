import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { MEDIDAS_META, pareceMedico, planBase, SUGERENCIAS_META, tocaTratamiento, traducir } from 'shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cerrarDb, filas, obtenerDb, una } from '../src/db/client.js';
import { comentarDia } from '../src/ia/comentar.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { consejoDeBase, consejoDelDia, validarPlan } from '../src/ia/metas.js';
import { persona as accesoPersona } from '../src/lib/acceso.js';
import { diaDePatty, sumarDias } from '../src/lib/fechas.js';
import { lineasMetas } from '../src/lib/metas.js';
import { pedirHipotesis } from '../src/ia/hipotesis.js';
import { resumirNoche } from '../src/ia/resumirNoche.js';
import { resumirSemana, lunesDe } from '../src/ia/resumirSemana.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

const PLAN = {
  resumen: 'Como cenás tarde, empezá por ahí.',
  pasos: [
    { texto: 'Cenar antes de las 21.', mide: '' },
    { texto: 'Acostarte a las 23.', mide: 'horas de sueño' },
    { texto: 'Caminar a la tarde.', mide: 'Dato inventado' },
  ],
  preguntas: ['¿Cenaste temprano?'],
  consejos: ['Probá cenar algo liviano.'],
};

/** La IA de mentira: contesta según el esquema que le piden, y anota lo pedido. */
function iaFalsa(o: { plan?: unknown; consejo?: unknown; falla?: boolean } = {}) {
  const pedidos: any[] = [];
  const crear = async (p: any) => {
    pedidos.push(p);
    if (o.falla) throw new Error('la IA se cayó');
    const props = p.output_config.format.schema.properties;
    const r = props.pasos
      ? (o.plan ?? PLAN)
      : props.tipo
        ? (o.consejo ?? { tipo: 'pregunta', texto: '¿Cenaste temprano hoy?' })
        : props.comentarios
          ? { comentarios: [{ emoji: '🦉', texto: 'Vas bien.' }] }
          : { titulo: 'Semana', texto: 'Bien.', destacados: [], sugerencias: [], objetivos: [] };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(r) }] };
  };
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
  return pedidos;
}

describe('los objetivos de la persona', () => {
  let ana: Cliente;
  let personaId: number;
  let categorias: Record<string, number>;
  beforeEach(async () => {
    ({ ana, personaId, categorias } = await conAdmin());
  });
  const crear = async (texto: string, clave?: string) => (await ana.post('/api/metas', { persona_id: personaId, texto, clave })).body;

  it('se crean varios, con sugerencia o texto libre, y cada uno ya tiene un plan aunque no haya IA', async () => {
    const a = await crear('Dormir mejor', 'dormir_mejor');
    expect(a.emoji).toBe('😴');
    expect(a.plan.origen).toBe('base');
    expect(a.plan.pasos.length).toBeGreaterThanOrEqual(3);
    // Un texto libre que se parece a una sugerencia usa ese plan; uno que no, el general.
    const b = await crear('quiero comer menos frituras');
    expect(b.emoji).toBe('🥗');
    const c = await crear('Aprender a tejer');
    expect(c.emoji).toBe('🎯');
    expect((await ana.get(`/api/metas?persona=${personaId}`)).body.map((m: any) => m.texto)).toEqual(['Dormir mejor', 'quiero comer menos frituras', 'Aprender a tejer']);
  });

  it('valida: ni vacío, ni repetido, ni más de 10 activos', async () => {
    expect((await ana.post('/api/metas', { persona_id: personaId, texto: 'x' })).status).toBe(400);
    await crear('Dormir mejor');
    expect((await ana.post('/api/metas', { persona_id: personaId, texto: 'dormir  MEJOR' })).status).toBe(409);
    for (let i = 0; i < 9; i++) await crear(`Objetivo número ${i}`);
    expect((await ana.post('/api/metas', { persona_id: personaId, texto: 'Uno más' })).status).toBe(400);
  });

  it('se pausa, se retoma, se cumple y se borra', async () => {
    const a = await crear('Moverme más');
    const put = (estado: string) => ana.put(`/api/metas/${a.id}`, { estado });
    expect((await put('pausada')).body.estado).toBe('pausada');
    expect((await put('activa')).body.estado).toBe('activa');
    expect((await put('cumplida')).body.estado).toBe('cumplida');
    expect((await put('cualquiera')).status).toBe(400);
    expect((await ana.del(`/api/metas/${a.id}`)).status).toBe(200);
    expect((await ana.get(`/api/metas?persona=${personaId}`)).body).toEqual([]);
    expect((await ana.del(`/api/metas/${a.id}`)).status).toBe(404);
  });

  it('nadie toca los de otra persona', async () => {
    const a = await crear('Moverme más');
    await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', clave: 'secreta1', rol: 'editor' });
    const beto = new Cliente();
    await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta1' });
    expect((await beto.put(`/api/metas/${a.id}`, { estado: 'pausada' })).status).toBe(404);
    expect((await beto.del(`/api/metas/${a.id}`)).status).toBe(404);
    expect((await beto.get(`/api/metas?persona=${personaId}`)).status).toBe(404);
  });

  describe('el plan', () => {
    it('la IA lo arma con lo que Patty sabe, queda guardado y solo se rehace si se pide', async () => {
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Milanesa', categoria_id: categorias.comida, inicio: new Date(Date.now() - 86400000).toISOString() });
      await obtenerDb().execute(sql`UPDATE personas SET condiciones = ARRAY['Hipertensión'] WHERE id = ${personaId}`);
      const a = await crear('Dormir mejor', 'dormir_mejor');
      const pedidos = iaFalsa();
      const r = (await ana.post(`/api/metas/${a.id}/plan`)).body;
      expect(r.aviso).toBeUndefined();
      expect(r.plan.origen).toBe('ia');
      expect(r.plan.resumen).toBe('Como cenás tarde, empezá por ahí.');
      // El dato que lo mide: copiado de la lista, con su nombre real; lo inventado se descarta.
      expect(r.plan.pasos.map((p: any) => p.mide)).toEqual(['', 'Horas de sueño', '']);
      expect(pedidos[0].messages[0].content).toContain('Dormir mejor');
      expect(pedidos[0].messages[0].content).toContain('Milanesa');
      expect(pedidos[0].messages[0].content).toContain('hipertensión');
      expect(pedidos[0].system).toContain('nunca des diagnósticos');
      // Ya guardado: no se vuelve a pedir.
      await ana.post(`/api/metas/${a.id}/plan`);
      expect(pedidos).toHaveLength(1);
      expect((await ana.get(`/api/metas?persona=${personaId}`)).body[0].plan.origen).toBe('ia');
      // Rehacerlo sí.
      await ana.post(`/api/metas/${a.id}/plan`, { rehacer: true });
      expect(pedidos).toHaveLength(2);
    });

    it('sin IA, o si falla, queda el que había y avisa por qué', async () => {
      const a = await crear('Dormir mejor', 'dormir_mejor');
      const sin = (await ana.post(`/api/metas/${a.id}/plan`)).body;
      expect(sin.aviso).toBe('sin_ia');
      expect(sin.plan.origen).toBe('base');
      iaFalsa({ falla: true });
      const fallo = await ana.post(`/api/metas/${a.id}/plan`);
      expect(fallo.status).toBe(200);
      expect(fallo.body.aviso).toBe('fallo');
      expect(fallo.body.plan.origen).toBe('base');
      // Rehacer y que falle no pierde el plan bueno.
      iaFalsa();
      await ana.post(`/api/metas/${a.id}/plan`);
      iaFalsa({ falla: true });
      const r = (await ana.post(`/api/metas/${a.id}/plan`, { rehacer: true })).body;
      expect(r.aviso).toBe('fallo');
      expect(r.plan.origen).toBe('ia');
    });

    it('si la IA se mete con un tratamiento, esos pasos no pasan; sin pasos suficientes queda el de base', async () => {
      const a = await crear('Bajar la presión');
      expect(a.medico).toBe(true);
      expect(a.emoji).toBe('🩺');
      expect(a.plan.resumen).toContain('médico');
      const pedidos = iaFalsa({
        plan: {
          resumen: 'Tenés hipertensión, bajá la dosis.',
          pasos: [{ texto: 'Bajá la dosis del enalapril.', mide: '' }, { texto: 'Dejá las pastillas de la mañana.', mide: '' }, { texto: 'Caminá un rato.', mide: 'Pasos' }],
          preguntas: [],
          consejos: [],
        },
      });
      const r = (await ana.post(`/api/metas/${a.id}/plan`)).body;
      expect(pedidos[0].system).toContain('suena médico');
      expect(r.aviso).toBe('fallo');
      expect(r.plan.origen).toBe('base');
      expect(JSON.stringify(r.plan)).not.toMatch(/dosis|enalapril/i);
    });

    it('rehacer gasta del límite de preguntas: al llegar, avisa y no le pide nada a la IA', async () => {
      await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', clave: 'secreta1', rol: 'editor' });
      const beto = new Cliente();
      await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta1' });
      const b = (await beto.post('/api/personas', { nombre: 'Beto' })).body;
      const m = (await beto.post('/api/metas', { persona_id: b.id, texto: 'Moverme más' })).body;
      await obtenerDb().execute(sql`UPDATE usuarios SET limites = '{"preguntar":0}'::jsonb WHERE usuario = 'beto'`);
      const pedidos = iaFalsa();
      expect((await beto.post(`/api/metas/${m.id}/plan`)).body.aviso).toBe('limite');
      expect(pedidos).toHaveLength(0);
    });
  });

  describe('lo que mide', () => {
    it('cuando hay datos: promedio por día o días, esta semana contra la anterior', async () => {
      const hoy = diaDePatty(new Date(), 'America/Argentina/Buenos_Aires');
      const db = obtenerDb();
      const a = await crear('Dormir mejor', 'dormir_mejor');
      expect(a.medidas).toEqual([]);
      const f = (await una<{ id: number }>(db, sql`INSERT INTO fuentes (persona_id, tipo, nombre, token_hash) VALUES (${personaId}, 'otro', 'Reloj', 'x') RETURNING id`))!.id;
      const c = (await una<{ id: number }>(db, sql`SELECT id FROM conceptos WHERE nombre = 'Horas de sueño'`))?.id
        ?? (await una<{ id: number }>(db, sql`INSERT INTO conceptos (nombre, nombre_norm, categoria_id, tipo_valor) VALUES ('Horas de sueño', 'horas de sueno', ${categorias.sueno}, 'numero') RETURNING id`))!.id;
      const medir = (fecha: string, valor: number) =>
        db.execute(sql`INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fecha, valor) VALUES (${personaId}, ${c}, ${f}, ${`${fecha}T12:00:00Z`}, ${fecha}, ${valor})`);
      await medir(hoy, 8);
      await medir(sumarDias(hoy, -6), 7);
      await medir(sumarDias(hoy, -7), 6); // ya es la semana anterior
      const l = (await ana.get(`/api/metas?persona=${personaId}`)).body;
      expect(l[0].medidas).toEqual([{ nombre: 'Horas de sueño', como: 'promedio', unidad: 'h', ahora: 7.5, antes: 6 }]);
    });

    it('algo anotado se cuenta por días, y lo pausado no se mide', async () => {
      const a = await crear('Comer más ensalada');
      const pedidos = iaFalsa({ plan: { ...PLAN, pasos: [{ texto: 'Comer ensalada al mediodía.', mide: 'Ensalada' }, { texto: 'Comprar verdura.', mide: '' }] } });
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Ensalada', categoria_id: categorias.comida, inicio: new Date(Date.now() - 86400000).toISOString() });
      const r = (await ana.post(`/api/metas/${a.id}/plan`)).body;
      expect(pedidos).toHaveLength(1);
      expect(r.medidas).toEqual([{ nombre: 'Ensalada', como: 'dias', unidad: null, ahora: 1, antes: 0 }]);
      expect((await ana.put(`/api/metas/${a.id}`, { estado: 'pausada' })).body.medidas).toEqual([]);
    });
  });

  describe('lo que se estima de las comidas', () => {
    const conComidas = async () => {
      const db = obtenerDb();
      const hoy = diaDePatty(new Date(), 'America/Argentina/Buenos_Aires');
      // Un plato liviano casi todos los días; el pesado, tres veces esta semana y una la anterior.
      const alimento = async (nombre: string, grasa: number) => {
        const a = (await una<{ id: number }>(db, sql`INSERT INTO alimentos (clave, nombre, estado, confianza, gramos, componentes) VALUES (${nombre}, ${nombre}, 'resuelto', 1, 300, ${JSON.stringify({ grasa })}::jsonb) RETURNING id`))!.id;
        const c = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: nombre, categoria_id: categorias.comida, inicio: new Date(Date.now() - 3600000).toISOString() })).body;
        await db.execute(sql`UPDATE conceptos SET alimento_id = ${a} WHERE id = ${c.concepto_id}`);
        await db.execute(sql`DELETE FROM registros WHERE id = ${c.id}`);
        return c.concepto_id as number;
      };
      const liviano = await alimento('Ensalada de prueba', 3);
      const pesado = await alimento('Fritura de prueba', 80);
      const pesados = new Set([1, 2, 3, 9, 15, 20]);
      for (let k = 1; k <= 40; k++) {
        const fecha = sumarDias(hoy, -k);
        await db.execute(sql`INSERT INTO registros (persona_id, concepto_id, inicio, fecha, origen) VALUES (${personaId}, ${pesados.has(k) ? pesado : liviano}, ${`${fecha}T15:00:00Z`}, ${fecha}, 'manual')`);
      }
    };

    it('"Días con mucha grasa" se cuenta esta semana contra la anterior', async () => {
      await conComidas();
      const a = await crear('Comer menos grasas', 'menos_grasas');
      expect(a.medidas.find((m: any) => m.nombre === 'Días con mucha grasa')).toEqual({ nombre: 'Días con mucha grasa', como: 'dias', unidad: null, ahora: 3, antes: 1 });
    });

    it('si apagó los componentes en Qué patrones buscar, no se mide con eso', async () => {
      await conComidas();
      await obtenerDb().execute(sql`UPDATE personas SET patrones = '{"componentes": false}'::jsonb WHERE id = ${personaId}`);
      const a = await crear('Comer menos grasas', 'menos_grasas');
      expect(a.medidas.find((m: any) => m.nombre === 'Días con mucha grasa')).toBeUndefined();
    });
  });

  describe('en el Día', () => {
    it('sin objetivos, nada; con IA, uno solo por día aunque se pida dos veces', async () => {
      const pedidos = iaFalsa();
      expect((await ana.get(`/api/metas/dia?persona=${personaId}`)).body).toBeNull();
      expect(pedidos).toHaveLength(0);
      await crear('Dormir mejor', 'dormir_mejor');
      await crear('Moverme más', 'moverme_mas');
      const a = (await ana.get(`/api/metas/dia?persona=${personaId}`)).body;
      expect(a).toMatchObject({ tipo: 'pregunta', texto: '¿Cenaste temprano hoy?', objetivo: 'Dormir mejor', estado: 'nuevo', otros: 1 });
      expect(pedidos[0].system).toContain('más o menos');
      const b = (await ana.get(`/api/metas/dia?persona=${personaId}`)).body;
      expect(b.id).toBe(a.id);
      expect(pedidos).toHaveLength(1);
    });

    it('sin IA o si falla, sale del plan; lo inadecuado no se muestra', async () => {
      const a = await crear('Dormir mejor', 'dormir_mejor');
      const sinIa = (await ana.get(`/api/metas/dia?persona=${personaId}`)).body;
      expect(a.plan.consejos).toContain(sinIa.texto);
      expect(sinIa.tipo).toBe('consejo');

      const p = await accesoPersona(obtenerDb(), { id: 1, rol: 'admin' } as never, personaId, true);
      const manana = new Date(Date.now() + 86400000);
      iaFalsa({ falla: true });
      const c1 = await consejoDelDia(obtenerDb(), p, 'es', { crear: true, ahora: manana });
      expect(a.plan.preguntas).toContain(c1!.texto);
      const pasado = new Date(Date.now() + 2 * 86400000);
      iaFalsa({ consejo: { tipo: 'consejo', texto: 'Suspendé el clonazepam esta semana, no te hace falta la dosis.' } });
      const c2 = await consejoDelDia(obtenerDb(), p, 'es', { crear: true, ahora: pasado });
      expect(c2!.texto).not.toMatch(/clonazepam/);
      expect(a.plan.consejos).toContain(c2!.texto);
    });

    it('rota entre los objetivos activos, sin los pausados', async () => {
      const p = await accesoPersona(obtenerDb(), { id: 1, rol: 'admin' } as never, personaId, true);
      await crear('Dormir mejor');
      const b = await crear('Moverme más');
      const c = await crear('Menos pantalla');
      await ana.put(`/api/metas/${c.id}`, { estado: 'pausada' });
      const dia = (n: number) => new Date(Date.now() + n * 86400000);
      const vistos = [];
      for (const n of [0, 1, 2]) vistos.push((await consejoDelDia(obtenerDb(), p, 'es', { crear: true, ahora: dia(n) }))?.objetivo);
      expect(vistos).toEqual(['Dormir mejor', 'Moverme más', 'Dormir mejor']);
      // Pausado el de hoy, hoy no se muestra nada, y no se arma otro.
      await ana.put(`/api/metas/${b.id}`, { estado: 'pausada' });
      expect(await consejoDelDia(obtenerDb(), p, 'es', { crear: true, ahora: dia(1) })).toBeNull();
    });

    it('el día es el de Patty: a las 4 de la mañana sigue siendo el anterior', async () => {
      await crear('Dormir mejor');
      const p = await accesoPersona(obtenerDb(), { id: 1, rol: 'admin' } as never, personaId, true);
      const tarde = new Date('2030-03-10T22:00:00-03:00');
      const madrugada = new Date('2030-03-11T04:00:00-03:00');
      const a = await consejoDelDia(obtenerDb(), { ...p, zona_horaria: 'America/Argentina/Buenos_Aires' }, 'es', { crear: true, ahora: tarde });
      const b = await consejoDelDia(obtenerDb(), { ...p, zona_horaria: 'America/Argentina/Buenos_Aires' }, 'es', { crear: true, ahora: madrugada });
      expect(a!.fecha).toBe('2030-03-10');
      expect(b!.id).toBe(a!.id);
    });

    it('se cierra o se contesta; lo contestado le llega a la IA después', async () => {
      await crear('Dormir mejor');
      const pedidos = iaFalsa();
      const a = (await ana.get(`/api/metas/dia?persona=${personaId}`)).body;
      expect((await ana.put(`/api/metas/dia/${a.id}`, { respuesta: 'cualquiera' })).status).toBe(400);
      expect((await ana.put(`/api/metas/dia/${a.id}`, { respuesta: 'mas_o_menos' })).status).toBe(200);
      const b = (await ana.get(`/api/metas/dia?persona=${personaId}`)).body;
      expect(b).toMatchObject({ estado: 'respondido', respuesta: 'mas_o_menos' });
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: new Date(Date.now() - 3600000).toISOString() });
      await comentarDia(obtenerDb(), { id: personaId, nombre: 'Rodrigo', zona_horaria: 'America/Argentina/Buenos_Aires' }, 'es');
      const comentario = pedidos.find((x) => x.output_config.format.schema.properties.comentarios);
      expect(comentario.messages[0].content).toContain('→ mas_o_menos');
    });

    it('quien solo puede mirar no lo arma ni gasta IA', async () => {
      await crear('Dormir mejor');
      await ana.post('/api/usuarios', { usuario: 'lucia', nombre: 'Lucía', clave: 'secreta1', rol: 'lector' });
      const lucia = new Cliente();
      await lucia.post('/api/entrar', { usuario: 'lucia', clave: 'secreta1' });
      await obtenerDb().execute(sql`INSERT INTO persona_usuarios (persona_id, usuario_id, rol) SELECT ${personaId}, id, 'lector' FROM usuarios WHERE usuario = 'lucia'`);
      const pedidos = iaFalsa();
      const r = await lucia.get(`/api/metas/dia?persona=${personaId}`);
      expect(r.status).toBe(200);
      expect(r.body).toBeNull();
      expect(pedidos).toHaveLength(0);
      expect((await lucia.post('/api/metas', { persona_id: personaId, texto: 'Otro objetivo' })).status).toBe(403);
    });
  });

  describe('el contexto de la IA', () => {
    const anotar = () => ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: new Date(Date.now() - 3600000).toISOString() });

    it('los activos llegan a los comentarios del día; los pausados y cumplidos, no', async () => {
      await crear('Dormir mejor', 'dormir_mejor');
      const b = await crear('Moverme más', 'moverme_mas');
      const c = await crear('Menos pantalla', 'menos_pantalla');
      await ana.put(`/api/metas/${b.id}`, { estado: 'pausada' });
      await ana.put(`/api/metas/${c.id}`, { estado: 'cumplida' });
      await anotar();
      const pedidos = iaFalsa();
      await comentarDia(obtenerDb(), { id: personaId, nombre: 'Rodrigo', zona_horaria: 'America/Argentina/Buenos_Aires' }, 'es');
      expect(pedidos[0].messages[0].content).toContain('Dormir mejor');
      expect(pedidos[0].messages[0].content).toContain('no instrucciones');
      expect(pedidos[0].messages[0].content).not.toContain('Moverme más');
      expect(pedidos[0].messages[0].content).not.toContain('Menos pantalla');
      expect(pedidos[0].system).toContain('nunca diagnósticos');
    });

    it('sin objetivos, el pedido no cambia', async () => {
      await anotar();
      const pedidos = iaFalsa();
      await comentarDia(obtenerDb(), { id: personaId, nombre: 'Rodrigo', zona_horaria: 'America/Argentina/Buenos_Aires' }, 'es');
      expect(pedidos[0].messages[0].content).not.toContain('Objetivos que se puso');
      expect(pedidos[0].system).not.toContain('se puso objetivos');
    });

    it('llegan al resumen de la noche y a las hipótesis', async () => {
      await crear('Dormir mejor', 'dormir_mejor');
      const db = obtenerDb();
      const hoy = diaDePatty(new Date(), 'America/Argentina/Buenos_Aires');
      await db.execute(sql`INSERT INTO sueno_etapas (persona_id, noche, inicio, fin, etapa) VALUES (${personaId}, ${hoy}, ${`${hoy}T03:00:00Z`}, ${`${hoy}T09:00:00Z`}, 'profundo')`);
      const pedidos: any[] = [];
      const crearNoche = async (p: any) => {
        pedidos.push(p);
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(p.output_config.format.schema.properties.hipotesis ? { hipotesis: [] } : { texto: 'Dormiste bien.', calidad: 8 }) }] };
      };
      usarClientePrueba({ messages: { create: crearNoche }, beta: { messages: { create: crearNoche } } } as unknown as Anthropic);
      await resumirNoche(db, { id: personaId, nombre: 'Rodrigo', zona_horaria: 'America/Argentina/Buenos_Aires' }, hoy, 'es');
      expect(pedidos[0].messages[0].content).toContain('Dormir mejor');
      await pedirHipotesis({ perfil: 'PERFIL', conocidos: [], rechazadas: [], apartados: [], objetivos: await lineasMetas(db, personaId) });
      expect(pedidos[1].messages[0].content).toContain('OBJETIVOS QUE SE PUSO');
      expect(pedidos[1].messages[0].content).toContain('Dormir mejor');
    });

    it('llegan al resumen de la semana y a lo que se le pregunta a Patty', async () => {
      await crear('Dormir mejor', 'dormir_mejor');
      await anotar();
      const hoy = diaDePatty(new Date(), 'America/Argentina/Buenos_Aires');
      const pedidos = iaFalsa();
      await resumirSemana(obtenerDb(), { id: personaId, nombre: 'Rodrigo' }, lunesDe(hoy), 'es');
      expect(pedidos.at(-1).messages[0].content).toContain('Dormir mejor');
      const antes = pedidos.length;
      const crearPregunta = async (p: any) => {
        pedidos.push(p);
        const props = p.output_config.format.schema.properties;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(props.concepto_ids ? { concepto_ids: [], desde: '', hasta: '' } : { respuesta: 'Bien.', fechas: [] }) }] };
      };
      usarClientePrueba({ messages: { create: crearPregunta }, beta: { messages: { create: crearPregunta } } } as unknown as Anthropic);
      const r = await ana.post('/api/preguntar', { persona_id: personaId, pregunta: '¿Cómo vengo con dormir?' });
      expect(r.status).toBe(200);
      expect(pedidos.length).toBe(antes + 2);
      expect(pedidos.at(-1).messages[0].content).toContain('Dormir mejor');
    });
  });

  it('se borran con la persona', async () => {
    await crear('Dormir mejor');
    await ana.get(`/api/metas/dia?persona=${personaId}`);
    await obtenerDb().execute(sql`DELETE FROM personas WHERE id = ${personaId}`);
    expect(await filas(obtenerDb(), sql`SELECT id FROM metas`)).toEqual([]);
    expect(await filas(obtenerDb(), sql`SELECT id FROM metas_dia`)).toEqual([]);
  });
});

describe('lo médico', () => {
  it('reconoce lo que suena médico, y no lo que no', () => {
    for (const t of ['Bajar la presión', 'Controlar la diabetes', 'dejar la pastilla', 'menos dolores de cabeza', 'Lower my blood pressure']) expect(pareceMedico(t), t).toBe(true);
    for (const t of ['Dormir mejor', 'Comer menos grasas', 'Moverme más', 'Tomar más agua', 'Aprender a tejer', 'Sleep better']) expect(pareceMedico(t), t).toBe(false);
  });

  it('frena lo que se mete con un tratamiento o diagnostica, pero no derivar al médico', () => {
    for (const t of ['Bajá la dosis', 'Dejá de tomar la pastilla', 'Tenés diabetes, ojo', 'Cambiá tu medicación por la tarde', 'Stop your medication']) expect(tocaTratamiento(t), t).toBe(true);
    for (const t of ['Hablá con tu médico antes de cambiar la medicación', 'Caminá 10 minutos', 'Cortá el café después del mediodía', 'Bajá el azúcar de a poco']) expect(tocaTratamiento(t), t).toBe(false);
  });

  it('el plan de base de lo médico deriva a la consulta y nunca menciona tratamientos a cambiar', () => {
    const p = planBase('Bajar la presión', null, 'es');
    expect(p.resumen).toContain('médico');
    for (const x of [...p.pasos.map((y) => y.texto), ...p.preguntas, ...p.consejos]) expect(tocaTratamiento(x), x).toBe(false);
  });

  it('las sugerencias y los datos que miden están traducidos', () => {
    const textos = [...MEDIDAS_META.map((m) => m.nombre), ...SUGERENCIAS_META.flatMap((x) => [x.texto, x.resumen, ...x.pasos.map((p) => p.texto), ...x.preguntas, ...x.consejos])];
    expect(textos.filter((x) => traducir('en', x) === x)).toEqual([]);
  });

  it('el plan de base sale traducido', () => {
    expect(planBase('Dormir mejor', 'dormir_mejor', 'en').pasos[0].texto).toBe('Go to bed and get up at a similar time, weekends too.');
  });
});

describe('sin IA, de a poco', () => {
  it('intercala consejos y preguntas y vuelve a empezar', () => {
    const plan = planBase('Dormir mejor', 'dormir_mejor', 'es');
    const l = [0, 1, 2, 3, 4].map((n) => consejoDeBase(plan, n));
    expect(l.map((x) => x.tipo)).toEqual(['consejo', 'pregunta', 'consejo', 'pregunta', 'consejo']);
    expect(l[4].texto).toBe(l[0].texto);
  });

  it('lo que la IA devuelva mal no rompe: sin pasos, no hay plan', () => {
    const base = planBase('Dormir mejor', 'dormir_mejor', 'es');
    expect(validarPlan({ pasos: 'nada' }, new Map(), base)).toBeNull();
    expect(validarPlan({}, new Map(), base)).toBeNull();
    const ok = validarPlan({ resumen: 3, pasos: [{ texto: 'Uno' }, { texto: 'Dos', mide: 7 }] }, new Map(), base);
    expect(ok?.resumen).toBe(base.resumen);
    expect(ok?.pasos.map((p) => p.mide)).toEqual(['', '']);
    expect(ok?.consejos).toEqual(base.consejos);
  });
});
