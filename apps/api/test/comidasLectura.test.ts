// Lo que más se viene comiendo (por lo que tienen adentro las comidas) y la lectura diaria: las cuentas, sin IA y con IA.
import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { consumoDeElementos, elementoDe, elementosDelPlato, lecturaSinIa, type RegistroConIngredientes } from '../src/componentes/consumo.js';
import { cerrarDb, filas, obtenerDb, una } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { leerComidas } from '../src/ia/leerComidas.js';
import { sumarDias } from '../src/lib/fechas.js';
import { leerComidasDeHoy } from '../src/patrones/noche.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarClientePrueba(null));

const HOY = '2026-06-30';
const MILANESA = [{ nombre: 'peceto', gramos: 130 }, { nombre: 'pan rallado', gramos: 35 }, { nombre: 'huevo', gramos: 20 }, { nombre: 'aceite de girasol', gramos: 25 }, { nombre: 'sal', gramos: 1 }];
const EMPANADA = [{ nombre: 'tapa de empanada', gramos: 70 }, { nombre: 'carne picada', gramos: 55 }, { nombre: 'cebolla', gramos: 30 }, { nombre: 'manteca', gramos: 8 }];
const reg = (fecha: string, ingredientes: RegistroConIngredientes['ingredientes'], x: Partial<RegistroConIngredientes> & { h?: number } = {}): RegistroConIngredientes => ({
  fecha,
  hora: Date.parse(`${fecha}T${String(x.h ?? 13).padStart(2, '0')}:00:00Z`),
  estado: 'resuelto',
  ingredientes,
  ...x,
});

describe('los elementos principales', () => {
  it('junta lo parecido y deja afuera lo que no dice nada', () => {
    expect(elementoDe('peceto')).toBe('Carne');
    expect(elementoDe('Carne picada')).toBe('Carne');
    expect(elementoDe('pechuga de pollo')).toBe('Pollo');
    expect(elementoDe('muzzarella')).toBe('Queso');
    expect(elementoDe('pan rallado')).toBe('Pan');
    expect(elementoDe('papa frita')).toBe('Papa');
    expect(elementoDe('sal')).toBeNull();
    expect(elementoDe('agua')).toBeNull();
    expect(elementoDe('dulce de leche')).toBe('Dulce de leche');
    expect(elementoDe('galletitas de agua')).toBe('Galletitas de agua');
    expect(elementoDe('morron')).toBe('Morrón');
    expect(elementoDe('lentejas')).toBe('Lentejas');
  });

  it('de un plato, solo lo que pesa: el aceite y la sal de la milanesa no son la milanesa', () => {
    expect(elementosDelPlato(MILANESA)).toEqual(['Carne', 'Pan']);
    expect(elementosDelPlato(EMPANADA)).toEqual(['Harina y masas', 'Carne', 'Cebolla']);
  });

  it('el café no se pierde por el agua: el agua no cuenta para el total', () => {
    expect(elementosDelPlato([{ nombre: 'agua', gramos: 240 }, { nombre: 'cafe', gramos: 10 }])).toEqual(['Café']);
    expect(elementosDelPlato([{ nombre: 'agua', gramos: 240 }])).toEqual([]);
  });
});

