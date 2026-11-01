// Qué fue cada rato del día: quieto, a pie o en vehículo. Es la única regla: viajes, km, paseos, caminatas, tráfico y mapas
// salen de acá, así nada puede decir "caminata" de lo que otro contó como viaje. Sin base de datos: recibe los puntos, los
// lugares con nombre y lo que se sepa de los pasos, así se prueba con recorridos armados.
//
// Cómo decide:
// 1. Saca los saltos del GPS y deja un punto cada ~150 m (puntosDeMovimiento): el temblor en el lugar no llega a esto.
// 2. Parte el día donde hubo una parada de verdad (10 minutos quieto, o quedarse en un lugar con nombre).
// 3. A cada pedazo entre dos puntos le calcula una velocidad robusta: la mediana de sus vecinos, para que un semáforo o un
//    punto que saltó no cambien nada.
// 4. Junta los pedazos en rápidos y no rápidos, y a estos últimos los resuelve con los pasos y con lo que tienen al lado:
//    lo lento entre dos rápidos es tráfico; lo lento solo es caminar.
//
// Una bici se cuenta como vehículo (va con ruedas y no da pasos) y se adivina solo como modo de un viaje (ver `bici`): por
// GPS no se distingue de un auto en la ciudad, así que no es una categoría aparte y la persona lo corrige en la tarjeta.
import { DISTANCIA_VIAJE_M, distanciaMetros, lugarDe, type Coordenadas } from 'shared';
import { caminoLimpio, metrosDe, puntosDeMovimiento, sinLosMalos, sinPicos, sinSaltos, type LugarZona, type Punto } from './puntos.js';

/** Hasta acá se camina: una caminata ligera llega a 6-7 km/h, y la velocidad medida tiembla un poco. */
export const A_PIE_MAX_KMH = 8;
/**
 * Desde acá, sostenido, es un vehículo. Correr a esto ya es de atleta: solo se cree si los pasos lo confirman. Entre 8 y 16
 * km/h no alcanza con la velocidad (correr, bici o un auto en la ciudad): se resuelve con los pasos y lo que hay al lado.
 */
export const VEHICULO_KMH = 16;
/** Entre 8 y 16 km/h, solo y sin saber de los pasos: hasta acá se corre (un corredor común va a 9-12), más rápido es una bici. */
export const CORRER_SIN_PASOS_KMH = 13;
/** Con pasos, se cree que fue a pie hasta esta velocidad. Más rápido, los pasos son falsos: el teléfono saltando en el auto. */
export const PASOS_MAX_KMH = 20;
/** Tan lejos y tan rápido de un punto al otro no es el GPS ni un pique a pie, aunque los vecinos sean lentos. */
const SEGURO_KMH = 25;
const SEGURO_M = 500;
/** Más corto que esto, lo rápido es ruido del GPS en medio de una caminata (dos puntos que rebotaron). */
const RAPIDO_MIN_M = 300;
/** La mediana mira este rato a cada lado (y al menos dos vecinos): tres minutos pasan en un semáforo largo. */
const VENTANA_MIN = 3;

/** Una parada corta el viaje desde este rato quieto en cualquier lado. Las de los lugares con nombre van aparte. */
const PARADA_MIN = 10;
/** Más rápido que esto de un punto al otro, por más rato que haya entre medio: no paró, se perdieron los puntos. */
const SIGUIO_KMH = A_PIE_MAX_KMH;
/** Más hueco que esto entre dos puntos ya no se une: no se sabe qué pasó (fue y volvió, durmió en otro lado…). */
const HUECO_MAX_MIN = 120;
/** Saliendo de un lugar con nombre después de quedarse, más que esto entre dos puntos incluye la estadía: no sirve de velocidad. */
const SALIDA_LUGAR_MIN = 3;
/** Pasar por un lugar con nombre en menos que esto no es una parada: el viaje sigue. */
const PASO_DE_LARGO_MIN = 5;
/** Menos que esto entre dos puntos es el GPS que tiembla, no un movimiento. */
const TRAMO_M = 60;
/** Dentro de este radio del punto anterior, un punto fino dice que seguía ahí (con los flojos, el doble de lo que dudan). */
const QUIETO_RADIO_M = 50;
/** Velocidad supuesta cuando no se sabe cuándo salió: en vehículo, de ciudad; a pie, paso normal. */
const SALIDA_VEHICULO_MS = 30 / 3.6;
const PASO_MS = 1.4;
/** Un salto de esto o más, sin puntos en el medio ni pasos, se supone en vehículo: caminando, el teléfono deja puntos. */
const SALTO_VEHICULO_M = DISTANCIA_VIAJE_M;
/** Lo lento entre dos rápidos es tráfico hasta este rato. Más, sin pasos, ya no es un embotellamiento creíble. */
const ATASCO_MAX_MIN = 40;
/** Sin pasos cerca de un rápido: desde este rato, caminar habría dejado una caminata en los pasos (ver caminatasDe en la app). */
const CAMINATA_SE_VE_MIN = 10;
/** Termina a menos de esta parte de lo recorrido de donde empezó: es una vuelta. El tráfico va para adelante. */
const VUELTA_PROPORCION = 0.5;
const VUELTA_MIN_M = 300;
/** Qué parte de un rato tienen que cubrir los pasos para creerles. */
const PASOS_COBERTURA = 0.5;

