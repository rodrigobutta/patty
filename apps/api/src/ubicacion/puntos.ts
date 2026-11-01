// Los puntos de ubicación y lo que se hace con ellos sin saber todavía qué fueron: sacar los malos y los saltos, dejar uno
// cada ~150 m para decidir, medir y dibujar.
//
// La cantidad de puntos depende del teléfono: cada ~150 m los que mandan pocos, cada 15 m los que siguen el recorrido
// mientras uno camina. Para que eso no cambie las cuentas, lo que pasó (ver movimiento.ts) se decide siempre con
// `puntosDeMovimiento`, que deja uno cada ~150 m: el temblor del GPS no llega ahí. Los puntos finos solo se usan después,
// para el dibujo (`caminoLimpio`) y para medir mejor los km de lo que ya se sabe qué fue (`metrosDe`).
import { DISTANCIA_PUNTO_M, distanciaMetros, lugarDe, type Coordenadas } from 'shared';

export interface LugarZona extends Coordenadas {
  id: number;
  radio_m: number;
}

export interface Punto extends Coordenadas {
  /** ms */
  instante: number;
  /** Cuánto dice el GPS que se puede equivocar (m). Null si no se sabe (un atajo del teléfono, por ejemplo). */
  precision_m?: number | null;
}

/** De cuándo a cuándo van esos puntos (sin desparramar la lista: en tres meses pueden ser muchísimos). */
export function rangoDe(puntos: Punto[]): { desde: number; hasta: number } {
  let desde = Infinity;
  let hasta = -Infinity;
  for (const p of puntos) {
    if (p.instante < desde) desde = p.instante;
    if (p.instante > hasta) hasta = p.instante;
  }
  return { desde, hasta };
}

/** Una fila de la tabla `puntos`, como se usa acá. */
export const puntoDeFila = (x: { instante: string; lat: number; lon: number; precision_m?: number | null }): Punto => ({
  instante: new Date(x.instante).getTime(),
  lat: x.lat,
  lon: x.lon,
  precision_m: x.precision_m,
});

/**
 * Peor que esto, un punto dice más o menos dónde estaba (sirve para saber en qué lugar) pero no se usa para dibujar el
 * camino: ~50 m es media cuadra, y los de la red celular llegan a 300 m.
 */
export const PRECISION_CAMINO_M = 50;
const esMalo = (p: Punto) => p.precision_m != null && p.precision_m > PRECISION_CAMINO_M;

/** Saca los puntos malos, salvo que casi no queden buenos (ahí una línea recta sería peor). */
export function sinLosMalos(puntos: Punto[], fijos: Punto[] = []): Punto[] {
  const buenos = puntos.filter((p) => !esMalo(p) || fijos.includes(p));
  return buenos.length >= 2 && buenos.length * 2 >= puntos.length ? buenos : puntos;
}

/**
 * Los puntos con los que se decide qué pasó: uno nuevo solo al alejarse ~150 m del anterior (un punto malo, además, lo que
 * se puede equivocar) o al cambiar de lugar. Son los mismos que quedaban cuando el servidor no guardaba otra cosa, así que
 * las cuentas no dependen de cuántos puntos manda el teléfono, y un GPS que tiembla en el lugar no arma km ni caminatas.
 */
export function puntosDeMovimiento(orden: Punto[], lugares: LugarZona[]): Punto[] {
  const r: Punto[] = [];
  for (const p of orden) {
    const a = r.at(-1);
    if (!a || distanciaMetros(a, p) >= DISTANCIA_PUNTO_M + (esMalo(p) ? p.precision_m! : 0) || lugarDe(a, lugares)?.id !== lugarDe(p, lugares)?.id) r.push(p);
  }
  return r;
}

/** Menos que esto desde el anterior no suma km: es el temblor del GPS, aun yendo por la calle. */
const ANCLA_KM_M = 25;

/**
 * Lo recorrido por esos puntos. Solo va de un punto al siguiente que esté a más de 25 m, así el temblor en un semáforo no
 * suma: con puntos cada 15 m, sumar todos los tramos da de más.
 */
export function metrosDe(puntos: Punto[]): number {
  const l = sinPicos(puntos);
  let metros = 0;
  let ancla = l[0];
  for (const p of l.slice(1)) {
    const d = distanciaMetros(ancla, p);
    if (d < ANCLA_KM_M) continue;
    metros += d;
    ancla = p;
  }
  return metros;
}

/** Un pico: un punto suelto que se va más que esto y vuelve casi al mismo lugar enseguida. */
const PICO_M = 30;
const PICO_MIN = 3;

/** Saca los picos: ir hasta un punto y volver casi al mismo lugar, en poco tiempo. Es el GPS que rebotó, no la persona. */
export function sinPicos(puntos: Punto[]): Punto[] {
  const r: Punto[] = [];
  puntos.forEach((p, i) => {
    const a = r.at(-1);
    const b = puntos[i + 1];
    if (a && b && b.instante - a.instante <= PICO_MIN * 60000) {
      const ida = distanciaMetros(a, p);
      const vuelta = distanciaMetros(p, b);
      if (Math.min(ida, vuelta) > PICO_M && distanciaMetros(a, b) < Math.min(ida, vuelta) / 2) return;
    }
    r.push(p);
  });
  return r;
}

