import { puntoNuevo } from 'shared';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { horasDeLuz, lunaIluminada } from '../src/clima/cielo.js';
import { cerrarDb } from '../src/db/client.js';
import { esperarClima } from '../src/routes/clima.js';
import { Cliente, conAdmin } from './ayudas.js';
import { caminoLimpio, huboTrafico, metrosDe, paradasSinNombre, paseosDelDia, resumirDia, viajesDelDia, type Punto } from '../src/ubicacion/resumen.js';

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

describe('puntos imposibles', () => {
  afterAll(() => cerrarDb());
  it('no se guardan los saltos del GPS (8.000 km en un minuto) ni los 0,0', async () => {
    const { ana, personaId } = await conAdmin();
    const t = (min: number) => new Date(Date.now() - 3600000 + min * 60000).toISOString();
    const r = await ana.post('/api/ubicacion', {
      persona_id: personaId,
      puntos: [
        { lat: -34.6, lon: -58.4, instante: t(0) },
        { lat: 29.73, lon: -98.5, instante: t(1) },
        { lat: 0, lon: 0, instante: t(2) },
        { lat: -34.61, lon: -58.4, instante: t(5) },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.guardados).toBe(2);
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

  it('tráfico: los tramos a paso de hombre y lo que tarda habitualmente ese recorrido', async () => {
    const { viajesDelDia, minutosHabituales, huboTrafico } = await import('../src/ubicacion/resumen.js');
    const dia = (d: number) => (min: number) => Date.parse('2026-10-20T12:00:00Z') + d * 86400000 + min * 60000;
    // De casa al centro: 3 tramos rápidos de 2,2 km y, en el medio, 4 minutos para 150-250 m (embotellamiento).
    const conTrafico = (m: (n: number) => number) => [
      { lat: -34.6, lon: -58.4, instante: m(0) },
      { lat: -34.62, lon: -58.4, instante: m(5) },
      { lat: -34.6215, lon: -58.4, instante: m(9) },
      { lat: -34.6235, lon: -58.4, instante: m(13) },
      { lat: -34.6255, lon: -58.4, instante: m(17) },
      { lat: -34.6455, lon: -58.4, instante: m(22) },
    ];
    const v = viajesDelDia(conTrafico(dia(5)));
    expect(v).toHaveLength(1);
    expect(v[0].lento_min).toBe(12);
    expect(huboTrafico(v[0], null)).toBe(true);
    // El mismo recorrido, otros días, sin tráfico: 10 minutos. Hoy tardó 22 sin tramos lentos marcados: también.
    const rapido = (m: (n: number) => number) => [
      { lat: -34.6, lon: -58.4, instante: m(0) },
      { lat: -34.62, lon: -58.4, instante: m(4) },
      { lat: -34.6455, lon: -58.4, instante: m(10) },
    ];
    const anteriores = [1, 2, 3].flatMap((d) => viajesDelDia(rapido(dia(d))));
    const hoy = viajesDelDia([
      { lat: -34.6, lon: -58.4, instante: dia(6)(0) },
      { lat: -34.62, lon: -58.4, instante: dia(6)(11) },
      { lat: -34.6455, lon: -58.4, instante: dia(6)(22) },
    ]);
    expect(minutosHabituales(hoy[0], anteriores)).toBe(10);
    expect(huboTrafico(hoy[0], 10)).toBe(true);
    expect(huboTrafico(anteriores[0], 10)).toBe(false);
    // Un recorrido nuevo no tiene habitual.
    expect(minutosHabituales(hoy[0], [])).toBeNull();
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

describe('con puntos seguidos (uno cada 15 m a pie)', () => {
  const m = (min: number) => Date.parse('2026-10-26T12:00:00Z') + min * 60000;
  const METRO = 1 / 111195;
  const METRO_LON = METRO / Math.cos((34.6 * Math.PI) / 180);
  /** Un azar que da siempre lo mismo. */
  const azar = (semilla: number) => () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296 - 0.5;
  };
  /** De un lugar a otro, en metros desde -34.6/-58.4, con un punto cada `paso` metros, a `ms` m/s, con temblor de hasta ±`temblor`/2 m. */
  const tramo = (de: [number, number], a: [number, number], desde: number, ms: number, paso: number, temblor = 0, precision = 10, semilla = 1): Punto[] => {
    const r = azar(semilla);
    const largo = Math.hypot(a[0] - de[0], a[1] - de[1]);
    const n = Math.round(largo / paso);
    return Array.from({ length: n + 1 }, (_, i) => ({
      lat: -34.6 + (de[0] + ((a[0] - de[0]) * i) / n + r() * temblor) * METRO,
      lon: -58.4 + (de[1] + ((a[1] - de[1]) * i) / n + r() * temblor) * METRO_LON,
      instante: desde + (i * paso * 1000) / ms,
      precision_m: precision,
    }));
  };
  /** Parado en un lugar: un punto cada `cada` segundos, temblando. */
  const parado = (donde: [number, number], desde: number, minutos: number, temblor: number, cada = 30, precision = 20, semilla = 2): Punto[] => {
    const r = azar(semilla);
    return Array.from({ length: Math.round((minutos * 60) / cada) }, (_, i) => ({
      lat: -34.6 + (donde[0] + r() * temblor) * METRO,
      lon: -58.4 + (donde[1] + r() * temblor) * METRO_LON,
      instante: desde + i * cada * 1000,
      precision_m: precision,
    }));
  };
  /** Una vuelta a la manzana de `lado` metros, a pie. */
  const vueltaAPie = (t0: number, lado = 300, temblor = 6) => {
    const esquinas: Array<[number, number]> = [[0, 0], [lado, 0], [lado, lado], [0, lado], [0, 0]];
    return esquinas.slice(0, -1).flatMap((e, k) => tramo(e, esquinas[k + 1], t0 + (k * lado * 1000) / 1.4, 1.4, 15, temblor, 10, k + 3));
  };

  it('quedarse parado con el GPS temblando no arma viajes, ni km, ni caminatas, y se ve la parada', () => {
    const puntos = parado([0, 0], m(0), 180, 60);
    expect(resumirDia(puntos, [])).toEqual({ viajes: 0, km: 0, estadias: [] });
    expect(paseosDelDia(puntos, [])).toEqual([]);
    const paradas = paradasSinNombre(puntos, [], m(180));
    expect(paradas).toHaveLength(1);
    expect((paradas[0].salida - paradas[0].llegada) / 60000).toBe(180);
  });

  it('una vuelta a pie es un paseo, con sus km bien medidos aunque el GPS tiemble, y no un viaje', () => {
    const puntos = vueltaAPie(m(0));
    expect(puntos.length).toBeGreaterThan(70);
    const [p, ...otros] = paseosDelDia(puntos, []);
    expect(otros).toEqual([]);
    expect(p.metros).toBeGreaterThan(1000);
    expect(p.metros).toBeLessThan(1320); // son 1200 m: sumar todos los tramos con temblor daría bastante más
    expect((p.fin - p.inicio) / 60000).toBeGreaterThan(8);
    expect(viajesDelDia(puntos, [])).toEqual([]);
    expect(resumirDia(puntos, []).km).toBe(0);
  });

  it('un viaje en auto cuenta lo mismo con pocos puntos que con muchos', () => {
    const fino = [...parado([0, 0], m(-40), 30, 10), ...tramo([0, 0], [5000, 0], m(0), 10, 60, 4)];
    const ralo = tramo([0, 0], [5000, 0], m(0), 10, 150);
    const [f] = viajesDelDia(fino, []);
    const [r] = viajesDelDia(ralo, []);
    expect(viajesDelDia(fino, [])).toHaveLength(1);
    expect(Math.abs(f.metros - r.metros)).toBeLessThan(200);
    expect(f.metros).toBeLessThan(5250);
    expect(f.lento_min).toBe(0);
    expect(f.camino!.length).toBeGreaterThan(r.camino!.length);
  });

  it('el temblor en un semáforo no suma km, y una caminata de 15 m por punto no se parte en mil', () => {
    const puntos = [
      ...tramo([0, 0], [2000, 0], m(0), 10, 60, 4),
      ...parado([2000, 0], m(0) + 200000, 1.5, 25, 5, 15),
      ...tramo([2000, 0], [4000, 0], m(0) + 290000, 10, 60, 4),
    ];
    const v = viajesDelDia(puntos, []);
    expect(v).toHaveLength(1);
    expect(v[0].metros).toBeGreaterThan(3900);
    expect(v[0].metros).toBeLessThan(4200);
  });

  it('los minutos de tráfico se ven igual con muchos puntos', () => {
    const puntos = [
      ...tramo([0, 0], [2000, 0], m(0), 12, 70, 4),
      ...tramo([2000, 0], [3000, 0], m(0) + 170000, 1.5, 15, 3), // ~11 min a paso de hombre
      ...tramo([3000, 0], [6000, 0], m(0) + 840000, 12, 70, 4),
    ];
    const [v] = viajesDelDia(puntos, []);
    expect(v.lento_min).toBeGreaterThanOrEqual(9);
    expect(v.lento_min).toBeLessThanOrEqual(12);
    expect(huboTrafico(v, null)).toBe(true);
  });

  it('pasar en auto por un lugar con nombre no corta el viaje ni es una estadía', () => {
    const lugar = { id: 9, lat: -34.6 + 2000 * METRO, lon: -58.4, radio_m: 150 };
    const puntos = tramo([0, 0], [4000, 0], m(0), 10, 60, 2);
    const r = resumirDia(puntos, [lugar]);
    expect(r.viajes).toBe(1);
    expect(r.estadias).toEqual([]);
  });

  it('llegar a un lugar y quedarse sí corta el viaje, y caminar por el borde del radio no parte la estadía', () => {
    const lugar = { id: 9, lat: -34.6 + 2000 * METRO, lon: -58.4, radio_m: 150 };
    const llega = m(0) + 200000;
    const puntos = [
      ...tramo([0, 0], [2000, 0], m(0), 10, 60),
      { lat: lugar.lat + 149 * METRO, lon: lugar.lon, instante: llega + 60000 },
      { lat: lugar.lat + 155 * METRO, lon: lugar.lon, instante: llega + 90000 }, // un ratito afuera
      { lat: lugar.lat + 149 * METRO, lon: lugar.lon, instante: llega + 120000 },
      ...tramo([2000, 0], [4000, 0], m(40), 10, 60, 0, 10),
    ];
    const r = resumirDia(puntos, [lugar]);
    expect(r.viajes).toBe(2);
    expect(r.estadias).toHaveLength(1);
    expect(r.estadias[0].salida).toBeGreaterThan(m(40));
  });

  it('el dibujo: sin los puntos malos ni los picos, y un paseo largo con menos puntos sin perder las esquinas', () => {
    const buenos = tramo([0, 0], [300, 0], m(0), 1.4, 15);
    const conErrores = [...buenos];
    conErrores.splice(5, 0, { lat: buenos[5].lat, lon: buenos[5].lon + 200 * METRO_LON, instante: buenos[5].instante - 2000, precision_m: 200 }); // de la red
    conErrores.splice(14, 0, { lat: buenos[13].lat, lon: buenos[13].lon + 80 * METRO_LON, instante: buenos[13].instante + 2000, precision_m: 20 }); // un rebote
    const lejos = (c: Array<{ lat: number; lon: number }>) => Math.max(...c.map((x) => Math.abs(x.lon + 58.4) / METRO_LON));
    expect(lejos(conErrores)).toBeGreaterThan(150);
    expect(lejos(caminoLimpio(conErrores))).toBeLessThan(10);
    expect(metrosDe(conErrores.filter((p) => p.precision_m! <= 50))).toBeLessThan(330);

    const vuelta = vueltaAPie(m(0), 900, 4);
    expect(vuelta.length).toBeGreaterThan(200);
    const c = caminoLimpio(vuelta);
    expect(c.length).toBeLessThan(vuelta.length);
    // Las esquinas siguen: pasa a pocos metros de la de enfrente.
    const esquina = { lat: -34.6 + 900 * METRO, lon: -58.4 + 900 * METRO_LON };
    expect(Math.min(...c.map((x) => Math.hypot((x.lat - esquina.lat) / METRO, (x.lon - esquina.lon) / METRO_LON)))).toBeLessThan(15);
  });

  it('un camino con todos los puntos flojos se dibuja igual (mejor que nada)', () => {
    const flojos = tramo([0, 0], [1000, 0], m(0), 10, 200, 0, 150);
    expect(caminoLimpio(flojos)).toHaveLength(flojos.length);
    expect(metrosDe(flojos)).toBeCloseTo(1000, -1);
  });

  describe('lo que se guarda', () => {
    afterAll(() => cerrarDb());
    const hace = (min: number) => new Date(Date.now() - 2 * 3600000 + min * 60000).toISOString();

    it('con la marca de movimiento y buena precisión se guarda cada pocos metros, con más decimales; sin ella, como siempre', async () => {
      const { ana, personaId } = await conAdmin();
      const f = await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'telefono', nombre: 'App' });
      const app = new Cliente();
      app.headers.Authorization = `Bearer ${f.body.token}`;
      const fijo = (segundos: number, metros: number, extra: Record<string, unknown>) => ({
        latitude: -34.60001 - metros * METRO,
        longitude: -58.40001,
        time: Date.now() - 3600000 + segundos * 1000,
        ...extra,
      });
      const r = await app.post('/api/ingesta/ubicacion?clima=no', {
        puntos: [
          fijo(0, 0, { accuracy: 8, movimiento: true }), // primero
          fijo(10, 15, { accuracy: 8, movimiento: true }), // 15 m: del recorrido
          fijo(20, 18, { accuracy: 8, movimiento: true }), // 3 m: no agrega nada
          fijo(30, 35, { accuracy: 90, movimiento: true }), // mala: solo si se alejó como para decir dónde está
          fijo(40, 50, { accuracy: 8 }), // sin la marca (una app vieja, un punto de la red): no
          fijo(50, 70, { accuracy: 8, movimiento: true }),
          fijo(60, 400, { accuracy: 120 }), // lejos: dice dónde está, aunque sea malo
        ],
      });
      expect(r.status).toBe(200);
      expect(r.body.guardados).toBe(4);
      const dibujo = (await ana.get(`/api/ubicacion/camino?persona=${personaId}&desde=${hace(0)}&hasta=${new Date().toISOString()}`)).body;
      expect(dibujo.camino[0].lat).toBeCloseTo(-34.60001, 5); // 5 decimales, no 4
      expect(dibujo.camino).toHaveLength(3); // el malo no se dibuja
    });

    it('el mapa de calor no pesa más por tener más puntos', async () => {
      const { ana, personaId } = await conAdmin();
      const puntos = Array.from({ length: 12 }, (_, i) => ({ lat: -34.60001 - i * 15 * METRO * 0.2, lon: -58.4, precision: 8, movimiento: true, instante: hace(i * 0.1) }));
      expect((await ana.post('/api/ubicacion', { persona_id: personaId, puntos })).status).toBeLessThan(300);
      const r = (await ana.get(`/api/ubicacion/calor?persona=${personaId}&dias=7`)).body;
      expect(r.reduce((s: number, x: any) => s + x.n, 0)).toBeLessThanOrEqual(3);
    });
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

  it('el camino de un rato (para la imagen de una actividad): solo esos puntos, sin saltos, con los km', async () => {
    const { ana, personaId } = await conAdmin();
    const puntos = [
      { lat: -34.6, lon: -58.4, instante: '2026-10-27T12:00:00.000Z' },
      { lat: -34.61, lon: -58.4, instante: '2026-10-27T12:10:00.000Z' },
      { lat: -34.62, lon: -58.4, instante: '2026-10-27T12:20:00.000Z' },
      { lat: -34.7, lon: -58.4, instante: '2026-10-27T15:00:00.000Z' }, // ya fuera del rato
    ];
    await ana.post('/api/ubicacion', { persona_id: personaId, puntos });
    const r = await ana.get(`/api/ubicacion/camino?persona=${personaId}&desde=2026-10-27T11:55:00.000Z&hasta=2026-10-27T12:30:00.000Z`);
    expect(r.body.camino.map((x: any) => x.lat)).toEqual([-34.6, -34.61, -34.62]);
    expect(r.body.km).toBeCloseTo(2.2, 1);
    expect((await ana.get(`/api/ubicacion/camino?persona=${personaId}&desde=2026-10-27T12:30:00.000Z&hasta=2026-10-27T11:00:00.000Z`)).status).toBe(400);
  });
});

describe('contar un viaje', () => {
  afterAll(() => cerrarDb());
  it('con tráfico, además de cómo fue quedan "Viaje con tráfico" y los minutos en tráfico', async () => {
    const { ana, personaId } = await conAdmin();
    const inicio = '2026-10-24T15:00:00.000Z';
    const r = await ana.post('/api/ubicacion/viajes', { persona_id: personaId, inicio, fin: '2026-10-24T15:40:00.000Z', minutos: 40, km: 12, modo: 'auto', como: 'normal', trafico: true, lento_min: 14, habitual_min: 22 });
    expect(r.status).toBe(201);
    const l = (await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-24&hasta=2026-10-24`)).body;
    const por = new Map(l.map((x: any) => [x.concepto, x.valor]));
    expect(por.has('Viaje en auto')).toBe(true);
    expect(por.has('Viaje con tráfico')).toBe(true);
    // Lo que más tardó que lo habitual (18) le gana a los tramos lentos (14).
    expect(por.get('Minutos en tráfico')).toBe(18);
  });
});

describe('sol y luna', () => {
  it('las horas de luz, como las da Open-Meteo, y más en verano que en invierno', () => {
    expect(Math.abs(horasDeLuz(-34.6, '2026-10-30') - 13.45)).toBeLessThan(0.1); // Open-Meteo: 48419 s
    expect(horasDeLuz(-34.6, '2026-12-21')).toBeGreaterThan(14);
    expect(horasDeLuz(-34.6, '2026-06-21')).toBeLessThan(10);
    expect(horasDeLuz(78, '2026-06-21')).toBe(24); // sol de medianoche
  });

  it('la luna: nueva y llena en fechas conocidas', () => {
    expect(lunaIluminada('2026-02-17')).toBeLessThan(5); // eclipse de sol
    expect(lunaIluminada('2026-03-03')).toBeGreaterThan(95); // eclipse de luna
  });
});

describe('clima con la ubicación que manda el teléfono', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('con Patty cerrada guarda el clima de esa hora, una vez, y respeta el apagado', async () => {
    const { ana, personaId } = await conAdmin();
    const f = await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'telefono', nombre: 'App' });
    const app = new Cliente();
    app.headers.Authorization = `Bearer ${f.body.token}`;
    vi.stubEnv('CLIMA_DE_FONDO', 'si');
    const pedidos: URL[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      const url = new URL(u);
      pedidos.push(url);
      const time = [url.searchParams.get('start_hour')];
      const hourly = Object.fromEntries((url.searchParams.get('hourly') ?? '').split(',').map((k) => [k, [10]]));
      return new Response(JSON.stringify({ hourly: { time, ...hourly } }), { headers: { 'Content-Type': 'application/json' } });
    });

    await app.post('/api/ingesta/ubicacion?clima=no', { lat: -34.6, lon: -58.4 });
    await esperarClima();
    expect(pedidos).toHaveLength(0);

    expect((await app.post('/api/ingesta/ubicacion', { lat: -34.6123, lon: -58.4 })).status).toBe(200);
    await esperarClima();
    expect(pedidos.map((u) => u.searchParams.get('latitude'))).toEqual(['-34.61', '-34.61']); // clima y aire
    const hoy = (await ana.get(`/api/registros/automaticos?persona=${personaId}`)).body;
    expect(hoy.find((d: any) => d.concepto === 'Calidad del aire')).toMatchObject({ fuente: 'Clima automático', suma: 10 });

    await app.post('/api/ingesta/ubicacion', { lat: -34.63, lon: -58.4 });
    await esperarClima();
    expect(pedidos).toHaveLength(2); // esa hora ya está
  });

  it('los días con datos reciben luna y horas de luz, sin clima, y entran al análisis', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const cafe = (await ana.post('/api/conceptos', { nombre: 'Café', categoria_id: categorias.bebida })).body.concepto.id;
    await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Casa', lat: -34.6, lon: -58.4 });
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: cafe, inicio: '2026-03-03T15:00:00Z', valor: 1 });
    const pedir = () => ana.post('/api/analisis', { persona_id: personaId, desde: '2026-03-01', hasta: '2026-03-05', ia: false });
    await pedir();
    await pedir(); // no duplica
    const dia = (await ana.get(`/api/registros/automaticos?persona=${personaId}&fecha=2026-03-03`)).body;
    const cielo = dia.filter((d: any) => d.fuente === 'Sol y luna');
    expect(cielo.map((d: any) => [d.concepto, d.cantidad]).sort()).toEqual([['Horas de luz', 1], ['Luna iluminada', 1]]);
    expect(cielo.find((d: any) => d.concepto === 'Luna iluminada').suma).toBeGreaterThan(95);
  });
});