/** Un viaje es de al menos esto (las vueltas cortas no cuentan). */
const VIAJE_M = DISTANCIA_VIAJE_M;
/** Un viaje más rápido que esto en promedio no es posible por tierra: es ruido del GPS que quedó. */
const VIAJE_MAX_KMH = 160;
/** Más lento que esto entre dos puntos seguidos de un vehículo: tráfico. */
const LENTO_KMH = 10;
/** Entre puntos más separados que esto no se sabe qué pasó en el medio (no cuenta como lento). */
const LENTO_HUECO_MIN = 5;
/** Con tantos minutos lentos se habla de tráfico (ver huboTrafico): ya no se adivina una bici. */
const LENTO_NO_BICI_MIN = 8;
/** Después del último punto de un tramo, los que siguen hasta este rato (los últimos metros, ya cerca de donde paró). */
const COLA_MIN = 5;

/** Una vuelta a pie que termina donde empezó cuenta como actividad desde unas cuadras y este tiempo. */
const PASEO_VUELTA_M = 300;
const PASEO_VUELTA_MIN = 5;
/** Ir caminando de un lado a otro, desde más: caminar hasta el auto o la parada no es una actividad. */
const PASEO_IDA_M = 600;
const PASEO_IDA_MIN = 8;
/** Lo que ya no se dibuja como un recorrido a pie: cruzar la calle. */
export const A_PIE_DIBUJO_M = 100;

export type TipoTramo = 'quieto' | 'a_pie' | 'vehiculo';

export interface Tramo {
  tipo: TipoTramo;
  /** ms */
  inicio: number;
  fin: number;
  metros: number;
  /** Los puntos finos de este rato, sin los malos: para medir y dibujar solo esto. */
  puntos: Punto[];
  /** Minutos a paso de hombre (solo en vehículo): tráfico. */
  lento_min: number;
  /** Si se adivina que fue en bici (solo en vehículo; ver esBici). */
  bici: boolean;
}

/**
 * Lo que se sabe de los pasos. `ratos`: cuándo hubo pasos a ritmo de caminata (las caminatas de Health Connect). `desde` y
 * `hasta`: de cuándo a cuándo hay datos de pasos: solo en ese rato, no ver pasos dice algo (sin reloj, o si todavía no
 * sincronizó, no dice nada).
 */
export interface Pasos {
  ratos: Array<{ inicio: number; fin: number }>;
  desde?: number | null;
  hasta?: number | null;
}

export interface Viaje {
  inicio: number;
  fin: number;
  metros: number;
  /** Por dónde pasó (los puntos del viaje, en orden): para el mapita. */
  camino?: Coordenadas[];
  /** Minutos a paso de hombre (menos de 10 km/h) entre puntos seguidos del viaje: tráfico. */
  lento_min?: number;
  /** Si se adivina que fue en bici: por la velocidad, y la persona lo corrige. */
  bici?: boolean;
}

/** De un punto al siguiente (de los de cada ~150 m), dentro de un rato sin paradas. */
interface Pedazo {
  a: Punto;
  b: Punto;
  metros: number;
  /** Todo el rato entre los dos puntos, con lo que estuvo parado. */
  min: number;
  /** Hasta cuándo siguió donde `a`, si los puntos finos lo dicen (un semáforo, o subirse al auto): recién ahí salió. */
  salio: Punto;
  /** La velocidad desde que salió: la de estar andando, sin lo que estuvo parado en el medio. */
  kmh: number;
  /** Después de una parada, sin saber cuándo salió: la velocidad no dice nada. */
  salto: boolean;
  /** Tan cerca que es el GPS o cruzar el borde de un lugar: toma lo que tenga al lado. */
  borde: boolean;
  /** La velocidad robusta (ver suavizar). */
  robusta: number;
  tipo: 'a_pie' | 'vehiculo' | null;
}

