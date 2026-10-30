// La tabla compartida de comidas: cada comida se resuelve una sola vez para todos. Nunca frena la carga: lo hace el worker, de a
// poco, con un tope de gasto por día. En orden:
//   a. Si ya está en la tabla (semilla u otra persona), se enlaza y listo: gratis.
//   b. La IA la desarma en ingredientes y elige cada uno de una lista corta de la tabla: los números salen de la tabla.
//   c. Lo que no está en la tabla lo estima la IA por 100 g, y queda marcado como estimado (pesa menos en la confianza).
//   d. Sin IA, o si falla: queda pendiente, los días se arman con lo que digan los tipos del plato (componentes/niveles.ts) y se
//      reintenta más tarde, con una cantidad acotada de intentos.
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { alimentos } from '../db/schema.js';
import { hayIa } from '../ia/cliente.js';
import { pedirDescomposicion, pedirEleccion, type ElegirIngrediente, type EstimadoCrudo, type PlatoCrudo } from '../ia/componentes.js';
import { diaDePatty } from '../lib/fechas.js';
import { conUso } from '../lib/usoIa.js';
import { calcularComponentes, type IngredienteResuelto } from './calcular.js';
import { CLAVES_IA, CLAVES_TABLA, claveAlimento, type Componentes } from './lista.js';
import { buscarIngrediente, tablaIngredientes, type Tabla } from './tabla.js';

/** Con qué nombre queda anotado el gasto (uso_ia.tipo). */
export const TIPO_USO = 'componentes';
/** Cuántas comidas por pedido a la IA. */
export const POR_LOTE = 8;
/**
 * El tope de gasto: tokens por día entre todos (entrada + salida). A US$ 4 / 20 por millón (claude-opus-5-5), peor caso US$ 1,20 por
 * día, más un lote que empiece justo antes del tope (16 mil tokens más, como mucho). Rinde unas 65 comidas por día. Es lo que acota también el
 * relleno de lo viejo.
 */
export const TOKENS_POR_DIA = 60000;
/** Entre un lote y otro en el worker (no se traba la vuelta de cada minuto, ni se gasta todo de golpe). */
const MINUTOS_ENTRE_LOTES = 10;
/** Cuántas veces se intenta una comida antes de dejarla como está (con lo que digan sus tipos). */
export const INTENTOS_MAX = 5;
const HORAS_REINTENTO = 6;
const ENLAZAR_POR_VUELTA = 500;
const ZONA = 'America/Argentina/Buenos_Aires';

const entre = (x: unknown, min: number, max: number, siNo: number) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : siNo;
};

interface Semilla {
  alimentos: Array<{ n: string[]; g: number; u?: number; i: Array<[string, number] | [string, number, Componentes]>; a: number[] }>;
}

/** Una comida de la semilla, ya con sus números. */
export function armarDeSemilla(t: Tabla, s: Semilla['alimentos'][number]) {
  const ingredientes: IngredienteResuelto[] = s.i.map(([nombre, gramos, estimado]) => {
    if (estimado) return { nombre, gramos, fuente: 'estimado', ref: null, por100: estimado };
    const x = t.porNombre.get(claveAlimento(nombre));
    if (!x) throw new Error(`La semilla usa un ingrediente que no está en la tabla: ${nombre}`);
    return { nombre, gramos, fuente: 'tabla', ref: x.id, por100: x.por100 };
  });
  const niveles = Object.fromEntries(CLAVES_IA.map((c, i) => [c, s.a[i] ?? 0]));
  const r = calcularComponentes(ingredientes, niveles);
  return { ...r, gramos: s.g, gramos_unidad: s.u ?? null, ingredientes: ingredientes.map(({ nombre, gramos, fuente, ref }) => ({ nombre, gramos, fuente, ref })) };
}

export const semilla = async () => (await import('./datos/semilla.json', { with: { type: 'json' } })).default as unknown as Semilla;

