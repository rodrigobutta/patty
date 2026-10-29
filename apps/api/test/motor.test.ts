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
    expect(describir(primero, 'Tomate', 'Dolor de cabeza')).toMatch(/^Los días con «Tomate», a los dos días hubo «Dolor de cabeza» el \d+%/);
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
  it('estar en un lugar → dolor al día siguiente; los días con solo ubicación no cuentan como anotados', () => {
    const r = azar(3);
    const conceptos: ConceptoInfo[] = [
      { id: 20, nombre: 'Supermercado', tipo_valor: 'duracion', rol: 'causa' },
      { id: 3, nombre: 'Café', tipo_valor: 'evento', rol: 'causa' },
      { id: 10, nombre: 'Dolor de cabeza', tipo_valor: 'intensidad', rol: 'efecto' },
    ];
    const filas: FilaDiaria[] = [];
    const sup: boolean[] = [];
    for (let i = 0; i < 60; i++) {
      const dia = sumarDias(DESDE, i);
      const t = (h: number) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:00:00Z`);
      sup[i] = r() < 0.35;
      if (sup[i]) filas.push({ fecha: dia, concepto_id: 20, veces: 1, suma: 40, promedio: 40, intensidad: null, primera: t(11), automatica: true });
      if (i >= 40) continue; // los últimos 20 días solo hay ubicación: no se anotó nada a mano
      filas.push({ fecha: dia, concepto_id: 3, veces: 1, suma: null, promedio: null, intensidad: null, primera: t(8) });
      if (r() < (i >= 1 && sup[i - 1] ? 0.85 : 0.1)) filas.push({ fecha: dia, concepto_id: 10, veces: 1, suma: null, promedio: null, intensidad: 4, primera: t(15) });
    }
    const res = buscarPatrones(filas, conceptos, DESDE, sumarDias(DESDE, 59));
    expect(res.dias_activos).toBe(40);
    expect(res.candidatos[0]).toMatchObject({ causa_id: 20, causa_modo: 'presente', efecto_id: 10, desfase_dias: 1 });
    expect(res.candidatos[0].q_valor).toBeLessThan(0.05);
  });
});

describe('patrones combinados', () => {
  it('frito + período + calor → dolor de panza al día siguiente, cuando cada cosa sola casi no alcanza', () => {
    const r = azar(11);
    const filas: FilaDiaria[] = [];
    const conceptos: ConceptoInfo[] = [
      { id: 1, nombre: 'Comida frita', tipo_valor: 'evento', rol: 'causa' },
      { id: 2, nombre: 'Fase menstrual', tipo_valor: 'evento', rol: 'causa' },
      { id: 3, nombre: 'Temperatura máxima', tipo_valor: 'medida', rol: 'causa' },
      { id: 4, nombre: 'Café', tipo_valor: 'evento', rol: 'causa' },
      { id: 10, nombre: 'Dolor de panza', tipo_valor: 'intensidad', rol: 'efecto' },
    ];
    const dias = 120;
    const juntos: boolean[] = [];
    for (let i = 0; i < dias; i++) {
      const dia = sumarDias(DESDE, i);
      const h = (x: number) => Date.parse(`${dia}T${String(x).padStart(2, '0')}:00:00Z`);
      const ev = (id: number, x: number) => filas.push({ fecha: dia, concepto_id: id, veces: 1, suma: null, promedio: null, intensidad: null, primera: h(x) });
      const periodo = i % 28 < 7;
      const calor = r() < 0.5;
      const frito = r() < (periodo ? 0.6 : 0.3);
      if (frito) ev(1, 13);
      if (periodo) ev(2, 8);
      if (r() < 0.6) ev(4, 8);
      filas.push({ fecha: dia, concepto_id: 3, veces: 1, suma: null, promedio: calor ? 30 : 20 + Math.round(r() * 3), intensidad: null, primera: null });
      juntos[i] = frito && periodo && calor;
      const ayer = i > 0 && juntos[i - 1];
      if (r() < (ayer ? 0.95 : 0.06)) ev(10, 11);
    }
    const res = buscarPatrones(filas, conceptos, DESDE, sumarDias(DESDE, dias - 1));
    const combinados = res.candidatos.filter((x) => x.causas_extra.length > 0 && x.efecto_id === 10);
    expect(combinados.length).toBeGreaterThan(0);
    const mejor = combinados[0];
    const ids = [mejor.causa_id, ...mejor.causas_extra.map((c) => c.id)].sort();
    expect(ids).toEqual([1, 2, 3]);
    expect(mejor.desfase_dias).toBe(1);
    expect(mejor.prob_con).toBeGreaterThan(0.8);
    // El café no entra en ninguna combinación.
    expect(res.candidatos.some((x) => [x.causa_id, ...x.causas_extra.map((c) => c.id)].includes(4))).toBe(false);
  });
});

describe('patrones de fechas y de semanas', () => {
  it('las fechas: día de la semana, feriados (con Semana Santa), Navidad, fiestas y principio y fin de mes', async () => {
    const { pascua, rasgosDeFecha } = await import('shared');
    expect(pascua(2026)).toBe('2026-04-05');
    expect(rasgosDeFecha('2026-12-25')).toEqual(expect.arrayContaining(['Viernes', 'Feriado', 'Navidad', 'Fiestas de fin de año']));
    expect(rasgosDeFecha('2026-12-30')).toEqual(expect.arrayContaining(['Fiestas de fin de año', 'Fin de mes']));
    expect(rasgosDeFecha('2026-04-03')).toEqual(expect.arrayContaining(['Viernes', 'Feriado', 'Principio de mes']));
    expect(rasgosDeFecha('2026-10-25')).toEqual(['Domingo', 'Fin de semana']);
  });

  it('los domingos, peor ánimo; y una semana durmiendo poco, dolor de cabeza (aunque la noche anterior no haya sido corta)', () => {
    const r = azar(5);
    const conceptos: ConceptoInfo[] = [
      { id: 1, nombre: 'Domingo', tipo_valor: 'evento', rol: 'causa' },
      { id: 2, nombre: 'Horas de sueño', tipo_valor: 'medida', rol: 'ambos' },
      { id: 3, nombre: 'Café', tipo_valor: 'evento', rol: 'causa' },
      { id: 10, nombre: 'Bajón', tipo_valor: 'evento', rol: 'efecto' },
      { id: 11, nombre: 'Dolor de cabeza', tipo_valor: 'evento', rol: 'efecto' },
    ];
    const filas: FilaDiaria[] = [];
    const dias = 140;
    const sueno: number[] = [];
    for (let i = 0; i < dias; i++) {
      const dia = sumarDias(DESDE, i);
      const domingo = new Date(`${dia}T12:00:00Z`).getUTCDay() === 0;
      const ev = (id: number) => filas.push({ fecha: dia, concepto_id: id, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${dia}T20:00:00Z`) });
      if (domingo) filas.push({ fecha: dia, concepto_id: 1, veces: 1, suma: null, promedio: null, intensidad: null, primera: null, automatica: true });
      if (r() < 0.6) ev(3);
      if (r() < (domingo ? 0.85 : 0.08)) ev(10);
      // Rachas de semanas durmiendo poco (de a 2 semanas), con noches sueltas que no cambian nada.
      const racha = Math.floor(i / 14) % 3 === 1;
      sueno[i] = (racha ? 5.5 : 7.5) + (r() - 0.5) * 6; // noche a noche varía mucho: lo que cuenta es la semana
      filas.push({ fecha: dia, concepto_id: 2, veces: 1, suma: sueno[i], promedio: sueno[i], intensidad: null, primera: null, automatica: true });
      const ultimos = sueno.slice(Math.max(0, i - 6), i + 1);
      const semanaCorta = ultimos.reduce((a, b) => a + b, 0) / ultimos.length < 6.5;
      if (r() < (semanaCorta ? 0.5 : 0.04)) ev(11);
    }
    const res = buscarPatrones(filas, conceptos, DESDE, sumarDias(DESDE, dias - 1));
    expect(res.candidatos.some((x) => x.causa_id === 1 && x.efecto_id === 10 && x.desfase_dias === 0)).toBe(true);
    const semana = res.candidatos.find((x) => x.causa_id === 2 && x.efecto_id === 11 && x.causa_modo === 'bajo_semana');
    expect(semana).toBeTruthy();
    // La semana no aparece como efecto.
    expect(res.candidatos.some((x) => x.efecto_modo === 'alto_semana' || x.efecto_modo === 'bajo_semana')).toBe(false);
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

