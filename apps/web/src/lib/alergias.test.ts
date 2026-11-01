import { describe, expect, it } from 'vitest';
import {
  alergiasDeTemporada,
  alergiasParaIa,
  alergiasQueChocan,
  chocaConAlergia,
  claveDeTemporada,
  COSAS_DEL_ANIMO,
  estadoEscrito,
  estadosDe,
  esEstadoPuntual,
  ESTADOS_PUNTUALES,
  ITEMS_SEGUIMIENTO,
  PLANTILLA_TEMPORADA_ALERGIA,
  traducir,
  type Alergia,
} from 'shared';
import { avisosEn } from './avisoAlergia';

const BA = 'America/Argentina/Buenos_Aires';
const MADRID = 'Europe/Madrid';
const primaveral: Alergia = { tipo: 'estacional', nombre: '', estacion: 'primavera' };
const comida = (nombre: string): Alergia => ({ tipo: 'alimento', nombre });
const remedio = (nombre: string): Alergia => ({ tipo: 'medicamento', nombre });

describe('la temporada de una alergia', () => {
  it('depende del hemisferio', () => {
    expect(alergiasDeTemporada([primaveral], '2026-11-01', BA)).toEqual([primaveral]);
    expect(alergiasDeTemporada([primaveral], '2026-11-01', MADRID)).toEqual([]);
    expect(alergiasDeTemporada([primaveral], '2026-04-15', MADRID)).toEqual([primaveral]);
    expect(alergiasDeTemporada([primaveral], '2026-04-15', BA)).toEqual([]);
  });
  it('solo cuentan las estacionales', () => {
    expect(alergiasDeTemporada([comida('Maní')], '2026-11-01', BA)).toEqual([]);
    expect(alergiasDeTemporada(undefined, '2026-11-01', BA)).toEqual([]);
  });
  it('callarla vale para toda la temporada, aunque cruce el año, y la del año que viene vuelve a preguntar', () => {
    expect(claveDeTemporada('2026-12-28', BA)).toBe(claveDeTemporada('2027-01-15', BA));
    expect(claveDeTemporada('2026-11-01', BA)).not.toBe(claveDeTemporada('2027-11-01', BA));
  });
  it('la IA se entera, y de la temporada solo si es la temporada', () => {
    expect(alergiasParaIa([primaveral], '2026-11-01', BA)).toMatch(/Hoy es temporada de su alergia primaveral/);
    expect(alergiasParaIa([primaveral], '2026-07-01', BA)).not.toMatch(/temporada/);
    expect(alergiasParaIa([], '2026-11-01', BA)).toBe('');
  });
  it('el recordatorio es una plantilla de seguimiento con ítems conocidos, que no se prende sola', () => {
    for (const c of PLANTILLA_TEMPORADA_ALERGIA.items) expect(ITEMS_SEGUIMIENTO.some((i) => i.clave === c)).toBe(true);
    expect(PLANTILLA_TEMPORADA_ALERGIA.dias).toBeLessThanOrEqual(60);
  });
});

