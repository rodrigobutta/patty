// El widget Comida del Día: que sus números sean los de los patrones, y lo que se dice y lo que no se dice de cada día.
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resumenDelDia } from '../src/componentes/delDia.js';
import { comidaDe, rasgosDeComidas, type RegistroComida } from '../src/componentes/niveles.js';
import { enlazarConceptos } from '../src/componentes/resolver.js';
import { obtenerDb, una } from '../src/db/client.js';
import { sumarDias } from '../src/lib/fechas.js';
import { Cliente, conAdmin } from './ayudas.js';

const HOY = '2026-06-30';

const reg = (fecha: string, nombre: string, componentes: RegistroComida['componentes'], x: Partial<RegistroComida> = {}): RegistroComida => ({
  fecha,
  hora: Date.parse(`${fecha}T13:00:00Z`),
  nombre,
  categoria: 'comida',
  valor: null,
  unidad: null,
  porcion: null,
  tipos: null,
  estado: 'resuelto',
  confianza: 0.9,
  gramos: 200,
  gramos_unidad: null,
  componentes,
  ...x,
});

/** `dias` días hasta ayer con la misma comida (un poco distinta cada día, para que haya un rango). */
function historia(dias: number, hasta = sumarDias(HOY, -1)): RegistroComida[] {
  return Array.from({ length: dias }, (_, i) => reg(sumarDias(hasta, -i), 'Pollo', { sal: 800 + (i % 10) * 40, fibra: 8 + (i % 5), calorias: 900 + (i % 10) * 10, gluten: 1 }));
}

const de = (r: ReturnType<typeof resumenDelDia>, clave: string) => r.componentes.find((c) => c.clave === clave)!;

describe('los números del día', () => {
  it('suman lo mismo que los patrones, escalados por la porción', () => {
    const r = resumenDelDia(
      [
        reg(HOY, 'Milanesa', { sal: 1000, calorias: 500 }, { porcion: 'grande' }),
        reg(HOY, 'Empanadas', { sal: 200, calorias: 100 }, { valor: 3, unidad: 'empanadas', gramos: 180, gramos_unidad: 90 }),
        reg(HOY, 'Ensalada', { sal: 100 }, { porcion: 'chica' }),
      ],
      HOY,
      HOY,
    );
    expect(de(r, 'sal').valor).toBeCloseTo(1000 * 1.4 + 200 * 1.5 + 100 * 0.7);
    expect(de(r, 'calorias').valor).toBeCloseTo(500 * 1.4 + 100 * 1.5);
    expect(de(r, 'sal').unidad).toBe('mg');
    expect(de(r, 'calorias').unidad).toBe('kcal');
    expect(de(r, 'lactosa')).toMatchObject({ de: 'ia', unidad: null });
    expect(de(r, 'sal').alimentos).toEqual(['Milanesa', 'Empanadas']); // la ensalada aporta menos de un décimo
  });

  it('una comida de poca confianza pesa lo mismo que en los patrones', () => {
    const r = resumenDelDia([reg(HOY, 'Guiso raro', { sal: 1000 }, { confianza: 0.25 })], HOY, HOY);
    expect(de(r, 'sal').valor).toBeCloseTo(500);
  });

  it('lo que no se sabe no se inventa: sin datos no hay valor, y lo que no es comida no cuenta', () => {
    const r = resumenDelDia(
      [reg(HOY, 'Algo raro', {}, { estado: 'pendiente' }), reg(HOY, 'Un plato frito', {}, { estado: 'generico', tipos: ['frito'] }), reg(HOY, 'Almuerzo', {}, { estado: 'generico' }), reg(HOY, 'Vitamina', {}, { estado: 'no_comida' })],
      HOY,
      HOY,
    );
    expect(r.cobertura).toEqual({ comidas: 3, resueltas: 0, aproximadas: 1, sin_dato: 1, pendientes: 1 });
    expect(r.comidas.map((c) => c.nombre)).not.toContain('Vitamina');
    expect(de(r, 'sal').valor).toBeNull();
    expect(de(r, 'grasa').valor).toBeCloseTo(25 * 0.4);
    expect(de(r, 'grasa').nivel).toBeNull(); // con tan poco sabido no se compara
  });
});

