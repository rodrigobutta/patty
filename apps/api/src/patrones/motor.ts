// Motor de patrones: busca "cuando pasa A, k días después pasa B más seguido que cuando no pasa A".
//
// Trabaja sobre la serie diaria de una persona (una fila por día y concepto) y no sabe nada de la base: así se puede
// probar con datos armados a mano. Para cada concepto arma "rasgos" de un día:
//   - presente: ese día se anotó (comió tomate, le dolió la cabeza)
//   - alto / bajo: el valor de ese día estuvo por encima / por debajo de su mediana. Para medidas y horas (temperatura,
//     pasos, hora de acostarse) y para las intensidades que se anotan casi todos los días (energía, ánimo), donde
//     "se anotó" no dice nada. Solo se comparan días en que hubo valor.
// Y para cada par causa → efecto y cada desfase de 0 a DESFASE_MAX días arma la tabla de 2x2 y calcula:
//   prob_con = P(efecto en d+k | causa en d), prob_sin = P(efecto en d+k | sin causa en d), lift = prob_con / prob_sin
//   p_valor = test exacto de Fisher de una cola (que la causa sube la probabilidad del efecto)
//   q_valor = corrección de Benjamini-Hochberg por la cantidad de pares probados (hay muchos: algunos salen por azar).
// Con desfase 0 (mismo día) solo cuenta si la causa se anotó antes que el efecto.
//
// Además, combinaciones: dos o tres causas el mismo día ("comida frita + fase menstrual + calor → dolor de panza al día
// siguiente"). Solo se combinan las causas que ya muestran algo de relación con ese efecto, y una combinación queda si
// explica bastante más que cada una de sus partes sola (si no, alcanza con la simple).
import { traducir, type Idioma, type Modo, type RolCategoria, type TipoValor } from 'shared';
import { diasEntre } from '../lib/fechas.js';

export interface FilaDiaria {
  fecha: string;
  concepto_id: number;
  veces: number;
  suma: number | null;
  promedio: number | null;
  /** la intensidad más alta del día (dolores, ánimo) */
  intensidad: number | null;
  /** primera vez que se anotó ese día (ms); null para las mediciones resumidas */
  primera: number | null;
  /**
   * Vino solo, sin que la persona anote nada (la llegada a un lugar, por ejemplo): tiene hora, pero ese día no cuenta
   * como "día anotado". Si contara, un día en que solo hubo ubicación parecería un día sin dolores.
   */
  automatica?: boolean;
}

const anotada = (f: FilaDiaria) => f.primera !== null && !f.automatica;

export interface ConceptoInfo {
  id: number;
  nombre: string;
  tipo_valor: TipoValor;
  rol: RolCategoria;
}

/** Una causa más de una combinación (la primera va en causa_id / causa_modo). */
export interface CausaExtra {
  id: number;
  modo: Modo;
}

export interface Candidato {
  causa_id: number;
  causa_modo: Modo;
  /** Las otras causas que tienen que estar el mismo día (vacío: un patrón simple). */
  causas_extra: CausaExtra[];
  efecto_id: number;
  efecto_modo: Modo;
  desfase_dias: number;
  soporte: number;
  dias_causa: number;
  dias_evaluados: number;
  prob_con: number;
  prob_sin: number;
  lift: number;
  p_valor: number;
  q_valor: number;
  puntaje: number;
  /** En una combinación: cuántas veces más fuerte es que la mejor de sus partes sola. */
  mejora?: number;
}

export interface Opciones {
  desfaseMax: number;
  /** mínimo de veces que se vio causa y efecto juntos */
  soporteMin: number;
  /** mínimo de días con la causa */
  diasCausaMin: number;
  liftMin: number;
  /** p de corte para quedarse con un candidato (antes de la corrección) */
  pMax: number;
  limite: number;
}

export const OPCIONES: Opciones = { desfaseMax: 3, soporteMin: 3, diasCausaMin: 3, liftMin: 1.3, pMax: 0.1, limite: 40 };

/** Cuántas causas (las más relacionadas con cada efecto) se prueban de a dos y de a tres. */
const PARA_COMBINAR = 16;
/** El p que tiene que tener una combinación (se prueban cientos por efecto). */
const P_COMBINADA = 0.001;
/** Con menos veces que esto, una combinación de varias cosas es fácil que sea casualidad. */
const SOPORTE_COMBINADA = 5;
/** Cuántas combinaciones quedan como mucho en un análisis. */
const COMBINADAS_MAX = 8;
/** Una combinación tiene que superar a la mejor de sus partes por esto (en lift) para quedar. */
const MEJORA_COMBINADA = 1.25;