const mediana = (l: number[]): number => {
  const o = [...l].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

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

/** El último punto fino entre dos (de los de decidir) que todavía estaba donde el primero: hasta ahí estuvo quieto. */
function ultimoQuieto(finos: Punto[], desdeIdx: number, a: Punto, b: Punto): Punto {
  let r = a;
  for (let k = desdeIdx; k < finos.length && finos[k].instante < b.instante; k++) {
    const p = finos[k];
    if (p.instante > a.instante && distanciaMetros(a, p) <= Math.max(QUIETO_RADIO_M, 2 * (p.precision_m ?? 0))) r = p;
  }
  return r;
}

/** El primer punto fino entre dos que ya estaba donde el segundo. */
function primeroCerca(finos: Punto[], desdeIdx: number, a: Punto, b: Punto): Punto | null {
  for (let k = desdeIdx; k < finos.length && finos[k].instante < b.instante; k++) {
    if (finos[k].instante > a.instante && distanciaMetros(b, finos[k]) <= Math.max(QUIETO_RADIO_M, 2 * (finos[k].precision_m ?? 0))) return finos[k];
  }
  return null;
}

/** Los ratos sin paradas: cada uno es una lista de pedazos seguidos. Una parada no pertenece a ninguno. */
function ratosSinParadas(finos: Punto[], orden: Punto[], lugares: LugarZona[]): Pedazo[][] {
  const parado = paradasEnLugares(orden, lugares);
  const ratos: Pedazo[][] = [];
  let actual: Pedazo[] = [];
  const cerrar = () => {
    if (actual.length) ratos.push(actual);
    actual = [];
  };
  let idx = 0;
  const pedazo = (a: Punto, b: Punto, salio: Punto, salto: boolean): Pedazo => {
    const metros = distanciaMetros(a, b);
    const min = (b.instante - a.instante) / 60000;
    const andando = (b.instante - salio.instante) / 3600000;
    return { a, b, metros, min, salio, kmh: distanciaMetros(salio, b) / 1000 / Math.max(andando, 1 / 3600), salto, borde: !salto && metros < TRAMO_M, robusta: 0, tipo: null };
  };
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    while (idx < finos.length && finos[idx].instante <= a.instante) idx++;
    const d = distanciaMetros(a, b);
    const min = (b.instante - a.instante) / 60000;
    const quieto = ultimoQuieto(finos, idx, a, b);
    const minQuieto = (quieto.instante - a.instante) / 60000;
    const minEnCamino = (b.instante - quieto.instante) / 60000;
    const kmh = d / 1000 / Math.max(min / 60, 1 / 3600);
    const siguio = min <= HUECO_MAX_MIN && kmh >= SIGUIO_KMH && minQuieto < PARADA_MIN;
    const paro = min >= PARADA_MIN && !siguio;
    const saleDeLugar = parado[i - 1] && lugarDe(a, lugares)?.id !== lugarDe(b, lugares)?.id;
    if (!paro && !saleDeLugar) {
      actual.push(pedazo(a, b, quieto, false));
      continue;
    }
    // Una parada. Si los puntos finos dicen que ya había llegado cerca de `b` hace rato, se quedó recién ahí: lo de antes es
    // parte de lo que venía (los últimos metros), no una salida nueva.
    const llego = paro ? primeroCerca(finos, idx, a, b) : null;
    if (llego && (b.instante - llego.instante) / 60000 >= PARADA_MIN) {
      if (minQuieto >= PARADA_MIN) cerrar();
      if (distanciaMetros(quieto, llego) >= TRAMO_M && llego.instante > quieto.instante) actual.push(pedazo(quieto, llego, quieto, false));
      cerrar();
      continue;
    }
    // Lo que venía termina acá.
    cerrar();
    if (d < TRAMO_M) continue;
    if (!paro && min < SALIDA_LUGAR_MIN) {
      actual.push(pedazo(a, b, quieto, false));
      continue;
    }
    // Si los puntos finos dicen hasta cuándo siguió quieto, se sabe a qué velocidad salió. Si no, solo que salió en algún
    // momento de ese rato.
    if (quieto !== a && minEnCamino < PARADA_MIN) actual.push(pedazo(quieto, b, quieto, false));
    else actual.push(pedazo(a, b, a, true));
  }
  cerrar();
  return ratos;
}

