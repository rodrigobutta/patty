import { puntoNuevo } from 'shared';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { conAdmin } from './ayudas.js';
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

  it('el primero del día, al moverse más de 150 m, o al entrar o salir de un lugar', () => {
    expect(puntoNuevo(null, p(-34.6), [])).toBe(true);
    expect(puntoNuevo(p(-34.6), p(-34.6008), [])).toBe(false); // 90 m, sin lugares
    expect(puntoNuevo(p(-34.6), p(-34.603), [])).toBe(true); // 330 m
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
  it('con puntos cada ~150 m: un viaje es uno solo; la vuelta a pie con el perro no es un viaje', async () => {
    const { viajesDelDia } = await import('../src/ubicacion/resumen.js');
    const m = (min: number) => Date.parse('2026-10-26T12:00:00Z') + min * 60000;
    // En auto: 5 km hacia el sur, un punto cada 150 m (cada ~20 s).
    const auto = Array.from({ length: 34 }, (_, i) => ({ lat: -34.6 - i * 0.00135, lon: -58.4, instante: m(i / 3) }));
    // A pie, donde terminó el auto: 1,2 km en un cuadrado que vuelve al mismo lugar, a ~4,5 km/h, un rato después.
    const fin = auto[auto.length - 1];
    const lado = 0.0027;
    const esquinas = [[0, 0], [lado, 0], [lado, lado], [0, lado], [0, 0]];
    const pie: Array<{ lat: number; lon: number; instante: number }> = [];
    esquinas.slice(0, -1).forEach(([la, lo], k) => {
      const [la2, lo2] = esquinas[k + 1];
      for (let j = 0; j < 2; j++) pie.push({ lat: fin.lat + la + ((la2 - la) * j) / 2, lon: -58.4 + lo + ((lo2 - lo) * j) / 2, instante: m(100 + (k * 2 + j) * 2) });
    });
    pie.push({ lat: fin.lat, lon: -58.4, instante: m(116) });
    const v = viajesDelDia([...auto, ...pie]);
    expect(v).toHaveLength(1);
    expect(Math.round(v[0].metros / 1000)).toBe(5);
  });

  it('un día real: 4 viajes en auto de varios km (un punto por km) cuentan como 4, no como 30', async () => {
    const { resumirDia } = await import('../src/ubicacion/resumen.js');
    const m = (min: number) => Date.parse('2026-10-26T12:00:00Z') + min * 60000;
    const casa = { id: 1, lat: -34.6, lon: -58.5, radio_m: 150 };
    const fleni = { id: 2, lat: -34.6, lon: -58.42, radio_m: 150 };
    const resto = { id: 3, lat: -34.56, lon: -58.5, radio_m: 150 };
    // De a a b en `km` tramos de ~1 km, uno cada 3 minutos, empezando en el minuto `t`.
    const ir = (a: typeof casa, b: typeof casa, t: number, km: number) =>
      Array.from({ length: km + 1 }, (_, i) => ({ lat: a.lat + ((b.lat - a.lat) * i) / km, lon: a.lon + ((b.lon - a.lon) * i) / km, instante: m(t + i * 3) }));
    const puntos = [...ir(casa, fleni, 0, 7), ...ir(fleni, casa, 200, 7).slice(1), ...ir(casa, resto, 400, 4).slice(1), ...ir(resto, casa, 600, 4).slice(1)];
    expect(resumirDia(puntos, [casa, fleni, resto]).viajes).toBe(4);
  });

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
    // La salida: el primer tramo (2,2 km desde casa) a velocidad de ciudad, unos 4 minutos antes del primer punto.
    expect((v[0].fin - v[0].inicio) / 60000).toBeCloseTo(22.4, 0);
    expect(v[0].camino).toHaveLength(5);
    // Incluye el primer tramo (de casa al primer punto en camino): ~8,9 km.
    expect(Math.round(v[0].metros / 100) / 10).toBeCloseTo(8.9, 0);
    expect(adivinarViaje(6.7, 18).modo).toBe('auto');
    expect(adivinarViaje(8, 60)).toMatchObject({ modo: 'auto', pesado: true }); // 8 km/h: tráfico
    expect(adivinarViaje(2, 30).modo).toBe('caminando');
  });

  it('un punto del GPS que salta lejos no arma un viaje imposible; un tramo largo después de estar quieto no dura un minuto', async () => {
    const { viajesDelDia } = await import('../src/ubicacion/resumen.js');
    const m = (min: number) => Date.parse('2026-10-24T12:00:00Z') + min * 60000;
    // Quieto, un punto a 20 km en un minuto y de vuelta: un salto, no un viaje.
    expect(viajesDelDia([
      { lat: -34.6, lon: -58.4, instante: m(0) },
      { lat: -34.6, lon: -58.4, instante: m(60) },
      { lat: -34.78, lon: -58.4, instante: m(61) },
      { lat: -34.6, lon: -58.4, instante: m(62) },
    ])).toEqual([]);
    // Varios puntos seguidos lejos (el caso real: 104 km en 15 minutos) y de vuelta al barrio: tampoco.
    expect(viajesDelDia([
      { lat: -34.6, lon: -58.4, instante: m(0) },
      { lat: -34.601, lon: -58.401, instante: m(5) },
      { lat: -35.06, lon: -58.4, instante: m(8) },
      { lat: -35.061, lon: -58.401, instante: m(10) },
      { lat: -34.602, lon: -58.402, instante: m(14) },
      { lat: -34.603, lon: -58.403, instante: m(20) },
    ])).toEqual([]);
    // Si el que saltó es el primero del día, se saca ese y no los buenos.
    expect(viajesDelDia([
      { lat: -35.06, lon: -58.4, instante: m(0) },
      { lat: -34.6, lon: -58.4, instante: m(3) },
      { lat: -34.62, lon: -58.4, instante: m(9) },
      { lat: -34.64, lon: -58.4, instante: m(15) },
    ])).toHaveLength(1);
    // Dos horas quieto y el primer punto en camino ya a 7 km: salió unos 14 minutos antes, no un minuto.
    const v = viajesDelDia([
      { lat: -34.6, lon: -58.4, instante: m(0) },
      { lat: -34.663, lon: -58.4, instante: m(120) },
    ]);
    const kmh = v[0].metros / 1000 / ((v[0].fin - v[0].inicio) / 3600000);
    expect(kmh).toBeLessThan(40);
  });
});

