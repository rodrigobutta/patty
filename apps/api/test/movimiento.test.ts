import { adivinarViaje, distanciaMetros } from 'shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { recalcularSiCambio } from '../src/routes/ubicacion.js';
import { caminataContradicha, clasificarDia, metrosAPie, paseosDelDia, pasosDelTramo, recorridosDe, recorteDe, viajesDelDia, type Pasos, type Tramo } from '../src/ubicacion/movimiento.js';
import { huboTrafico, resumirDia, type Punto } from '../src/ubicacion/resumen.js';
import { conAdmin } from './ayudas.js';

const METRO = 1 / 111195;
const METRO_LON = METRO / Math.cos((34.6 * Math.PI) / 180);
const T0 = Date.parse('2026-10-26T12:00:00Z');
const min = (n: number) => T0 + n * 60000;
const kmh = (n: number) => n / 3.6;

/** Un azar que da siempre lo mismo, para el temblor del GPS. */
const azar = (semilla: number) => () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296 - 0.5;
};

type Xy = [number, number];
/**
 * Un recorrido armado por tramos, en metros desde un origen. `cadaS`: un punto cada tantos segundos en lo sparse; si no, cada
 * tantos metros (como el teléfono: 15 m a pie, más separados en auto). `temblor`: hasta ±temblor/2 m en cada eje.
 */
class Recorrido {
  puntos: Punto[] = [];
  t: number;
  donde: Xy;
  r: () => number;
  constructor(desde = min(0), donde: Xy = [0, 0], private temblor = 8, semilla = 7) {
    this.t = desde;
    this.donde = donde;
    this.r = azar(semilla);
  }
  private punto(x: number, y: number) {
    this.puntos.push({
      lat: -34.6 + (x + this.r() * this.temblor) * METRO,
      lon: -58.4 + (y + this.r() * this.temblor) * METRO_LON,
      instante: Math.round(this.t),
      precision_m: 10,
    });
  }
  /** Va hasta `a` a `ms` m/s, con un punto cada `paso` metros. */
  ir(a: Xy, ms: number, paso: number) {
    const [x0, y0] = this.donde;
    const largo = Math.hypot(a[0] - x0, a[1] - y0);
    const n = Math.max(1, Math.round(largo / paso));
    const t0 = this.t;
    for (let i = this.puntos.length ? 1 : 0; i <= n; i++) {
      this.t = t0 + ((i / n) * largo * 1000) / ms;
      this.punto(x0 + ((a[0] - x0) * i) / n, y0 + ((a[1] - y0) * i) / n);
    }
    this.donde = a;
    return this;
  }
  /** Se queda ahí: `cadaS` segundos entre puntos (un teléfono quieto casi no manda: 0 es ninguno). */
  parar(minutos: number, cadaS = 0) {
    const fin = this.t + minutos * 60000;
    if (cadaS) for (this.t += cadaS * 1000; this.t < fin; this.t += cadaS * 1000) this.punto(...this.donde);
    this.t = fin;
    this.punto(...this.donde);
    return this;
  }
}

const seguido = (d = min(0), o: Xy = [0, 0]) => new Recorrido(d, o);
const moviendo = (t: Tramo[]) => t.filter((x) => x.tipo !== 'quieto');
const tipos = (t: Tramo[]) => moviendo(t).map((x) => x.tipo);
const enKm = (m: number) => Math.round(m / 100) / 10;
/** Unos pasos de verdad o de mentira, de minuto a minuto. */
const pasosEn = (...ratos: Array<[number, number]>): Pasos => ({ ratos: ratos.map(([a, b]) => ({ inicio: min(a), fin: min(b) })) });

const PIE_M = 15;
const AUTO_M = 80;
const PIE = 1.4;
const AUTO = kmh(40);