/**
 * La velocidad robusta de cada pedazo: la mediana de sus vecinos del lado que más se le parece. Mirar un lado por vez no
 * corre el cambio de caminar a manejar (la mediana de los dos lados se comería los últimos minutos a pie), y como cualquiera
 * de los dos tiene más vecinos que el pedazo, un semáforo o un punto que rebotó no pesan.
 */
function suavizar(l: Pedazo[]): void {
  const lado = (k: number, paso: 1 | -1): number[] => {
    const r = [l[k].kmh];
    const centro = l[k].a.instante + (l[k].b.instante - l[k].a.instante) / 2;
    for (let j = k + paso, n = 1; j >= 0 && j < l.length; j += paso, n++) {
      const medio = l[j].a.instante + (l[j].b.instante - l[j].a.instante) / 2;
      if (n > 2 && Math.abs(medio - centro) > VENTANA_MIN * 60000) break;
      r.push(l[j].kmh);
    }
    return r;
  };
  l.forEach((x, k) => {
    const lados = [lado(k, -1), lado(k, 1)].filter((s) => s.length > 1).map(mediana);
    x.robusta = lados.length ? lados.reduce((m, v) => (Math.abs(v - x.kmh) < Math.abs(m - x.kmh) ? v : m)) : x.kmh;
  });
  // Lo lento en las puntas no es un semáforo: es caminar hasta el auto, o desde donde estacionó.
  for (let k = 0; k < l.length && l[k].kmh < A_PIE_MAX_KMH; k++) l[k].robusta = l[k].kmh;
  for (let k = l.length - 1; k >= 0 && l[k].kmh < A_PIE_MAX_KMH; k--) l[k].robusta = l[k].kmh;
}

function solapa(pasos: Pasos | undefined, inicio: number, fin: number): number {
  return (pasos?.ratos ?? []).reduce((s, r) => s + Math.max(0, Math.min(r.fin, fin) - Math.max(r.inicio, inicio)), 0);
}

/** Si los pasos explican este rato: cubren al menos la mitad de lo que se tarda a pie en hacer esos metros. */
function pasosCubren(pasos: Pasos | undefined, inicio: number, fin: number, metros: number): boolean {
  const hace = Math.min(fin - inicio, (metros / PASO_MS) * 1000);
  return hace > 0 && solapa(pasos, inicio, fin) >= PASOS_COBERTURA * hace;
}

const hayDatosDePasos = (pasos: Pasos | undefined, t: number) => pasos?.desde != null && pasos.hasta != null && pasos.desde <= t && t <= pasos.hasta;