describe('el consumo día a día', () => {
  it('cuenta veces por día y por comida; lo del mismo minuto es una sola comida', () => {
    const c = consumoDeElementos(
      [
        reg(HOY, MILANESA, { h: 13 }),
        reg(HOY, [{ nombre: 'pan frances', gramos: 100 }], { h: 13 }), // misma comida: el pan cuenta una vez
        reg(HOY, [{ nombre: 'pan frances', gramos: 100 }], { h: 20 }),
        reg(sumarDias(HOY, -2), MILANESA),
      ],
      HOY,
    );
    expect(c.dias).toHaveLength(14);
    expect(c.dias[13]).toBe(HOY);
    expect(c.dias[0]).toBe(sumarDias(HOY, -13));
    const pan = c.elementos.find((e) => e.nombre === 'Pan')!;
    expect(pan.veces[13]).toBe(2);
    expect(pan.veces[11]).toBe(1);
    expect(pan).toMatchObject({ total: 3, dias: 2, dias_desde: 0, seguidos: 1 });
    expect(c.elementos[0].nombre).toBe('Pan'); // el más comido primero
    expect(c.comidas_por_dia[13]).toBe(2);
    expect(c.comidas_por_dia[12]).toBe(0);
    expect(c.distintos).toBe(2);
  });

  it('lo que no se sabe qué tiene no se adivina, y se dice; lo que no es comida no cuenta', () => {
    const c = consumoDeElementos([reg(HOY, [], { estado: 'pendiente' }), reg(HOY, [], { estado: 'generico' }), reg(HOY, null, { estado: null }), reg(HOY, [], { estado: 'no_comida' })], HOY);
    expect(c.elementos).toEqual([]);
    expect(c.sin_desglosar).toBe(3);
    expect(lecturaSinIa(c, 'es')).toBeNull();
  });

  it('no mira más allá del día pedido, y sabe qué dejó de aparecer', () => {
    const lentejas = [{ nombre: 'lentejas', gramos: 200 }];
    const c = consumoDeElementos(
      [reg(sumarDias(HOY, 1), MILANESA), reg(HOY, EMPANADA), reg(sumarDias(HOY, -20), lentejas), reg(sumarDias(HOY, -21), lentejas), reg(sumarDias(HOY, -22), lentejas), reg(sumarDias(HOY, -30), [{ nombre: 'batata', gramos: 200 }]), reg(sumarDias(HOY, -90), lentejas)],
      HOY,
    );
    expect(c.elementos.map((e) => e.nombre)).not.toContain('Pan');
    expect(c.sin_aparecer).toEqual([{ nombre: 'Lentejas', dias_desde: 20, veces: 3 }]); // la batata fue una sola vez; lo de hace 90 días no entra
  });

  it('muestra a lo sumo 8 elementos', () => {
    const nombres = ['arroz', 'pollo', 'tomate', 'lechuga', 'cebolla', 'zanahoria', 'huevo', 'pan blanco', 'banana', 'manzana'];
    const c = consumoDeElementos(nombres.map((n, i) => reg(HOY, [{ nombre: n, gramos: 100 }], { h: i + 8 })), HOY);
    expect(c.elementos).toHaveLength(8);
    expect(c.distintos).toBe(10);
  });
});

describe('la lectura sin IA', () => {
  const dias = (n: number, ing: RegistroConIngredientes['ingredientes']) => Array.from({ length: n }, (_, i) => reg(sumarDias(HOY, -i), ing));

  it('con menos de 3 días no dice nada', () => {
    expect(lecturaSinIa(consumoDeElementos(dias(2, MILANESA), HOY), 'es')).toBeNull();
  });

  it('dice lo que se repite, los días seguidos y lo que no aparece, con los números de verdad', () => {
    const lentejas = [{ nombre: 'lentejas', gramos: 200 }];
    const texto = lecturaSinIa(consumoDeElementos([...dias(4, MILANESA), reg(sumarDias(HOY, -20), lentejas), reg(sumarDias(HOY, -21), lentejas), reg(sumarDias(HOY, -22), lentejas)], HOY), 'es')!;
    expect(texto).toContain('En los últimos 14 días, lo que más se repite es carne (4 veces) y pan (4 veces).');
    expect(texto).toContain('Ya van 4 días seguidos con carne.');
    expect(texto).toContain('La última vez de lentejas fue hace 20 días');
  });

  it('en inglés también', () => {
    const texto = lecturaSinIa(consumoDeElementos(dias(4, MILANESA), HOY), 'en')!;
    expect(texto).toContain('what repeats the most is beef (4 times) and bread (4 times).');
    expect(texto).toContain('In total, 2 different things showed up.');
  });

  it('no da consejos ni diagnostica', () => {
    const texto = lecturaSinIa(consumoDeElementos(dias(5, MILANESA), HOY), 'es')!;
    expect(texto).not.toMatch(/deber[ií]as|dieta|sano|saludable|malo|bajá|evit/i);
  });
});

