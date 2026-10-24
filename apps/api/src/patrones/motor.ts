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
import type { Modo, RolCategoria, TipoValor } from 'shared';
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
}

export interface ConceptoInfo {
  id: number;
  nombre: string;
  tipo_valor: TipoValor;
  rol: RolCategoria;
}

export interface Candidato {
  causa_id: number;
  causa_modo: Modo;
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
    if (f.primera !== null) activo[i] = 1;
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
  const diasActivos = new Set(filas.filter((f) => f.primera !== null).map((f) => f.fecha)).size;
  if (diasActivos < DIAS_MINIMOS) return { candidatos: [], pares_evaluados: 0, dias: n, dias_activos: diasActivos };

  const causas = rasgos.filter((r) => r.concepto.rol !== 'efecto');
  const efectos = rasgos.filter((r) => r.concepto.rol !== 'causa');
  const crudos: Array<Omit<Candidato, 'q_valor' | 'puntaje'>> = [];
  let pares = 0;

  for (const A of causas) {
    for (const B of efectos) {
      if (A.concepto.id === B.concepto.id) continue;
      for (let k = 0; k <= o.desfaseMax; k++) {
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
        if (n1 < o.diasCausaMin || n0 < 3) continue;
        pares++;
        if (a < o.soporteMin) continue;
        const probCon = a / n1;
        const probSin = c / n0;
        const lift = (a + 0.5) / (n1 + 1) / ((c + 0.5) / (n0 + 1));
        if (lift < o.liftMin) continue;
        const p = fisherMayor(a, n1, a + c, n1 + n0);
        if (p > o.pMax) continue;
        crudos.push({
          causa_id: A.concepto.id,
          causa_modo: A.modo,
          efecto_id: B.concepto.id,
          efecto_modo: B.modo,
          desfase_dias: k,
          soporte: a,
          dias_causa: n1,
          dias_evaluados: n1 + n0,
          prob_con: probCon,
          prob_sin: probSin,
          lift,
          p_valor: p,
        });
      }
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
  const espejo = (m: Modo): Modo => (m === 'alto' ? 'bajo' : m === 'bajo' ? 'alto' : m);
  const mejor = new Map<string, Candidato>();
  for (const x of todos) {
    const [cm, em] = x.causa_modo === 'bajo' ? [espejo(x.causa_modo), espejo(x.efecto_modo)] : [x.causa_modo, x.efecto_modo];
    const clave = `${x.causa_id}${cm}>${x.efecto_id}${em}`;
    const y = mejor.get(clave);
    if (!y || x.puntaje > y.puntaje) mejor.set(clave, x);
  }
  const candidatos = [...mejor.values()].sort((a, b) => b.puntaje - a.puntaje).slice(0, o.limite);
  return { candidatos, pares_evaluados: pares, dias: n, dias_activos: diasActivos };
}

/** Texto simple de un hallazgo, para cuando no hay IA. `causa` y `efecto` ya vienen nombrados ("Energía baja"). */
export function describir(x: Candidato, causa: string, efecto: string): string {
  const cuando = x.desfase_dias === 0 ? 'ese mismo día, más tarde' : x.desfase_dias === 1 ? 'al día siguiente' : `${x.desfase_dias} días después`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return `Los días con «${causa}», ${cuando} hubo «${efecto}» el ${pct(x.prob_con)} de las veces (${x.soporte} de ${x.dias_causa}); el resto de los días, el ${pct(x.prob_sin)}.`;
}
