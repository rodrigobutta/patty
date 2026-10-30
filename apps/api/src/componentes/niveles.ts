// Del plato al día: cuánto de cada componente tuvo cada día de una persona, y si eso es mucho o poco PARA ELLA (nunca en
// gramos absolutos). Funciones puras, sin base: lo que sale son rasgos que el motor prueba como cualquier otra causa.
//
// Un día que casi no se sabe qué se comió no es un día "con poca sal": no es un día. Cada comida pesa según cuánto se le cree, y
// si lo conocido no llega a COBERTURA_MIN de lo comido ese día, el día queda afuera (no entra al universo del rasgo).
import { TIPOS_COMIDA, type TipoComida } from 'shared';
import { COMPONENTES, POCOS, type ClaveComponente, type Componentes } from './lista.js';

/** Lo que se come sin saber qué es: se supone esta cantidad. */
const GRAMOS_DESCONOCIDO = { comida: 350, bebida: 250 };
/** Por debajo de esto, lo conocido del día no alcanza. */
export const COBERTURA_MIN = 0.6;
/** Con menos días con datos que esto no se puede hablar de "lo habitual". */
export const DIAS_MIN = 21;
/** Y con menos días "con mucho" que esto no vale la pena gastar pruebas del motor. */
export const DIAS_RASGO_MIN = 5;
/** "Mucho" = el cuarto de arriba de sus días, y bastante por encima de su día típico. */
const CUANTIL_MUCHO = 0.75;
const CUANTIL_POCO = 0.25;
const SOBRE_MEDIANA = 1.25;
const BAJO_MEDIANA = 0.75;
/** Una comida sabida por la IA se le cree tanto como una de tabla: los números ya vienen de los ingredientes. Debajo de esto, pesa menos. */
const CONFIANZA_PLENA = 0.5;
/** Lo que solo se sabe por los tipos del plato (frito, harinas…): pesa poco, y solo para lo que esos tipos dicen. */
const PESO_APROXIMADO = 0.4;
const PORCION: Record<string, number> = { chica: 0.7, mediana: 1, grande: 1.4 };

/** Lo que se sabe de un plato por sus tipos, si no se sabe qué es (para una porción normal). Grueso a propósito. */
const POR_TIPO: Record<TipoComida, Componentes> = {
  frito: { grasa: 25, grasa_saturada: 6, calorias: 450 },
  harinas: { harinas: 50, calorias: 350, gluten: 2 },
  verdura: { fibra: 5 },
  proteina: { proteina: 30 },
  lacteos: { lactosa: 2, grasa_saturada: 5 },
  dulce: { azucar: 30, calorias: 300 },
  picante: { picante: 2 },
  ultraprocesado: { ultraprocesado: 3, sal: 800 },
};

/** Lo que llega de la base por cada registro de comida o bebida. */
export interface RegistroComida {
  fecha: string;
  /** ms */
  hora: number | null;
  nombre: string;
  categoria: 'comida' | 'bebida';
  valor: number | null;
  unidad: string | null;
  porcion: string | null;
  tipos: string[] | null;
  estado: 'pendiente' | 'resuelto' | 'generico' | 'no_comida' | 'fallido' | null;
  confianza: number | null;
  gramos: number | null;
  gramos_unidad: number | null;
  componentes: Componentes | null;
}

/** Una comida ya lista para sumar. */
export interface ComidaDia {
  fecha: string;
  hora: number | null;
  nombre: string;
  gramos: number;
  /** De 0 a 1: cuánto se le cree. */
  peso: number;
  /** Lo que se sabe (null: todo). De lo demás, esta comida no dice nada. */
  conocidos: Set<ClaveComponente> | null;
  componentes: Componentes;
}

/** Cuántas porciones típicas fueron, según lo anotado: "3 empanadas", "500 ml", porción grande. */
export function porciones(r: Pick<RegistroComida, 'valor' | 'unidad' | 'porcion' | 'gramos' | 'gramos_unidad'>): number {
  const gramos = r.gramos ?? 0;
  if (r.valor !== null && r.valor > 0 && gramos > 0) {
    const u = (r.unidad ?? '').toLowerCase();
    if (/^(g|gr|grs|gramos?)$/.test(u)) return Math.min(5, Math.max(0.1, r.valor / gramos));
    if (/^(ml|cc|cm3)$/.test(u)) return Math.min(5, Math.max(0.1, r.valor / gramos));
    if (/^(l|lt|lts|litros?)$/.test(u)) return Math.min(5, Math.max(0.1, (r.valor * 1000) / gramos));
    if (/^(kg|kilos?)$/.test(u)) return Math.min(5, Math.max(0.1, (r.valor * 1000) / gramos));
    if (r.gramos_unidad) return Math.min(5, Math.max(0.1, (r.valor * r.gramos_unidad) / gramos));
    return Math.min(5, r.valor);
  }
  return PORCION[r.porcion ?? ''] ?? 1;
}