/** Anota `dias` días terminados de milanesa hasta `hasta`, con la milanesa ya en la tabla de comidas. */
async function conComidas(categoria: number, personaId: number, hasta: string, dias: number) {
  const db = obtenerDb();
  const a = await una<{ id: number }>(
    db,
    sql`INSERT INTO alimentos (clave, nombre, estado, fuente, confianza, gramos, ingredientes, componentes) VALUES ('plato prueba', 'Plato de prueba', 'resuelto', 'ia', 0.9, 211, ${JSON.stringify(MILANESA)}::jsonb, '{"sal": 500}'::jsonb)
        ON CONFLICT (clave) DO UPDATE SET estado = 'resuelto' RETURNING id`,
  );
  const ya = await una<{ id: number }>(db, sql`SELECT id FROM conceptos WHERE nombre = 'Plato de prueba'`);
  const concepto = ya?.id ?? (await una<{ id: number }>(db, sql`INSERT INTO conceptos (categoria_id, nombre, nombre_norm, tipo_valor, usos, alimento_id) VALUES (${categoria}, 'Plato de prueba', 'plato de prueba', 'evento', 5, ${a!.id}) RETURNING id`))!.id;
  for (let i = 0; i < dias; i++) {
    const f = sumarDias(hasta, -i);
    await db.execute(sql`INSERT INTO registros (persona_id, concepto_id, inicio, fecha) VALUES (${personaId}, ${concepto}, ${`${f}T15:00:00Z`}, ${f})`);
  }
}

