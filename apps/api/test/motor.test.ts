import { describe, expect, it } from 'vitest';
import { benjaminiHochberg, buscarPatrones, describir, fisherMayor, type ConceptoInfo, type FilaDiaria } from '../src/patrones/motor.js';
import { sumarDias } from '../src/lib/fechas.js';

/** Números al azar pero siempre los mismos (para que la prueba no dependa de la suerte). */
function azar(semilla: number) {
  return () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONCEPTOS: ConceptoInfo[] = [
  { id: 1, nombre: 'Tomate', tipo_valor: 'evento', rol: 'causa' },
  { id: 2, nombre: 'Pan', tipo_valor: 'evento', rol: 'causa' },
  { id: 3, nombre: 'Café', tipo_valor: 'evento', rol: 'causa' },
  { id: 10, nombre: 'Dolor de cabeza', tipo_valor: 'intensidad', rol: 'efecto' },
  { id: 11, nombre: 'Me levanté', tipo_valor: 'hora', rol: 'ambos' },
  { id: 12, nombre: 'Temperatura', tipo_valor: 'medida', rol: 'causa' },
];
const DESDE = '2026-01-01';

/** 90 días: el tomate, 2 días después, da dolor de cabeza el 80% de las veces (si no, 10%). Pan y café no hacen nada. */
function datos(semilla = 7, conEfecto = true): FilaDiaria[] {
  const r = azar(semilla);
  const filas: FilaDiaria[] = [];
  const tomate: boolean[] = [];
  const hora = (dia: string, h: number) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:00:00Z`);
  for (let i = 0; i < 90; i++) {
    const dia = sumarDias(DESDE, i);
    const ev = (id: number, h: number) => filas.push({ fecha: dia, concepto_id: id, veces: 1, suma: null, promedio: null, intensidad: null, primera: hora(dia, h) });
    tomate[i] = r() < 0.3;
    if (tomate[i]) ev(1, 13);
    if (r() < 0.5) ev(2, 9);
    if (r() < 0.6) ev(3, 8);
    const prob = conEfecto && i >= 2 && tomate[i - 2] ? 0.8 : 0.1;
    if (r() < prob) ev(10, 18);
    filas.push({ fecha: dia, concepto_id: 11, veces: 1, suma: 400, promedio: 400 + Math.round(r() * 120), intensidad: null, primera: hora(dia, 7) });
    filas.push({ fecha: dia, concepto_id: 12, veces: 24, suma: null, promedio: 15 + r() * 15, intensidad: null, primera: null });
  }
  return filas;
}

describe('estadística', () => {
  it('Fisher de una cola coincide con valores conocidos', () => {
    // tabla [[3,1],[1,3]]: P(X>=3) = 17/70
    expect(fisherMayor(3, 4, 4, 8)).toBeCloseTo(17 / 70, 10);
    expect(fisherMayor(0, 4, 4, 8)).toBeCloseTo(1, 10);
  });

  it('Benjamini-Hochberg', () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03], 3);
    expect(q[0]).toBeCloseTo(0.03);
    expect(q[1]).toBeCloseTo(0.04);
    expect(q[2]).toBeCloseTo(0.04);
  });
});

describe('buscarPatrones', () => {
  it('encuentra "tomate → dolor de cabeza a los 2 días" como el patrón más fuerte', () => {
    const r = buscarPatrones(datos(), CONCEPTOS, DESDE, sumarDias(DESDE, 89));
    expect(r.dias_activos).toBe(90);
    const [primero] = r.candidatos;
    expect(primero).toMatchObject({ causa_id: 1, efecto_id: 10, desfase_dias: 2, causa_modo: 'presente' });
    expect(primero.prob_con).toBeGreaterThan(0.6);
    expect(primero.prob_sin).toBeLessThan(0.3);
    expect(primero.q_valor).toBeLessThan(0.01);
    // un solo desfase por par
    expect(r.candidatos.filter((c) => c.causa_id === 1 && c.efecto_id === 10)).toHaveLength(1);
    expect(describir(primero, 'Tomate', 'Dolor de cabeza')).toMatch(/^Los días con «Tomate», 2 días después hubo «Dolor de cabeza» el \d+%/);
  });

  it('sin relación real no aparece nada convincente', () => {
    for (const semilla of [1, 2, 3]) {
      const r = buscarPatrones(datos(semilla, false), CONCEPTOS, DESDE, sumarDias(DESDE, 89));
      expect(r.pares_evaluados).toBeGreaterThan(0);
      expect(r.candidatos.filter((c) => c.q_valor < 0.05)).toEqual([]);
    }
  });

  it('con pocos días no analiza', () => {
    const pocos = datos().filter((f) => f.fecha < sumarDias(DESDE, 10));
    const r = buscarPatrones(pocos, CONCEPTOS, DESDE, sumarDias(DESDE, 9));
    expect(r.candidatos).toEqual([]);
    expect(r.pares_evaluados).toBe(0);
  });

  it('el mismo día solo cuenta si la causa vino antes', () => {
    const filas: FilaDiaria[] = [];
    for (let i = 0; i < 30; i++) {
      const dia = sumarDias(DESDE, i);
      filas.push({ fecha: dia, concepto_id: 3, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${dia}T08:00:00Z`) });
      if (i % 2 === 0) {
        // el dolor llega antes que el pan: el pan no puede ser la causa
        filas.push({ fecha: dia, concepto_id: 10, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${dia}T10:00:00Z`) });
        filas.push({ fecha: dia, concepto_id: 2, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${dia}T12:00:00Z`) });
      }
    }
    const r = buscarPatrones(filas, CONCEPTOS, DESDE, sumarDias(DESDE, 29));
    expect(r.candidatos.find((c) => c.causa_id === 2 && c.desfase_dias === 0)).toBeUndefined();
  });

  it('acostarse tarde (pasada la medianoche) → poca energía al día siguiente, con la energía anotada todos los días', () => {
    const r = azar(5);
    const conceptos: ConceptoInfo[] = [
      { id: 20, nombre: 'Me acosté', tipo_valor: 'hora', rol: 'ambos' },
      { id: 21, nombre: 'Energía', tipo_valor: 'intensidad', rol: 'efecto' },
    ];
    const filas: FilaDiaria[] = [];
    let tardeAyer = false;
    for (let i = 0; i < 60; i++) {
      const dia = sumarDias(DESDE, i);
      const baja = tardeAyer ? r() < 0.85 : r() < 0.15;
      filas.push({ fecha: dia, concepto_id: 21, veces: 1, suma: null, promedio: null, intensidad: baja ? 2 : 7, primera: Date.parse(`${dia}T16:00:00Z`) });
      tardeAyer = r() < 0.4;
      // tarde = entre las 0:30 y la 1:30 (minutos 30 a 90); temprano = 22:30 a 23:30 (1350 a 1410)
      const min = tardeAyer ? 30 + Math.floor(r() * 60) : 1350 + Math.floor(r() * 60);
      filas.push({ fecha: dia, concepto_id: 20, veces: 1, suma: min, promedio: min, intensidad: null, primera: Date.parse(`${dia}T23:00:00Z`) });
    }
    const res = buscarPatrones(filas, conceptos, DESDE, sumarDias(DESDE, 59));
    const [primero] = res.candidatos;
    expect(primero).toMatchObject({ causa_id: 20, efecto_id: 21, desfase_dias: 1 });
    // tarde → baja, o su espejo temprano → alta (queda uno solo de los dos)
    expect([`${primero.causa_modo}>${primero.efecto_modo}`]).toContain(primero.causa_modo === 'alto' ? 'alto>bajo' : 'bajo>alto');
    expect(res.candidatos.filter((c) => c.causa_id === 20 && c.efecto_id === 21)).toHaveLength(1);
  });
});

describe('nombres de los rasgos', () => {
  it('presente, horas y medidas', async () => {
    const { nombreRasgo } = await import('shared');
    expect(nombreRasgo('Tomate', 'evento', 'presente')).toBe('Tomate');
    expect(nombreRasgo('Me acosté', 'hora', 'alto')).toBe('Me acosté tarde');
    expect(nombreRasgo('Energía', 'intensidad', 'bajo')).toBe('Menos energía');
    expect(nombreRasgo('Tiempo de pantalla', 'medida', 'alto')).toBe('Más tiempo de pantalla');
  });
});