describe('caminar hasta el auto, manejar y caminar al llegar', () => {
  const armar = (pie: number, auto: number) =>
    seguido(min(-60)).parar(58, 900).ir([250, 0], PIE, pie).parar(1).ir([6250, 0], AUTO, auto).parar(1).ir([6250, 300], PIE, pie).parar(60, 900).puntos;

  it('con muchos puntos: tres tramos, y el viaje es solo la parte en auto', () => {
    const puntos = armar(PIE_M, AUTO_M);
    const t = clasificarDia(puntos);
    expect(tipos(t)).toEqual(['a_pie', 'vehiculo', 'a_pie']);
    const [v, ...otros] = viajesDelDia(puntos);
    expect(otros).toEqual([]);
    expect(enKm(v.metros)).toBeGreaterThan(5.8);
    expect(enKm(v.metros)).toBeLessThan(6.4);
    // Lo caminado no es una actividad por sí solo, pero está medido.
    expect(paseosDelDia(puntos)).toEqual([]);
    expect(metrosAPie(t)).toBeGreaterThan(300);
    expect(metrosAPie(t)).toBeLessThan(800);
    expect(resumirDia(puntos, []).viajes).toBe(1);
    // El tramo del auto no tiene puntos de lo caminado.
    const auto = moviendo(t)[1];
    expect(auto.fin - auto.inicio).toBeLessThan(11 * 60000);
  });

  it('con un punto cada tanto: el viaje sigue siendo uno y con los mismos km', () => {
    // Un punto cada ~3 minutos: 250 m a pie, 2 km en auto, 300 m a pie.
    const puntos = seguido(min(0))
      .ir([250, 0], PIE, 250)
      .ir([2250, 0], AUTO, 2000)
      .ir([4250, 0], AUTO, 2000)
      .ir([6250, 0], AUTO, 2000)
      .ir([6250, 300], PIE, 300).puntos;
    expect(tipos(clasificarDia(puntos))).toEqual(['a_pie', 'vehiculo', 'a_pie']);
    const v = viajesDelDia(puntos);
    expect(v).toHaveLength(1);
    expect(enKm(v[0].metros)).toBeCloseTo(6, 0);
    expect(paseosDelDia(puntos)).toEqual([]);
  });
});

describe('tráfico', () => {
  const conAtasco = (paso: number, pasoLento: number) => seguido().ir([2000, 0], AUTO, paso).ir([3000, 0], 1.2, pasoLento).ir([6000, 0], AUTO, paso).puntos;

  it('un embotellamiento entre dos partes rápidas sigue siendo el mismo viaje, con sus minutos lentos', () => {
    for (const puntos of [conAtasco(AUTO_M, 15), conAtasco(800, 250)]) {
      const t = clasificarDia(puntos);
      expect(tipos(t)).toEqual(['vehiculo']);
      const [v] = viajesDelDia(puntos);
      expect(v.lento_min).toBeGreaterThanOrEqual(10);
      expect(huboTrafico(v, null)).toBe(true);
      expect(metrosAPie(t)).toBe(0);
    }
  });

  it('un viaje entero a 12 km/h en la ciudad, con partes rápidas, también (y lo lento no lo hace caminar)', () => {
    const r = seguido();
    for (let i = 1; i <= 6; i++) r.ir([i * 1000, 0], i % 2 ? kmh(9) : kmh(35), AUTO_M);
    expect(tipos(clasificarDia(r.puntos))).toEqual(['vehiculo']);
  });

  it('los semáforos no cortan ni cambian nada, aunque el GPS tiemble parado', () => {
    const r = new Recorrido(min(0), [0, 0], 20);
    for (let i = 1; i <= 5; i++) r.ir([i * 800, 0], AUTO, AUTO_M).parar(1.5, 15);
    const t = clasificarDia(r.puntos);
    expect(tipos(t)).toEqual(['vehiculo']);
    expect(enKm(t[0].metros)).toBeGreaterThan(3.8);
    expect(enKm(t[0].metros)).toBeLessThan(4.4);
  });

  it('lento al salir: sin datos de pasos es caminar hasta el auto; con pasos y sin caminata, no caminó', () => {
    const puntos = seguido().ir([1000, 0], 1.3, 30).ir([6000, 0], AUTO, AUTO_M).puntos;
    expect(tipos(clasificarDia(puntos))).toEqual(['a_pie', 'vehiculo']);
    const conReloj: Pasos = { ratos: [], desde: min(-600), hasta: min(600) };
    expect(tipos(clasificarDia(puntos, [], conReloj))).toEqual(['vehiculo']);
    // Pero si todavía no sincronizó el reloj, no ver pasos no dice nada.
    expect(tipos(clasificarDia(puntos, [], { ratos: [], desde: min(-600), hasta: min(5) }))).toEqual(['a_pie', 'vehiculo']);
  });
});