describe('el proceso de la mañana', () => {
  const clienteIa = (f: (p: never) => unknown) => usarClientePrueba({ messages: { create: f }, beta: { messages: { create: f } } } as unknown as Anthropic);

  it('corre a las 7 de cada persona, una sola vez por día, y lee hasta ayer (sin IA, con las cuentas)', async () => {
    const { personaId, categorias } = await conAdmin();
    await conComidas(categorias.comida, personaId, '2026-10-25', 5);
    const db = obtenerDb();
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T09:30:00Z'))).toBe(0); // las 6:30 en Buenos Aires: todavía no
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T10:05:00Z'))).toBe(1); // las 7:05
    const fila = await una<{ texto: string; origen: string }>(db, sql`SELECT texto, origen FROM lectura_comidas WHERE persona_id = ${personaId} AND fecha = '2026-10-26'`);
    expect(fila?.origen).toBe('calculada');
    expect(fila?.texto).toContain('Ya van 5 días seguidos');
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T10:06:00Z'))).toBe(0); // una vez
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T11:06:00Z'))).toBe(0); // y sin IA no reintenta a la hora siguiente
    expect(await filas(db, sql`SELECT 1 FROM lectura_comidas WHERE persona_id = ${personaId}`)).toHaveLength(1);
  });

  it('con IA guarda su texto, no repite el pedido, y los datos que le llegan son los de los días terminados', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await conComidas(categorias.comida, personaId, '2026-10-25', 5);
    const pedidos: Array<{ system: string; messages: Array<{ content: string }> }> = [];
    clienteIa(async (p: never) => {
      pedidos.push(p);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ texto: '  Viene mucha carne estos días.  ' }) }] };
    });
    const db = obtenerDb();
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T10:05:00Z'))).toBe(1);
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T11:05:00Z'))).toBe(0);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].system).toMatch(/nada de diagnósticos, dietas/);
    expect(pedidos[0].messages[0].content).toContain('Carne: 5 veces, en 5 días');
    expect(pedidos[0].messages[0].content).toContain('a 2026-10-25');
    const r = await ana.get(`/api/componentes/dia?persona=${personaId}&fecha=2026-10-26`);
    expect(r.body.lectura).toEqual({ fecha: '2026-10-26', texto: 'Viene mucha carne estos días.', origen: 'ia' });
  });

  it('si la IA falla queda la de las cuentas, se reintenta en la hora siguiente y la de la IA la reemplaza; después de 3 horas no insiste', async () => {
    const { personaId, categorias } = await conAdmin();
    await conComidas(categorias.comida, personaId, '2026-10-25', 5);
    let falla = true;
    let pedidos = 0;
    clienteIa(async () => {
      pedidos++;
      if (falla) throw new Error('IA caída');
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ texto: 'Con IA.' }) }] };
    });
    const db = obtenerDb();
    await leerComidasDeHoy(db, new Date('2026-10-26T10:05:00Z'));
    expect((await una<{ origen: string }>(db, sql`SELECT origen FROM lectura_comidas WHERE persona_id = ${personaId}`))?.origen).toBe('calculada');
    await leerComidasDeHoy(db, new Date('2026-10-26T10:06:00Z'));
    expect(pedidos).toBe(1); // no reintenta cada minuto
    falla = false;
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T11:05:00Z'))).toBe(1);
    expect(await una<{ texto: string; origen: string }>(db, sql`SELECT texto, origen FROM lectura_comidas WHERE persona_id = ${personaId}`)).toEqual({ texto: 'Con IA.', origen: 'ia' });
    // Otro día, si sigue fallando: fuera de las 7, 8 y 9 ya no se pide.
    falla = true;
    pedidos = 0;
    await leerComidasDeHoy(db, new Date('2026-10-27T13:05:00Z'));
    expect(pedidos).toBe(0);
  });

  it('con menos de 3 días no guarda nada, y no corre si apagó los componentes', async () => {
    const { personaId, categorias } = await conAdmin();
    await conComidas(categorias.comida, personaId, '2026-10-25', 2);
    const db = obtenerDb();
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T10:05:00Z'))).toBe(0);
    expect(await leerComidas(db, { id: personaId, nombre: 'x' }, '2026-10-26', 'es')).toBeNull();
    expect(await filas(db, sql`SELECT 1 FROM lectura_comidas WHERE persona_id = ${personaId}`)).toHaveLength(0);
    await conComidas(categorias.comida, personaId, '2026-10-25', 5);
    await db.execute(sql`UPDATE personas SET patrones = '{"componentes": false}'::jsonb WHERE id = ${personaId}`);
    expect(await leerComidasDeHoy(db, new Date('2026-10-26T11:05:00Z'))).toBe(0);
  });
});

describe('lo que trae el widget', () => {
  it('el gráfico y, si el proceso no corrió, la lectura de las cuentas sin guardarla', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await conComidas(categorias.comida, personaId, '2026-10-25', 5);
    const r = await ana.get(`/api/componentes/dia?persona=${personaId}&fecha=2026-10-26`);
    expect(r.status).toBe(200);
    expect(r.body.consumo.dias).toHaveLength(14);
    expect(r.body.consumo.elementos[0]).toMatchObject({ total: 5, dias_desde: 1 });
    expect(r.body.lectura.origen).toBe('calculada');
    expect(r.body.lectura.fecha).toBe('2026-10-26');
    expect(await filas(obtenerDb(), sql`SELECT 1 FROM lectura_comidas WHERE persona_id = ${personaId}`)).toHaveLength(0);
  });

  it('sin días suficientes no hay lectura', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await conComidas(categorias.comida, personaId, '2026-10-25', 1);
    const r = await ana.get(`/api/componentes/dia?persona=${personaId}&fecha=2026-10-26`);
    expect(r.body.lectura).toBeNull();
    expect(r.body.consumo.elementos.map((e: { nombre: string }) => e.nombre)).toContain('Carne');
  });
});
