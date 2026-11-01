// Qué dice la ubicación de un día: cuántos viajes hubo, cuántos km y en qué lugares con nombre estuvo la persona.
// Sin base de datos: recibe los puntos del día y los lugares, así se prueba con datos armados. Qué fue cada rato (quieto,
// a pie, en vehículo) lo decide movimiento.ts; acá solo se cuenta.
import { distanciaMetros, lugarDe, type Coordenadas } from 'shared';
import { viajesDelDia, type Pasos, type Viaje } from './movimiento.js';
import { puntosDeMovimiento, type LugarZona, type Punto } from './puntos.js';

export * from './puntos.js';
export { clasificarDia, paseosDelDia, viajesDelDia, type Pasos, type Tramo, type Viaje } from './movimiento.js';

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

export function resumirDia(puntosDia: Punto[], lugares: LugarZona[], pasos?: Pasos): ResumenDia {
  const orden = [...puntosDia].sort((a, b) => a.instante - b.instante);
  // Viajes: lo que fue en vehículo (ver viajesDelDia), no cada kilómetro: un viaje de 10 km en auto es uno solo. Los km
  // son solo los de esos viajes, en línea recta entre los puntos (ver metrosDe); lo caminado no suma acá.
  const vs = viajesDelDia(orden, lugares, pasos);
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
 * Si hubo tráfico: un buen rato a paso de hombre (un viaje ya es en vehículo: lo caminado no llega acá), o bastante más de
 * lo que tarda habitualmente ese recorrido.
 */
export function huboTrafico(v: Viaje, habitual: number | null): boolean {
  const minutos = (v.fin - v.inicio) / 60000;
  const lento = (v.lento_min ?? 0) >= 8;
  const tarde = habitual !== null && minutos >= habitual * 1.35 && minutos - habitual >= 8;
  return lento || tarde;
}
