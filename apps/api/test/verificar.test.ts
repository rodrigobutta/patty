import { describe, expect, it } from 'vitest';
import { sumarDias } from '../src/lib/fechas.js';
import { armarPerfil } from '../src/patrones/perfil.js';
import { evaluarHipotesis, explicarVeredicto, validarHipotesis, type Hipotesis, type HipotesisCruda } from '../src/patrones/verificar.js';
import { conCambio, DESDE, historia } from './sinteticos.js';
import { armarRasgos, buscarPatrones, type ConceptoInfo } from '../src/patrones/motor.js';

const cambio = (o: Partial<Hipotesis> = {}): Hipotesis => ({ tipo: 'cambio', causa_id: 1, causa_modo: 'presente', efecto_id: 2, efecto_modo: 'presente', sentido: 'baja', causa_despues: 'sube', desfase_dias: 0, fecha_desde: null, fecha_hasta: null, razon: 'Desde el mate parece que te duele menos.', ...o });
const relacion = (o: Partial<Hipotesis> = {}): Hipotesis => ({ ...cambio(), tipo: 'relacion', sentido: 'sube', ...o });
const cruda = (o: Partial<HipotesisCruda> = {}): HipotesisCruda => ({ tipo: 'relacion', causa: 'Mate', causa_modo: 'presente', efecto: 'Dolor de cabeza', efecto_modo: 'presente', sentido: 'sube', causa_despues: 'sube', desfase_dias: 1, fecha_desde: '', fecha_hasta: '', razon: 'Porque sí.', ...o });

describe('verificar un antes y después', () => {
  it('un cambio de verdad pasa, con sus números', () => {
    const d = conCambio(700, 350);
    const [v] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [cambio({ fecha_desde: d.fecha })]);
    expect(v.motivo).toBeNull();
    expect(v.pasa).toBe(true);
    expect(v.q_valor).toBeLessThanOrEqual(0.05);
    expect(v.prob_sin).toBeGreaterThan(0.35);
    expect(v.prob_con).toBeLessThan(0.2);
    expect(v.causa_antes).toBe(0);
    expect(v.causa_luego).toBeGreaterThan(0.6);
    const texto = explicarVeredicto(v, { causa: 'Mate', efecto: 'Dolor de cabeza', causaTipo: 'evento', efectoTipo: 'intensidad' });
    expect(texto).toContain('Desde el mate parece que te duele menos.');
    expect(texto).toMatch(/Desde el \d+ de \w+ de \d{4}, «Mate» aparece más seguido/);
    expect(texto).toContain('no prueba');
  });

  it('el lado equivocado no pasa', () => {
    const d = conCambio(700, 350);
    const [v] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [cambio({ fecha_desde: d.fecha, sentido: 'sube' })]);
    expect(v.pasa).toBe(false);
  });

  it('si la causa no cambió en esa fecha, no alcanza con que el efecto cambie', () => {
    const d = conCambio(700, 350);
    // El café va igual antes y después.
    const [v] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [cambio({ causa_id: 3, fecha_desde: d.fecha })]);
    expect(v.pasa).toBe(false);
    expect(v.motivo).toBe('la_causa_no_cambio');
  });

  it('con datos al azar no pasa nada, ni eligiendo la fecha que mejor parece', () => {
    let pasaron = 0;
    let pruebas = 0;
    for (let semilla = 1; semilla <= 15; semilla++) {
      const d = historia(900, 16, semilla * 977);
      const con = d.conceptos.filter((c) => c.tipo_valor === 'evento' || c.tipo_valor === 'cantidad');
      const efectos = d.conceptos.filter((c) => c.rol === 'efecto');
      // Como lo haría la IA: toma fechas de los cambios bruscos del perfil, y si no hay, cualquiera.
      const fechas = [...armarPerfil(d.filas, d.conceptos, d.desde, d.hasta).texto.matchAll(/^(\d{4}-\d{2}-\d{2}) /gm)].map((m) => m[1]);
      const lista: Hipotesis[] = [];
      for (let i = 0; i < 10; i++) {
        lista.push(cambio({
          causa_id: con[i % con.length].id,
          efecto_id: efectos[i % efectos.length].id,
          sentido: i % 2 ? 'sube' : 'baja',
          causa_despues: i % 3 ? 'sube' : 'baja',
          fecha_desde: fechas[i % Math.max(fechas.length, 1)] ?? sumarDias(DESDE, 200 + i * 30),
        }));
      }
      for (const v of evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, lista)) {
        pruebas++;
        if (v.pasa) pasaron++;
      }
    }
    expect(pruebas).toBe(150);
    expect(pasaron).toBe(0);
  });
});