/** Con menos días que esto no se analiza: cualquier coincidencia parecería un patrón. */
export const DIAS_MINIMOS = 14;

interface Rasgo {
  concepto: ConceptoInfo;
  modo: Modo;
  /** por índice de día: 1 si el rasgo está ese día */
  esta: Uint8Array;
  /** por índice de día: 1 si ese día cuenta para comparar (se anotó algo, o hubo medición) */
  universo: Uint8Array;
  /** por índice de día: ms de la primera vez (para el orden dentro del mismo día) */
  primera: Float64Array;
  /** Solo puede ser causa (las tendencias de la semana). */
  soloCausa?: boolean;
}

/** Las intensidades anotadas al menos en esta proporción de los días activos se tratan como un puntaje diario. */
const PUNTAJE_DIARIO = 0.6;

/**
 * Las horas dan la vuelta a la medianoche: acostarse a la 1:00 es "más tarde" que a las 23:00. Si los valores están
 * más juntos contando el día desde el mediodía, se usan así.
 */
function horasContinuas(v: number[]): number[] {
  const corrida = v.map((x) => (x + 720) % 1440);
  const dispersion = (l: number[]) => {
    const m = l.reduce((a, b) => a + b, 0) / l.length;
    return l.reduce((a, b) => a + (b - m) ** 2, 0);
  };
  return dispersion(corrida) < dispersion(v) ? corrida : v;
}

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- Estadística ----------

const cacheLogFact: number[] = [0];
function logFact(n: number): number {
  for (let i = cacheLogFact.length; i <= n; i++) cacheLogFact[i] = cacheLogFact[i - 1] + Math.log(i);
  return cacheLogFact[n];
}

const logComb = (n: number, k: number) => logFact(n) - logFact(k) - logFact(n - k);

/**
 * Test exacto de Fisher, una cola: probabilidad de ver `a` o más coincidencias por azar, si de `n` días `n1` tienen la
 * causa y `k` tienen el efecto.
 */
export function fisherMayor(a: number, n1: number, k: number, n: number): number {
  const max = Math.min(n1, k);
  const den = logComb(n, k);
  let p = 0;
  for (let x = a; x <= max; x++) {
    if (k - x > n - n1) continue;
    p += Math.exp(logComb(n1, x) + logComb(n - n1, k - x) - den);
  }
  return Math.min(1, p);
}

/** Benjamini-Hochberg: q de cada p, sabiendo que en total se probaron `m` hipótesis. */
export function benjaminiHochberg(ps: number[], m: number): number[] {
  const orden = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(ps.length);
  let min = 1;
  for (let j = orden.length - 1; j >= 0; j--) {
    const [p, i] = orden[j];
    min = Math.min(min, (p * m) / (j + 1));
    q[i] = min;
  }
  return q;
}

// ---------- Rasgos ----------

