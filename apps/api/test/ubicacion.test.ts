import { puntoNuevo } from 'shared';
import { describe, expect, it } from 'vitest';
import { paradasSinNombre, resumirDia } from '../src/ubicacion/resumen.js';

// Puntos de Buenos Aires: 0,01° de latitud son ~1,1 km.
const CASA = { id: 1, lat: -34.6, lon: -58.4, radio_m: 150 };
const SUPER = { id: 2, lat: -34.6005, lon: -58.4, radio_m: 150 }; // a 55 m de casa: los dos radios se pisan
const MAMA = { id: 3, lat: -34.62, lon: -58.4, radio_m: 150 }; // ~2,2 km
const h = (hora: number) => Date.parse('2026-10-24T00:00:00Z') + hora * 3600000;

describe('resumen de un día de ubicación', () => {
  it('cuenta viajes de más de 1 km, los km y las estadías en cada lugar', () => {
    const lugares = [CASA, MAMA];
    const r = resumirDia(
      [
        { instante: h(8), lat: -34.6, lon: -58.4 }, // casa
        { instante: h(10), lat: -34.6004, lon: -58.4 }, // sigue en casa (a 45 m)
        { instante: h(12), lat: -34.62, lon: -58.4 }, // lo de mamá
        { instante: h(13), lat: -34.61, lon: -58.4 }, // en el medio, ~1,1 km: otro viaje
        { instante: h(17), lat: -34.6, lon: -58.4 }, // de vuelta en casa
      ],
      lugares,
    );
    expect(r.viajes).toBe(3);
    expect(r.km).toBeCloseTo(4.4, 1);
    expect(r.estadias).toEqual([
      { lugar_id: 1, llegada: h(8), salida: h(12) },
      { lugar_id: 3, llegada: h(12), salida: h(13) },
      { lugar_id: 1, llegada: h(17), salida: h(17) },
    ]);
  });

  it('un día sin moverse: ningún viaje, una estadía', () => {
    const r = resumirDia([{ instante: h(9), lat: -34.6, lon: -58.4 }], [CASA]);
    expect(r).toEqual({ viajes: 0, km: 0, estadias: [{ lugar_id: 1, llegada: h(9), salida: h(9) }] });
  });
});

describe('qué puntos se guardan', () => {
  const p = (lat: number, dia = '2026-10-24') => ({ lat, lon: -58.4, dia });

  it('el primero del día, al moverse más de 1 km, o al entrar o salir de un lugar', () => {
    expect(puntoNuevo(null, p(-34.6), [])).toBe(true);
    expect(puntoNuevo(p(-34.6), p(-34.603), [])).toBe(false); // 330 m, sin lugares
    expect(puntoNuevo(p(-34.6), p(-34.61), [])).toBe(true); // 1,1 km
    expect(puntoNuevo(p(-34.6, '2026-10-23'), p(-34.6), [])).toBe(true); // otro día
    expect(puntoNuevo(p(-34.6), p(-34.603), [CASA])).toBe(true); // salió de casa
    expect(puntoNuevo(p(-34.6), p(-34.6005), [CASA, SUPER])).toBe(true); // el súper está más cerca
    expect(puntoNuevo(p(-34.6), p(-34.6001), [CASA])).toBe(false); // sigue en casa
  });
});

describe('puntos que manda la app nativa', () => {
  it('lleva el formato del plugin de ubicación al de Patty', async () => {
    const { puntoDeLaApp } = await import('../src/routes/ingesta.js');
    expect(puntoDeLaApp({ latitude: -34.6, longitude: -58.4, accuracy: 12, time: Date.parse('2026-10-24T12:00:00Z'), simulated: false })).toEqual({
      lat: -34.6,
      lon: -58.4,
      precision: 12,
      instante: '2026-10-24T12:00:00.000Z',
    });
  });
  it('deja pasar los puntos que ya vienen como los manda la web o un atajo', async () => {
    const { puntoDeLaApp } = await import('../src/routes/ingesta.js');
    expect(puntoDeLaApp({ lat: 1, lon: 2 })).toEqual({ lat: 1, lon: 2 });
  });
});