describe('a pie', () => {
  /** Una vuelta a la manzana de `lado` metros, de casa a casa. */
  const vuelta = (r: Recorrido, lado: number, paso: number, ms = PIE) => r.ir([lado, 0], ms, paso).ir([lado, lado], ms, paso).ir([0, lado], ms, paso).ir([0, 0], ms, paso);

  it('pasear al perro en una vuelta: es a pie, un paseo, sin viajes ni km en vehículo', () => {
    for (const paso of [PIE_M, 100, 300]) {
      const puntos = vuelta(seguido(), 400, paso).puntos;
      const t = clasificarDia(puntos);
      expect(tipos(t)).toEqual(['a_pie']);
      const p = paseosDelDia(puntos);
      expect(p).toHaveLength(1);
      expect(enKm(p[0].metros)).toBeGreaterThan(1.3);
      expect(enKm(p[0].metros)).toBeLessThan(1.8);
      expect(viajesDelDia(puntos)).toEqual([]);
      expect(resumirDia(puntos, []).km).toBe(0);
    }
  });

  it('el perro se para a oler (menos de 10 minutos): sigue siendo el mismo paseo', () => {
    const r = seguido().ir([400, 0], 1.2, PIE_M).parar(6, 30).ir([400, 400], 1.2, PIE_M).parar(4, 30).ir([0, 0], 1.2, PIE_M);
    expect(tipos(clasificarDia(r.puntos))).toEqual(['a_pie']);
    expect(paseosDelDia(r.puntos)).toHaveLength(1);
  });

  it('caminar de A a B no es un viaje: es una actividad, con pocos o muchos puntos', () => {
    for (const paso of [PIE_M, 300]) {
      const puntos = seguido().ir([2000, 0], PIE, paso).puntos;
      expect(tipos(clasificarDia(puntos))).toEqual(['a_pie']);
      expect(viajesDelDia(puntos)).toEqual([]);
      const [p] = paseosDelDia(puntos);
      expect(enKm(p.metros)).toBeCloseTo(2, 0);
      expect(resumirDia(puntos, []).viajes).toBe(0);
    }
  });

  it('dos cuadras a pie no son una actividad', () => {
    expect(paseosDelDia(seguido().ir([300, 0], PIE, PIE_M).puntos)).toEqual([]);
  });

  it('un punto que rebota en medio de una caminata no la vuelve un viaje', () => {
    const r = seguido().ir([700, 0], PIE, PIE_M);
    const antes = r.puntos.at(-1)!;
    r.puntos.push({ ...antes, lon: antes.lon + 200 * METRO_LON, instante: antes.instante + 12000 });
    r.t += 24000;
    r.ir([1400, 0], PIE, PIE_M);
    expect(tipos(clasificarDia(r.puntos))).toEqual(['a_pie']);
    expect(viajesDelDia(r.puntos)).toEqual([]);
  });

  it('el GPS temblando con el teléfono quieto no es nada', () => {
    const r = new Recorrido(min(0), [0, 0], 60);
    r.parar(180, 30);
    expect(tipos(clasificarDia(r.puntos))).toEqual([]);
    expect(clasificarDia(r.puntos)).toMatchObject([{ tipo: 'quieto' }]);
  });

  it('correr: a 11 km/h es a pie aunque no haya pasos, y más rápido solo si los pasos lo dicen', () => {
    const corrida = (v: number) => vuelta(seguido(), 700, 40, kmh(v)).puntos;
    expect(tipos(clasificarDia(corrida(11)))).toEqual(['a_pie']);
    expect(viajesDelDia(corrida(11))).toEqual([]);
    expect(tipos(clasificarDia(corrida(14)))).toEqual(['vehiculo']); // más parece una bici
    expect(tipos(clasificarDia(corrida(14), [], pasosEn([0, 60])))).toEqual(['a_pie']);
    expect(tipos(clasificarDia(corrida(18), [], pasosEn([0, 60])))).toEqual(['a_pie']);
    expect(tipos(clasificarDia(corrida(18)))).toEqual(['vehiculo']);
  });

  it('con pocos puntos, correr o no se decide igual', () => {
    const puntos = seguido().ir([3000, 0], kmh(10), 500).puntos;
    expect(tipos(clasificarDia(puntos))).toEqual(['a_pie']);
  });
});

describe('bici', () => {
  it('a 18 km/h parejo es vehículo (no da pasos) y se adivina bici; un auto en la ciudad, por sus picos, no', () => {
    const bici = seguido().ir([5000, 0], kmh(18), 60).puntos;
    const [v] = viajesDelDia(bici);
    expect(v.bici).toBe(true);
    expect(adivinarViaje(5, 17, { bici: v.bici! }).modo).toBe('bici');
    const r = seguido();
    for (let i = 1; i <= 8; i++) r.ir([i * 700, 0], i % 2 ? kmh(55) : kmh(14), 60);
    const [a] = viajesDelDia(r.puntos);
    expect(a.bici).toBe(false);
  });
});

