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
}

/** Entre dos puntos de un mismo viaje no pasa más que esto (en movimiento, el teléfono guarda uno cada ~150 m). */
const CONTINUO_MIN = 20;
/** Menos que esto entre dos puntos es el GPS que tiembla, no un movimiento. */
const TRAMO_M = 60;
/** Un viaje es de al menos esto (las vueltas cortas no cuentan). */
const VIAJE_M = DISTANCIA_VIAJE_M;
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
      // Si estuvo un rato quieto antes, el viaje empezó cerca del final de ese tramo (la hora de salida es aproximada).
      actual = { inicio: largo ? b.instante : a.instante, fin: b.instante, metros: d, desde: largo ? b : a, hasta: b };
      r.push(actual);
    }
  }
  return r
    .filter((v) => v.metros >= VIAJE_M)
    .filter((v) => !esVuelta(v))
    .map(({ inicio, fin, metros }) => ({ inicio, fin, metros }));
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