describe('verificar una relación', () => {
  const plantada = (dias = 500, semilla = 3) => {
    const d = conCambio(dias, dias + 1, semilla, 0.05, 0.05);
    // Dolor a los 7 días de la pizza: el motor solo no lo busca (mira hasta 3 días).
    const dias_pizza = new Set(d.filas.filter((f) => f.concepto_id === 4).map((f) => f.fecha));
    d.filas = d.filas.filter((f) => f.concepto_id !== 2);
    let i = 0;
    for (let n = 0; n < dias; n++) {
      const f = sumarDias(DESDE, n);
      i = (i * 31 + 7) % 101;
      if (dias_pizza.has(sumarDias(f, -7)) ? i < 70 : i < 5) d.filas.push({ fecha: f, concepto_id: 2, veces: 1, suma: null, promedio: null, intensidad: 3, primera: Date.parse(`${f}T12:00:00Z`) });
    }
    return d;
  };

  it('un efecto a los 7 días que el motor no busca: pasa la hipótesis', () => {
    const d = plantada();
    expect(buscarPatrones(d.filas, d.conceptos, d.desde, d.hasta).candidatos.some((c) => c.causa_id === 4 && c.efecto_id === 2 && c.q_valor <= 0.05)).toBe(false);
    const [v, otro] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [relacion({ causa_id: 4, desfase_dias: 7 }), relacion({ causa_id: 3, desfase_dias: 7 })]);
    expect(v.pasa).toBe(true);
    expect(v.prob_con).toBeGreaterThan(0.5);
    expect(otro.pasa).toBe(false);
  });

  it('se cuenta igual que en la búsqueda de siempre', () => {
    const d = plantada();
    const motor = buscarPatrones(d.filas, d.conceptos, d.desde, d.hasta, { desfaseMax: 3, proteccion: false, umbrales: false, pMax: 1, liftMin: 0, soporteMin: 1 }).candidatos.find((c) => c.causa_id === 3 && c.efecto_id === 2 && c.causa_modo === 'presente')!;
    const [v] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [relacion({ causa_id: 3, desfase_dias: motor.desfase_dias })]);
    expect(v.soporte).toBe(motor.soporte);
    expect(v.dias_causa).toBe(motor.dias_causa);
    expect(v.lift).toBeCloseTo(motor.lift, 10);
  });

  it('un período paga haber sido elegido mirando: con la misma tabla, un p bastante más alto', () => {
    const d = plantada();
    const [entera] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [relacion({ causa_id: 4, desfase_dias: 7 })]);
    const [periodo] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [relacion({ causa_id: 4, desfase_dias: 7, fecha_desde: d.desde, fecha_hasta: sumarDias(d.hasta, -1) })]);
    expect(periodo.p_valor).toBeGreaterThan(entera.p_valor * 50);
    expect(periodo.pasa).toBe(true);
  });

  it('lo que no pasa de ser azar se rechaza', () => {
    let pasaron = 0;
    for (let s = 1; s <= 20; s++) {
      const d = historia(900, 12, s * 131);
      const causas = d.conceptos.filter((c) => c.rol === 'causa');
      const efecto = d.conceptos.find((c) => c.rol === 'efecto')!;
      const lista = causas.slice(0, 10).map((c, i) => relacion({ causa_id: c.id, efecto_id: efecto.id, desfase_dias: i }));
      pasaron += evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, lista).filter((v) => v.pasa).length;
    }
    expect(pasaron).toBeLessThanOrEqual(1);
  });

  it('una sola hipótesis no se libra de la corrección: cuenta como si fueran 10', () => {
    const d = conCambio(700, 350);
    const [v] = evaluarHipotesis(d.filas, d.conceptos, d.desde, d.hasta, [cambio({ fecha_desde: d.fecha })]);
    expect(v.q_valor).toBeCloseTo(v.p_valor * 10, 12);
  });
});

