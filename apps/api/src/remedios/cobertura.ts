// Qué cubre lo que la persona come y toma, y qué aparece poco. No hay tabla de vitaminas por comida (componentes/lista.ts las deja afuera
// a propósito), así que se mira con palabras: en qué comidas e ingredientes anotados suele estar cada una. Es sin IA y una estimación
// gruesa: no mide cantidades ni las compara con nada, y "aparece poco" nunca quiere decir que falte. Con pocos días anotados no se dice nada.
import { sql } from 'drizzle-orm';
import { NUTRIENTES, nombreNutriente, normalizar, type ClaveNutriente, type Cobertura, type ComponenteSuplemento, type FuenteContenido, type NutrienteCubierto, type Suplemento } from 'shared';
import { filas, type Tx } from '../db/client.js';
import { sumarDias } from '../lib/fechas.js';
import { claveRemedio } from './saberes.js';

export const DIAS_COBERTURA = 30;
/** Con menos días con comidas que esto, no se dice nada de la comida. */
export const DIAS_MINIMOS = 10;
/** Por debajo de esta parte de los días (y hasta un mínimo), aparece poco. */
const PARTE_POCO = 0.1;

/** Dónde suele estar cada una. En singular y sin tildes, como quedan al normalizar lo anotado. */
export const FUENTES: Record<ClaveNutriente, string[]> = {
  vitamina_a: ['zanahoria', 'zapallo', 'calabaza', 'batata', 'espinaca', 'acelga', 'higado', 'huevo', 'manteca', 'mango', 'morron'],
  vitamina_b12: ['carne', 'bife', 'asado', 'milanesa', 'hamburguesa', 'pollo', 'pescado', 'atun', 'salmon', 'merluza', 'sardina', 'huevo', 'leche', 'queso', 'yogur', 'higado', 'jamon'],
  folato: ['lenteja', 'garbanzo', 'poroto', 'espinaca', 'acelga', 'brocoli', 'palta', 'naranja', 'lechuga', 'higado'],
  vitamina_c: ['naranja', 'mandarina', 'limon', 'pomelo', 'kiwi', 'frutilla', 'morron', 'tomate', 'brocoli', 'repollo', 'anana'],
  vitamina_d: ['salmon', 'atun', 'caballa', 'sardina', 'trucha', 'huevo', 'hongo', 'champinon'],
  vitamina_e: ['almendra', 'nuez', 'mani', 'girasol', 'aceite', 'palta', 'espinaca'],
  vitamina_k: ['espinaca', 'acelga', 'brocoli', 'repollo', 'lechuga', 'rucula', 'kale', 'perejil'],
  calcio: ['leche', 'queso', 'yogur', 'almendra', 'sardina', 'brocoli', 'tofu', 'ricota'],
  hierro: ['carne', 'bife', 'asado', 'milanesa', 'hamburguesa', 'higado', 'lenteja', 'garbanzo', 'poroto', 'espinaca', 'acelga', 'morcilla'],
  magnesio: ['nuez', 'almendra', 'mani', 'semilla', 'avena', 'lenteja', 'garbanzo', 'poroto', 'banana', 'espinaca', 'chocolate'],
  zinc: ['carne', 'bife', 'asado', 'pollo', 'mariscos', 'semilla', 'lenteja', 'garbanzo', 'queso', 'huevo', 'nuez'],
  potasio: ['banana', 'papa', 'batata', 'tomate', 'naranja', 'palta', 'lenteja', 'poroto', 'espinaca'],
  omega_3: ['salmon', 'atun', 'caballa', 'sardina', 'trucha', 'nuez', 'chia', 'lino'],
};

/** Lo que dice el nombre de un tratamiento ("Vitamina D", "Hierro", "Complejo B"), para contarlo aunque no esté cargado como suplemento. */
const POR_NOMBRE: Array<[RegExp, ClaveNutriente]> = [
  [/\bvitamina a\b/, 'vitamina_a'],
  [/\b(vitamina b12|b12|cianocobalamina)\b/, 'vitamina_b12'],
  [/\b(acido folico|folato)\b/, 'folato'],
  [/\b(vitamina c|acido ascorbico)\b/, 'vitamina_c'],
  [/\b(vitamina d|vitamina d3|colecalciferol)\b/, 'vitamina_d'],
  [/\bvitamina e\b/, 'vitamina_e'],
  [/\bvitamina k\b/, 'vitamina_k'],
  [/\bcalcio\b/, 'calcio'],
  [/\b(hierro|sulfato ferroso)\b/, 'hierro'],
  [/\bmagnesio\b/, 'magnesio'],
  [/\bzinc\b/, 'zinc'],
  [/\bpotasio\b/, 'potasio'],
  [/\b(omega 3|omega3)\b/, 'omega_3'],
];

export const nutrientesDelNombre = (nombre: string): ClaveNutriente[] => POR_NOMBRE.filter(([r]) => r.test(normalizar(nombre))).map(([, c]) => c);

const palabras = (x: string) =>
  normalizar(x)
    .split(' ')
    .filter(Boolean)
    .map((p) => (p.length > 3 && p.endsWith('es') && 'lnrd'.includes(p[p.length - 3]) ? p.slice(0, -2) : p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p));

interface ComidaAnotada {
  fecha: string;
  nombre: string;
  ingredientes: string[];
}

