// Las combinaciones ("frito + período + calor → dolor de panza"): mientras los datos de una persona no alcancen, no se muestran.
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { sumarDias } from '../src/lib/fechas.js';
import { buscarPatrones, combinadasMax, DIAS_POR_COMBINADA, pCombinadas, type Candidato } from '../src/patrones/motor.js';
import { conAdmin } from './ayudas.js';
import { conCombinada, historia } from './sinteticos.js';

afterAll(() => cerrarDb());

const combinadas = (x: { filas: Parameters<typeof buscarPatrones>[0]; conceptos: Parameters<typeof buscarPatrones>[1]; desde: string; hasta: string }) =>
  buscarPatrones(x.filas, x.conceptos, x.desde, x.hasta).candidatos.filter((c) => c.causas_extra.length);
/** Si es la combinación plantada, con sus tres causas. */
const laPlantada = (c: Candidato, base = 1000) =>
  c.efecto_id === base + 10 && c.desfase_dias === 1 && [c.causa_id, ...c.causas_extra.map((e) => e.id)].sort().join() === [base + 1, base + 2, base + 3].join();

/** Los mismos datos, pero solo los primeros `dias` días. */
const primeros = <T extends ReturnType<typeof conCombinada>>(x: T, dias: number) => {
  const hasta = sumarDias(x.desde, dias - 1);
  return { ...x, filas: x.filas.filter((f) => f.fecha <= hasta), hasta };
};

describe('la vara de cada persona', () => {
  it('cuantos más días anotó, más combinaciones se le pueden mostrar', () => {
    expect(combinadasMax(DIAS_POR_COMBINADA - 1)).toBe(0);
    expect(combinadasMax(DIAS_POR_COMBINADA)).toBe(1);
    expect(combinadasMax(200)).toBe(2);
    expect(combinadasMax(5000)).toBe(8);
  });

  it('cuantas más cosas anota, más firme tiene que ser', () => {
    expect(pCombinadas(250, 40, 4)).toBeLessThan(pCombinadas(100, 14, 4) / 10);
    expect(pCombinadas(20, 3, 2)).toBeGreaterThan(pCombinadas(100, 14, 4) * 100);
    expect(pCombinadas(0, 0, 4)).toBe(0.05);
  });
});

describe('en datos al azar', () => {
  it('casi nunca sale una combinación, con cualquier historia y cantidad de cosas', () => {
    const casos = [[100, 60], [100, 180], [100, 365], [100, 1825], [300, 60], [300, 365], [300, 1825]];
    for (const [conceptos, dias] of casos) {
      let total = 0;
      const personas = 6;
      for (let s = 1; s <= personas; s++) {
        const h = historia(dias, conceptos, s * 7919);
        total += combinadas(h).length;
      }
      expect(total / personas, `${conceptos} conceptos, ${dias} días`).toBeLessThanOrEqual(0.2);
    }
  }, 120000);
});

describe('una combinación de verdad', () => {
  it('aparece cuando hay datos: con un año casi siempre, y con dos, siempre', () => {
    const veces = (dias: number) => {
      let n = 0;
      for (let s = 1; s <= 10; s++) if (combinadas(conCombinada(dias, 100, s * 104729)).some((c) => laPlantada(c))) n++;
      return n;
    };
    expect(veces(365)).toBeGreaterThanOrEqual(7);
    expect(veces(730)).toBe(10);
  }, 60000);

  it('con pocos días espera, aunque sea de verdad; con los mismos datos y más días aparece', () => {
    let aparece = 0;
    for (let s = 1; s <= 5; s++) {
      const entera = conCombinada(365, 30, s * 104729);
      expect(combinadas(primeros(entera, 70))).toEqual([]);
      expect(combinadas(primeros(entera, DIAS_POR_COMBINADA - 1))).toEqual([]);
      if (combinadas(entera).some((c) => laPlantada(c))) aparece++;
    }
    expect(aparece).toBeGreaterThanOrEqual(4);
  });

  it('el mismo patrón con muchas más cosas anotadas tarda más en aparecer', () => {
    const veces = (conceptos: number) => {
      let n = 0;
      for (let s = 1; s <= 10; s++) if (combinadas(conCombinada(130, conceptos, s * 104729)).some((c) => laPlantada(c))) n++;
      return n;
    };
    expect(veces(10)).toBeGreaterThan(veces(300));
  }, 60000);

  it('con pocos días entra una sola, aunque haya más', () => {
    const dos = (dias: number) => {
      const a = conCombinada(dias, 5, 1234577);
      const b = conCombinada(dias, 0, 7654321, { base: 2000 });
      return { ...a, filas: [...a.filas, ...b.filas], conceptos: [...a.conceptos, ...b.conceptos] };
    };
    expect(combinadas(dos(170))).toHaveLength(1);
    // Las dos tienen el período el mismo día, así que cualquiera de los dos conceptos sirve: se mira el efecto.
    expect(combinadas(dos(600)).map((c) => c.efecto_id).sort()).toEqual([1010, 2010]);
  });

  it('lo que pasó en una sola temporada no es un patrón', () => {
    for (let s = 1; s <= 8; s++) {
      const h = conCombinada(365, 30, s * 104729, { racha: [100 + s * 10, 130 + s * 10] });
      expect(combinadas(h).filter((c) => c.efecto_id === 1010)).toEqual([]);
    }
  });
});

describe('lo que la persona ya opinó', () => {
  it('una combinación confirmada queda aunque el motor ya no la muestre; una nueva se va', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const db = obtenerDb();
    const concepto = async (nombre: string, cat: number) => (await ana.post('/api/conceptos', { nombre, categoria_id: cat })).body.concepto.id as number;
    const frita = await concepto('Comida frita', categorias.comida);
    const helado = await concepto('Helado', categorias.comida);
    const panza = await concepto('Dolor de panza', categorias.sintoma);
    const cabeza = await concepto('Dolor de cabeza', categorias.sintoma);
    const hasta = '2026-06-30';
    for (let i = 0; i < 20; i++) {
      await ana.post('/api/registros', { persona_id: personaId, concepto_id: i % 2 ? frita : helado, inicio: `${sumarDias(hasta, -i)}T15:00:00Z` });
    }
    const combinada = async (efecto: number, estado: string) =>
      (await db.execute(sql`INSERT INTO hallazgos (persona_id, causa_id, efecto_id, causas_extra, combo, desfase_dias, soporte, dias_causa, dias_evaluados,
                                                   prob_con, prob_sin, lift, p_valor, q_valor, puntaje, estado)
                            VALUES (${personaId}, ${frita}, ${efecto}, ${JSON.stringify([{ id: helado, modo: 'presente' }])}::jsonb,
                                    ${[frita, helado].map((id) => `${id}:presente`).sort().join('+')},
                                    1, 5, 6, 40, 0.8, 0.1, 6, 0.0001, 0.01, 5, ${estado}) RETURNING id`))[0].id as number;
    const confirmada = await combinada(panza, 'confirmado');
    const nueva = await combinada(cabeza, 'nuevo');

    const r = await ana.post('/api/analisis', { persona_id: personaId, desde: sumarDias(hasta, -19), hasta, ia: false });
    expect(r.status).toBe(200);
    expect(r.body.hallazgos.filter((h: { causas_extra: unknown[] }) => h.causas_extra.length)).toEqual([]);

    const lista = (await ana.get(`/api/hallazgos?persona=${personaId}`)).body as Array<{ id: number; estado: string }>;
    expect(lista.find((h) => h.id === confirmada)).toMatchObject({ estado: 'confirmado' });
    expect(lista.find((h) => h.id === nueva)).toBeUndefined();
  });
});