describe('pocos puntos y muy separados', () => {
  it('quieto un buen rato y de golpe lejos: sin pasos, un viaje; con pasos que lo explican, una caminata', () => {
    const puntos = seguido().parar(120, 0).ir([2200, 0], 2, 2200).puntos;
    puntos.at(-1)!.instante = min(150);
    expect(tipos(clasificarDia(puntos))).toEqual(['vehiculo']);
    expect(viajesDelDia(puntos)).toHaveLength(1);
    const conPasos = pasosEn([125, 150]);
    expect(tipos(clasificarDia(puntos, [], conPasos))).toEqual(['a_pie']);
    expect(viajesDelDia(puntos, [], conPasos)).toEqual([]);
    const [p] = paseosDelDia(puntos, [], conPasos);
    expect((p.fin - p.inicio) / 60000).toBeCloseTo(26, 0); // lo que se tarda a pie, no las dos horas y media
  });

  it('un salto corto toma lo que sigue: si seguía en auto, es parte del viaje', () => {
    const puntos = seguido().parar(60, 0).ir([300, 0], AUTO, 300).ir([3300, 0], AUTO, 800).puntos;
    expect(tipos(clasificarDia(puntos))).toEqual(['vehiculo']);
    expect(enKm(viajesDelDia(puntos)[0].metros)).toBeCloseTo(3.3, 0);
  });

  it('los puntos finos dicen hasta cuándo siguió quieto: la velocidad real es la de después', () => {
    // 15 minutos en el mismo lugar y recién ahí 900 m en 2 minutos: no es caminar 17 minutos a 3 km/h.
    const puntos = seguido().parar(15, 300).ir([900, 0], kmh(27), 300).puntos;
    const [t] = moviendo(clasificarDia(puntos));
    expect(t.tipo).toBe('vehiculo');
    expect((t.fin - t.inicio) / 60000).toBeLessThan(3);
  });
});

describe('los pasos como dato', () => {
  const viajeEnAuto = () => seguido().ir([20000, 0], AUTO, AUTO_M).puntos;

  it('una caminata de los pasos a 40 km/h es falsa (el teléfono saltando en el auto)', () => {
    const puntos = viajeEnAuto();
    const falsa = pasosEn([3, 20]);
    const t = clasificarDia(puntos, [], falsa);
    expect(tipos(t)).toEqual(['vehiculo']);
    expect(viajesDelDia(puntos, [], falsa)).toHaveLength(1);
    expect(caminataContradicha(falsa.ratos[0], t)).toBe(true);
  });

  it('una de verdad no se toca, y sin puntos de ese rato se le cree a los pasos', () => {
    const puntos = seguido().ir([1500, 0], PIE, PIE_M).puntos;
    const r = pasosEn([1, 15]);
    const t = clasificarDia(puntos, [], r);
    expect(caminataContradicha(r.ratos[0], t)).toBe(false);
    expect(caminataContradicha({ inicio: min(300), fin: min(320) }, t)).toBe(false);
    expect(caminataContradicha(r.ratos[0], [])).toBe(false);
  });

  it('lento entre dos partes en auto: sin pasos, tráfico; con pasos, se bajó a caminar y son dos viajes', () => {
    const puntos = seguido().ir([3000, 0], AUTO, AUTO_M).ir([3900, 0], 1.3, PIE_M).ir([7000, 0], AUTO, AUTO_M).puntos;
    expect(tipos(clasificarDia(puntos))).toEqual(['vehiculo']);
    expect(viajesDelDia(puntos)).toHaveLength(1);
    const conPasos = pasosEn([4.5, 16]);
    expect(tipos(clasificarDia(puntos, [], conPasos))).toEqual(['vehiculo', 'a_pie', 'vehiculo']);
    expect(viajesDelDia(puntos, [], conPasos)).toHaveLength(2);
  });

  it('entre dos partes en auto, una vuelta que termina donde empezó no es tráfico: se bajó y volvió al auto', () => {
    const puntos = seguido().ir([3000, 0], AUTO, AUTO_M).ir([3000, 500], 1.3, PIE_M).ir([3400, 500], 1.3, PIE_M).ir([3000, 0], 1.3, PIE_M).ir([6000, 0], AUTO, AUTO_M).puntos;
    const t = clasificarDia(puntos);
    expect(tipos(t)).toEqual(['vehiculo', 'a_pie', 'vehiculo']);
    expect(paseosDelDia(puntos)).toHaveLength(1);
    expect(viajesDelDia(puntos)).toHaveLength(2);
  });
});