/** Carga las comidas populares (una vez por cada versión de la semilla). Pisa lo que hubiera con ese nombre: está revisada a mano. */
export async function cargarSemilla(tx: Tx): Promise<void> {
  const s = await semilla();
  const version = createHash('sha1').update(JSON.stringify(s.alimentos)).digest('hex').slice(0, 12);
  const primera = await una(tx, sql`INSERT INTO avisos_enviados (clave) VALUES (${`semilla-alimentos|${version}`}) ON CONFLICT DO NOTHING RETURNING clave`);
  if (!primera) return;
  const t = await tablaIngredientes();
  const valores = new Map<string, typeof alimentos.$inferInsert>();
  for (const a of s.alimentos) {
    const r = armarDeSemilla(t, a);
    for (const nombre of a.n) {
      valores.set(claveAlimento(nombre), { clave: claveAlimento(nombre), nombre, estado: 'resuelto', fuente: 'semilla', confianza: r.confianza, gramos: r.gramos, gramos_unidad: r.gramos_unidad, ingredientes: r.ingredientes, componentes: r.componentes });
    }
  }
  await tx
    .insert(alimentos)
    .values([...valores.values()])
    .onConflictDoUpdate({
      target: alimentos.clave,
      set: { nombre: sql`excluded.nombre`, estado: 'resuelto', fuente: 'semilla', confianza: sql`excluded.confianza`, gramos: sql`excluded.gramos`, gramos_unidad: sql`excluded.gramos_unidad`, ingredientes: sql`excluded.ingredientes`, componentes: sql`excluded.componentes`, error: null, actualizado: sql`now()` },
    });
}

/**
 * a. Las comidas y bebidas anotadas que todavía no apuntan a la tabla: si ya está (por nombre o por alguno de sus otros nombres),
 * se enlazan; si no, se crean pendientes. Devuelve cuántas enlazó. Lo que entra solo por el plato ("Comida frita") no se anota
 * nunca como comida propia: no se resuelve.
 */
export async function enlazarConceptos(db: Db | Tx, limite = ENLAZAR_POR_VUELTA): Promise<number> {
  const lista = await filas<{ id: number; nombre: string; alias: string[] }>(
    db,
    sql`SELECT c.id, c.nombre, coalesce((SELECT array_agg(a.alias) FROM concepto_alias a WHERE a.concepto_id = c.id), '{}') AS alias
        FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
        WHERE c.alimento_id IS NULL AND c.unido_a IS NULL AND c.usos > 0 AND k.clave IN ('comida', 'bebida')
        ORDER BY c.usos DESC, c.id LIMIT ${limite}`,
  );
  let n = 0;
  for (const c of lista) {
    const clave = claveAlimento(c.nombre);
    if (!clave) continue;
    const claves = [clave, ...c.alias.map(claveAlimento).filter(Boolean)];
    let id = (await una<{ id: number }>(db, sql`SELECT id FROM alimentos WHERE clave IN ${claves} ORDER BY (estado = 'resuelto') DESC, (clave = ${clave}) DESC LIMIT 1`))?.id;
    if (id === undefined) {
      await db.insert(alimentos).values({ clave, nombre: c.nombre }).onConflictDoNothing({ target: alimentos.clave });
      id = (await una<{ id: number }>(db, sql`SELECT id FROM alimentos WHERE clave = ${clave}`))!.id;
    }
    await db.execute(sql`UPDATE conceptos SET alimento_id = ${id} WHERE id = ${c.id}`);
    n++;
  }
  return n;
}

/** Cuánto se gastó hoy en esto (tokens). */
export async function gastadoHoy(db: Db | Tx, ahora = new Date()): Promise<number> {
  return (await una<{ n: number }>(db, sql`SELECT coalesce(sum(entrada + salida), 0)::int AS n FROM uso_ia WHERE tipo = ${TIPO_USO} AND fecha = ${diaDePatty(ahora, ZONA)}`))?.n ?? 0;
}

export interface ComidaResuelta {
  nombre: string;
  estado: 'resuelto' | 'generico' | 'no_comida';
  confianza: number;
  gramos: number | null;
  gramos_unidad: number | null;
  ingredientes: Array<{ nombre: string; gramos: number; fuente: IngredienteResuelto['fuente']; ref: number | null; en?: string }>;
  componentes: Componentes;
}

