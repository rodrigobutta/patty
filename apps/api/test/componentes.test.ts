import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { calcularComponentes } from '../src/componentes/calcular.js';
import { CONCEPTOS_COMPONENTES, claveAlimento } from '../src/componentes/lista.js';
import { comidaDe, COBERTURA_MIN, porciones, rasgosDeComidas, type ComidaDia, type RegistroComida } from '../src/componentes/niveles.js';
import { armarDeSemilla, enlazarConceptos, gastadoHoy, INTENTOS_MAX, probarAlimento, resolverLote, semilla, TOKENS_POR_DIA } from '../src/componentes/resolver.js';
import { buscarIngrediente, tablaIngredientes } from '../src/componentes/tabla.js';
import { filas, obtenerDb, una } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { sumarDias } from '../src/lib/fechas.js';
import { analizarPersona } from '../src/patrones/analizar.js';
import { armarPerfil } from '../src/patrones/perfil.js';
import { buscarPatrones, describir, type ConceptoInfo, type FilaDiaria } from '../src/patrones/motor.js';
import { preventivosDeHoy } from '../src/patrones/preventivo.js';
import { baseLimpia, conAdmin } from './ayudas.js';
import { azar, comidaDePrueba, conComponentes } from './sinteticos.js';

const DESDE = '2025-01-06';
const db = () => obtenerDb();
afterEach(() => usarClientePrueba(null));

/** Una IA de mentira: responde según el esquema que le pidan, y anota cuánto gastó. */
function iaFalsa(responder: (texto: string, esquema: { properties: Record<string, unknown> }) => unknown, usage = { input_tokens: 100, output_tokens: 100 }) {
  const pedidos: string[] = [];
  const crear = async (p: { messages: Array<{ content: string }>; output_config: { format: { schema: { properties: Record<string, unknown> } } } }) => {
    pedidos.push(p.messages[0].content);
    return { content: [{ type: 'text', text: JSON.stringify(responder(p.messages[0].content, p.output_config.format.schema)) }], stop_reason: 'end_turn', usage };
  };
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
  return pedidos;
}

const NIVELES = { lactosa: 0, gluten: 3, fodmap: 1, histamina: 0, picante: 0, ultraprocesado: 0 };

describe('la tabla de ingredientes', () => {
  it('trae lo que hace falta, por 100 g', async () => {
    const t = await tablaIngredientes();
    expect(t.filas.length).toBeGreaterThan(3000);
    const sal = t.porNombre.get(claveAlimento('sal'))!;
    expect(sal.por100.sal).toBeGreaterThan(30000);
    expect(t.porNombre.get(claveAlimento('harina de trigo'))!.por100.harinas).toBeGreaterThan(60);
    expect(t.porNombre.get(claveAlimento('pan integral'))!.por100.harinas ?? 0).toBe(0);
    expect(t.porNombre.get(claveAlimento('cerveza'))!.por100.alcohol).toBeGreaterThan(3);
    expect(t.porNombre.get(claveAlimento('cafe'))!.por100.cafeina).toBeGreaterThan(30);
  });

  it('se busca sin tenerla entera en la cabeza: en inglés o en castellano', async () => {
    const t = await tablaIngredientes();
    expect(buscarIngrediente(t, 'wheat flour')[0].en).toMatch(/Wheat flour/);
    expect(buscarIngrediente(t, 'lechuga')[0].es).toContain('lechuga');
    expect(buscarIngrediente(t, 'wheat flour')).toHaveLength(8);
    expect(buscarIngrediente(t, 'xxzzqq')).toEqual([]);
  });

  it('la clave junta los nombres que son lo mismo y separa los que no', () => {
    expect(claveAlimento('Empanadas de Carne')).toBe(claveAlimento('empanada carne'));
    expect(claveAlimento('Tostadas')).toBe(claveAlimento('tostada'));
    expect(claveAlimento('Alfajores')).toBe(claveAlimento('alfajor'));
    expect(claveAlimento('Panes')).toBe(claveAlimento('pan'));
    expect(claveAlimento('Café')).not.toBe(claveAlimento('Café sin azúcar'));
    expect(claveAlimento('Helado de café')).not.toBe(claveAlimento('Café helado'));
  });
});