describe('validar lo que devuelve la IA', () => {
  const conceptos: ConceptoInfo[] = [
    { id: 1, nombre: 'Mate', tipo_valor: 'evento', rol: 'causa', categoria: 'bebida' },
    { id: 2, nombre: 'Dolor de cabeza', tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' },
    { id: 3, nombre: 'Lluvia', tipo_valor: 'evento', rol: 'causa', categoria: 'clima' },
  ];
  const base = {
    nombres: new Map([['mate', 1], ['dolor de cabeza', 2], ['lluvia', 3]]),
    conceptos,
    rasgos: new Set(['1|presente', '2|presente', '3|presente']),
    desde: '2021-01-01',
    hasta: '2023-12-31',
    desfasesLargos: true,
    proteccion: true,
  };
  const motivo = (c: Partial<HipotesisCruda>, o = {}) => validarHipotesis([cruda(c)], { ...base, ...o }).descartadas[0]?.motivo;

  it('acepta lo válido, sin distinguir tildes ni mayúsculas', () => {
    const { validas } = validarHipotesis([cruda({ causa: 'MATE', efecto: 'dolor  de cabeza' })], base);
    expect(validas).toMatchObject([{ causa_id: 1, efecto_id: 2, desfase_dias: 1, fecha_desde: null }]);
  });

  it('descarta conceptos que no existen, modos inventados y otras cosas que no se pueden medir', () => {
    expect(motivo({ causa: 'Unicornio' })).toBe('concepto_desconocido');
    expect(motivo({ efecto: 'Tristeza cósmica' })).toBe('concepto_desconocido');
    expect(motivo({ efecto: 'Mate' })).toBe('misma_cosa');
    expect(motivo({ efecto: 'Lluvia' })).toBe('no_puede_ser_efecto');
    expect(motivo({ causa_modo: 'alto' })).toBe('modo_invalido');
    expect(motivo({ causa_modo: 'desde' })).toBe('modo_invalido');
    expect(motivo({ tipo: 'otra' })).toBe('tipo_invalido');
    expect(motivo({ sentido: 'igual' })).toBe('sentido_invalido');
    expect(motivo({ desfase_dias: 15 })).toBe('desfase_invalido');
    expect(motivo({ desfase_dias: 1.5 })).toBe('desfase_invalido');
    expect(motivo({ razon: '  ' })).toBe('sin_razon');
    expect(motivo({ tipo: 'cambio', fecha_desde: '' })).toBe('fecha_invalida');
    expect(motivo({ tipo: 'cambio', fecha_desde: '2030-01-01' })).toBe('fecha_invalida');
    expect(motivo({ fecha_desde: '2022-01-01', fecha_hasta: '2022-01-10' })).toBe('fecha_invalida');
  });

  it('respeta lo que la persona apagó', () => {
    expect(motivo({ desfase_dias: 2 }, { desfasesLargos: false })).toBe('apagado_desfases_largos');
    expect(motivo({ sentido: 'baja' }, { proteccion: false })).toBe('apagado_proteccion');
    expect(validarHipotesis([cruda({ desfase_dias: 1 })], { ...base, desfasesLargos: false }).validas.length).toBe(1);
  });

  it('como mucho 10, sin repetidas; un período de toda la historia es lo mismo que sin período', () => {
    const muchas = Array.from({ length: 15 }, (_, i) => cruda({ desfase_dias: i % 14 }));
    const r = validarHipotesis(muchas, base);
    expect(r.validas.length + r.descartadas.length).toBe(10);
    expect(validarHipotesis([cruda(), cruda()], base).descartadas[0].motivo).toBe('repetida_en_la_respuesta');
    expect(validarHipotesis([cruda({ fecha_desde: base.desde, fecha_hasta: base.hasta })], base).validas[0].fecha_desde).toBeNull();
  });

  it('los rasgos que acepta son los que arma el motor', () => {
    const d = conCambio(100, 50);
    const rasgos = armarRasgos(d.filas, new Map(d.conceptos.map((c) => [c.id, c])), d.desde, 100);
    expect(rasgos.some((r) => r.concepto.id === 2 && r.modo === 'presente')).toBe(true);
  });
});