/** b y c: de nombres a componentes, con la IA. Tira si la IA falla. Una comida que volvió rara queda fuera del resultado. */
export async function resolverConIa(comidas: Array<{ nombre: string; categoria?: string | null }>): Promise<Map<number, ComidaResuelta>> {
  const t = await tablaIngredientes();
  const platos = new Map<number, PlatoCrudo>();
  for (const p of await pedirDescomposicion(comidas)) if (Number.isInteger(p?.indice) && p.indice >= 0 && p.indice < comidas.length && Array.isArray(p.ingredientes)) platos.set(p.indice, p);

  // Lo que está tal cual en la tabla (por nombre en castellano) no hace falta preguntarlo. Lo demás, de una lista corta.
  interface Item { plato: number; nombre: string; gramos: number; ref: number | null; por100: Componentes; fuente: IngredienteResuelto['fuente'] }
  const items: Item[] = [];
  const preguntas: ElegirIngrediente[] = [];
  const dePregunta: Item[] = [];
  for (const [i, p] of platos) {
    if (p.tipo !== 'plato') continue;
    for (const x of p.ingredientes.slice(0, 8)) {
      const gramos = entre(x?.gramos, 0, 1500, 0);
      const nombre = String(x?.nombre ?? '').slice(0, 80);
      if (!gramos || !nombre) continue;
      const item: Item = { plato: i, nombre, gramos, ref: null, por100: {}, fuente: 'sin_dato' };
      items.push(item);
      const directo = t.porNombre.get(claveAlimento(nombre));
      if (directo) {
        Object.assign(item, { ref: directo.id, por100: directo.por100, fuente: 'tabla' });
        continue;
      }
      const candidatos = buscarIngrediente(t, `${String(x?.busqueda_en ?? '')} ${nombre}`);
      preguntas.push({ nombre, candidatos: candidatos.map((c) => ({ id: c.id, en: c.en })) });
      dePregunta.push(item);
    }
  }
  if (preguntas.length) {
    const { elegidos, estimados } = await pedirEleccion(preguntas);
    for (const e of elegidos) {
      const item = dePregunta[e?.indice];
      const x = t.porId.get(Number(e?.id));
      // Solo vale un id de los que se le mostraron.
      if (!item || !x || !preguntas[e.indice].candidatos.some((c) => c.id === x.id)) continue;
      Object.assign(item, { ref: x.id, por100: x.por100, fuente: 'tabla' });
    }
    for (const e of estimados as EstimadoCrudo[]) {
      const item = dePregunta[e?.indice];
      if (!item || item.fuente === 'tabla') continue;
      const por100: Componentes = {};
      for (const c of CLAVES_TABLA) {
        const v = entre(e[c], 0, c === 'sal' ? 40000 : c === 'calorias' ? 900 : c === 'cafeina' ? 3000 : 100, 0);
        if (v) por100[c] = v;
      }
      Object.assign(item, { por100, fuente: 'estimado' });
    }
  }

  const r = new Map<number, ComidaResuelta>();
  for (const [i, p] of platos) {
    const nombre = comidas[i].nombre;
    if (p.tipo !== 'plato') {
      r.set(i, { nombre, estado: p.tipo === 'no_es_comida' ? 'no_comida' : 'generico', confianza: 0, gramos: null, gramos_unidad: null, ingredientes: [], componentes: {} });
      continue;
    }
    const mios = items.filter((x) => x.plato === i);
    if (!mios.length) continue;
    const niveles = Object.fromEntries(CLAVES_IA.map((c) => [c, Math.round(entre(p[c], 0, 3, 0))]));
    const c = calcularComponentes(mios.map((x) => ({ nombre: x.nombre, gramos: x.gramos, fuente: x.fuente, ref: x.ref, por100: x.por100 })), niveles);
    r.set(i, {
      nombre,
      estado: 'resuelto',
      confianza: c.confianza,
      gramos: c.gramos,
      gramos_unidad: entre(p.gramos_unidad, 0, 2000, 0) || null,
      ingredientes: mios.map((x) => ({ nombre: x.nombre, gramos: x.gramos, fuente: x.fuente, ref: x.ref, ...(x.ref ? { en: t.porId.get(x.ref)?.en } : {}) })),
      componentes: c.componentes,
    });
  }
  return r;
}

/**
 * Un lote de comidas pendientes, si hay IA y queda presupuesto. Devuelve cuántas resolvió. Si la IA falla, cada una suma un intento y se
 * reintenta más tarde, cada vez más espaciado; al llegar al tope queda `fallido` (sigue pesando por sus tipos). Que no haya IA o
 * se haya gastado el día no cuenta como intento.
 */