describe('la semilla de comidas populares', () => {
  it('usa solo ingredientes de la tabla y cada nombre es de una sola comida', async () => {
    const t = await tablaIngredientes();
    const s = await semilla();
    expect(s.alimentos.length).toBeGreaterThan(150);
    const dueno = new Map<string, number>();
    s.alimentos.forEach((a, i) => {
      expect(() => armarDeSemilla(t, a)).not.toThrow();
      expect(a.a).toHaveLength(6);
      for (const n of a.n) {
        const c = claveAlimento(n);
        expect(dueno.has(c) && dueno.get(c) !== i ? `${n} está dos veces` : '').toBe('');
        dueno.set(c, i);
      }
    });
  });

  it('da números con sentido', async () => {
    const t = await tablaIngredientes();
    const s = await semilla();
    const de = (nombre: string) => armarDeSemilla(t, s.alimentos.find((a) => a.n.includes(nombre))!).componentes;
    expect(de('Empanada').harinas).toBeGreaterThan(25);
    expect(de('Milanesa').sal).toBeGreaterThan(300);
    expect(de('Gaseosa').azucar).toBeGreaterThan(20);
    expect(de('Cerveza').alcohol).toBeGreaterThan(15);
    expect(de('Mate').cafeina).toBeGreaterThan(50);
    expect(de('Agua').calorias ?? 0).toBe(0);
    expect(de('Helado').lactosa).toBe(3);
    expect(de('Asado').grasa).toBeGreaterThan(50);
  });
});

describe('las cuentas de un plato', () => {
  it('suma los ingredientes y la confianza va por gramo', () => {
    const r = calcularComponentes(
      [
        { nombre: 'a', gramos: 100, fuente: 'tabla', ref: 1, por100: { sal: 100, grasa: 10 } },
        { nombre: 'b', gramos: 100, fuente: 'estimado', ref: null, por100: { sal: 50 } },
      ],
      { gluten: 2 },
    );
    expect(r.componentes).toEqual({ sal: 150, grasa: 10, gluten: 2 });
    expect(r.confianza).toBe(0.7);
    expect(r.gramos).toBe(200);
  });

  it('las porciones escalan: chica, grande, "3 empanadas", "500 ml"', () => {
    const base = { valor: null, unidad: null, porcion: null, gramos: 180, gramos_unidad: 90 };
    expect(porciones({ ...base, porcion: 'chica' })).toBe(0.7);
    expect(porciones({ ...base, porcion: 'grande' })).toBe(1.4);
    expect(porciones(base)).toBe(1);
    expect(porciones({ ...base, valor: 3, unidad: 'empanadas' })).toBe(1.5);
    expect(porciones({ ...base, gramos: 250, gramos_unidad: 250, valor: 2, unidad: 'vasos' })).toBe(2);
    expect(porciones({ ...base, gramos: 250, gramos_unidad: null, valor: 500, unidad: 'ml' })).toBe(2);
    expect(porciones({ ...base, gramos_unidad: null, valor: 100 })).toBe(5);
  });
});

describe('sin saber qué es: lo que digan los tipos del plato', () => {
  const r = (x: Partial<RegistroComida>): RegistroComida => ({ fecha: DESDE, hora: 0, nombre: 'Algo', categoria: 'comida', valor: null, unidad: null, porcion: null, tipos: null, estado: 'pendiente', confianza: 0, gramos: null, gramos_unidad: null, componentes: {}, ...x });

  it('pesa poco y solo dice lo que el tipo sabe', () => {
    const c = comidaDe(r({ tipos: ['frito'] }))!;
    expect(c.componentes.grasa).toBeGreaterThan(0);
    expect(c.peso).toBeLessThan(0.5);
    expect(c.conocidos?.has('grasa')).toBe(true);
    expect(c.conocidos?.has('sal')).toBe(false);
  });

  it('sin tipos cuenta como comido, pero no se sabe nada', () => {
    const c = comidaDe(r({}))!;
    expect(c.peso).toBe(0);
    expect(c.gramos).toBeGreaterThan(0);
  });

  it('lo que no es comida no cuenta; lo resuelto, con sus números', () => {
    expect(comidaDe(r({ estado: 'no_comida' }))).toBeNull();
    const c = comidaDe(r({ estado: 'resuelto', confianza: 0.9, gramos: 200, componentes: { sal: 400 }, porcion: 'grande' }))!;
    expect(c.componentes.sal).toBe(560);
    expect(c.peso).toBe(1);
    expect(c.conocidos).toBeNull();
  });
});