describe('las paradas de un viaje siguen siendo las de siempre', () => {
  it('se corta en un lugar con nombre donde se quedó o a los 10 minutos quieto; no en un rato sin puntos', () => {
    const lugar = { id: 1, lat: -34.6 + 3000 * METRO, lon: -58.4, radio_m: 150 };
    const conParada = seguido().ir([3000, 0], AUTO, AUTO_M).parar(6, 60).ir([6000, 0], AUTO, AUTO_M).puntos;
    expect(viajesDelDia(conParada, [lugar])).toHaveLength(2);
    expect(viajesDelDia(conParada, [])).toHaveLength(1); // 6 minutos en un lugar cualquiera no corta
    const conMas = seguido().ir([3000, 0], AUTO, AUTO_M).parar(12, 60).ir([6000, 0], AUTO, AUTO_M).puntos;
    expect(viajesDelDia(conMas, [])).toHaveLength(2);
    // Sin puntos pero avanzando: el teléfono no mandó, el viaje es uno.
    const r = seguido().ir([3000, 0], AUTO, AUTO_M);
    r.t += 30 * 60000;
    r.donde = [23000, 0];
    r.ir([26000, 0], AUTO, AUTO_M);
    expect(viajesDelDia(r.puntos, [])).toHaveLength(1);
  });
});

describe('con cualquier temblor del GPS da lo mismo', () => {
  const semillas = Array.from({ length: 25 }, (_, i) => i * 37 + 11);
  for (const temblor of [8, 30]) {
    it(`±${temblor / 2} m: los casos de siempre, con ${semillas.length} temblores distintos`, () => {
      for (const s of semillas) {
        const r = () => new Recorrido(min(0), [0, 0], temblor, s);
        // A pie, auto, a pie.
        const ida = r().ir([400, 0], PIE, PIE_M).parar(1, 10).ir([7000, 0], AUTO, AUTO_M).parar(1, 10).ir([7000, 400], PIE, PIE_M).parar(40, 300).puntos;
        expect(viajesDelDia(ida)).toHaveLength(1);
        expect(tipos(clasificarDia(ida))).toEqual(['a_pie', 'vehiculo', 'a_pie']);
        // Una vuelta con el perro, con paradas.
        const perro = r().ir([300, 0], 1.1, PIE_M).parar(3, 15).ir([300, 300], 1.1, PIE_M).ir([0, 300], 1.1, PIE_M).parar(2, 15).ir([0, 0], 1.1, PIE_M).puntos;
        expect(tipos(clasificarDia(perro))).toEqual(['a_pie']);
        expect(viajesDelDia(perro)).toEqual([]);
        expect(paseosDelDia(perro)).toHaveLength(1);
        // Un embotellamiento.
        const atasco = r().ir([2500, 0], AUTO, AUTO_M).ir([3500, 0], 1, 15).ir([7000, 0], AUTO, AUTO_M).puntos;
        expect(tipos(clasificarDia(atasco))).toEqual(['vehiculo']);
        // Ralo: de A a B a pie, un punto cada 4 minutos.
        const ralo = r().ir([3000, 0], PIE, 330).puntos;
        expect(tipos(clasificarDia(ralo))).toEqual(['a_pie']);
        expect(viajesDelDia(ralo)).toEqual([]);
        // Ralo: en auto, un punto cada 3 minutos.
        const raloAuto = r().ir([10000, 0], AUTO, 2000).puntos;
        expect(tipos(clasificarDia(raloAuto))).toEqual(['vehiculo']);
      }
    });
  }
});

describe('qué se adivina de un viaje', () => {
  it('un viaje ya es en vehículo: lento es tráfico, no caminando; sin saberlo, como siempre', () => {
    expect(adivinarViaje(2, 30, { bici: false }).modo).toBe('auto');
    expect(adivinarViaje(2, 30).modo).toBe('caminando');
    expect(adivinarViaje(10, 20, { bici: false }).modo).toBe('auto');
  });
});

describe('el recorte de un rato (el mapa de una actividad)', () => {
  it('solo lo que fue de ese tipo: una caminata anotada que se cruza con un auto no dibuja el auto ni suma sus km', () => {
    const puntos = seguido().ir([800, 0], PIE, PIE_M).parar(1).ir([20000, 0], AUTO, AUTO_M).parar(1).ir([20200, 0], PIE, PIE_M).puntos;
    const t = clasificarDia(puntos);
    const r = recorteDe(t, 'a_pie', min(0), min(60));
    expect(r.metros).toBeGreaterThan(600);
    expect(r.metros).toBeLessThan(1000);
    expect(Math.max(...r.puntos.map((p) => distanciaMetros(p, puntos[0])))).toBeLessThan(1000);
    const v = recorteDe(t, 'vehiculo', min(0), min(60));
    expect(enKm(v.metros)).toBeGreaterThan(18);
    // Un rato sin nada de ese tipo no tiene camino.
    expect(recorteDe(t, 'a_pie', min(14), min(25)).puntos).toEqual([]);
  });
});