/** Menos que esto del anterior no se dibuja: quedarse parado no hace garabatos. */
const QUIETO_DIBUJO_M = 10;
/** Se suaviza un punto solo si sus vecinos están más cerca que esto: a pie. En auto los puntos están lejos y el GPS anda bien. */
const SUAVE_M = 40;
/** Con más puntos que esto se sacan los que no cambian el dibujo (una calle recta no necesita uno cada 15 m). */
const MUCHOS_PUNTOS = 150;
const TOLERANCIA_M = 3;

const pesoDe = (p: Punto) => 1 / Math.max(5, p.precision_m ?? 15) ** 2;

/**
 * El camino para dibujar en un mapa: sin los puntos malos ni los picos, sin garabatos al estar parado y con un suavizado
 * leve a pie (cada punto, promediado con sus dos vecinos según la precisión de cada uno). No inventa nada: no se pega a las
 * calles (el servidor público de rutas solo sabe de autos, y un parque o una vereda no están en su mapa).
 */
export function caminoLimpio(puntos: Punto[]): Coordenadas[] {
  const r: Punto[] = [];
  for (const p of sinPicos(sinLosMalos(puntos))) {
    const a = r.at(-1);
    if (!a || distanciaMetros(a, p) >= QUIETO_DIBUJO_M) r.push(p);
  }
  const suave = r.map((p, i) => {
    const a = r[i - 1];
    const b = r[i + 1];
    if (!a || !b || distanciaMetros(a, p) > SUAVE_M || distanciaMetros(p, b) > SUAVE_M) return { lat: p.lat, lon: p.lon };
    const [pa, pp, pb] = [pesoDe(a), 2 * pesoDe(p), pesoDe(b)];
    const total = pa + pp + pb;
    return { lat: (a.lat * pa + p.lat * pp + b.lat * pb) / total, lon: (a.lon * pa + p.lon * pp + b.lon * pb) / total };
  });
  return suave.length > MUCHOS_PUNTOS ? simplificar(suave) : suave;
}

/** Saca los puntos que no cambian el dibujo (Douglas-Peucker: los que quedan a menos de 3 m de la línea). */
function simplificar(l: Coordenadas[]): Coordenadas[] {
  const queda = new Array<boolean>(l.length).fill(false);
  queda[0] = queda[l.length - 1] = true;
  const pendientes: Array<[number, number]> = [[0, l.length - 1]];
  const metrosLat = 111195;
  const metrosLon = metrosLat * Math.cos((l[0].lat * Math.PI) / 180);
  while (pendientes.length) {
    const [i, j] = pendientes.pop()!;
    const dx = (l[j].lon - l[i].lon) * metrosLon;
    const dy = (l[j].lat - l[i].lat) * metrosLat;
    const largo2 = dx * dx + dy * dy;
    let lejos = -1;
    let dLejos = TOLERANCIA_M;
    for (let k = i + 1; k < j; k++) {
      const x = (l[k].lon - l[i].lon) * metrosLon;
      const y = (l[k].lat - l[i].lat) * metrosLat;
      const t = largo2 ? Math.max(0, Math.min(1, (x * dx + y * dy) / largo2)) : 0;
      const d = Math.hypot(x - t * dx, y - t * dy);
      if (d > dLejos) [lejos, dLejos] = [k, d];
    }
    if (lejos < 0) continue;
    queda[lejos] = true;
    pendientes.push([i, lejos], [lejos, j]);
  }
  return l.filter((_, i) => queda[i]);
}

/** Más rápido que esto entre dos puntos no es un viaje: es el GPS que saltó (o una vuelta en avión, que no se cuenta). */
const SALTO_KMH = 200;

/**
 * Saca los saltos del GPS: uno o varios puntos seguidos que quedan lejísimos (llegar ahí habría sido a más de 200 km/h)
 * y después vuelve a donde estaba. Si más adelante (hasta 6 puntos) hay uno cerca de donde estaba, al que sí se pudo
 * llegar a una velocidad posible, lo del medio se saca. Sin eso, un par de puntos mal puestos armaban un viaje de 100 km en 15 minutos.
 */
export function sinSaltos(orden: Punto[]): Punto[] {
  const kmh = (a: Punto, b: Punto) => distanciaMetros(a, b) / 1000 / Math.max((b.instante - a.instante) / 3600000, 1 / 3600);
  const r: Punto[] = [];
  for (let i = 0; i < orden.length; i++) {
    const a = r.at(-1);
    if (a && kmh(a, orden[i]) > SALTO_KMH) {
      const lejos = distanciaMetros(a, orden[i]);
      const vuelve = orden.slice(i + 1, i + 7).findIndex((c) => kmh(a, c) <= SALTO_KMH && distanciaMetros(a, c) < lejos / 3);
      // Vuelve a algo posible: lo del medio era el salto.
      if (vuelve >= 0) {
        i += vuelve;
        continue;
      }
      // No vuelve, pero desde acá sigue a una velocidad posible: el que saltó era el anterior (el primero del día, por
      // ejemplo). Si tampoco, se saca este.
      const siguiente = orden[i + 1];
      if (siguiente && kmh(orden[i], siguiente) <= SALTO_KMH) r.pop();
      else continue;
    }
    r.push(orden[i]);
  }
  return r;
}