describe('el nivel de cada día, según la persona', () => {
  /** `dias` días con esta cantidad de sal cada uno. */
  const conSal = (valores: number[]) => valores.map((v, i) => comidaDePrueba(sumarDias(DESDE, i), 'Comida', { sal: v }));
  const mucha = (l: ComidaDia[]) => rasgosDeComidas(l).find((x) => x.clave === 'sal' && x.nivel === 'mucho');

  it('"mucho" es relativo a sus propios días, no a gramos absolutos', () => {
    const r = azar(3);
    const base = Array.from({ length: 60 }, () => 1 + r());
    const poco = mucha(conSal(base.map((x) => x * 800)))!;
    const muchisimo = mucha(conSal(base.map((x) => x * 3000)))!;
    expect(poco.dias.map((d) => d.fecha)).toEqual(muchisimo.dias.map((d) => d.fecha));
    expect(poco.dias.length).toBeGreaterThan(8);
    expect(poco.dias.length).toBeLessThanOrEqual(16);
  });

  it('si todos sus días son iguales no hay días con mucho, y lo poquito no llega al piso', () => {
    expect(mucha(conSal(Array(60).fill(1000)))).toBeUndefined();
    const r = azar(4);
    expect(mucha(conSal(Array.from({ length: 60 }, () => 100 + 300 * r())))).toBeUndefined();
  });

  it('el que casi nunca toma: cualquier día con alcohol es mucho', () => {
    const l = Array.from({ length: 60 }, (_, i) => comidaDePrueba(sumarDias(DESDE, i), 'Comida', i % 10 ? {} : { alcohol: 20 }));
    expect(rasgosDeComidas(l).find((x) => x.clave === 'alcohol')?.dias).toHaveLength(6);
  });

  it('con pocos días no hay rasgo', () => {
    expect(mucha(conSal(Array.from({ length: 15 }, (_, i) => 500 + i * 200)))).toBeUndefined();
  });

  it('un día que casi no se sabe qué se comió no cuenta como "poco": queda afuera', () => {
    const r = azar(5);
    const l: ComidaDia[] = [];
    const sinSaber: string[] = [];
    for (let i = 0; i < 80; i++) {
      const f = sumarDias(DESDE, i);
      l.push(comidaDePrueba(f, 'Sabida', { sal: 300 + 2500 * r(), fibra: 1 + 20 * r() }));
      l.push(comidaDePrueba(f, 'Otra', { sal: 300, fibra: 3 }));
      if (i % 5 === 0) {
        // Ese día lo sabido es una comida chica al lado de mucho sin resolver.
        l.push(comidaDePrueba(f, 'Sin resolver', {}, { peso: 0, conocidos: new Set(), gramos: 1500 }));
        sinSaber.push(f);
      }
    }
    const rasgos = rasgosDeComidas(l);
    const sal = rasgos.find((x) => x.clave === 'sal' && x.nivel === 'mucho')!;
    const poca = rasgos.find((x) => x.clave === 'fibra' && x.nivel === 'poco')!;
    for (const f of sinSaber) {
      expect(sal.universo.has(f)).toBe(false);
      expect(poca.universo.has(f)).toBe(false);
      expect(poca.dias.some((d) => d.fecha === f)).toBe(false);
    }
    expect(sal.universo.size).toBe(80 - sinSaber.length);
    expect(COBERTURA_MIN).toBeGreaterThan(0.5);
  });

  it('un día solo con comidas aproximadas (por sus tipos) tampoco alcanza', () => {
    const l: ComidaDia[] = [];
    for (let i = 0; i < 60; i++) {
      const f = sumarDias(DESDE, i);
      l.push(comidaDePrueba(f, 'Frita', { grasa: 25 }, { peso: 0.4, conocidos: new Set(['grasa']) }));
    }
    expect(rasgosDeComidas(l).find((x) => x.clave === 'grasa')).toBeUndefined();
  });

  it('un día con mucho menos anotado que lo habitual para esa persona no cuenta', () => {
    const r = azar(6);
    const l: ComidaDia[] = [];
    for (let i = 0; i < 60; i++) {
      const f = sumarDias(DESDE, i);
      const cuantas = i % 6 === 0 ? 1 : 4;
      for (let k = 0; k < cuantas; k++) l.push(comidaDePrueba(f, `C${k}`, { fibra: 3 + 6 * r(), sal: r() < 0.3 ? 1500 : 200 }));
    }
    const sal = rasgosDeComidas(l).find((x) => x.clave === 'sal')!;
    expect(sal.universo.has(DESDE)).toBe(false);
    expect(sal.universo.size).toBe(50);
  });

  it('dice qué comidas aportaron más, y a qué hora se llegó a "mucho"', () => {
    const l: ComidaDia[] = [];
    for (let i = 0; i < 40; i++) {
      const f = sumarDias(DESDE, i);
      const alto = i % 4 === 0;
      l.push(comidaDePrueba(f, 'Tostada', { sal: 100 }, { hora: Date.parse(`${f}T09:00:00Z`) }));
      l.push(comidaDePrueba(f, alto ? (i % 8 === 0 ? 'Milanesa' : 'Empanada') : 'Ensalada', { sal: alto ? 2000 : 150 }, { hora: Date.parse(`${f}T21:00:00Z`) }));
    }
    const sal = rasgosDeComidas(l).find((x) => x.clave === 'sal')!;
    expect(sal.alimentos.slice(0, 2).sort()).toEqual(['Empanada', 'Milanesa']);
    expect(sal.dias[0].primera).toBe(Date.parse(`${sal.dias[0].fecha}T21:00:00Z`));
  });
});