describe('contra lo habitual de cada persona', () => {
  const salado = reg(sumarDias(HOY, -1), 'Salame', { sal: 5000, fibra: 9, calorias: 930, gluten: 1 });

  it('con poca historia hay valores, sin niveles', () => {
    const r = resumenDelDia([...historia(10), reg(HOY, 'Salame', { sal: 5000 })], HOY, HOY);
    expect(de(r, 'sal').valor).toBe(5000);
    expect(r.componentes.every((c) => c.nivel === null)).toBe(true);
    expect(r.destacado).toBeNull();
  });

  it('lo que se sale va primero, y es "mucho" el mismo día que para los patrones', () => {
    const lista = [...historia(40).slice(1), salado];
    const r = resumenDelDia(lista, salado.fecha, HOY);
    expect(r.componentes[0].clave).toBe('sal');
    expect(r.componentes[0].nivel).toBe('mucho');
    expect(r.destacado).toEqual({ clave: 'sal', nivel: 'mucho' });
    // Con los días "con mucho" que pide un rasgo: los mismos días, los mismos cortes.
    const varios = [...historia(60).slice(6), ...[1, 2, 3, 4, 5, 6].map((i) => reg(sumarDias(HOY, -i), 'Salame', { sal: 5000 + i, fibra: 9, calorias: 930, gluten: 1 }))];
    const sal = rasgosDeComidas(varios.map(comidaDe).filter((c) => c !== null)).find((x) => x.clave === 'sal' && x.nivel === 'mucho')!;
    for (const d of sal.dias) expect(de(resumenDelDia(varios, d.fecha, HOY), 'sal').nivel).toBe('mucho');
    expect(de(resumenDelDia(varios, sumarDias(HOY, -20), HOY), 'sal').nivel).not.toBe('mucho');
  });

  it('las calorías no van en la línea del Día, aunque adentro sí estén', () => {
    const r = resumenDelDia([...historia(40), reg(HOY, 'Banquete', { calorias: 9000 })], HOY, HOY);
    expect(de(r, 'calorias').nivel).toBe('mucho');
    expect(r.destacado).toBeNull();
  });

  it('hoy todavía no terminó: "mucho" se puede decir, "poco" no', () => {
    const lista = [...historia(40), reg(HOY, 'Tostada', { sal: 10, fibra: 0.5, calorias: 50 })];
    const hoy = resumenDelDia(lista, HOY, HOY);
    expect(hoy.en_curso).toBe(true);
    expect(de(hoy, 'fibra').nivel).toBeNull();
    // El mismo día, ya pasado, sí es poco.
    const ayer = resumenDelDia(lista, HOY, sumarDias(HOY, 1));
    expect(ayer.en_curso).toBe(false);
    expect(de(ayer, 'fibra').nivel).toBe('poco');
  });

  it('si lo habitual es casi nada, tener menos no dice nada', () => {
    const r = resumenDelDia([...historia(40).map((x) => ({ ...x, componentes: { ...x.componentes, alcohol: 0.5 } })), reg(sumarDias(HOY, -41), 'Agua', {})], sumarDias(HOY, -41), HOY);
    expect(de(r, 'alcohol').nivel).not.toBe('poco');
  });
});

