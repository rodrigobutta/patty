// La tabla compartida de lo que se sabe de cada remedio: se llena de a poco en el worker, y sin IA simplemente queda pendiente (lo
// demás sigue andando, sin el dato). Acá también se decide cuándo dos nombres son lo mismo: nada de esto usa la IA.
import { sql } from 'drizzle-orm';
import { CLAVES_NUTRIENTES, esTextoSeguro, nombreNutriente, normalizar, type ComponenteSuplemento } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { hayIa } from '../ia/cliente.js';
import { pedirSaberes, type ContenidoCrudo, type SaberCrudo } from '../ia/saberRemedios.js';
import { diaDePatty } from '../lib/fechas.js';
import { conUso } from '../lib/usoIa.js';

/** Con qué nombre queda anotado el gasto (uso_ia.tipo). */
export const TIPO_USO = 'saberes_remedio';
/** Cuántos nombres por pedido a la IA. */
const POR_LOTE = 5;
/** El tope de gasto: tokens por día entre todos. Cada nombre se paga una sola vez, así que alcanza y sobra. */
const TOKENS_POR_DIA = 60000;
const INTENTOS_MAX = 5;
const HORAS_REINTENTO = 6;
/** Lo que la IA no reconoció se vuelve a probar al mes; lo conocido, al medio año. */
const DIAS_REPASO_DESCONOCIDO = 30;
const DIAS_REPASO_CONOCIDO = 180;
const ZONA = 'America/Argentina/Buenos_Aires';

const UNIDAD = /^(mg|mcg|ug|µg|g|gr|grs|ml|ui|iu|comp|comprimidos?|capsulas?|caps|gotas?|sobres?|tabletas?|pastillas?|cucharadas?|cucharaditas?|forte|retard|plus)$/;
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'al', 'a', 'con', 'y', 'e', 'en', 'mi', 'me', 'se', 'muy', 'mucho', 'mucha', 'the', 'of', 'with', 'and', 'my', 'i', 'have']);

function singular(p: string): string {
  if (p.length <= 3 || !p.endsWith('s')) return p;
  if (p.endsWith('es') && p.length > 4 && 'lnrd'.includes(p[p.length - 3])) return p.slice(0, -2);
  return p.slice(0, -1);
}

/**
 * La clave de un remedio en la tabla compartida: sin tildes ni mayúsculas, y sin la dosis ni la forma. "Ibuprofeno 400 mg", "ibuprofeno
 * 400" e "IBUPROFENO" son el mismo; "Omega 3" y "Vitamina B12" conservan lo que los nombra.
 */
export function claveRemedio(nombre: string): string {
  const palabras = normalizar(nombre).split(' ').filter(Boolean);
  const quedan = palabras.filter((p, i) => {
    if (UNIDAD.test(p)) return false;
    if (/^\d+(mg|mcg|ug|g|ml|ui|iu)$/.test(p)) return false;
    // Un número suelto es la dosis, salvo los que son parte del nombre ("omega 3", "vitamina b 12").
    if (/^\d+$/.test(p) && (Number(p) >= 25 || UNIDAD.test(palabras[i + 1] ?? ''))) return false;
    return !VACIAS.has(p);
  });
  return quedan.join(' ') || normalizar(nombre);
}

/** Las palabras de lo que anota una persona, para comparar con un efecto. "Me duele la cabeza" y "Dolor de cabeza" dan lo mismo. */
function palabrasDeSintoma(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p && !VACIAS.has(p))
    .map((p) => (/^(duele|duelen|dolores|doliendo|dolia|dolio)$/.test(p) ? 'dolor' : singular(p)));
}

/** Solas, estas no dicen qué: "dolor" no coincide con cualquier dolor. */
const GENERICAS = new Set(['dolor', 'molestia', 'malestar', 'problema', 'pain', 'ache', 'discomfort', 'sintoma', 'efecto', 'estado']);