/** Una persona que come de todo: cada día, de una lista de comidas al azar. Dolor de cabeza con mucha sal el día anterior. */
function conSalPlantada(dias: number, semilla = 11, plantar = true) {
  const r = azar(semilla);
  // Ninguna comida salada aparece tantas veces como para que se note sola: lo que las une es la sal.
  const saladas = Array.from({ length: 12 }, (_, i) => ({ nombre: `Salada ${i}`, id: 100 + i, sal: 1800 + 400 * r() }));
  const otras = Array.from({ length: 12 }, (_, i) => ({ nombre: `Otra ${i}`, id: 200 + i, sal: 80 + 200 * r() }));
  const conceptos: ConceptoInfo[] = [
    ...[...saladas, ...otras].map((c) => ({ id: c.id, nombre: c.nombre, tipo_valor: 'evento' as const, rol: 'causa' as const, categoria: 'comida' })),
    { id: 1, nombre: 'Dolor de cabeza', tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' },
  ];
  const filasD: FilaDiaria[] = [];
  const comidas: ComidaDia[] = [];
  let ayerSalado = false;
  for (let d = 0; d < dias; d++) {
    const f = sumarDias(DESDE, d);
    const t = Date.parse(`${f}T12:00:00Z`);
    const salado = r() < 0.25;
    const del = salado ? saladas[Math.floor(r() * saladas.length)] : otras[Math.floor(r() * otras.length)];
    const segunda = otras[Math.floor(r() * otras.length)];
    for (const c of [del, segunda]) {
      filasD.push({ fecha: f, concepto_id: c.id, veces: 1, suma: null, promedio: null, intensidad: null, primera: t });
      comidas.push(comidaDePrueba(f, c.nombre, { sal: c.sal }, { hora: t }));
    }
    if (r() < (plantar && ayerSalado ? 0.75 : 0.08)) filasD.push({ fecha: f, concepto_id: 1, veces: 1, suma: null, promedio: null, intensidad: 4, primera: t - 3600000 });
    ayerSalado = salado;
  }
  const extra: ConceptoInfo[] = [];
  rasgosDeComidas(comidas).forEach((x, i) => {
    const id = 50000 + i;
    extra.push({ id, nombre: x.concepto, tipo_valor: 'evento', rol: 'causa', categoria: 'componente', universo: x.universo, componente: { clave: x.clave, nivel: x.nivel, alimentos: x.alimentos } });
    for (const y of x.dias) filasD.push({ fecha: y.fecha, concepto_id: id, veces: 1, suma: null, promedio: null, intensidad: null, primera: y.primera, automatica: true });
  });
  return { filas: filasD, conceptos: [...conceptos, ...extra], desde: DESDE, hasta: sumarDias(DESDE, dias - 1), saladas };
}

describe('el motor con componentes', () => {
  it('encuentra "mucha sal → dolor de cabeza" entre comidas distintas', () => {
    const p = conSalPlantada(150);
    const r = buscarPatrones(p.filas, p.conceptos, p.desde, p.hasta);
    const nombre = new Map(p.conceptos.map((c) => [c.id, c.nombre]));
    const sal = r.candidatos.find((x) => nombre.get(x.causa_id) === 'Días con mucha sal');
    expect(sal?.desfase_dias).toBe(1);
    expect(sal?.q_valor).toBeLessThan(0.05);
    expect(sal?.efecto_id).toBe(1);
    // Es más fuerte que cualquiera de las comidas sola.
    const primera = [...r.candidatos].filter((x) => x.efecto_id === 1 && !x.causas_extra.length).sort((a, b) => b.puntaje - a.puntaje)[0];
    expect(nombre.get(primera.causa_id)).toBe('Días con mucha sal');
    expect(describir(sal!, 'Días con mucha sal', 'Dolor de cabeza', 'es')).toContain('Los días con «mucha sal»');
  });

  it('un rasgo de componente es solo causa, y se mide solo en los días que se sabe', () => {
    const p = conSalPlantada(150);
    const c = p.conceptos.find((x) => x.nombre === 'Días con mucha sal')!;
    const r = buscarPatrones(p.filas, p.conceptos, p.desde, p.hasta);
    expect(r.candidatos.some((x) => x.efecto_id === c.id)).toBe(false);
    const cuantos = c.universo!.size;
    const x = r.candidatos.find((y) => y.causa_id === c.id)!;
    expect(x.dias_evaluados).toBeLessThanOrEqual(cuantos);
  });

  it('cuentan como cualquier otra prueba en la corrección', () => {
    const p = conSalPlantada(150);
    const sin = buscarPatrones(p.filas.filter((f) => f.concepto_id < 50000), p.conceptos.filter((c) => c.id < 50000), p.desde, p.hasta);
    const con = buscarPatrones(p.filas, p.conceptos, p.desde, p.hasta);
    expect(con.pares_evaluados).toBeGreaterThan(sin.pares_evaluados);
  });

  it('no llena la lista de lo mismo: grasa, calorías y grasa saturada van juntas y queda una', () => {
    const r = azar(21);
    const conceptos: ConceptoInfo[] = [{ id: 1, nombre: 'Dolor de panza', tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' }, { id: 2, nombre: 'Comida frita', tipo_valor: 'evento', rol: 'causa', categoria: 'comida' }];
    const filasD: FilaDiaria[] = [];
    const comidas: ComidaDia[] = [];
    let ayer = false;
    for (let d = 0; d < 200; d++) {
      const f = sumarDias(DESDE, d);
      const t = Date.parse(`${f}T12:00:00Z`);
      const pesada = r() < 0.25;
      const ruido = () => 0.8 + 0.4 * r();
      comidas.push(comidaDePrueba(f, pesada ? 'Frita' : 'Liviana', pesada ? { grasa: 60 * ruido(), grasa_saturada: 20 * ruido(), calorias: 1500 * ruido(), sal: 500 * ruido() } : { grasa: 15 * ruido(), grasa_saturada: 4 * ruido(), calorias: 500 * ruido(), sal: 500 * ruido() }, { hora: t }));
      if (pesada) filasD.push({ fecha: f, concepto_id: 2, veces: 1, suma: null, promedio: null, intensidad: null, primera: t });
      else filasD.push({ fecha: f, concepto_id: 3, veces: 1, suma: null, promedio: null, intensidad: null, primera: t });
      if (r() < (ayer ? 0.7 : 0.08)) filasD.push({ fecha: f, concepto_id: 1, veces: 1, suma: null, promedio: null, intensidad: 4, primera: t - 3600000 });
      ayer = pesada;
    }
    conceptos.push({ id: 3, nombre: 'Liviano', tipo_valor: 'evento', rol: 'causa', categoria: 'comida' });
    const extra: ConceptoInfo[] = [];
    rasgosDeComidas(comidas).forEach((x, i) => {
      extra.push({ id: 50000 + i, nombre: x.concepto, tipo_valor: 'evento', rol: 'causa', categoria: 'componente', universo: x.universo, componente: { clave: x.clave, nivel: x.nivel, alimentos: x.alimentos } });
      for (const y of x.dias) filasD.push({ fecha: y.fecha, concepto_id: 50000 + i, veces: 1, suma: null, promedio: null, intensidad: null, primera: y.primera, automatica: true });
    });
    expect(extra.length).toBeGreaterThanOrEqual(3);
    const res = buscarPatrones(filasD, [...conceptos, ...extra], DESDE, sumarDias(DESDE, 199));
    const relacionados = res.candidatos.filter((x) => x.efecto_id === 1 && !x.causas_extra.length && !x.protege && (x.causa_id >= 50000 || x.causa_id === 2));
    expect(relacionados).toHaveLength(1);
  });

  it('en datos al azar no agregan patrones firmes falsos', async () => {
    const t = await tablaIngredientes();
    const s = await semilla();
    const composiciones = s.alimentos.map((a) => armarDeSemilla(t, a).componentes);
    let componentes = 0;
    for (const sem of [1, 2, 3, 4]) {
      const h = conComponentes(365, 60, sem * 101, composiciones);
      const nombres = new Map(h.conceptos.map((c) => [c.id, c]));
      const r = buscarPatrones(h.conFilas, h.conceptos, h.desde, h.hasta);
      componentes += r.candidatos.filter((x) => x.q_valor <= 0.1 && nombres.get(x.causa_id)?.componente).length;
    }
    expect(componentes).toBeLessThanOrEqual(1);
  }, 120000);
});

describe('qué se le da a la IA para sospechar', () => {
  it('el perfil lista los componentes, con los días que se dieron', () => {
    const p = conSalPlantada(150);
    const perfil = armarPerfil(p.filas, p.conceptos, p.desde, p.hasta);
    expect(perfil.texto).toContain('Días con mucha sal');
    expect(perfil.nombres.has('dias con mucha sal')).toBe(true);
    expect(perfil.texto).not.toMatch(/\bmg\b/);
  });
});

describe('resolver una comida', () => {
  beforeAll(baseLimpia);

  const anotarConcepto = async (nombre: string, usos = 3) => {
    const k = await una<{ id: number }>(db(), sql`SELECT id FROM categorias WHERE clave = 'comida'`);
    const r = await una<{ id: number }>(db(), sql`INSERT INTO conceptos (categoria_id, nombre, nombre_norm, tipo_valor, usos) VALUES (${k!.id}, ${nombre}, ${nombre.toLowerCase()}, 'evento', ${usos}) RETURNING id`);
    return r!.id;
  };
  const alimentoDe = (conceptoId: number) => una<any>(db(), sql`SELECT a.* FROM alimentos a JOIN conceptos c ON c.alimento_id = a.id WHERE c.id = ${conceptoId}`);

  it('a. lo que ya está en la tabla se enlaza sin gastar IA, aunque esté en plural', async () => {
    const pedidos = iaFalsa(() => ({}));
    const id = await anotarConcepto('Empanadas de carne');
    await enlazarConceptos(db());
    const a = await alimentoDe(id);
    expect(a.fuente).toBe('semilla');
    expect(a.estado).toBe('resuelto');
    expect(a.componentes.harinas).toBeGreaterThan(20);
    expect(a.confianza).toBeGreaterThan(0.8);
    expect(pedidos).toEqual([]);
  });

  it('b y c. la IA desarma, se calcula de la tabla, y lo que no está lo estima ella', async () => {
    const id = await anotarConcepto('Pastel de papa de la abuela');
    await enlazarConceptos(db());
    expect((await alimentoDe(id)).estado).toBe('pendiente');
    const t = await tablaIngredientes();
    const carne = t.porNombre.get(claveAlimento('carne picada'))!;
    const pedidos = iaFalsa((texto, esquema) => {
      if (esquema.properties.platos) {
        return { platos: [{ indice: 0, tipo: 'plato', gramos_unidad: 0, ...NIVELES, ingredientes: [
          { nombre: 'carne picada', busqueda_en: 'ground beef', gramos: 100 },
          { nombre: 'Queso rarísimo', busqueda_en: 'cheddar cheese', gramos: 50 },
          { nombre: 'Condimento secreto', busqueda_en: 'xxzzqq', gramos: 50 },
        ] }] };
      }
      expect(texto).toContain('Queso rarísimo');
      expect(texto).not.toContain('carne picada'); // estaba tal cual en la tabla: no se pregunta
      const cheddar = /(\d+): Cheese, cheddar/.exec(texto)![1];
      return { elegidos: [{ indice: 0, id: Number(cheddar) }, { indice: 1, id: 0 }], estimados: [{ indice: 1, calorias: 100, grasa: 0, grasa_saturada: 0, azucar: 0, harinas: 0, fibra: 0, proteina: 0, sal: 1000, alcohol: 0, cafeina: 0 }] };
    });
    expect(await resolverLote(db())).toBe(1);
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1].length).toBeLessThan(3000); // la lista corta, nunca la tabla entera
    const a = await alimentoDe(id);
    expect(a.estado).toBe('resuelto');
    expect(a.fuente).toBe('ia');
    const fuentes = Object.fromEntries(a.ingredientes.map((i: any) => [i.nombre, i.fuente]));
    expect(fuentes).toEqual({ 'carne picada': 'tabla', 'Queso rarísimo': 'tabla', 'Condimento secreto': 'estimado' });
    expect(a.confianza).toBeCloseTo(0.8, 5);
    // Los números: lo de la tabla sale de la tabla; lo estimado, de lo que dijo la IA.
    const sal = (carne.por100.sal! * 100) / 100 + (t.porNombre.get(claveAlimento('queso cheddar'))!.por100.sal! * 50) / 100 + 500;
    expect(a.componentes.sal).toBeCloseTo(sal, 1);
    expect(a.componentes.gluten).toBe(3);
  });

  it('no le cree un id que no estaba en la lista, y acota lo que devuelve', async () => {
    const id = await anotarConcepto('Plato inventado uno');
    await enlazarConceptos(db());
    iaFalsa((_t, esquema) =>
      esquema.properties.platos
        ? { platos: [{ indice: 0, tipo: 'plato', gramos_unidad: 0, ...NIVELES, lactosa: 99, ingredientes: [{ nombre: 'Cosa rara', busqueda_en: 'wheat flour', gramos: 99999 }] }] }
        : { elegidos: [{ indice: 0, id: 173468 }], estimados: [] },
    );
    await resolverLote(db());
    const a = await alimentoDe(id);
    expect(a.ingredientes[0].fuente).toBe('sin_dato');
    expect(a.confianza).toBe(0);
    expect(a.gramos).toBe(1500);
    expect(a.componentes.lactosa).toBe(3);
  });

  it('una comida genérica o algo que no se come queda dicho, y no se vuelve a pagar', async () => {
    const generica = await anotarConcepto('Almuerzo con amigos');
    const nada = await anotarConcepto('Nada hoy');
    await enlazarConceptos(db());
    iaFalsa(() => ({ platos: [{ indice: 0, tipo: 'generico', gramos_unidad: 0, ...NIVELES, ingredientes: [] }, { indice: 1, tipo: 'no_es_comida', gramos_unidad: 0, ...NIVELES, ingredientes: [] }] }));
    await resolverLote(db());
    expect((await alimentoDe(generica)).estado).toBe('generico');
    expect((await alimentoDe(nada)).estado).toBe('no_comida');
    const pedidos = iaFalsa(() => ({ platos: [] }));
    expect(await resolverLote(db())).toBe(0);
    expect(pedidos).toEqual([]);
  });

  it('d. sin IA no se gasta ningún intento', async () => {
    const id = await anotarConcepto('Plato sin ia');
    await enlazarConceptos(db());
    usarClientePrueba(null);
    expect(await resolverLote(db())).toBe(0);
    const a = await alimentoDe(id);
    expect(a.estado).toBe('pendiente');
    expect(a.intentos).toBe(0);
  });

  it('d. si la IA falla, reintenta más tarde, cada vez más espaciado y con un tope', async () => {
    const id = await anotarConcepto('Plato que falla');
    await enlazarConceptos(db());
    const crear = async () => {
      throw new Error('se cayó');
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    const espera: number[] = [];
    let ahora = new Date();
    for (let i = 0; i < INTENTOS_MAX; i++) {
      await resolverLote(db(), { ahora, limite: 20 }).catch(() => 0);
      const a = await alimentoDe(id);
      expect(a.intentos).toBe(i + 1);
      espera.push(new Date(a.proximo_intento).getTime() - ahora.getTime());
      // Antes de tiempo, no vuelve a intentar.
      const antes = await alimentoDe(id);
      await resolverLote(db(), { ahora, limite: 20 });
      expect((await alimentoDe(id)).intentos).toBe(antes.intentos);
      ahora = new Date(new Date(a.proximo_intento).getTime() + 1000);
    }
    expect(espera[1]).toBeGreaterThan(espera[0]);
    expect((await alimentoDe(id)).estado).toBe('fallido');
    expect((await alimentoDe(id)).error).toBeTruthy();
  });

  it('el tope de gasto del día frena todo, sin gastar intentos', async () => {
    const id = await anotarConcepto('Plato sin presupuesto');
    await enlazarConceptos(db());
    const pedidos = iaFalsa(() => ({ platos: [] }));
    await db().execute(sql`INSERT INTO uso_ia (tipo, fecha, entrada, salida) VALUES ('componentes', ${new Date().toISOString().slice(0, 10)}, ${TOKENS_POR_DIA}, 0), ('componentes', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, ${TOKENS_POR_DIA}, 0)`);
    expect(await gastadoHoy(db())).toBeGreaterThanOrEqual(TOKENS_POR_DIA);
    expect(await resolverLote(db())).toBe(0);
    expect(pedidos).toEqual([]);
    expect((await alimentoDe(id)).intentos).toBe(0);
    await db().execute(sql`DELETE FROM uso_ia`);
  });

  it('lo que gasta queda anotado aparte, y se puede probar sin guardar', async () => {
    await db().execute(sql`DELETE FROM uso_ia`);
    iaFalsa(() => ({ platos: [{ indice: 0, tipo: 'plato', gramos_unidad: 0, ...NIVELES, ingredientes: [{ nombre: 'lechuga', busqueda_en: 'lettuce', gramos: 80 }] }] }));
    const r = await probarAlimento('Ensalada de la casa');
    expect(r?.ingredientes[0].fuente).toBe('tabla');
    expect(await gastadoHoy(db())).toBe(200);
    expect(await una(db(), sql`SELECT 1 FROM alimentos WHERE nombre = 'Ensalada de la casa'`)).toBeNull();
  });

  it('al cambiarle el nombre a una comida, se vuelve a resolver', async () => {
    const { ana, categorias } = await conAdmin();
    const c = await ana.post('/api/conceptos', { nombre: 'Tostadas', categoria_id: categorias.comida });
    const id = c.body.concepto.id;
    await db().execute(sql`UPDATE conceptos SET usos = 3 WHERE id = ${id}`);
    await enlazarConceptos(db());
    expect((await alimentoDe(id)).fuente).toBe('semilla');
    await ana.put(`/api/conceptos/${id}`, { nombre: 'Polenta frita' });
    expect(await alimentoDe(id)).toBeNull();
  });
});

describe('de punta a punta', () => {
  /** Una persona con comidas de la semilla, salada cada tanto, y dolor de cabeza al día siguiente. */
  async function preparar(ana: { post: any; put: any }, personaId: number, categorias: Record<string, number>, dias = 120) {
    const d = db();
    const id = async (nombre: string, categoria: number, tipo = 'evento') => (await una<{ id: number }>(d, sql`INSERT INTO conceptos (categoria_id, nombre, nombre_norm, tipo_valor, usos) VALUES (${categoria}, ${nombre}, ${nombre.toLowerCase()}, ${tipo}, 5) ON CONFLICT DO NOTHING RETURNING id`))?.id ?? (await una<{ id: number }>(d, sql`SELECT id FROM conceptos WHERE categoria_id = ${categoria} AND nombre_norm = ${nombre.toLowerCase()}`))!.id;
    const saladas = [await id('Salame', categorias.comida), await id('Panceta', categorias.comida), await id('Palitos salados', categorias.comida), await id('Papitas', categorias.comida), await id('Fiambre', categorias.comida)];
    const livianas = [await id('Ensalada', categorias.comida), await id('Pollo', categorias.comida), await id('Manzana', categorias.comida), await id('Arroz', categorias.comida)];
    const dolor = await id('Dolor de cabeza prueba', categorias.sintoma, 'intensidad');
    const r = azar(31);
    const hasta = new Date().toISOString().slice(0, 10);
    const desde = sumarDias(hasta, -dias);
    let ayer = false;
    for (let i = 0; i <= dias; i++) {
      const f = sumarDias(desde, i);
      const salado = r() < 0.25;
      const c1 = salado ? saladas[Math.floor(r() * saladas.length)] : livianas[Math.floor(r() * livianas.length)];
      const c2 = livianas[Math.floor(r() * livianas.length)];
      for (const c of salado ? [c1, c1, c1, c2] : [c1, c2]) await d.execute(sql`INSERT INTO registros (persona_id, concepto_id, inicio, fecha) VALUES (${personaId}, ${c}, ${`${f}T15:00:00Z`}, ${f})`);
      if (r() < (ayer ? 0.8 : 0.05)) await d.execute(sql`INSERT INTO registros (persona_id, concepto_id, inicio, fecha, intensidad) VALUES (${personaId}, ${dolor}, ${`${f}T12:00:00Z`}, ${f}, 4)`);
      ayer = salado;
    }
    await enlazarConceptos(d);
    return { desde, hasta, saladas, dolor };
  }

  it('encuentra el patrón, dice qué comidas fueron, y el interruptor lo apaga', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const { desde, hasta, dolor } = await preparar(ana, personaId, categorias);
    const persona = { id: personaId, nombre: 'Rodrigo', zona_horaria: 'America/Argentina/Buenos_Aires', rol: 'dueno' as const };
    const inicio = Date.now();
    const r = await analizarPersona(db(), persona, { desde, hasta, idioma: 'es', ia: false, origen: 'manual' });
    console.log(`Análisis de punta a punta con componentes: ${Date.now() - inicio} ms`);
    const h = r.hallazgos.find((x) => x.causa === 'Días con mucha sal' && x.efecto_id === dolor);
    expect(h).toBeTruthy();
    expect(h!.componente?.clave).toBe('sal');
    expect(h!.componente?.alimentos.length).toBeGreaterThan(0);
    // Nada de gramos en lo que se le muestra.
    expect(h!.explicacion).not.toMatch(/\d\s?(mg|g|kcal)\b/);
    const lista = await ana.get(`/api/hallazgos?persona=${personaId}`);
    expect(lista.body.some((x: { componente?: unknown }) => x.componente)).toBe(true);

    // No se le sugiere a nadie al escribir.
    const sug = await ana.get('/api/conceptos/buscar?q=mucha%20sal');
    expect(sug.body).toEqual([]);

    // No avisa por adelantado: se leería como un consejo de dieta.
    const prev = await preventivosDeHoy(db(), persona);
    expect(prev.some((x) => x.causas.some((c) => CONCEPTOS_COMPONENTES.includes(c.nombre as never)))).toBe(false);

    // Apagado: lo de antes no se muestra, y el análisis nuevo no lo busca.
    expect((await ana.put(`/api/personas/${personaId}`, { patrones: { componentes: false } })).status).toBe(200);
    const sin = await ana.get(`/api/hallazgos?persona=${personaId}`);
    expect(sin.body.some((x: { componente?: unknown }) => x.componente)).toBe(false);
    const otra = await analizarPersona(db(), persona, { desde, hasta, idioma: 'es', ia: false, origen: 'manual' });
    expect(otra.hallazgos.some((x) => x.causa.startsWith('Días con'))).toBe(false);
    expect(otra.pares_evaluados).toBeLessThan(r.pares_evaluados);
  }, 120000);

  it('sin nada resuelto no hay rasgos: todos los días quedan sin datos', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const { desde, hasta } = await preparar(ana, personaId, categorias);
    await db().execute(sql`UPDATE conceptos SET alimento_id = NULL`);
    const r = await analizarPersona(db(), { id: personaId, nombre: 'R', zona_horaria: 'America/Argentina/Buenos_Aires', rol: 'dueno' }, { desde, hasta, idioma: 'es', ia: false, origen: 'manual' });
    expect(r.hallazgos.some((x) => x.causa.startsWith('Días con'))).toBe(false);
    expect((await filas(db(), sql`SELECT 1 FROM conceptos WHERE nombre LIKE 'Días con%' AND usos > 0`)).length).toBe(0);
  }, 120000);
});