describe('con la base', () => {
  afterAll(() => cerrarDb());
  // Hace unas horas, para que nada quede fuera de los 90 días ni en el futuro.
  const base = Date.now() - 8 * 3600000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const aPuntos = (l: Punto[]) => l.map((p) => ({ lat: p.lat, lon: p.lon, precision: p.precision_m, movimiento: true, instante: iso(p.instante) }));
  const de = (m: number) => base + m * 60000;
  const enTandas = async (ana: { post: (r: string, b: unknown) => Promise<{ status: number }> }, personaId: number, l: Punto[]) => {
    const todos = aPuntos(l);
    for (let i = 0; i < todos.length; i += 400) expect((await ana.post('/api/ubicacion', { persona_id: personaId, puntos: todos.slice(i, i + 400) })).status).toBe(200);
  };

  it('una caminata falsa de los pasos, en pleno viaje, no se muestra ni se cuenta; si se borran los puntos, vuelve', async () => {
    const { ana, personaId } = await conAdmin();
    const puntos = new Recorrido(de(0)).ir([15000, 0], AUTO, AUTO_M).puntos;
    await enTandas(ana, personaId, puntos);
    const db = obtenerDb();
    const { sql } = await import('drizzle-orm');
    const { filas } = await import('../src/db/client.js');
    const dia = (await filas<{ fecha: string }>(db, sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM puntos WHERE persona_id = ${personaId} LIMIT 1`))[0].fecha;
    const caminatas = [
      { inicio: iso(de(3)), fin: iso(de(18)), pasos: 1200 }, // en el auto
      { inicio: iso(de(200)), fin: iso(de(215)), pasos: 1400 }, // más tarde, sin puntos: se le cree
    ];
    expect((await ana.post('/api/actividad/caminatas', { persona_id: personaId, dias: [{ fecha: dia, caminatas }] })).status).toBe(200);
    const ver = async () => (await ana.get(`/api/actividad/caminatas?persona=${personaId}&fecha=${dia}`)).body.map((x: any) => Date.parse(x.inicio));
    expect(await ver()).toEqual([de(200)]);
    const auto = (await ana.get(`/api/registros/automaticos?persona=${personaId}&fecha=${dia}`)).body.find((x: any) => x.concepto === 'Caminata');
    expect(auto.cantidad).toBe(1);
    // Volver a sincronizar lo mismo no la resucita.
    await ana.post('/api/actividad/caminatas', { persona_id: personaId, dias: [{ fecha: dia, caminatas }] });
    expect(await ver()).toEqual([de(200)]);
    // Recalcular (cambió la forma de contar) tampoco.
    await recalcularSiCambio(db, `prueba-${Date.now()}`);
    expect(await ver()).toEqual([de(200)]);
    // El viaje sigue contando, y los km son del vehículo.
    const hoja = (await ana.get(`/api/ubicacion/dia?persona=${personaId}&fecha=${dia}`)).body;
    expect(hoja.viajes).toBe(1);
    expect(hoja.km).toBeGreaterThan(14);
    // No se perdió nada: sin puntos, vuelve.
    await ana.del(`/api/ubicacion?persona=${personaId}`);
    expect((await ver()).sort()).toEqual([de(3), de(200)]);
  });

  it('cada mapa, lo suyo: a pie sin el auto y en vehículo sin lo caminado, con sus km aparte', async () => {
    const { ana, personaId } = await conAdmin();
    const puntos = new Recorrido(de(0)).ir([1000, 0], PIE, PIE_M).parar(1).ir([9000, 0], AUTO, AUTO_M).parar(1).ir([9000, 700], PIE, PIE_M).puntos;
    await enTandas(ana, personaId, puntos);
    const { filas } = await import('../src/db/client.js');
    const { sql } = await import('drizzle-orm');
    const db = obtenerDb();
    const dia = (await filas<{ fecha: string }>(db, sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM puntos WHERE persona_id = ${personaId} LIMIT 1`))[0].fecha;

    const aPie = (await ana.get(`/api/ubicacion/recorrido?persona=${personaId}&fecha=${dia}&tipo=a_pie`)).body;
    expect(aPie.rutas).toHaveLength(2);
    const lejos = (l: Array<{ lat: number; lon: number }>, c: { lat: number; lon: number }) => Math.max(...l.map((p) => distanciaMetros(p, c)));
    expect(lejos(aPie.rutas[0].puntos, aPie.rutas[0].puntos[0])).toBeLessThan(1300); // no llega hasta donde fue el auto
    expect(aPie.rutas[0].km).toBeCloseTo(1, 0);

    const vehiculo = (await ana.get(`/api/ubicacion/recorrido?persona=${personaId}&fecha=${dia}&tipo=vehiculo`)).body;
    expect(vehiculo.rutas).toHaveLength(1);
    expect(vehiculo.rutas[0].km).toBeCloseTo(8, 0);

    // Las mediciones del día.
    const auto = (await ana.get(`/api/registros/automaticos?persona=${personaId}&fecha=${dia}`)).body;
    const valor = (c: string) => auto.find((x: any) => x.concepto === c)?.suma;
    expect(valor('Viajes')).toBe(1);
    expect(valor('Km en vehículo')).toBeCloseTo(8, 0);
    expect(valor('Km a pie')).toBeCloseTo(1.7, 0);
    expect(valor('Km recorridos')).toBeUndefined();

    // La tarjeta de una caminata: solo esa caminata, con su velocidad; aunque el rato pedido incluya el auto.
    const r = (await ana.get(`/api/ubicacion/camino?persona=${personaId}&desde=${iso(de(0))}&hasta=${iso(de(25))}&tipo=a_pie`)).body;
    expect(r.km).toBeCloseTo(1, 0);
    expect(lejos(r.camino, r.camino[0])).toBeLessThan(1300);
    const v = (await ana.get(`/api/ubicacion/camino?persona=${personaId}&desde=${iso(de(0))}&hasta=${iso(de(25))}&tipo=vehiculo`)).body;
    expect(v.km).toBeCloseTo(8, 0);

    // Los viajes del día: uno solo, en auto, con su mapita.
    const viajes = (await ana.get(`/api/ubicacion/viajes?persona=${personaId}&fecha=${dia}`)).body;
    expect(viajes).toHaveLength(1);
    expect(viajes[0].modo).toBe('auto');
    expect(viajes[0].km).toBeCloseTo(8, 0);
  });

  it('cada caminata y cada viaje, con lo suyo: de un solo clasificarDia, y un día sin datos no rompe', async () => {
    const { ana, personaId } = await conAdmin();
    const db = obtenerDb();
    const { filas } = await import('../src/db/client.js');
    const { sql } = await import('drizzle-orm');
    const casa = await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Casa', lat: -34.6, lon: -58.4, radio_m: 100 });
    expect(casa.status).toBeLessThan(300);
    const puntos = new Recorrido(de(0)).ir([1000, 0], PIE, PIE_M).parar(1).ir([9000, 0], AUTO, AUTO_M).parar(1).ir([9000, 700], PIE, PIE_M).puntos;
    await enTandas(ana, personaId, puntos);
    const dia = (await filas<{ fecha: string }>(db, sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM puntos WHERE persona_id = ${personaId} LIMIT 1`))[0].fecha;

    // Una caminata de los pasos, con sus pasos, que cubre la primera vuelta a pie.
    const sync = await ana.post('/api/actividad/caminatas', { persona_id: personaId, dias: [{ fecha: dia, caminatas: [{ inicio: iso(de(0)), fin: iso(de(14)), pasos: 1400 }] }] });
    expect(sync.status).toBe(200);

    const pie = (await ana.get(`/api/ubicacion/recorrido?persona=${personaId}&fecha=${dia}&tipo=a_pie`)).body.rutas;
    expect(pie).toHaveLength(2);
    expect(pie[0].origen.lugar).toBe('Casa');
    expect(pie[0].destino.lugar).toBeNull();
    expect(pie[0].minutos).toBeGreaterThan(5);
    expect(pie[0].kmh).toBeGreaterThan(2);
    expect(pie[0].kmh).toBeLessThan(8);
    expect(pie[0].pasos).toBeGreaterThan(500);
    expect(pie[0].pasos).toBeLessThanOrEqual(1400);
    expect(pie[1].pasos).toBeNull(); // la segunda no tiene caminata: no se inventa
    expect(pie[1].origen.lugar).toBeNull();

    const viajes = (await ana.get(`/api/ubicacion/recorrido?persona=${personaId}&fecha=${dia}&tipo=vehiculo`)).body.rutas;
    expect(viajes).toHaveLength(1);
    expect(viajes[0].km).toBeCloseTo(8, 0);
    expect(viajes[0].kmh).toBeGreaterThan(16);
    expect(viajes[0].pasos).toBeNull();
    expect(Date.parse(viajes[0].inicio)).toBeGreaterThanOrEqual(Date.parse(pie[0].fin));
    expect(Date.parse(viajes[0].fin)).toBeLessThanOrEqual(Date.parse(pie[1].inicio));

    // Los mismos ratos que dice la clasificación, y lo mismo que cuentan los viajes del día.
    const del = (await ana.get(`/api/ubicacion/viajes?persona=${personaId}&fecha=${dia}`)).body;
    expect(del.map((v: any) => v.inicio)).toEqual(viajes.map((v: any) => v.inicio));

    // Sin datos.
    const vacio = (await ana.get(`/api/ubicacion/recorrido?persona=${personaId}&fecha=2020-01-01&tipo=a_pie`)).body;
    expect(vacio.rutas).toEqual([]);

    // Volver a sincronizar sin los pasos los saca (el día se reemplaza entero), y la caminata sigue.
    await ana.post('/api/actividad/caminatas', { persona_id: personaId, dias: [{ fecha: dia, caminatas: [{ inicio: iso(de(0)), fin: iso(de(14)) }] }] });
    const sinPasos = (await ana.get(`/api/ubicacion/recorrido?persona=${personaId}&fecha=${dia}&tipo=a_pie`)).body.rutas;
    expect(sinPasos[0].pasos).toBeNull();
    expect((await ana.get(`/api/actividad/caminatas?persona=${personaId}&fecha=${dia}`)).body).toHaveLength(1);
  });

  it('la dirección de una punta se pide aparte, y con una persona que no es tuya no', async () => {
    const { ana, personaId } = await conAdmin();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ address: { road: 'Av. Cabildo', house_number: '2100', suburb: 'Belgrano' } }), { headers: { 'Content-Type': 'application/json' } }));
    try {
      const r = await ana.get(`/api/ubicacion/direccion?persona=${personaId}&lat=-34.5612&lon=-58.4561`);
      expect(r.status).toBe(200);
      expect(r.body.direccion).toBe('Av. Cabildo 2100, Belgrano');
      expect((await ana.get(`/api/ubicacion/direccion?persona=${personaId}&lat=200&lon=0`)).status).toBe(400);
      expect((await ana.get(`/api/ubicacion/direccion?persona=999999&lat=-34.5&lon=-58.4`)).status).toBeGreaterThanOrEqual(403);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('un tramo solo: recorridosDe da ese, y los pasos se reparten por el tiempo que comparten', () => {
    const puntos = new Recorrido(min(0)).ir([1000, 0], PIE, PIE_M).puntos;
    const tramos = clasificarDia(puntos);
    const fin = tramos.find((t) => t.tipo === 'a_pie')!.fin;
    const inicio = tramos.find((t) => t.tipo === 'a_pie')!.inicio;
    const [r, ...resto] = recorridosDe(tramos, 'a_pie', [], { ratos: [{ inicio, fin, pasos: 1000 }] });
    expect(resto).toEqual([]);
    expect(r.pasos).toBe(1000);
    expect(r.metros).toBeGreaterThan(800);
    expect(r.origen).toMatchObject({ lugar: null });
    expect(recorridosDe(tramos, 'vehiculo')).toEqual([]);
    expect(recorridosDe([], 'a_pie')).toEqual([]);

    const h = 3600000;
    expect(pasosDelTramo({ ratos: [{ inicio: 0, fin: 2 * h, pasos: 2000 }] }, 0, h)).toBe(1000);
    expect(pasosDelTramo({ ratos: [{ inicio: 0, fin: h / 4, pasos: 2000 }] }, 0, h)).toBeNull(); // cubre muy poco
    expect(pasosDelTramo({ ratos: [{ inicio: 0, fin: h }] }, 0, h)).toBeNull();
    expect(pasosDelTramo(undefined, 0, h)).toBeNull();
  });

  it('un paseo pendiente que en realidad fue en auto ya no se pregunta; uno de verdad, con solo su camino', async () => {
    const { ana, personaId } = await conAdmin();
    const db = obtenerDb();
    const { sql } = await import('drizzle-orm');
    const puntos = new Recorrido(de(0)).ir([700, 0], PIE, PIE_M).parar(1).ir([9000, 0], AUTO, AUTO_M).puntos;
    await enTandas(ana, personaId, puntos);
    const finPie = de(9);
    const finAuto = puntos.at(-1)!.instante;
    await db.execute(sql`INSERT INTO paseos_detectados (persona_id, inicio, fin, metros) VALUES
      (${personaId}, ${iso(de(0))}, ${iso(finPie)}, 700),
      (${personaId}, ${iso(finPie + 120000)}, ${iso(finAuto)}, 8000)`);
    const r = (await ana.get(`/api/paseos?persona=${personaId}`)).body;
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0].metros).toBe(700);
    expect(Math.max(...r.pendientes[0].camino.map((p: any) => distanciaMetros(p, r.pendientes[0].camino[0])))).toBeLessThan(800);
  });
});