/** Pura: lo anotado + lo que toma → qué se cubre. */
export function calcularCobertura(
  comidas: ComidaAnotada[],
  toma: Array<{ nombre: string; contenido: ComponenteSuplemento[]; fuente: FuenteContenido }>,
  desde: string,
  hasta: string,
): Cobertura {
  const dias = new Set(comidas.map((c) => c.fecha));
  const suficiente = dias.size >= DIAS_MINIMOS;
  const conPalabras = comidas.map((c) => ({ ...c, palabras: new Set([...palabras(c.nombre), ...c.ingredientes.flatMap(palabras)]) }));
  const nutrientes: NutrienteCubierto[] = NUTRIENTES.map(({ clave }) => {
    const fuentes = FUENTES[clave];
    const coinciden = conPalabras.filter((c) => fuentes.some((f) => c.palabras.has(f)));
    const diasCon = new Set(coinciden.map((c) => c.fecha)).size;
    const veces = new Map<string, number>();
    for (const c of coinciden) veces.set(c.nombre, (veces.get(c.nombre) ?? 0) + 1);
    const alimentos = [...veces].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    const deLoQueToma = toma.flatMap((t) => t.contenido.filter((x) => x.nutriente === clave).map((x) => ({ nombre: t.nombre, cantidad: x.cantidad, unidad: x.unidad, fuente: t.fuente })));
    const poco = diasCon < Math.max(2, dias.size * PARTE_POCO);
    const estado: NutrienteCubierto['estado'] = deLoQueToma.length ? 'toma' : !suficiente ? 'sin_dato' : poco ? 'poco' : 'comida';
    return { clave, estado, toma: deLoQueToma, alimentos, dias: diasCon };
  });
  return { desde, hasta, dias_con_comida: dias.size, suficiente, nutrientes };
}

/** Lo que toma con el contenido que vale: el suplemento, o lo que dice su nombre si es un tratamiento. */
export async function loQueToma(tx: Tx, personaId: number): Promise<Array<{ nombre: string; contenido: ComponenteSuplemento[]; fuente: FuenteContenido }>> {
  const sup = await suplementosDe(tx, personaId);
  const salida: Array<{ nombre: string; contenido: ComponenteSuplemento[]; fuente: FuenteContenido }> = sup.filter((s) => s.activo).map((s) => ({ nombre: s.nombre, contenido: s.contenido, fuente: s.fuente }));
  const ya = new Set(sup.filter((s) => s.activo).map((s) => s.clave));
  const trat = await filas<{ nombre: string }>(
    tx,
    sql`SELECT DISTINCT c.nombre FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id
        WHERE t.persona_id = ${personaId} AND t.borrado IS NULL AND t.terminado IS NULL AND (t.fin IS NULL OR t.fin > now())`,
  );
  for (const t of trat) {
    if (ya.has(claveRemedio(t.nombre))) continue;
    const contenido = nutrientesDelNombre(t.nombre).map((c) => ({ nutriente: c, nombre: nombreNutriente(c)!, cantidad: null, unidad: null }));
    if (contenido.length) salida.push({ nombre: t.nombre, contenido, fuente: 'persona' });
  }
  return salida;
}

export async function coberturaDe(tx: Tx, personaId: number, hasta: string): Promise<Cobertura> {
  const desde = sumarDias(hasta, -DIAS_COBERTURA + 1);
  const comidas = await filas<{ fecha: string; nombre: string; ingredientes: Array<{ nombre: string }> | null }>(
    tx,
    sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, c.nombre, a.ingredientes
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id LEFT JOIN alimentos a ON a.id = c.alimento_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave IN ('comida', 'bebida') AND r.fecha BETWEEN ${desde} AND ${hasta}`,
  );
  return calcularCobertura(
    comidas.map((c) => ({ fecha: c.fecha, nombre: c.nombre, ingredientes: (c.ingredientes ?? []).map((i) => i.nombre) })),
    await loQueToma(tx, personaId),
    desde,
    hasta,
  );
}

/** Los suplementos de una persona, con el contenido que vale y de dónde salió. */
export async function suplementosDe(tx: Tx, personaId: number, id?: number): Promise<Suplemento[]> {
  const l = await filas<{ id: number; persona_id: number; nombre: string; clave: string; contenido: ComponenteSuplemento[] | null; origen: 'nombre' | 'foto'; corregido: boolean; desde: string; terminado: string | null; tipico: ComponenteSuplemento[] | null}>(
    tx,
    sql`SELECT s.id, s.persona_id, s.nombre, s.clave, s.contenido, s.origen, s.corregido, s.desde, s.terminado, x.contenido AS tipico
        FROM suplementos s LEFT JOIN saberes_remedio x ON x.clave = s.clave AND x.estado = 'conocido'
        WHERE s.persona_id = ${personaId} AND s.borrado IS NULL ${id ? sql`AND s.id = ${id}` : sql``} ORDER BY s.terminado IS NOT NULL, s.desde DESC`,
  );
  return l.map((s) => {
    const propio = s.contenido !== null;
    const tipico = s.tipico ?? [];
    const fuente: FuenteContenido = s.corregido || (propio && s.origen === 'nombre') ? 'persona' : propio ? 'foto' : tipico.length ? 'ia' : 'sin_dato';
    return {
      id: s.id,
      persona_id: s.persona_id,
      nombre: s.nombre,
      clave: s.clave,
      contenido: propio ? s.contenido! : tipico,
      fuente,
      corregido: s.corregido,
      desde: new Date(s.desde).toISOString(),
      terminado: s.terminado ? new Date(s.terminado).toISOString() : null,
      activo: !s.terminado,
    };
  });
}