function armarRasgos(filas: FilaDiaria[], conceptos: Map<number, ConceptoInfo>, desde: string, n: number): Rasgo[] {
  const activo = new Uint8Array(n); // días en que se anotó algo a mano: los demás no cuentan como "no pasó"
  const porConcepto = new Map<number, FilaDiaria[]>();
  for (const f of filas) {
    const i = diasEntre(desde, f.fecha);
    if (i < 0 || i >= n || !conceptos.has(f.concepto_id)) continue;
    if (anotada(f)) activo[i] = 1;
    let l = porConcepto.get(f.concepto_id);
    if (!l) porConcepto.set(f.concepto_id, (l = []));
    l.push(f);
  }
  const rasgos: Rasgo[] = [];
  const totalActivos = activo.reduce((a, b) => a + b, 0);
  for (const [id, lista] of porConcepto) {
    const concepto = conceptos.get(id)!;
    const t = concepto.tipo_valor;
    const puntaje = t === 'intensidad' && lista.length >= PUNTAJE_DIARIO * totalActivos;
    if (t === 'medida' || t === 'hora' || puntaje) {
      const conValor = lista.filter((f) => (puntaje ? f.intensidad : f.promedio) !== null);
      if (conValor.length < 6) continue;
      let valores = conValor.map((f) => (puntaje ? f.intensidad! : f.promedio!));
      if (t === 'hora') valores = horasContinuas(valores);
      const med = mediana(valores);
      const universo = new Uint8Array(n);
      const alto = new Uint8Array(n);
      const bajo = new Uint8Array(n);
      for (const [j, f] of conValor.entries()) {
        const i = diasEntre(desde, f.fecha);
        universo[i] = 1;
        if (valores[j] > med) alto[i] = 1;
        else if (valores[j] < med) bajo[i] = 1;
      }
      const sinHora = new Float64Array(n).fill(Number.NaN);
      rasgos.push({ concepto, modo: 'alto', esta: alto, universo, primera: sinHora });
      rasgos.push({ concepto, modo: 'bajo', esta: bajo, universo, primera: sinHora });
      // La semana: el promedio de los últimos 7 días (con al menos 4 con valor), por encima o por debajo de lo habitual.
      // Solo como causa ("una semana durmiendo menos → dolor de cabeza"): como efecto, una semana se parece demasiado a
      // la anterior y saldría todo relacionado con todo.
      if (concepto.rol !== 'efecto' && conValor.length >= 14) {
        const porDia = new Map(conValor.map((f, j) => [diasEntre(desde, f.fecha), valores[j]]));
        const semana = new Float64Array(n).fill(Number.NaN);
        for (let d = 0; d < n; d++) {
          const l: number[] = [];
          for (let x = Math.max(0, d - 6); x <= d; x++) if (porDia.has(x)) l.push(porDia.get(x)!);
          if (l.length >= 4) semana[d] = l.reduce((a, b) => a + b, 0) / l.length;
        }
        const conSemana = [...semana].filter((v) => !Number.isNaN(v));
        if (conSemana.length >= 10) {
          const medSem = mediana(conSemana);
          const uSem = new Uint8Array(n);
          const altoSem = new Uint8Array(n);
          const bajoSem = new Uint8Array(n);
          for (let d = 0; d < n; d++) {
            if (Number.isNaN(semana[d])) continue;
            uSem[d] = 1;
            if (semana[d] > medSem) altoSem[d] = 1;
            else if (semana[d] < medSem) bajoSem[d] = 1;
          }
          rasgos.push({ concepto, modo: 'alto_semana', esta: altoSem, universo: uSem, primera: sinHora, soloCausa: true });
          rasgos.push({ concepto, modo: 'bajo_semana', esta: bajoSem, universo: uSem, primera: sinHora, soloCausa: true });
        }
      }
    } else {
      const esta = new Uint8Array(n);
      const primera = new Float64Array(n).fill(Number.NaN);
      for (const f of lista) {
        const i = diasEntre(desde, f.fecha);
        esta[i] = 1;
        if (f.primera !== null) primera[i] = f.primera;
      }
      rasgos.push({ concepto, modo: 'presente', esta, universo: activo, primera });
    }
  }
  return rasgos;
}

// ---------- Búsqueda ----------

export interface Resultado {
  candidatos: Candidato[];
  pares_evaluados: number;
  dias: number;
  dias_activos: number;
}