/** Si lo anotado es ese efecto (o uno de sus sinónimos): tiene todas sus palabras. "Dolor de cabeza fuerte" es "dolor de cabeza"; "Dolor de panza" no es "dolor". */
export function esElMismoSintoma(anotado: string, efecto: string): boolean {
  const a = new Set(palabrasDeSintoma(anotado));
  const e = palabrasDeSintoma(efecto);
  if (!a.size || !e.length) return false;
  if (e.length === 1 && GENERICAS.has(e[0])) return false;
  return e.every((p) => a.has(p));
}

/** Si un nombre de una interacción ("ibuprofeno", "antiinflamatorios") nombra algo que la persona toma. */
export function nombraA(con: string, clave: string): boolean {
  const c = claveRemedio(con);
  if (!c) return false;
  return c === clave || ` ${c} `.includes(` ${clave} `) || ` ${clave} `.includes(` ${c} `);
}

const corto = (x: unknown, n: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Lo que vino de la IA, sin lo que no sirve: cantidades y unidades raras, o lo repetido. Cantidad 0 quiere decir que no se sabe. */
export function limpiarContenido(lista: ContenidoCrudo[] | ComponenteSuplemento[] | null | undefined): ComponenteSuplemento[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const salida: ComponenteSuplemento[] = [];
  for (const x of lista.slice(0, 30)) {
    const nutriente = CLAVES_NUTRIENTES.includes(x?.nutriente) ? x.nutriente : 'otro';
    const nombre = corto(x?.nombre, 60) || nombreNutriente(nutriente) || '';
    if (!nombre) continue;
    const clave = nutriente === 'otro' ? normalizar(nombre) : nutriente;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const n = Number(x?.cantidad);
    const cantidad = Number.isFinite(n) && n > 0 ? n : null;
    salida.push({ nutriente, nombre, cantidad, unidad: cantidad === null ? null : corto(x?.unidad, 12) || null });
  }
  return salida;
}

/**
 * Lo que devolvió la IA para un nombre, listo para guardar. Lo que no reconoce no tiene nada (aunque haya mandado algo), y lo que
 * se sale de los límites (que deje o ajuste un remedio, que compre un suplemento) se saca: acá no se le cree por las dudas.
 */
export function limpiarSaber(c: SaberCrudo) {
  if (c.reconocido !== true) return { estado: 'desconocido' as const, tipo: null, efectos: [], interacciones: [], contenido: [] };
  const efectos = (Array.isArray(c.efectos) ? c.efectos : [])
    .slice(0, 10)
    .map((e) => ({
      nombre: corto(e?.nombre, 80),
      nombre_en: corto(e?.nombre_en, 80),
      sinonimos: (Array.isArray(e?.sinonimos) ? e.sinonimos : []).slice(0, 6).map((s) => corto(s, 60)).filter(Boolean),
      urgente: e?.urgente === true,
    }))
    .filter((e) => e.nombre && esTextoSeguro(e.nombre) && esTextoSeguro(e.nombre_en));
  const interacciones = (Array.isArray(c.interacciones) ? c.interacciones : [])
    .slice(0, 6)
    .map((i) => ({ con: corto(i?.con, 60), con_en: corto(i?.con_en, 60), detalle: corto(i?.detalle, 240), detalle_en: corto(i?.detalle_en, 240) }))
    .filter((i) => i.con && i.detalle && [i.con, i.con_en, i.detalle, i.detalle_en].every(esTextoSeguro));
  return {
    estado: 'conocido' as const,
    tipo: c.tipo === 'suplemento' || c.tipo === 'medicamento' ? c.tipo : null,
    efectos,
    interacciones,
    contenido: limpiarContenido(c.contenido),
  };
}

/** Los nombres que hacen falta: lo que alguien toma hoy o tomó hace poco. Solo el nombre: nada de quién. */
async function anotarFaltantes(db: Db): Promise<void> {
  const nombres = await filas<{ nombre: string }>(
    db,
    sql`SELECT c.nombre FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id
        WHERE t.borrado IS NULL AND t.terminado IS NULL AND (t.fin IS NULL OR t.fin > now())
        UNION
        SELECT c.nombre FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
        WHERE k.clave = 'medicacion' AND c.unido_a IS NULL AND c.ultimo_uso > now() - interval '90 days'
        UNION
        SELECT s.nombre FROM suplementos s WHERE s.borrado IS NULL AND s.terminado IS NULL`,
  );
  const claves = [...new Set(nombres.map((x) => claveRemedio(x.nombre)).filter(Boolean))];
  if (!claves.length) return;
  await db.execute(
    sql`INSERT INTO saberes_remedio (clave) SELECT * FROM unnest(ARRAY[${sql.join(claves.map((c) => sql`${c}`), sql`, `)}]::text[]) ON CONFLICT (clave) DO NOTHING`,
  );
}

/** Una vuelta del worker: anota los nombres nuevos y, si hay IA y queda presupuesto, averigua unos pocos. Devuelve cuántos resolvió. */
export async function saberesPendientes(db: Db, ahora = new Date()): Promise<number> {
  await anotarFaltantes(db);
  if (!hayIa()) return 0;
  await db.execute(
    sql`UPDATE saberes_remedio SET estado = 'pendiente', intentos = 0, proximo_intento = now()
        WHERE (estado = 'desconocido' AND actualizado < now() - make_interval(days => ${DIAS_REPASO_DESCONOCIDO}))
           OR (estado = 'conocido' AND actualizado < now() - make_interval(days => ${DIAS_REPASO_CONOCIDO}))`,
  );
  const gastado = await una<{ n: number }>(db, sql`SELECT coalesce(sum(entrada + salida), 0)::int AS n FROM uso_ia WHERE tipo = ${TIPO_USO} AND fecha = ${diaDePatty(ahora, ZONA)}`);
  if ((gastado?.n ?? 0) >= TOKENS_POR_DIA) return 0;
  const lote = await filas<{ id: number; clave: string; intentos: number }>(
    db,
    sql`SELECT id, clave, intentos FROM saberes_remedio WHERE estado = 'pendiente' AND proximo_intento <= now() ORDER BY id LIMIT ${POR_LOTE}`,
  );
  if (!lote.length) return 0;
  const fallar = async (x: (typeof lote)[number], error: string) =>
    db.execute(
      sql`UPDATE saberes_remedio SET intentos = ${x.intentos + 1}, error = ${error.slice(0, 300)}, actualizado = now(),
            estado = ${x.intentos + 1 >= INTENTOS_MAX ? 'fallido' : 'pendiente'}, proximo_intento = now() + make_interval(hours => ${HORAS_REINTENTO})
          WHERE id = ${x.id}`,
    );
  let crudos: SaberCrudo[];
  try {
    crudos = await conUso({ usuarioId: null, tipo: TIPO_USO }, () => pedirSaberes(lote.map((x) => x.clave)));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('Saberes de remedios: la IA falló:', error);
    for (const x of lote) await fallar(x, error);
    return 0;
  }
  let n = 0;
  for (const [i, x] of lote.entries()) {
    const c = crudos.find((y) => y?.indice === i);
    if (!c) {
      await fallar(x, 'La IA no lo devolvió');
      continue;
    }
    const s = limpiarSaber(c);
    await db.execute(
      sql`UPDATE saberes_remedio SET estado = ${s.estado}, tipo = ${s.tipo}, efectos = ${JSON.stringify(s.efectos)}::jsonb, interacciones = ${JSON.stringify(s.interacciones)}::jsonb,
            contenido = ${JSON.stringify(s.contenido)}::jsonb, error = NULL, actualizado = now() WHERE id = ${x.id}`,
    );
    n++;
  }
  return n;
}