describe('la semana', () => {
  it('compara con la anterior, sin contar hoy, y dice cuando no alcanza', () => {
    const lista = Array.from({ length: 14 }, (_, i) => {
      const f = sumarDias(HOY, -i);
      return reg(f, 'Pollo', { sal: i < 7 ? 2000 : 1000, fibra: 10, azucar: i < 7 ? 20 : 21 });
    });
    const r = resumenDelDia([...lista, reg(HOY, 'Banquete', { sal: 90000 })], HOY, HOY);
    expect(r.semana.dias).toHaveLength(7);
    expect(r.semana.dias[6]).toBe(HOY);
    const sal = r.semana.componentes.find((c) => c.clave === 'sal')!;
    expect(sal.cambio).toBe('mas');
    expect(sal.promedio).toBe(2000); // el banquete de hoy se ve pero no entra
    expect(sal.promedio_anterior).toBe(1000);
    expect(sal.valores).toHaveLength(7);
    expect(r.semana.componentes.find((c) => c.clave === 'fibra')!.cambio).toBe('igual');
    expect(r.semana.componentes.find((c) => c.clave === 'azucar')!.cambio).toBe('igual');

    const poca = resumenDelDia(lista.slice(0, 5), HOY, HOY);
    expect(poca.semana.componentes.find((c) => c.clave === 'sal')!.cambio).toBeNull();
  });
});

describe('GET /api/componentes/dia', () => {
  it('devuelve lo del día con la porción aplicada, y lo pendiente', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const d = obtenerDb();
    const id = async (nombre: string) => (await una<{ id: number }>(d, sql`INSERT INTO conceptos (categoria_id, nombre, nombre_norm, tipo_valor, usos) VALUES (${categorias.comida}, ${nombre}, ${nombre.toLowerCase()}, 'evento', 5) RETURNING id`))!.id;
    const milanesa = await id('Milanesa');
    const rara = await id('Cosa rarísima que nadie conoce');
    await enlazarConceptos(d);
    const fecha = '2026-06-10';
    await d.execute(sql`INSERT INTO registros (persona_id, concepto_id, inicio, fecha, datos) VALUES (${personaId}, ${milanesa}, ${`${fecha}T15:00:00Z`}, ${fecha}, ${JSON.stringify({ porcion: 'grande' })}::jsonb)`);
    await d.execute(sql`INSERT INTO registros (persona_id, concepto_id, inicio, fecha) VALUES (${personaId}, ${rara}, ${`${fecha}T21:00:00Z`}, ${fecha})`);
    const a = await una<{ componentes: Record<string, number>; estado: string }>(d, sql`SELECT a.componentes, a.estado FROM alimentos a JOIN conceptos c ON c.alimento_id = a.id WHERE c.id = ${milanesa}`);
    expect(a?.estado).toBe('resuelto');

    const r = await ana.get(`/api/componentes/dia?persona=${personaId}&fecha=${fecha}`);
    expect(r.status).toBe(200);
    expect(r.body.fecha).toBe(fecha);
    expect(r.body.en_curso).toBe(false);
    expect(r.body.cobertura).toMatchObject({ comidas: 2, resueltas: 1, pendientes: 1 });
    expect(r.body.componentes).toHaveLength(16);
    const sal = r.body.componentes.find((c: { clave: string }) => c.clave === 'sal');
    expect(sal.valor).toBeCloseTo(a!.componentes.sal * 1.4, 1);
    expect(sal.alimentos).toEqual(['Milanesa']);
    expect(sal.nivel).toBeNull();
    expect(r.body.semana.dias).toHaveLength(7);
    expect(r.body.patrones).toEqual([]);
  });

  it('solo quien puede ver a la persona', async () => {
    const { ana, personaId } = await conAdmin();
    await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', clave: 'secreta2', rol: 'lector' });
    const beto = new Cliente();
    await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta2' });
    expect((await beto.get(`/api/componentes/dia?persona=${personaId}`)).status).toBe(404);
    expect((await new Cliente().get(`/api/componentes/dia?persona=${personaId}`)).status).toBe(401);
    expect((await ana.get(`/api/componentes/dia?persona=${personaId}`)).status).toBe(200);
  });
});