/** Decide a pie o en vehículo para cada pedazo de un rato sin paradas. */
function resolver(rato: Pedazo[], pasos: Pasos | undefined): void {
  const moviendo = rato.filter((x) => !x.salto && !x.borde);
  suavizar(moviendo);
  // Juntar en corridas de rápidos y no rápidos.
  const rapido = moviendo.map((x) => x.robusta >= VEHICULO_KMH || (x.kmh >= SEGURO_KMH && x.metros - (x.a.precision_m ?? 0) - (x.b.precision_m ?? 0) >= SEGURO_M));
  type Corrida = { desde: number; hasta: number; rapida: boolean };
  const corridasDe = () => {
    const r: Corrida[] = [];
    rapido.forEach((f, k) => {
      const u = r.at(-1);
      if (u && u.rapida === f) u.hasta = k;
      else r.push({ desde: k, hasta: k, rapida: f });
    });
    return r;
  };
  // Un rápido muy corto es el GPS que rebotó.
  for (const c of corridasDe()) {
    if (!c.rapida) continue;
    const metros = moviendo.slice(c.desde, c.hasta + 1).reduce((s, x) => s + x.metros, 0);
    if (metros < RAPIDO_MIN_M) rapido.fill(false, c.desde, c.hasta + 1);
  }
  const corridas = corridasDe();
  const datos = (c: Corrida) => {
    const l = moviendo.slice(c.desde, c.hasta + 1);
    const metros = l.reduce((s, x) => s + x.metros, 0);
    const inicio = l[0].a.instante;
    const fin = l.at(-1)!.b.instante;
    return { l, metros, inicio, fin, min: (fin - inicio) / 60000, kmh: mediana(l.map((x) => x.kmh)), vuelta: metros >= VUELTA_MIN_M && distanciaMetros(l[0].a, l.at(-1)!.b) < VUELTA_PROPORCION * metros };
  };
  // Primero los saltos y los rápidos: son los vecinos que miran los demás.
  const primero = rato[0];
  if (primero.salto) {
    if (pasosCubren(pasos, primero.a.instante, primero.b.instante, primero.metros)) primero.tipo = 'a_pie';
    else if (primero.metros >= SALTO_VEHICULO_M) primero.tipo = 'vehiculo';
  }
  const tipos = corridas.map((c): Pedazo['tipo'] => {
    if (!c.rapida) return null;
    const d = datos(c);
    return d.kmh <= PASOS_MAX_KMH && pasosCubren(pasos, d.inicio, d.fin, d.metros) ? 'a_pie' : 'vehiculo';
  });
  corridas.forEach((c, n) => {
    if (c.rapida) return;
    const d = datos(c);
    const izquierda = n === 0 ? primero.salto && primero.tipo === 'vehiculo' : tipos[n - 1] === 'vehiculo';
    const derecha = tipos[n + 1] === 'vehiculo';
    tipos[n] = lentoEs(d, izquierda, derecha, pasos);
  });
  corridas.forEach((c, n) => moviendo.slice(c.desde, c.hasta + 1).forEach((x) => (x.tipo = tipos[n])));
  // Un salto corto (salió, y el primer punto ya está lejos) es lo que siguió; si no sigue nada, unos pasos.
  if (primero.salto && !primero.tipo) primero.tipo = moviendo[0]?.tipo ?? 'a_pie';
  // Los puntos pegados toman lo que tienen al lado.
  rato.forEach((x, k) => {
    if (x.borde) x.tipo = rato[k - 1]?.tipo ?? null;
  });
  for (let k = rato.length - 2; k >= 0; k--) if (!rato[k].tipo) rato[k].tipo = rato[k + 1].tipo;
}

/** Lo no rápido (menos de 16 km/h), según los pasos y lo que tiene al lado. */
function lentoEs(d: { metros: number; inicio: number; fin: number; min: number; kmh: number; vuelta: boolean }, izquierda: boolean, derecha: boolean, pasos: Pasos | undefined): 'a_pie' | 'vehiculo' {
  if (pasosCubren(pasos, d.inicio, d.fin, d.metros)) return 'a_pie';
  // Sin pasos que digan otra cosa desde acá. "Sabe": hay datos de pasos y una caminata así de larga se habría visto.
  const sabe = hayDatosDePasos(pasos, d.fin) && d.min >= CAMINATA_SE_VE_MIN;
  if (izquierda && derecha) {
    // Entre dos rápidos: tráfico. Salvo que vuelva a donde empezó (bajó, dio una vuelta y volvió al auto), o dure más que
    // cualquier embotellamiento, y a paso de caminata.
    if (d.kmh >= A_PIE_MAX_KMH) return 'vehiculo';
    return d.vuelta || (d.min > ATASCO_MAX_MIN && !sabe) ? 'a_pie' : 'vehiculo';
  }
  if (izquierda || derecha) {
    // Al lado de un rápido: despacio en la ciudad, o caminar hasta el auto. A paso de caminata es caminar, salvo que los
    // pasos digan que no hubo una caminata.
    if (d.kmh >= A_PIE_MAX_KMH) return 'vehiculo';
    return sabe && !d.vuelta ? 'vehiculo' : 'a_pie';
  }
  // Solo. A paso de caminata, siempre a pie: el perro que se para no llega al ritmo de una caminata de los pasos, así que
  // no verlos no alcanza para decir que fue un auto.
  if (d.kmh < A_PIE_MAX_KMH) return 'a_pie';
  if (sabe) return 'vehiculo';
  return d.kmh < CORRER_SIN_PASOS_KMH ? 'a_pie' : 'vehiculo';
}

/**
 * Si se adivina que un viaje fue en bici. Con puntos seguidos se ven los picos: de 10 a 25 km/h, sin pasar de 30 (un auto, por
 * más ciudad que sea, en algún momento acelera). Con pocos puntos, solo un viaje corto a esa velocidad. Con tráfico, no.
 */