export async function resolverLote(db: Db, o: { limite?: number; ahora?: Date } = {}): Promise<number> {
  const ahora = o.ahora ?? new Date();
  if (!hayIa() || (await gastadoHoy(db, ahora)) >= TOKENS_POR_DIA) return 0;
  const lote = await filas<{ id: number; nombre: string; categoria: string | null; intentos: number }>(
    db,
    sql`SELECT a.id, a.nombre, a.intentos, (SELECT k.clave FROM conceptos c JOIN categorias k ON k.id = c.categoria_id WHERE c.alimento_id = a.id LIMIT 1) AS categoria
        FROM alimentos a
        WHERE a.estado = 'pendiente' AND a.proximo_intento <= ${ahora.toISOString()}::timestamptz + interval '1 second'
        ORDER BY (SELECT coalesce(sum(c.usos), 0) FROM conceptos c WHERE c.alimento_id = a.id) DESC, a.id
        LIMIT ${o.limite ?? POR_LOTE}`,
  );
  if (!lote.length) return 0;
  const fallar = async (x: (typeof lote)[number], error: string) => {
    const intentos = x.intentos + 1;
    const espera = HORAS_REINTENTO * 2 ** x.intentos;
    await db.execute(
      sql`UPDATE alimentos SET intentos = ${intentos}, error = ${error.slice(0, 300)}, actualizado = now(),
            estado = ${intentos >= INTENTOS_MAX ? 'fallido' : 'pendiente'},
            proximo_intento = ${ahora.toISOString()}::timestamptz + make_interval(hours => ${espera})
          WHERE id = ${x.id}`,
    );
  };
  let resueltas: Map<number, ComidaResuelta>;
  try {
    resueltas = await conUso({ usuarioId: null, tipo: TIPO_USO }, () => resolverConIa(lote));
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('Componentes: la IA no pudo resolver un lote:', m);
    for (const x of lote) await fallar(x, m);
    return 0;
  }
  let n = 0;
  for (const [i, x] of lote.entries()) {
    const r = resueltas.get(i);
    if (!r) {
      await fallar(x, 'La IA no devolvió esta comida.');
      continue;
    }
    await db.execute(
      sql`UPDATE alimentos SET estado = ${r.estado}, fuente = 'ia', confianza = ${r.confianza}, gramos = ${r.gramos}, gramos_unidad = ${r.gramos_unidad},
            ingredientes = ${JSON.stringify(r.ingredientes)}::jsonb, componentes = ${JSON.stringify(r.componentes)}::jsonb, error = NULL, actualizado = now()
          WHERE id = ${x.id}`,
    );
    n++;
  }
  console.log(`Componentes: ${n} de ${lote.length} comidas resueltas con la IA.`);
  return n;
}

let ultimoLote = 0;
/** La vuelta de cada minuto del worker: enlaza lo nuevo (gratis) y, de vez en cuando, un lote con la IA. */
export async function componentesPendientes(db: Db, ahora = new Date()): Promise<number> {
  let n = await enlazarConceptos(db);
  if (ahora.getTime() - ultimoLote >= MINUTOS_ENTRE_LOTES * 60000) {
    ultimoLote = ahora.getTime();
    n += await resolverLote(db, { ahora });
  }
  return n;
}

/** Para probar la IA de verdad: resuelve una comida y devuelve lo que saldría, sin guardar nada. Gasta (cuenta para el tope). */
export async function probarAlimento(nombre: string, categoria: 'comida' | 'bebida' = 'comida'): Promise<ComidaResuelta | null> {
  const r = await conUso({ usuarioId: null, tipo: TIPO_USO }, () => resolverConIa([{ nombre, categoria }]));
  return r.get(0) ?? null;
}

/** Cómo viene la tabla (para la administración). */
export async function estadoAlimentos(db: Db, ahora = new Date()) {
  const porEstado = await filas<{ estado: string; fuente: string | null; n: number; confianza: number | null }>(
    db,
    sql`SELECT estado, fuente, count(*)::int AS n, round(avg(confianza)::numeric, 2)::float AS confianza FROM alimentos GROUP BY 1, 2 ORDER BY 1, 2`,
  );
  return { por_estado: porEstado, tokens_hoy: await gastadoHoy(db, ahora), tope_tokens_dia: TOKENS_POR_DIA };
}