describe('qué choca con una alergia', () => {
  it('sin acentos, en plural y en cualquier parte del nombre', () => {
    expect(chocaConAlergia('Barrita de MANI tostado', comida('Maní'))).toBe(true);
    expect(chocaConAlergia('Huevos revueltos', comida('huevo'))).toBe(true);
    expect(chocaConAlergia('Camarones al ajillo', comida('Camarón'))).toBe(true);
    expect(chocaConAlergia('Nueces', comida('Nuez'))).toBe(true);
  });
  it('por lo que suele traer', () => {
    expect(chocaConAlergia('Rabas', comida('Mariscos'))).toBe(true);
    expect(chocaConAlergia('Pizza', comida('Gluten'))).toBe(true);
    expect(chocaConAlergia('Yogur con frutas', comida('Lactosa'))).toBe(true);
    expect(chocaConAlergia('Amoxidal 500', remedio('Penicilina'))).toBe(true);
    expect(chocaConAlergia('Ibupirac', remedio('Ibuprofeno'))).toBe(true);
    expect(chocaConAlergia('Ibupirac', remedio('Antiinflamatorios'))).toBe(true);
  });
  it('sin confundirse', () => {
    expect(chocaConAlergia('Pizza sin gluten', comida('Gluten'))).toBe(false);
    expect(chocaConAlergia('Pizza sin TACC', comida('Gluten'))).toBe(false);
    expect(chocaConAlergia('Alfajor sin maní', comida('Maní'))).toBe(false);
    expect(chocaConAlergia('Panqueque', comida('Gluten'))).toBe(false);
    expect(chocaConAlergia('Paracetamol', remedio('Ibuprofeno'))).toBe(false);
    expect(chocaConAlergia('Lo que sea', { tipo: 'estacional', nombre: '', estacion: 'primavera' })).toBe(false);
  });
  it('cada categoría con las suyas', () => {
    const todas = [comida('Maní'), remedio('Penicilina'), { tipo: 'animal', nombre: 'Gatos' } as Alergia, { tipo: 'otra', nombre: 'Látex' } as Alergia];
    expect(alergiasQueChocan('Maní', todas, 'comida')).toHaveLength(1);
    expect(alergiasQueChocan('Maní', todas, 'medicacion')).toHaveLength(0);
    expect(alergiasQueChocan('Penicilina', todas, 'medicacion')).toHaveLength(1);
    expect(alergiasQueChocan('Penicilina', todas, 'comida')).toHaveLength(0);
    expect(alergiasQueChocan('Gatos', todas, 'comida')).toHaveLength(0);
    expect(alergiasQueChocan('Guantes de látex', todas, 'medicacion')).toHaveLength(1);
    expect(alergiasQueChocan('Maní', todas, 'sintoma')).toHaveLength(0);
  });
  it('encuentra los avisos en la respuesta del servidor', () => {
    const aviso = { que: 'Maní', alergia: 'Maní' };
    expect(avisosEn({ id: 1, avisos_alergia: [aviso] })).toEqual([aviso]);
    expect(avisosEn([{ id: 1 }, { id: 2, avisos_alergia: [aviso] }])).toEqual([aviso]);
    expect(avisosEn({ id: 1 })).toEqual([]);
    expect(avisosEn(null)).toEqual([]);
  });
});

describe('los chips de "¿Algo puntual?"', () => {
  it('"Con alergia" viene de fábrica y se anota como el malestar', () => {
    expect(ESTADOS_PUNTUALES.find((e) => e.nombre === 'Con alergia')).toMatchObject({ concepto: 'Alergia', categoria: 'sintoma' });
    expect(traducir('en', 'Con alergia')).toBe('With allergies');
    expect(COSAS_DEL_ANIMO).not.toContain('Con alergia');
  });
  it('cada uno saca los de Patty que no quiere y suma los suyos', () => {
    const a = { estados_puntuales: { ocultos: ['Con frío'], propios: [{ nombre: 'Con mocos', emoji: '🤧' }] } };
    const nombres = estadosDe(a).map((e) => e.nombre);
    expect(nombres).not.toContain('Con frío');
    expect(nombres).toContain('Con alergia');
    expect(nombres.at(-1)).toBe('Con mocos');
    expect(esEstadoPuntual('Con mocos', a)).toBe(true);
    // Lo que ya se anotó de uno que después sacó se sigue viendo como antes.
    expect(esEstadoPuntual('Con frío', a)).toBe(true);
    expect(esEstadoPuntual('Café', a)).toBe(false);
    expect(estadosDe({}).length).toBe(ESTADOS_PUNTUALES.length);
  });
  it('un emoji adelante queda como el suyo', () => {
    expect(estadoEscrito('🤧 con mocos')).toEqual({ nombre: 'Con mocos', emoji: '🤧' });
    expect(estadoEscrito('Con mocos').emoji).toBe('✨');
    expect(estadoEscrito('🤧').nombre).toBe('');
  });
});