function esBici(pedazos: Pedazo[], metros: number, kmh: number, lento: number): boolean {
  if (lento >= LENTO_NO_BICI_MIN) return false;
  const l = pedazos.filter((x) => !x.salto && !x.borde).map((x) => x.kmh).sort((a, b) => a - b);
  if (l.length >= 6) {
    const m = mediana(l);
    return m >= 10 && m <= 25 && l[Math.floor(l.length * 0.9)] <= 30;
  }
  return kmh >= A_PIE_MAX_KMH && kmh < VEHICULO_KMH && metros < 6000;
}

/**
 * El día partido en tramos: quieto, a pie o en vehículo, en orden y sin pisarse. `pasos` es opcional: sin datos del reloj se
 * decide solo con la velocidad y lo que hay al lado.
 */
export function clasificarDia(puntosDia: Punto[], lugares: LugarZona[] = [], pasos?: Pasos): Tramo[] {
  const finos = sinPicos(sinSaltos([...puntosDia].sort((a, b) => a.instante - b.instante)));
  if (!finos.length) return [];
  const orden = puntosDeMovimiento(finos, lugares);
  const moviendose: Tramo[] = [];
  for (const rato of ratosSinParadas(finos, orden, lugares)) {
    resolver(rato, pasos);
    for (let i = 0; i < rato.length; ) {
      const tipo = rato[i].tipo;
      let j = i;
      while (j + 1 < rato.length && rato[j + 1].tipo === tipo) j++;
      if (tipo) moviendose.push(armarTramo(rato.slice(i, j + 1), tipo, j === rato.length - 1, finos, orden));
      i = j + 1;
    }
  }
  // Lo que queda entre medio es estar quieto.
  const r: Tramo[] = [];
  const quieto = (inicio: number, fin: number) => {
    if (fin > inicio) r.push({ tipo: 'quieto', inicio, fin, metros: 0, puntos: [], lento_min: 0, bici: false });
  };
  let t = finos[0].instante;
  for (const x of moviendose) {
    quieto(t, x.inicio);
    r.push(x);
    t = x.fin;
  }
  quieto(t, finos.at(-1)!.instante);
  return r;
}

function armarTramo(l: Pedazo[], tipo: 'a_pie' | 'vehiculo', ultimoDelRato: boolean, finos: Punto[], orden: Punto[]): Tramo {
  const a = l[0];
  const hasta = l.at(-1)!.b;
  // Si estuvo quieto antes y no se sabe cuándo salió, salió en algún momento de ese rato: lo que se tarda en hacer esos
  // metros, antes de llegar al punto. Empezar en el punto anterior daba viajes eternos, y empezar en este, a 400 km/h.
  const ms = tipo === 'vehiculo' ? SALIDA_VEHICULO_MS : PASO_MS;
  const inicio = a.salto ? Math.max(a.a.instante, a.b.instante - Math.round((a.metros / ms) * 1000)) : a.salio.instante;
  // Lo que sigue al último punto, solo si no sigue otro tramo: los últimos metros, ya cerca de donde paró.
  let tope = hasta.instante;
  if (ultimoDelRato) {
    const siguiente = orden.find((p) => p.instante > hasta.instante);
    tope = Math.min(hasta.instante + COLA_MIN * 60000, (siguiente?.instante ?? Infinity) - 1);
  }
  const desde = a.salto ? a.a : a.salio;
  const puntos = sinLosMalos(finos.filter((p) => p.instante >= desde.instante && p.instante <= tope), [desde, hasta]);
  const metros = metrosDe(puntos);
  const lento =
    tipo === 'vehiculo'
      ? l.reduce((s, x) => (!x.salto && !x.borde && x.min <= LENTO_HUECO_MIN && x.metros / 1000 / (x.min / 60) < LENTO_KMH ? s + x.min : s), 0)
      : 0;
  const fin = hasta.instante;
  const kmh = metros / 1000 / Math.max((fin - inicio) / 3600000, 1 / 60);
  return { tipo, inicio, fin, metros, puntos, lento_min: lento, bici: tipo === 'vehiculo' && esBici(l, metros, kmh, lento) };
}

/**
 * Los viajes del día: lo que fue en vehículo, y de más de 1 km. Un viaje se corta en un lugar con nombre donde se quedó o
 * después de 10 minutos quieto en cualquier otro lado; un semáforo o un rato sin puntos mientras seguía andando no lo cortan.
 * Caminar (de A a B, en una vuelta, hasta el auto) no es un viaje ni suma a sus km.
 */