describe('resumen del clima de un día', () => {
  it('saca máxima, mínima, horas de sol y de lluvia, y la nubosidad solo de las horas de luz', async () => {
    const { resumirClimaDelDia } = await import('../src/clima/resumenDiario.js');
    const h = (n: number) => n * 3600000;
    const lecturas = [
      // Noche: nublado, sin radiación (no cuenta para la nubosidad de día).
      { hora: h(3), concepto: 'Nubosidad', valor: 100 },
      { hora: h(3), concepto: 'Radiación solar', valor: 0 },
      { hora: h(3), concepto: 'Temperatura', valor: 10 },
      { hora: h(3), concepto: 'Lluvia', valor: 1.2 },
      { hora: h(3), concepto: 'Presión', valor: 1015 },
      // Día: poco nublado, con sol.
      { hora: h(13), concepto: 'Nubosidad', valor: 20 },
      { hora: h(13), concepto: 'Radiación solar', valor: 600 },
      { hora: h(13), concepto: 'Temperatura', valor: 22 },
      { hora: h(13), concepto: 'Minutos de sol', valor: 60 },
      { hora: h(13), concepto: 'Lluvia', valor: 0 },
      { hora: h(13), concepto: 'Presión', valor: 1009 },
      { hora: h(14), concepto: 'Nubosidad', valor: 40 },
      { hora: h(14), concepto: 'Radiación solar', valor: 500 },
      { hora: h(14), concepto: 'Minutos de sol', valor: 30 },
    ];
    const r = Object.fromEntries(resumirClimaDelDia(lecturas).map((v) => [v.concepto, v.valor]));
    expect(r).toMatchObject({
      'Temperatura máxima': 22,
      'Temperatura mínima': 10,
      'Amplitud térmica': 12,
      'Nubosidad de día': 30,
      'Horas de sol': 1.5,
      'Lluvia del día': 1.2,
      'Horas con lluvia': 1,
      'Cambio de presión': -6,
    });
    expect(r['Humedad media']).toBeUndefined(); // sin datos, no se inventa
  });
});

describe('paradas en lugares sin nombre', () => {
  it('encuentra dónde se quedó un buen rato fuera de los lugares con nombre', () => {
    const PAPA = { lat: -34.65, lon: -58.4 }; // ~5,5 km de casa, sin nombre
    const KIOSCO = { lat: -34.67, lon: -58.4 };
    const puntos = [
      { ...CASA, instante: h(8) },
      { ...PAPA, instante: h(12) }, // llega 12:00
      { ...KIOSCO, instante: h(15.5) }, // se fue de lo de papá: 3 h 30 min ahí
      { ...CASA, instante: h(15.8) }, // en el kiosco, 18 min: no cuenta
      { lat: -34.7, lon: -58.4, instante: h(22) }, // último del día, hasta las 23
    ];
    const r = paradasSinNombre(puntos, [CASA], h(23));
    expect(r.map((x) => [x.lat, (x.salida - x.llegada) / 60000])).toEqual([[-34.65, 210], [-34.7, 60]]);
  });
});

describe('viajes del día', () => {
  it('junta los tramos en movimiento y adivina en qué fue', async () => {
    const { viajesDelDia } = await import('../src/ubicacion/resumen.js');
    const { adivinarViaje } = await import('shared');
    const m = (min: number) => Date.parse('2026-10-24T12:00:00Z') + min * 60000;
    // Quieto en casa, después 3 tramos de ~2,2 km cada 6 min (≈22 km/h), y quieto de nuevo.
    const v = viajesDelDia([
      { lat: -34.6, lon: -58.4, instante: m(0) },
      { lat: -34.62, lon: -58.4, instante: m(180) },
      { lat: -34.64, lon: -58.4, instante: m(186) },
      { lat: -34.66, lon: -58.4, instante: m(192) },
      { lat: -34.68, lon: -58.4, instante: m(198) },
    ]);
    expect(v).toHaveLength(1);
    expect((v[0].fin - v[0].inicio) / 60000).toBe(18);
    expect(Math.round(v[0].metros / 100) / 10).toBeCloseTo(6.7, 0);
    expect(adivinarViaje(6.7, 18).modo).toBe('auto');
    expect(adivinarViaje(8, 60)).toMatchObject({ modo: 'auto', pesado: true }); // 8 km/h: tráfico
    expect(adivinarViaje(2, 30).modo).toBe('caminando');
  });
});
