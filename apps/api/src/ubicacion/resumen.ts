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
  // Viajes: cada vez que se alejó más de 1 km del último punto donde estuvo. Los km son en línea recta entre esos puntos.
  let viajes = 0;
  let metros = 0;
  let ancla: Punto | null = null;
  for (const p of orden) {
    if (!ancla) {
      ancla = p;
      continue;
    }
    const d = distanciaMetros(ancla, p);
    if (d >= DISTANCIA_VIAJE_M) {
      viajes++;
      metros += d;
      ancla = p;
    }
  }
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