export function viajesDelDia(puntosDia: Punto[], lugares: LugarZona[] = [], pasos?: Pasos): Viaje[] {
  return viajesDe(clasificarDia(puntosDia, lugares, pasos));
}

export function viajesDe(tramos: Tramo[]): Viaje[] {
  return tramos
    .filter((t) => t.tipo === 'vehiculo' && t.metros >= VIAJE_M)
    .filter((t) => t.metros / 1000 / Math.max((t.fin - t.inicio) / 3600000, 1 / 60) <= VIAJE_MAX_KMH)
    .map((t) => ({ inicio: t.inicio, fin: t.fin, metros: t.metros, camino: caminoLimpio(t.puntos), lento_min: Math.round(t.lento_min), bici: t.bici }));
}

/** Si un tramo a pie alcanza para ser una actividad: una vuelta de unas cuadras, o ir caminando de un lado a otro. */
function esPaseo(t: Tramo): boolean {
  if (t.tipo !== 'a_pie' || !t.puntos.length) return false;
  const min = (t.fin - t.inicio) / 60000;
  const vuelta = distanciaMetros(t.puntos[0], t.puntos.at(-1)!) < VUELTA_MIN_M;
  return vuelta ? t.metros >= PASEO_VUELTA_M && min >= PASEO_VUELTA_MIN : t.metros >= PASEO_IDA_M && min >= PASEO_IDA_MIN;
}

/**
 * Los paseos del día: lo que fue a pie y alcanza para ser una actividad (sacar a los perros, salir a caminar, ir caminando
 * a algún lado). Caminar hasta el auto no. Patty los sugiere para anotar (patrones/paseos.ts).
 */
export function paseosDelDia(puntosDia: Punto[], lugares: LugarZona[] = [], pasos?: Pasos): Viaje[] {
  return clasificarDia(puntosDia, lugares, pasos)
    .filter(esPaseo)
    .map(({ inicio, fin, metros }) => ({ inicio, fin, metros }));
}

/** Lo caminado en el día, sume o no para ser una actividad. */
export const metrosAPie = (tramos: Tramo[]): number => tramos.filter((t) => t.tipo === 'a_pie').reduce((s, t) => s + t.metros, 0);

/**
 * Si una caminata que dicen los pasos es falsa: pasó sobre todo en vehículo (el teléfono saltando en el auto cuenta pasos).
 * Si los puntos no dicen nada de ese rato, se le cree a los pasos.
 */
export function caminataContradicha(rato: { inicio: number; fin: number }, tramos: Tramo[]): boolean {
  const dura = rato.fin - rato.inicio;
  if (dura <= 0) return false;
  const enVehiculo = tramos.filter((t) => t.tipo === 'vehiculo').reduce((s, t) => s + Math.max(0, Math.min(t.fin, rato.fin) - Math.max(t.inicio, rato.inicio)), 0);
  return enVehiculo >= 0.5 * dura;
}

/**
 * Los puntos de ese tipo dentro de un rato (una actividad o un viaje anotados, para el mapa de esa actividad): solo lo que
 * fue de ese tipo. Si en el medio hubo otra cosa (caminó, manejó, caminó), queda la parte más larga: lo de antes y lo de
 * después no son la misma salida.
 */
export function recorteDe(tramos: Tramo[], tipo: 'a_pie' | 'vehiculo', desde: number, hasta: number): { puntos: Punto[]; metros: number } {
  const grupos: Array<{ puntos: Punto[]; metros: number }> = [];
  let abierto = false;
  for (const t of tramos) {
    if (t.tipo === 'quieto') continue;
    if (t.tipo !== tipo) {
      abierto = false;
      continue;
    }
    if (t.fin < desde || t.inicio > hasta) continue;
    const puntos = t.puntos.filter((p) => p.instante >= desde && p.instante <= hasta);
    if (!puntos.length) continue;
    if (!abierto) grupos.push({ puntos: [], metros: 0 });
    abierto = true;
    const g = grupos.at(-1)!;
    g.puntos.push(...puntos);
    g.metros += metrosDe(puntos);
  }
  return grupos.reduce((m, g) => (g.metros > m.metros ? g : m), { puntos: [], metros: 0 });
}
