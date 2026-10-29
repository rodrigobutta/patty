// Qué dice la ubicación de un día: cuántos viajes hubo, cuántos km y en qué lugares con nombre estuvo la persona.
// Sin base de datos: recibe los puntos del día (ya filtrados: uno por cada movimiento de más de 1 km o cambio de lugar)
// y los lugares, así se prueba con datos armados.
import { DISTANCIA_VIAJE_M, distanciaMetros, lugarDe, type Coordenadas } from 'shared';

export interface Punto extends Coordenadas {
  /** ms */
  instante: number;
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

export function resumirDia(puntosDia: Punto[], lugares: LugarZona[]): ResumenDia {
  const orden = [...puntosDia].sort((a, b) => a.instante - b.instante);
  // Viajes: los tramos seguidos en movimiento (ver viajesDelDia), no cada kilómetro: un viaje de 10 km en auto es uno
  // solo. Los km son los de esos viajes, en línea recta entre los puntos.
  const vs = viajesDelDia(orden, lugares);
  const viajes = vs.length;
  const metros = vs.reduce((t, v) => t + v.metros, 0);
  // Estadías: puntos seguidos en el mismo lugar con nombre.
  const estadias: Estadia[] = [];
  let actual: Estadia | null = null;
  for (const p of orden) {
    const l = lugarDe(p, lugares);
    if (actual && l?.id === actual.lugar_id) {
      actual.salida = p.instante;
      continue;
    }
    if (actual) actual.salida = p.instante; // se fue: el primer punto afuera marca la salida
    actual = l ? { lugar_id: l.id, llegada: p.instante, salida: p.instante } : null;
    if (actual) estadias.push(actual);
  }
  return { viajes, km: Math.round(metros / 100) / 10, estadias };
}

export interface Parada extends Coordenadas {
  /** ms en que llegó (el punto guardado ahí) y en que se fue (el siguiente punto, ya lejos, o `fin`) */
  llegada: number;
  salida: number;
}

/** Desde cuánto tiempo en un mismo lugar sin nombre se pregunta qué lugar es. */
export const PARADA_MIN = 30;

/**
 * Dónde se quedó un buen rato sin que sea un lugar con nombre: un punto guardado (el teléfono manda uno cada vez que
 * se mueve más de 1 km) y el siguiente bastante después. Es aproximado: entre uno y otro también está el viaje.
 * `fin` es hasta cuándo cuenta el último punto del día (ahora, si es hoy).
 */
export function paradasSinNombre(puntosDia: Punto[], lugares: LugarZona[], fin: number): Parada[] {
  const orden = [...puntosDia].sort((a, b) => a.instante - b.instante);
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
}

/** Entre dos puntos de un mismo viaje no pasa más que esto (en movimiento, el teléfono guarda uno cada ~150 m). */
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
 * Los viajes del día con los puntos guardados (uno cada ~150 m al moverse, o al entrar o salir de un lugar): puntos
 * seguidos en movimiento, sin quedarse en ningún lado en el medio. Si entre un punto y el siguiente pasaron más de 20
 * minutos, o si el punto es en un lugar con nombre (llegó a casa, al súper), ahí hubo una parada y empieza otro viaje.
 * Así un viaje de 10 km en auto es uno solo. Las vueltas a pie que terminan donde empezaron (sacar al perro) son
 * caminatas, no viajes: no se cuentan. La salida es aproximada (el primer punto ya es en camino).
 */
export function viajesDelDia(puntosDia: Punto[], lugares: LugarZona[] = []): Viaje[] {
  const orden = sinSaltos([...puntosDia].sort((a, b) => a.instante - b.instante));
  const r: Array<Viaje & { desde: Punto; hasta: Punto; camino: Coordenadas[] }> = [];
  let actual: (Viaje & { desde: Punto; hasta: Punto; camino: Coordenadas[] }) | null = null;
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    const d = distanciaMetros(a, b);
    if (d < TRAMO_M) continue;
    const largo = b.instante - a.instante > CONTINUO_MIN * 60000;
    const seguido = actual !== null && actual.fin === a.instante && !largo && !lugarDe(a, lugares);
    if (seguido) {
      actual!.fin = b.instante;
      actual!.metros += d;
      actual!.hasta = b;
      actual!.camino.push({ lat: b.lat, lon: b.lon });
    } else {
      // Si estuvo un rato quieto antes, salió en algún momento de ese rato: lo que tarda en hacer ese tramo a velocidad de
      // ciudad, antes de llegar al punto (la hora de salida es aproximada). Antes empezaba en el mismo punto y un tramo
      // largo quedaba en un minuto: 400 km/h.
      const inicio = largo ? Math.max(a.instante, b.instante - Math.round((d / SALIDA_MS) * 1000)) : a.instante;
      actual = { inicio, fin: b.instante, metros: d, desde: a, hasta: b, camino: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }] };
      r.push(actual);
    }
  }
  return r
    .filter((v) => v.metros >= VIAJE_M)
    .filter((v) => !esVuelta(v))
    .filter((v) => v.metros / 1000 / Math.max((v.fin - v.inicio) / 3600000, 1 / 60) <= VIAJE_MAX_KMH)
    .map(({ inicio, fin, metros, camino }) => ({ inicio, fin, metros, camino }));
}

/** Una vuelta a pie: termina cerca de donde empezó, a paso de caminata. */
function esVuelta(v: Viaje & { desde: Punto; hasta: Punto }): boolean {
  const horas = Math.max((v.fin - v.inicio) / 3600000, 1 / 60);
  return distanciaMetros(v.desde, v.hasta) < VUELTA_M && v.metros / 1000 / horas < CAMINANDO_KMH;
}

/** Un paseo es de al menos esto (unas cuadras) y este tiempo. */
const PASEO_M = 300;
const PASEO_MIN = 5;

/**
 * Los paseos del día: las vueltas a pie que terminan donde empezaron (sacar a los perros, dar una vuelta), de unas
 * cuadras para arriba. Son las que viajesDelDia deja afuera; Patty las sugiere para anotar (patrones/paseos.ts).
 */
export function paseosDelDia(puntosDia: Punto[], lugares: LugarZona[] = []): Viaje[] {
  const orden = [...puntosDia].sort((a, b) => a.instante - b.instante);
  const r: Array<Viaje & { desde: Punto; hasta: Punto }> = [];
  let actual: (Viaje & { desde: Punto; hasta: Punto }) | null = null;
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    const d = distanciaMetros(a, b);
    if (d < TRAMO_M) continue;
    const largo = b.instante - a.instante > CONTINUO_MIN * 60000;
    const seguido = actual !== null && actual.fin === a.instante && !largo && !lugarDe(a, lugares);
    if (seguido) {
      actual!.fin = b.instante;
      actual!.metros += d;
      actual!.hasta = b;
    } else {
      // Si sale de un lugar suyo (casa) después de estar quieto, la vuelta empieza ahí: a paso de caminata, un rato
      // antes del primer punto en camino.
      const deUnLugar = largo && lugarDe(a, lugares);
      const inicio = largo ? (deUnLugar ? Math.max(a.instante, b.instante - (d / 1.4) * 1000) : b.instante) : a.instante;
      actual = { inicio, fin: b.instante, metros: d, desde: largo && !deUnLugar ? b : a, hasta: b };
      r.push(actual);
    }
  }
  return r
    .filter((v) => v.metros >= PASEO_M && v.fin - v.inicio >= PASEO_MIN * 60000 && esVuelta(v))
    .map(({ inicio, fin, metros }) => ({ inicio, fin, metros }));
}