export function buscarPatrones(
  filas: FilaDiaria[],
  conceptosLista: ConceptoInfo[],
  desde: string,
  hasta: string,
  opciones: Partial<Opciones> = {},
): Resultado {
  const o = { ...OPCIONES, ...opciones };
  const n = diasEntre(desde, hasta) + 1;
  const conceptos = new Map(conceptosLista.map((c) => [c.id, c]));
  const rasgos = armarRasgos(filas, conceptos, desde, n);
  const diasActivos = new Set(filas.filter(anotada).map((f) => f.fecha)).size;
  if (diasActivos < DIAS_MINIMOS) return { candidatos: [], pares_evaluados: 0, dias: n, dias_activos: diasActivos };

  const causas = rasgos.filter((r) => r.concepto.rol !== 'efecto');
  const efectos = rasgos.filter((r) => r.concepto.rol !== 'causa' && !r.soloCausa);
  const crudos: Array<Omit<Candidato, 'q_valor' | 'puntaje'>> = [];
  let pares = 0;
  /** Por efecto y desfase, las causas que muestran algo de relación (para probar combinaciones). */
  const relacionadas = new Map<string, Array<{ A: Rasgo; lift: number; probCon: number; p: number }>>();

  /** La tabla de 2x2 de una causa (simple o combinada) con un efecto, y si sirve como candidato. */
  const probar = (A: Pick<Rasgo, 'esta' | 'universo' | 'primera'>, B: Rasgo, k: number) => {
    let n1 = 0, a = 0, n0 = 0, c = 0;
    for (let d = 0; d + k < n; d++) {
      if (!A.universo[d] || !B.universo[d + k]) continue;
      let efecto = B.esta[d + k] === 1;
      if (A.esta[d]) {
        // Mismo día: el efecto tiene que venir después de la causa (si se sabe la hora de los dos).
        if (k === 0 && efecto && A.primera[d] > B.primera[d]) efecto = false;
        n1++;
        if (efecto) a++;
      } else {
        n0++;
        if (efecto) c++;
      }
    }
    if (n1 < o.diasCausaMin || n0 < 3) return null;
    const lift = (a + 0.5) / (n1 + 1) / ((c + 0.5) / (n0 + 1));
    return { n1, a, n0, c, lift, probCon: a / n1, probSin: c / n0 };
  };
  const guardar = (A: Rasgo, extra: CausaExtra[], B: Rasgo, k: number, t: NonNullable<ReturnType<typeof probar>>, mejora?: number) => {
    if (t.a < o.soporteMin || t.lift < o.liftMin) return false;
    const p = fisherMayor(t.a, t.n1, t.a + t.c, t.n1 + t.n0);
    // Las combinaciones se prueban muchas más veces: se les pide mucho más.
    if (p > (extra.length ? P_COMBINADA : o.pMax)) return false;
    crudos.push({
      causa_id: A.concepto.id,
      causa_modo: A.modo,
      causas_extra: extra,
      efecto_id: B.concepto.id,
      efecto_modo: B.modo,
      desfase_dias: k,
      soporte: t.a,
      dias_causa: t.n1,
      dias_evaluados: t.n1 + t.n0,
      prob_con: t.probCon,
      prob_sin: t.probSin,
      lift: t.lift,
      p_valor: p,
      ...(mejora ? { mejora } : {}),
    });
    return true;
  };

  for (const A of causas) {
    for (const B of efectos) {
      if (A.concepto.id === B.concepto.id) continue;
      for (let k = 0; k <= o.desfaseMax; k++) {
        const t = probar(A, B, k);
        if (!t) continue;
        pares++;
        // Se combinan causas solo para síntomas y ánimo: lo que la persona siente, que es lo que quiere entender.
        // Las tendencias de la semana no se combinan: se parecen mucho entre sí y sumarían casualidades.
        if (t.a >= 2 && t.lift > 1.05 && !A.soloCausa && (B.concepto.rol === 'efecto' || B.concepto.tipo_valor === 'intensidad')) {
          const clave = `${efectos.indexOf(B)}|${k}`;
          let l = relacionadas.get(clave);
          if (!l) relacionadas.set(clave, (l = []));
          l.push({ A, lift: t.lift, probCon: t.probCon, p: fisherMayor(t.a, t.n1, t.a + t.c, t.n1 + t.n0) });
        }
        guardar(A, [], B, k, t);
      }
    }
  }

  // Combinaciones: de las causas más relacionadas con cada efecto, de a dos y de a tres (de conceptos distintos).
  const juntar = (partes: Rasgo[]) => {
    const esta = new Uint8Array(n);
    const universo = new Uint8Array(n);
    const primera = new Float64Array(n).fill(Number.NaN);
    for (let d = 0; d < n; d++) {
      universo[d] = partes.every((x) => x.universo[d]) ? 1 : 0;
      esta[d] = partes.every((x) => x.esta[d]) ? 1 : 0;
      // La combinación "pasó" cuando pasó la última de sus partes.
      const horas = partes.map((x) => x.primera[d]).filter((h) => !Number.isNaN(h));
      if (horas.length) primera[d] = Math.max(...horas);
    }
    return { esta, universo, primera };
  };
  for (const [clave, lista] of relacionadas) {
    const [bi, ks] = clave.split('|');
    const B = efectos[Number(bi)];
    const k = Number(ks);
    // Las más sostenidas por los números (no las de lift alto con dos días, que suelen ser casualidad).
    const top = lista.sort((x, y) => x.p - y.p).slice(0, PARA_COMBINAR);
    const grupos: Array<typeof top> = [];
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        grupos.push([top[i], top[j]]);
        for (let m = j + 1; m < top.length; m++) grupos.push([top[i], top[j], top[m]]);
      }
    }
    for (const g of grupos) {
      if (new Set(g.map((x) => x.A.concepto.id)).size < g.length) continue;
      // Dos partes que casi siempre van juntas (pasos y km caminados) son la misma cosa: no es una combinación.
      if (g.some((x, i) => g.some((y, j) => j > i && parecidos(x.A, y.A)))) continue;
      const t = probar(juntar(g.map((x) => x.A)), B, k);
      if (!t) continue;
      pares++;
      // Tiene que decir bastante más que cada parte sola: si no, es la simple con un agregado de casualidad. Y eso se
      // prueba también: entre los días con la mejor parte, los que además tienen las otras dan el efecto bastante más.
      const mejor = g.reduce((x, y) => (y.lift > x.lift ? y : x));
      const mejorProb = Math.max(...g.map((x) => x.probCon));
      if (t.lift < mejor.lift * MEJORA_COMBINADA || t.probCon < mejorProb + 0.1) continue;
      const solo = probar(mejor.A, B, k);
      if (!solo) continue;
      // Días con la mejor parte: t.n1 con todo (t.a con efecto) y el resto sin las otras partes.
      const pAporte = fisherMayor(t.a, t.n1, solo.a, solo.n1);
      if (pAporte > 0.05) continue;
      const [primero, ...resto] = g.map((x) => x.A);
      guardar(primero, resto.map((x) => ({ id: x.concepto.id, modo: x.modo })), B, k, t, t.lift / mejor.lift);
    }
  }

  const q = benjaminiHochberg(
    crudos.map((x) => x.p_valor),
    Math.max(pares, 1),
  );
  const todos: Candidato[] = crudos.map((x, i) => ({
    ...x,
    q_valor: q[i],
    // Más arriba lo que es fuerte (lift), poco probable por azar (p) y visto muchas veces (soporte).
    puntaje: Math.log2(x.lift) * -Math.log10(x.p_valor) * Math.sqrt(x.soporte),
  }));

  // De cada par causa → efecto queda el mejor desfase (si no, "tomate → dolor" aparecería con 1, 2 y 3 días).
  // Y "acostarse tarde → energía baja" es lo mismo que "acostarse temprano → energía alta": queda uno solo.
  const espejo = (m: Modo): Modo =>
    m === 'alto' ? 'bajo' : m === 'bajo' ? 'alto' : m === 'alto_semana' ? 'bajo_semana' : m === 'bajo_semana' ? 'alto_semana' : m;
  const mejor = new Map<string, Candidato>();
  for (const x of todos) {
    const [cm, em] = (x.causa_modo === 'bajo' || x.causa_modo === 'bajo_semana') && !x.causas_extra.length ? [espejo(x.causa_modo), espejo(x.efecto_modo)] : [x.causa_modo, x.efecto_modo];
    const clave = `${claveCausas(x)}|${cm}>${x.efecto_id}${em}`;
    const y = mejor.get(clave);
    if (!y || x.puntaje > y.puntaje) mejor.set(clave, x);
  }
  // Una combinación sobra si una de sus partes sola (con cualquier desfase) ya explica lo mismo, o si es de tres y no
  // supera a una de dos con las mismas partes.
  const todosMejores = [...mejor.values()];
  const semanal = (m: Modo) => m === 'alto_semana' || m === 'bajo_semana';
  const elegidos = todosMejores.filter((x) => {
    // La tendencia de la semana sobra si el mismo rasgo del día ya lo explica casi igual (dormir poco anoche y dormir
    // poco esta semana suelen ir juntos): queda solo cuando la semana dice bastante más.
    if (semanal(x.causa_modo) && !x.causas_extra.length) {
      const diaria = todosMejores.find((y) => !y.causas_extra.length && y.causa_id === x.causa_id && !semanal(y.causa_modo) && y.efecto_id === x.efecto_id && y.efecto_modo === x.efecto_modo);
      return !diaria || x.lift > diaria.lift * MEJORA_COMBINADA;
    }
    if (!x.causas_extra.length) return true;
    const mias = partes(x);
    return !todosMejores.some(
      (y) =>
        y !== x &&
        y.efecto_id === x.efecto_id &&
        y.efecto_modo === x.efecto_modo &&
        y.causas_extra.length < x.causas_extra.length &&
        partes(y).every((c) => mias.includes(c)) &&
        // Una de sus partes sola que ya la explica igual, o una combinación más chica que casi la iguala.
        y.lift >= x.lift / (y.causas_extra.length ? MEJORA_COMBINADA : 1),
    );
  });
  // Combinaciones con los mismos números para el mismo efecto son la misma (cambia una parte por otra equivalente).
  const vistos = new Set<string>();
  const sinRepetir = elegidos
    .sort((a, b) => b.puntaje - a.puntaje)
    .filter((x) => {
      if (!x.causas_extra.length) return true;
      const k = `${x.efecto_id}|${x.efecto_modo}|${x.desfase_dias}|${x.soporte}|${x.dias_causa}|${x.lift.toFixed(4)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  // Las combinaciones se prueban de a cientos: solo quedan las muy firmes (p muy chico, ver `guardar`), y como mucho
  // unas pocas, así no tapan a las simples.
  // Primero las mejor sostenidas por los números, y como mucho una por efecto (si no, el mismo "dormir poco + …"
  // aparece con cada cosa que va con dormir poco).
  const porEfecto = new Set<string>();
  const combinadas = sinRepetir
    .filter((x) => x.causas_extra.length && x.soporte >= SOPORTE_COMBINADA)
    .sort((a, b) => a.p_valor - b.p_valor)
    .filter((x) => {
      const k = `${x.efecto_id}|${x.efecto_modo}`;
      if (porEfecto.has(k)) return false;
      porEfecto.add(k);
      return true;
    })
    .slice(0, COMBINADAS_MAX);
  const simples = sinRepetir.filter((x) => !x.causas_extra.length).slice(0, o.limite - combinadas.length);
  const candidatos = [...simples, ...combinadas].sort((a, b) => b.puntaje - a.puntaje);
  return { candidatos, pares_evaluados: pares, dias: n, dias_activos: diasActivos };
}

/**
 * Si dos rasgos dicen casi lo mismo: están juntos en más del 75 % de los días en que está alguno, o uno está casi
 * siempre dentro del otro ("Milanesa con papas fritas" y "Comida frita").
 */
function parecidos(a: Rasgo, b: Rasgo): boolean {
  let juntos = 0;
  let alguno = 0;
  let enA = 0;
  let enB = 0;
  for (let d = 0; d < a.esta.length; d++) {
    if (a.esta[d] || b.esta[d]) alguno++;
    if (a.esta[d] && b.esta[d]) juntos++;
    enA += a.esta[d];
    enB += b.esta[d];
  }
  if (!alguno) return false;
  return juntos / alguno > 0.75 || juntos / Math.max(1, Math.min(enA, enB)) > 0.9;
}

const partes = (x: Pick<Candidato, 'causa_id' | 'causa_modo' | 'causas_extra'>) => [`${x.causa_id}:${x.causa_modo}`, ...x.causas_extra.map((c) => `${c.id}:${c.modo}`)];

/** Las causas de un hallazgo, en un orden fijo (así la misma combinación da siempre la misma clave). */
export function claveCausas(x: Pick<Candidato, 'causa_id' | 'causa_modo' | 'causas_extra'>): string {
  return partes(x).sort().join('+');
}

/** Texto simple de un hallazgo, para cuando no hay IA. `causa` y `efecto` ya vienen nombrados ("Energía baja"). */
export function describir(x: Candidato, causa: string, efecto: string, idioma: Idioma = 'es'): string {
  const t = (texto: string, vars?: Record<string, string | number>) => traducir(idioma, texto, vars);
  const cuando = x.desfase_dias === 0 ? t('ese mismo día, más tarde') : x.desfase_dias === 1 ? t('al día siguiente') : t('{n} días después', { n: x.desfase_dias });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return t('Los días con «{causa}», {cuando} hubo «{efecto}» el {con} de las veces ({soporte} de {dias}); el resto de los días, el {sin}.', {
    causa,
    cuando,
    efecto,
    con: pct(x.prob_con),
    soporte: x.soporte,
    dias: x.dias_causa,
    sin: pct(x.prob_sin),
  });
}