/** Un registro como se suma: lo resuelto con sus números; si no, lo que digan sus tipos; si no, nada (pero cuenta como comido). */
export function comidaDe(r: RegistroComida): ComidaDia | null {
  if (r.estado === 'no_comida') return null;
  const base = { fecha: r.fecha, hora: r.hora, nombre: r.nombre };
  if (r.estado === 'resuelto' && r.componentes) {
    const n = porciones(r);
    const componentes: Componentes = {};
    for (const [c, v] of Object.entries(r.componentes)) componentes[c as ClaveComponente] = v * n;
    return { ...base, gramos: (r.gramos ?? GRAMOS_DESCONOCIDO[r.categoria]) * n, peso: Math.min(1, (r.confianza ?? 0) / CONFIANZA_PLENA), conocidos: null, componentes };
  }
  const n = PORCION[r.porcion ?? ''] ?? 1;
  const gramos = GRAMOS_DESCONOCIDO[r.categoria] * n;
  const tipos = (r.tipos ?? []).filter((t): t is TipoComida => TIPOS_COMIDA.some((x) => x.clave === t));
  if (!tipos.length) return { ...base, gramos, peso: 0, conocidos: new Set(), componentes: {} };
  const componentes: Componentes = {};
  for (const t of tipos) for (const [c, v] of Object.entries(POR_TIPO[t])) componentes[c as ClaveComponente] = (componentes[c as ClaveComponente] ?? 0) + v * n;
  return { ...base, gramos, peso: PESO_APROXIMADO, conocidos: new Set(Object.keys(componentes) as ClaveComponente[]), componentes };
}

/** Un rasgo de un componente para una persona. */
export interface RasgoComponente {
  clave: ClaveComponente;
  nivel: 'mucho' | 'poco';
  concepto: string;
  /** Los días en que se da, con la hora en que se llegó a eso (para el orden dentro del mismo día). */
  dias: Array<{ fecha: string; primera: number | null }>;
  /** Los días en que se puede decir si se dio o no. */
  universo: Set<string>;
  /** Lo que más aportó en esos días. */
  alimentos: string[];
}

function cuantil(ordenados: number[], q: number): number {
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.round(q * (ordenados.length - 1))))];
}

/** El valor de cada día de un componente, sin los días en que no se sabe lo suficiente. */
export function valoresDelDia(comidas: ComidaDia[], clave: ClaveComponente): Map<string, { valor: number; cobertura: number }> {
  const r = new Map<string, { valor: number; total: number; sabido: number }>();
  for (const c of comidas) {
    const d = r.get(c.fecha) ?? { valor: 0, total: 0, sabido: 0 };
    r.set(c.fecha, d);
    d.total += c.gramos;
    if (c.conocidos && !c.conocidos.has(clave)) continue;
    d.sabido += c.gramos * c.peso;
    d.valor += (c.componentes[clave] ?? 0) * c.peso;
  }
  const out = new Map<string, { valor: number; cobertura: number }>();
  for (const [f, d] of r) {
    const cobertura = d.total ? d.sabido / d.total : 0;
    if (cobertura >= COBERTURA_MIN) out.set(f, { valor: d.valor, cobertura });
  }
  return out;
}

/** Los rasgos de una persona: para cada componente, sus días con mucho (y poco, si importa), según sus propios días. */
export function rasgosDeComidas(comidas: ComidaDia[]): RasgoComponente[] {
  const porDia = new Map<string, ComidaDia[]>();
  for (const c of comidas) {
    const l = porDia.get(c.fecha) ?? [];
    l.push(c);
    porDia.set(c.fecha, l);
  }
  for (const l of porDia.values()) l.sort((a, b) => (a.hora ?? 0) - (b.hora ?? 0));
  // Un día con mucho menos anotado de lo que esta persona suele anotar quedó a medias: no dice "poco".
  const cuantas = [...porDia.values()].map((l) => l.length).sort((a, b) => a - b);
  const minComidas = Math.max(1, Math.ceil(cuantil(cuantas, 0.5) / 2));

  const rasgos: RasgoComponente[] = [];
  for (const comp of COMPONENTES) {
    const valores = valoresDelDia(comidas, comp.clave);
    for (const [f] of valores) if (porDia.get(f)!.length < minComidas) valores.delete(f);
    if (valores.size < DIAS_MIN) continue;
    const orden = [...valores.values()].map((v) => v.valor).sort((a, b) => a - b);
    const med = cuantil(orden, 0.5);
    const universo = new Set(valores.keys());
    const corteMucho = Math.max(cuantil(orden, CUANTIL_MUCHO), comp.piso, med * SOBRE_MEDIANA);
    const dias: RasgoComponente['dias'] = [];
    const aporte = new Map<string, number>();
    for (const [f, v] of valores) {
      if (v.valor < corteMucho) continue;
      // Cuándo se llegó a "mucho": lo que vino después de esa comida no pudo causar lo que pasó antes.
      let suma = 0;
      let primera: number | null = null;
      for (const c of porDia.get(f)!) {
        const aporta = (c.conocidos && !c.conocidos.has(comp.clave) ? 0 : (c.componentes[comp.clave] ?? 0)) * c.peso;
        suma += aporta;
        if (aporta) aporte.set(c.nombre, (aporte.get(c.nombre) ?? 0) + aporta);
        if (primera === null && suma >= corteMucho) primera = c.hora;
      }
      dias.push({ fecha: f, primera });
    }
    if (dias.length >= DIAS_RASGO_MIN) {
      const alimentos = [...aporte].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
      rasgos.push({ clave: comp.clave, nivel: 'mucho', concepto: comp.concepto, dias, universo, alimentos });
    }
    const poco = POCOS.find((p) => p.clave === comp.clave);
    if (poco) {
      const corte = Math.min(cuantil(orden, CUANTIL_POCO), med * BAJO_MEDIANA);
      const bajos: RasgoComponente['dias'] = [];
      for (const [f, v] of valores) {
        if (v.valor > corte) continue;
        // Que fue poco se sabe recién con lo último que se comió.
        const l = porDia.get(f)!;
        bajos.push({ fecha: f, primera: l[l.length - 1].hora });
      }
      if (bajos.length >= DIAS_RASGO_MIN) rasgos.push({ clave: comp.clave, nivel: 'poco', concepto: poco.concepto, dias: bajos, universo, alimentos: [] });
    }
  }
  return rasgos;
}
