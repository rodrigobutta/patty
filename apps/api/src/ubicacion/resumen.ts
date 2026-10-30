// Qué dice la ubicación de un día: cuántos viajes hubo, cuántos km y en qué lugares con nombre estuvo la persona.
// Sin base de datos: recibe los puntos del día y los lugares, así se prueba con datos armados.
//
// La cantidad de puntos depende del teléfono: cada ~150 m los que mandan pocos, cada 15 m los que siguen el recorrido
// mientras uno camina. Para que eso no cambie las cuentas, lo que pasó (viajes, paseos, paradas) se decide siempre con
// `puntosDeMovimiento`, que deja uno cada ~150 m: el temblor del GPS no llega ahí. Los puntos finos solo se usan después,
// para el dibujo (`caminoLimpio`) y para medir mejor los km de lo que ya se sabe que fue un viaje (`metrosDe`).
import { DISTANCIA_PUNTO_M, DISTANCIA_VIAJE_M, distanciaMetros, lugarDe, type Coordenadas } from 'shared';

export interface Punto extends Coordenadas {
  /** ms */
  instante: number;
  /** Cuánto dice el GPS que se puede equivocar (m). Null si no se sabe (un atajo del teléfono, por ejemplo). */
  precision_m?: number | null;
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
function sinPicos(puntos: Punto[]): Punto[] {
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

export interface LugarZona extends Coordenadas {
  id: number;
  radio_m: number;
}

export interface Estadia {
  lugar_id: number;
  /** ms del primer punto en el lugar */
  llegada: number;
  /** ms del primer punto afuera (o del último adentro, si el día terminó ahí) */
  salida: number;
}

export interface ResumenDia {
  viajes: number;
  km: number;
  estadias: Estadia[];
}

/** Una estadía más corta que esto, si después siguió viaje, es pasar por la puerta: con puntos seguidos se ve siempre. */
const ESTADIA_MIN = 2;
/** Salir y volver al mismo lugar antes de esto es la misma estadía (caminar justo por el borde del radio). */
const MISMA_ESTADIA_MIN = 5;

export function resumirDia(puntosDia: Punto[], lugares: LugarZona[]): ResumenDia {
  const orden = [...puntosDia].sort((a, b) => a.instante - b.instante);
  // Viajes: los tramos seguidos en movimiento (ver viajesDelDia), no cada kilómetro: un viaje de 10 km en auto es uno
  // solo. Los km son los de esos viajes, en línea recta entre los puntos (ver metrosDe).
  const vs = viajesDelDia(orden, lugares);
  const viajes = vs.length;
  const metros = vs.reduce((t, v) => t + v.metros, 0);
  // Estadías: puntos seguidos en el mismo lugar con nombre.
  const estadias: Estadia[] = [];
  const cerradas = new Set<Estadia>();
  let actual: Estadia | null = null;
  for (const p of orden) {
    const l = lugarDe(p, lugares);
    if (actual && l?.id === actual.lugar_id) {
      actual.salida = p.instante;
      continue;
    }
    if (actual) {
      actual.salida = p.instante; // se fue: el primer punto afuera marca la salida
      cerradas.add(actual);
    }
    const previa = estadias.at(-1);
    if (l && previa?.lugar_id === l.id && p.instante - previa.salida < MISMA_ESTADIA_MIN * 60000) {
      previa.salida = p.instante;
      cerradas.delete(previa);
      actual = previa;
      continue;
    }
    actual = l ? { lugar_id: l.id, llegada: p.instante, salida: p.instante } : null;
    if (actual) estadias.push(actual);
  }
  return { viajes, km: Math.round(metros / 100) / 10, estadias: estadias.filter((e) => !cerradas.has(e) || e.salida - e.llegada >= ESTADIA_MIN * 60000) };
}

export interface Parada extends Coordenadas {
  /** ms en que llegó (el primer punto ahí) y en que se fue (el siguiente punto ya lejos, o `fin`) */
  llegada: number;
  salida: number;
}

/** Desde cuánto tiempo en un mismo lugar sin nombre se pregunta qué lugar es. */
export const PARADA_MIN = 30;

/**
 * Dónde se quedó un buen rato sin que sea un lugar con nombre: un punto y el siguiente ya lejos (ver puntosDeMovimiento)
 * bastante después. Es aproximado: entre uno y otro también está el viaje.
 * `fin` es hasta cuándo cuenta el último punto del día (ahora, si es hoy).
 */
export function paradasSinNombre(puntosDia: Punto[], lugares: LugarZona[], fin: number): Parada[] {
  const orden = puntosDeMovimiento([...puntosDia].sort((a, b) => a.instante - b.instante), lugares);
  const r: Parada[] = [];
  orden.forEach((p, i) => {
    if (lugarDe(p, lugares)) return;
    const salida = orden[i + 1]?.instante ?? fin;
    if (salida - p.instante < PARADA_MIN * 60000) return;
    // Dos puntos seguidos cerca (por ejemplo, el primero del día) son la misma parada.
    const anterior = r.at(-1);
    if (anterior && anterior.salida === p.instante && distanciaMetros(anterior, p) < 300) anterior.salida = salida;
    else r.push({ lat: p.lat, lon: p.lon, llegada: p.instante, salida });
  });
  return r;
}

export interface Viaje {
  inicio: number;
  fin: number;
  metros: number;
  /** Por dónde pasó (los puntos del viaje, en orden): para el mapita. */
  camino?: Coordenadas[];
  /** Minutos a paso de hombre (menos de 10 km/h) entre puntos seguidos del viaje: en auto o colectivo, tráfico. */
  lento_min?: number;
}

/** Entre dos puntos de un mismo viaje no pasa más que esto (ver puntosDeMovimiento: en movimiento, uno cada ~150 m). */
const CONTINUO_MIN = 20;
/** Menos que esto entre dos puntos es el GPS que tiembla, no un movimiento. */
const TRAMO_M = 60;
/** Un viaje es de al menos esto (las vueltas cortas no cuentan). */
const VIAJE_M = DISTANCIA_VIAJE_M;
/** Más rápido que esto entre dos puntos no es un viaje: es el GPS que saltó (o una vuelta en avión, que no se cuenta). */
const SALTO_KMH = 200;
/** Si después de estar quieto el primer punto en camino ya está lejos, se supone que fue a esta velocidad (m/s). */
const SALIDA_MS = 30 / 3.6;

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

/** Un viaje más rápido que esto en promedio no es posible por tierra: es ruido del GPS que quedó. */
const VIAJE_MAX_KMH = 160;

/** Una vuelta que termina donde empezó, a paso de caminata, es un paseo (una caminata), no un viaje. */
const VUELTA_M = 300;
const CAMINANDO_KMH = 7;

/**
 * Los viajes del día con los puntos de movimiento (uno cada ~150 m al moverse, o al entrar o salir de un lugar): puntos
 * seguidos en movimiento, sin quedarse en ningún lado en el medio. Si entre un punto y el siguiente pasaron más de 20
 * minutos, o si se quedó en un lugar con nombre (llegó a casa, al súper), ahí hubo una parada y empieza otro viaje.
 * Así un viaje de 10 km en auto es uno solo. Las vueltas a pie que terminan donde empezaron (sacar al perro) son
 * caminatas, no viajes: no se cuentan. La salida es aproximada (el primer punto ya es en camino).
 */
export function viajesDelDia(puntosDia: Punto[], lugares: LugarZona[] = []): Viaje[] {
  const finos = sinSaltos([...puntosDia].sort((a, b) => a.instante - b.instante));
  const orden = puntosDeMovimiento(finos, lugares);
  const parado = paradasEnLugares(orden, lugares);
  const r: Array<Viaje & { desde: Punto; hasta: Punto; siguiente?: Punto; lento_min: number }> = [];
  let actual: (Viaje & { desde: Punto; hasta: Punto; siguiente?: Punto; lento_min: number }) | null = null;
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    const d = distanciaMetros(a, b);
    const largo = b.instante - a.instante > CONTINUO_MIN * 60000;
    const seguido = actual !== null && actual.fin === a.instante && !largo && !parado[i - 1];
    if (d < TRAMO_M) {
      // Un punto cerca del anterior es que cruzó el borde de un lugar: no corta lo que venía.
      if (seguido) Object.assign(actual!, { fin: b.instante, hasta: b, siguiente: orden[i + 1] });
      continue;
    }
    if (seguido) {
      const min = (b.instante - a.instante) / 60000;
      if (min <= LENTO_HUECO_MIN && d / 1000 / (min / 60) < LENTO_KMH) actual!.lento_min += min;
      actual!.fin = b.instante;
      actual!.hasta = b;
      actual!.siguiente = orden[i + 1];
    } else {
      // Si estuvo un rato quieto antes, salió en algún momento de ese rato: lo que tarda en hacer ese tramo a velocidad de
      // ciudad, antes de llegar al punto (la hora de salida es aproximada). Antes empezaba en el mismo punto y un tramo
      // largo quedaba en un minuto: 400 km/h.
      const inicio = largo ? Math.max(a.instante, b.instante - Math.round((d / SALIDA_MS) * 1000)) : a.instante;
      actual = { inicio, fin: b.instante, metros: 0, desde: a, hasta: b, siguiente: orden[i + 1], lento_min: 0 };
      r.push(actual);
    }
  }
  return r
    .map((v) => {
      const tramo = puntosDelTramo(finos, v.desde, v.hasta, v.siguiente);
      return { ...v, tramo, metros: metrosDe(tramo) };
    })
    .filter((v) => v.metros >= VIAJE_M)
    .filter((v) => !esVuelta(v))
    .filter((v) => v.metros / 1000 / Math.max((v.fin - v.inicio) / 3600000, 1 / 60) <= VIAJE_MAX_KMH)
    .map(({ inicio, fin, metros, tramo, lento_min }) => ({ inicio, fin, metros, camino: caminoLimpio(tramo), lento_min: Math.round(lento_min) }));
}

/** Más lento que esto entre dos puntos seguidos es a paso de hombre: en un auto, tráfico. */
const LENTO_KMH = 10;
/** Entre puntos más separados que esto no se sabe qué pasó en el medio (no cuenta como lento). */
const LENTO_HUECO_MIN = 5;
/** Un viaje "igual" a otro: sale y llega a menos de esto de donde salió y llegó el otro. */
const MISMO_RECORRIDO_M = 600;

/**
 * Cuánto tarda habitualmente este mismo recorrido (salir y llegar cerca de los mismos lugares, en el mismo sentido):
 * la mediana de los viajes anteriores, si hay al menos dos. null si es un recorrido nuevo.
 */
export function minutosHabituales(v: Viaje, anteriores: Viaje[]): number | null {
  const ini = v.camino?.[0];
  const fin = v.camino?.at(-1);
  if (!ini || !fin) return null;
  const mismos = anteriores
    .filter((x) => x.camino?.length && distanciaMetros(x.camino[0], ini) < MISMO_RECORRIDO_M && distanciaMetros(x.camino.at(-1)!, fin) < MISMO_RECORRIDO_M)
    .map((x) => (x.fin - x.inicio) / 60000)
    .sort((a, b) => a - b);
  if (mismos.length < 2) return null;
  return Math.round(mismos[Math.floor(mismos.length / 2)]);
}

/**
 * Si hubo tráfico: un buen rato a paso de hombre yendo en algo con motor (el viaje en total no fue a pie), o bastante
 * más de lo que tarda habitualmente ese recorrido.
 */
export function huboTrafico(v: Viaje, habitual: number | null): boolean {
  const minutos = (v.fin - v.inicio) / 60000;
  const kmh = v.metros / 1000 / Math.max(minutos / 60, 1 / 60);
  const lento = (v.lento_min ?? 0) >= 8 && kmh >= 12;
  const tarde = habitual !== null && minutos >= habitual * 1.35 && minutos - habitual >= 8;
  return lento || tarde;
}

/** Una vuelta a pie: termina cerca de donde empezó, a paso de caminata. */
function esVuelta(v: Viaje & { desde: Punto; hasta: Punto }): boolean {
  const horas = Math.max((v.fin - v.inicio) / 3600000, 1 / 60);
  return distanciaMetros(v.desde, v.hasta) < VUELTA_M && v.metros / 1000 / horas < CAMINANDO_KMH;
}

/** Pasar por un lugar con nombre en menos que esto no es una parada: el viaje sigue. */
const PASO_DE_LARGO_MIN = 5;

/** En cada punto, si ahí hubo una parada en un lugar con nombre (no si solo pasó por ahí). */
function paradasEnLugares(orden: Punto[], lugares: LugarZona[]): boolean[] {
  const r = new Array<boolean>(orden.length).fill(false);
  for (let i = 0; i < orden.length; ) {
    const id = lugarDe(orden[i], lugares)?.id;
    let j = i + 1;
    while (j < orden.length && lugarDe(orden[j], lugares)?.id === id) j++;
    if (id !== undefined && (j === orden.length || orden[j].instante - orden[i].instante >= PASO_DE_LARGO_MIN * 60000)) r.fill(true, i, j);
    i = j;
  }
  return r;
}

/** Después del último punto del tramo, los que siguen hasta este rato (los últimos metros, ya cerca de donde paró). */
const COLA_MIN = 5;

/**
 * Los puntos finos de un tramo, de `desde` a `hasta` y lo que siguió hasta el próximo punto de movimiento. Sin los malos
 * (salvo las puntas), que no son para medir ni para dibujar.
 */
function puntosDelTramo(orden: Punto[], desde: Punto, hasta: Punto, siguiente: Punto | undefined): Punto[] {
  const tope = Math.min(hasta.instante + COLA_MIN * 60000, (siguiente?.instante ?? Infinity) - 1);
  return sinLosMalos(orden.filter((p) => p.instante >= desde.instante && p.instante <= tope), [desde, hasta]);
}

/** Un paseo es de al menos esto (unas cuadras) y este tiempo. */
const PASEO_M = 300;
const PASEO_MIN = 5;

/**
 * Los paseos del día: las vueltas a pie que terminan donde empezaron (sacar a los perros, dar una vuelta), de unas
 * cuadras para arriba. Son las que viajesDelDia deja afuera; Patty las sugiere para anotar (patrones/paseos.ts).
 */
export function paseosDelDia(puntosDia: Punto[], lugares: LugarZona[] = []): Viaje[] {
  const finos = [...puntosDia].sort((a, b) => a.instante - b.instante);
  const orden = puntosDeMovimiento(finos, lugares);
  const parado = paradasEnLugares(orden, lugares);
  const r: Array<Viaje & { desde: Punto; hasta: Punto; siguiente?: Punto }> = [];
  let actual: (Viaje & { desde: Punto; hasta: Punto; siguiente?: Punto }) | null = null;
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    const d = distanciaMetros(a, b);
    const largo = b.instante - a.instante > CONTINUO_MIN * 60000;
    const seguido = actual !== null && actual.fin === a.instante && !largo && !parado[i - 1];
    if (d < TRAMO_M) {
      // Un punto cerca del anterior es que cruzó el borde de un lugar: no corta lo que venía.
      if (seguido) Object.assign(actual!, { fin: b.instante, hasta: b, siguiente: orden[i + 1] });
      continue;
    }
    if (seguido) {
      actual!.fin = b.instante;
      actual!.hasta = b;
      actual!.siguiente = orden[i + 1];
    } else {
      // Si sale de un lugar suyo (casa) después de estar quieto, la vuelta empieza ahí: a paso de caminata, un rato
      // antes del primer punto en camino.
      const deUnLugar = largo && lugarDe(a, lugares);
      const inicio = largo ? (deUnLugar ? Math.max(a.instante, b.instante - (d / 1.4) * 1000) : b.instante) : a.instante;
      actual = { inicio, fin: b.instante, metros: d, desde: largo && !deUnLugar ? b : a, hasta: b, siguiente: orden[i + 1] };
      r.push(actual);
    }
  }
  return r
    .map((v) => ({ ...v, metros: metrosDe(puntosDelTramo(finos, v.desde, v.hasta, v.siguiente)) }))
    .filter((v) => v.metros >= PASEO_M && v.fin - v.inicio >= PASEO_MIN * 60000 && esVuelta(v))
    .map(({ inicio, fin, metros }) => ({ inicio, fin, metros }));
}