describe('unir lugares', () => {
  afterAll(() => cerrarDb());
  it('lo de un lugar pasa al otro (solo de esta persona) y el primero se borra', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const casa = (await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Casa', lat: -34.6, lon: -58.4 })).body;
    const micasa = (await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Mi casa', lat: -34.6005, lon: -58.4 })).body;
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: micasa.concepto_id, categoria_id: categorias.lugar, inicio: '2026-10-20T15:00:00.000Z', valor: 30 });
    const r = await ana.post(`/api/ubicacion/lugares/${micasa.id}/unir`, { en: casa.id });
    expect(r.status).toBe(200);
    expect(r.body.radio_m).toBeGreaterThanOrEqual(casa.radio_m);
    const lugares = (await ana.get(`/api/ubicacion/lugares?persona=${personaId}`)).body;
    expect(lugares.map((l: any) => l.nombre)).toEqual(['Casa']);
    const regs = (await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-20&hasta=2026-10-20`)).body;
    expect(regs[0].concepto_id).toBe(casa.concepto_id);
    expect((await ana.post(`/api/ubicacion/lugares/${casa.id}/unir`, { en: casa.id })).status).toBe(400);
  });
});

describe('mapa de calor', () => {
  afterAll(() => cerrarDb());
  it('junta los puntos en cuadraditos con cuántos hay en cada uno', async () => {
    const { ana, personaId } = await conAdmin();
    const ahora = Date.now();
    const puntos = [
      { lat: -34.6001, lon: -58.4001, instante: new Date(ahora - 3 * 3600000).toISOString() },
      { lat: -34.6002, lon: -58.4002, instante: new Date(ahora - 2 * 3600000).toISOString() },
      { lat: -34.62, lon: -58.4, instante: new Date(ahora - 3600000).toISOString() },
    ];
    expect((await ana.post('/api/ubicacion', { persona_id: personaId, puntos })).status).toBeLessThan(300);
    const r = (await ana.get(`/api/ubicacion/calor?persona=${personaId}&dias=7`)).body;
    // El punto a pocos metros del anterior no se guarda (no se movió): quedan dos cuadraditos, uno por zona.
    expect(r).toHaveLength(2);
    expect(r.every((x: any) => x.n >= 1 && typeof x.lat === 'number')).toBe(true);
  });
});

describe('recorrido del día', () => {
  afterAll(() => cerrarDb());
  it('los puntos del día en orden, con el anterior si está cerca de la medianoche', async () => {
    const { ana, personaId } = await conAdmin();
    const puntos = [
      { lat: -34.60, lon: -58.40, instante: '2026-10-26T07:30:00.000Z' }, // 4:30 en Buenos Aires: todavía el día 25
      { lat: -34.62, lon: -58.40, instante: '2026-10-26T09:00:00.000Z' },
      { lat: -34.64, lon: -58.40, instante: '2026-10-26T15:00:00.000Z' },
    ];
    await ana.post('/api/ubicacion', { persona_id: personaId, puntos });
    const r = (await ana.get(`/api/ubicacion/recorrido?persona=${personaId}&fecha=2026-10-26`)).body;
    expect(r.puntos.map((x: any) => x.lat)).toEqual([-34.62, -34.64]);
    expect(r.antes).toMatchObject({ lat: -34.6 });
    expect(r.despues).toBeNull();
  });
});