describe('patrones más finos', () => {
  const FINOS: ConceptoInfo[] = [
    { id: 1, nombre: 'Café', tipo_valor: 'cantidad', rol: 'causa', categoria: 'bebida' },
    { id: 2, nombre: 'Caminar', tipo_valor: 'evento', rol: 'causa', categoria: 'actividad' },
    { id: 3, nombre: 'Pan', tipo_valor: 'evento', rol: 'causa', categoria: 'comida' },
    { id: 4, nombre: 'Temperatura', tipo_valor: 'medida', rol: 'causa', categoria: 'clima' },
    { id: 10, nombre: 'Dolor de cabeza', tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' },
    { id: 11, nombre: 'Dolor de panza', tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' },
  ];
  const DIAS = 150;
  const HASTA = sumarDias(DESDE, DIAS - 1);
  /**
   * 150 días. Con `efectos`: a partir de 3 cafés, al día siguiente dolor de cabeza (con 1 o 2, como sin café); caminar
   * hace que al día siguiente casi no duela la panza (si no, la mitad de los días). Pan y temperatura no hacen nada.
   */
  function finos(semilla = 11, efectos = true): FilaDiaria[] {
    const r = azar(semilla);
    const filas: FilaDiaria[] = [];
    const cafes: number[] = [];
    const camino: boolean[] = [];
    const hora = (dia: string, h: number) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:00:00Z`);
    for (let i = 0; i < DIAS; i++) {
      const dia = sumarDias(DESDE, i);
      const ev = (id: number, h: number) => filas.push({ fecha: dia, concepto_id: id, veces: 1, suma: null, promedio: null, intensidad: null, primera: hora(dia, h) });
      cafes[i] = r() < 0.25 ? 0 : 1 + Math.floor(r() * 4); // 0 a 4
      if (cafes[i]) filas.push({ fecha: dia, concepto_id: 1, veces: 1, suma: cafes[i], promedio: cafes[i], intensidad: null, primera: hora(dia, 8) });
      camino[i] = r() < 0.4;
      if (camino[i]) ev(2, 10);
      if (r() < 0.5) ev(3, 9);
      filas.push({ fecha: dia, concepto_id: 4, veces: 24, suma: null, promedio: 15 + r() * 15, intensidad: null, primera: null });
      const cabeza = efectos && i >= 1 && cafes[i - 1] >= 3 ? 0.75 : 0.1;
      if (r() < cabeza) ev(10, 18);
      const panza = efectos && i >= 1 && camino[i - 1] ? 0.05 : 0.5;
      if (r() < panza) ev(11, 20);
    }
    return filas;
  }

  it('umbral: "a partir de 3 cafés → dolor de cabeza al día siguiente", en vez de "café → dolor de cabeza"', () => {
    const r = buscarPatrones(finos(), FINOS, DESDE, HASTA);
    const umbral = r.candidatos.find((c) => c.causa_id === 1 && c.efecto_id === 10);
    expect(umbral).toMatchObject({ causa_modo: 'desde', umbral: 3, desfase_dias: 1 });
    expect(umbral!.q_valor).toBeLessThan(0.01);
    // El simple sobra: el umbral ya dice más.
    expect(r.candidatos.filter((c) => c.causa_id === 1 && c.efecto_id === 10 && c.causa_modo === 'presente')).toEqual([]);
  });

  it('umbral de una medida: con 27 °C o más, dolor de cabeza ese mismo día (y no con un día apenas más cálido que lo habitual)', () => {
    const r = azar(5);
    const filas: FilaDiaria[] = [];
    for (let i = 0; i < DIAS; i++) {
      const dia = sumarDias(DESDE, i);
      const temp = 10 + r() * 20;
      filas.push({ fecha: dia, concepto_id: 4, veces: 24, suma: null, promedio: temp, intensidad: null, primera: null });
      filas.push({ fecha: dia, concepto_id: 3, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${dia}T09:00:00Z`) });
      if (r() < (temp >= 27 ? 0.8 : 0.1)) filas.push({ fecha: dia, concepto_id: 10, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${dia}T18:00:00Z`) });
    }
    const x = buscarPatrones(filas, FINOS, DESDE, HASTA).candidatos.find((c) => c.causa_id === 4 && c.efecto_id === 10);
    expect(x).toMatchObject({ causa_modo: 'desde', desfase_dias: 0 });
    expect(x!.umbral).toBeGreaterThanOrEqual(25);
    expect(x!.umbral).toBeLessThanOrEqual(28);
  });

  it('lo que protege: caminar → al día siguiente, menos dolor de panza', () => {
    const r = buscarPatrones(finos(), FINOS, DESDE, HASTA);
    const p = r.candidatos.find((c) => c.protege);
    expect(p).toMatchObject({ causa_id: 2, causa_modo: 'presente', efecto_id: 11, desfase_dias: 1, protege: true });
    expect(p!.lift).toBeLessThan(0.5);
    expect(p!.prob_con).toBeLessThan(p!.prob_sin);
    expect(p!.q_valor).toBeLessThan(0.01);
    expect(describir(p!, 'Caminar', 'Dolor de panza')).toMatch(/^Los días con «Caminar», al día siguiente hubo «Dolor de panza» solo el \d+%.*Parece que te protege\.$/);
    // Nada más protege de verdad (lo que sale por azar queda con q alto, entre los "posibles").
    expect(r.candidatos.filter((c) => c.protege && c.efecto_id !== 11 && c.q_valor < 0.1)).toEqual([]);
  });

  it('apagados, no aparecen', () => {
    const r = buscarPatrones(finos(), FINOS, DESDE, HASTA, { umbrales: false, proteccion: false });
    expect(r.candidatos.filter((c) => c.umbral != null || c.causa_modo === 'desde' || c.causa_modo === 'hasta')).toEqual([]);
    expect(r.candidatos.filter((c) => c.protege)).toEqual([]);
    // Sin el umbral, vuelve el simple.
    expect(r.candidatos.find((c) => c.causa_id === 1 && c.efecto_id === 10)).toMatchObject({ causa_modo: 'presente' });
  });

  it('sin los desfases largos, solo el mismo día y el siguiente (y el tomate a los dos días no aparece)', () => {
    const conLargos = buscarPatrones(datos(), CONCEPTOS, DESDE, sumarDias(DESDE, 89));
    expect(conLargos.candidatos.some((c) => c.desfase_dias >= 2)).toBe(true);
    const r = buscarPatrones(datos(), CONCEPTOS, DESDE, sumarDias(DESDE, 89), { desfasesLargos: false });
    expect(r.candidatos.every((c) => c.desfase_dias <= 1)).toBe(true);
    expect(r.pares_evaluados).toBeLessThan(conLargos.pares_evaluados);
    expect(r.candidatos.filter((c) => c.causa_id === 1 && c.efecto_id === 10 && c.q_valor < 0.05)).toEqual([]);
  });

  it('a los dos y a los tres días se dice así', () => {
    const base = { causa_id: 1, causa_modo: 'presente' as const, causas_extra: [], efecto_id: 10, efecto_modo: 'presente' as const, soporte: 4, dias_causa: 5, dias_evaluados: 50, prob_con: 0.8, prob_sin: 0.1, lift: 8, p_valor: 0.001, q_valor: 0.01, puntaje: 1 };
    expect(describir({ ...base, desfase_dias: 2 }, 'Tomate', 'Dolor')).toContain('a los dos días');
    expect(describir({ ...base, desfase_dias: 3 }, 'Tomate', 'Dolor')).toContain('a los tres días');
    expect(describir({ ...base, desfase_dias: 3 }, 'Tomato', 'Pain', 'en')).toContain('three days later');
  });

  it('sin relación real, ni umbrales ni protecciones convincentes', () => {
    for (const semilla of [1, 2, 3, 4]) {
      const r = buscarPatrones(finos(semilla, false), FINOS, DESDE, HASTA);
      expect(r.candidatos.filter((c) => (c.protege || c.umbral != null) && c.q_valor < 0.05)).toEqual([]);
    }
  });
});

describe('nombres de los umbrales', () => {
  it('"Café: 3 o más", con unidades y duraciones', async () => {
    const { nombreRasgo } = await import('shared');
    expect(nombreRasgo('Café', 'cantidad', 'desde', 'es', { valor: 3 })).toBe('Café: 3 o más');
    expect(nombreRasgo('Caminata', 'duracion', 'desde', 'es', { valor: 90, unidad: 'min' })).toBe('Caminata: 1 h 30 min o más');
    expect(nombreRasgo('Temperatura', 'medida', 'hasta', 'es', { valor: 12.34, unidad: '°C' })).toBe('Temperatura: 12,3 °C o menos');
    expect(nombreRasgo('Pasos', 'medida', 'desde', 'es', { valor: 8000, unidad: 'pasos' })).toBe('Pasos: 8.000 pasos o más');
    expect(nombreRasgo('Café', 'cantidad', 'desde', 'en', { valor: 3 })).toMatch(/: 3 or more$/);
  });
});
