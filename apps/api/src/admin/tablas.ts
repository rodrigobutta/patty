// El navegador de tablas de la administración (Datos → Tablas): cualquier tabla de la base, con filtros, orden y
// páginas, y editar o borrar una fila. Los nombres de tablas y columnas se validan contra el catálogo de Postgres
// (nunca se arma SQL con lo que llega del pedido), las columnas con claves o tokens no se muestran ni se editan, y cada
// cambio queda en `auditoria_admin` con cómo estaba antes y cómo quedó.
import { sql, type SQL } from 'drizzle-orm';
import { filas, una, type Tx } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';

/** De qué tipo es lo que guarda cada tabla, para agruparlas en la pantalla. */
export const GRUPO_TABLA: Record<string, 'persona' | 'automatico' | 'ia' | 'catalogo' | 'sistema'> = {
  registros: 'persona',
  tratamientos: 'persona',
  tomas: 'persona',
  gente: 'persona',
  lugares: 'persona',
  preguntas_concepto: 'persona',
  plantillas_seguimiento: 'persona',
  seguimientos: 'persona',
  objetivos: 'persona',
  personas: 'persona',
  persona_usuarios: 'persona',
  supervisiones: 'persona',
  mediciones: 'automatico',
  fuentes: 'automatico',
  puntos: 'automatico',
  escuchas: 'automatico',
  sueno_etapas: 'automatico',
  paseos_detectados: 'automatico',
  uso_diario: 'automatico',
  instalaciones: 'automatico',
  dispositivos: 'automatico',
  avisos_historial: 'automatico',
  llamadas_horas: 'automatico',
  avisos_conteos: 'automatico',
  avisos_detectados: 'automatico',
  analisis: 'ia',
  hallazgos: 'ia',
  resumen_noche: 'ia',
  resumen_semana: 'ia',
  comentarios: 'ia',
  contexto_registro: 'ia',
  fuera_de_lo_normal: 'ia',
  preguntas: 'ia',
  uso_ia: 'ia',
  categorias: 'catalogo',
  conceptos: 'catalogo',
  concepto_alias: 'catalogo',
  medios_cache: 'catalogo',
};

/** Tablas que no se muestran: son llaves de entrada. */
const OCULTAS = new Set(['sesiones', 'codigos_supervision']);
/** Columnas con claves o tokens: no se leen ni se editan. */
const SENSIBLES: Record<string, string[]> = { usuarios: ['clave'], fuentes: ['token_hash'], dispositivos: ['token'] };
/** Tablas que se miran pero no se tocan desde acá (la auditoría no se edita a sí misma). */
const SOLO_LECTURA = new Set(['auditoria_admin', 'serie_diaria', 'accesos']);

export interface Columna {
  nombre: string;
  tipo: string;
  nula: boolean;
  defecto: boolean;
}

export interface Tabla {
  nombre: string;
  vista: boolean;
  grupo: string;
  filas: number;
  columnas: Columna[];
  clave: string[];
  editable: boolean;
}

/** Todas las tablas (y las vistas, solo para mirar) con sus columnas y su clave primaria. */
export async function listarTablas(tx: Tx): Promise<Tabla[]> {
  const cols = await filas<{ tabla: string; vista: boolean; columna: string; tipo: string; nula: boolean; defecto: boolean; filas: number }>(
    tx,
    sql`SELECT c.relname AS tabla, c.relkind = 'v' AS vista, a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo,
               NOT a.attnotnull AS nula, (a.atthasdef OR a.attidentity <> '') AS defecto, greatest(c.reltuples, 0)::bigint AS filas
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum`,
  );
  const pks = await filas<{ tabla: string; columna: string }>(
    tx,
    sql`SELECT c.relname AS tabla, a.attname AS columna
        FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
        WHERE n.nspname = 'public' AND i.indisprimary ORDER BY c.relname, array_position(i.indkey, a.attnum)`,
  );
  const tablas = new Map<string, Tabla>();
  for (const c of cols) {
    if (OCULTAS.has(c.tabla)) continue;
    if (SENSIBLES[c.tabla]?.includes(c.columna)) continue;
    let t = tablas.get(c.tabla);
    if (!t) {
      t = { nombre: c.tabla, vista: c.vista, grupo: GRUPO_TABLA[c.tabla] ?? 'sistema', filas: Number(c.filas), columnas: [], clave: [], editable: false };
      tablas.set(c.tabla, t);
    }
    t.columnas.push({ nombre: c.columna, tipo: c.tipo, nula: c.nula, defecto: c.defecto });
  }
  for (const p of pks) tablas.get(p.tabla)?.clave.push(p.columna);
  for (const t of tablas.values()) t.editable = !t.vista && t.clave.length > 0 && !SOLO_LECTURA.has(t.nombre);
  return [...tablas.values()];
}

export async function tablaDe(tx: Tx, nombre: string): Promise<Tabla> {
  const t = (await listarTablas(tx)).find((x) => x.nombre === nombre);
  if (!t) throw new ErrorApi('No existe.', 404);
  return t;
}

/** La columna por la que se filtra "desde / hasta" en cada tabla: el día si tiene, si no el instante. */
export function columnaFecha(t: Tabla): string | null {
  for (const c of ['fecha', 'noche', 'semana', 'inicio', 'instante', 'programada', 'detectado', 'creado', 'enviado', 'actualizado']) {
    if (t.columnas.some((x) => x.nombre === c)) return c;
  }
  return null;
}

const esTexto = (tipo: string) => tipo === 'text' || tipo.startsWith('character');

export interface Consulta {
  pagina?: number;
  por?: number;
  orden?: string;
  dir?: string;
  persona_id?: number;
  usuario_id?: number;
  desde?: string;
  hasta?: string;
  buscar?: string;
  /** columna → valor exacto (o "null" para vacío). */
  filtros?: Record<string, string>;
}

/** Una página de filas de la tabla, con el total que cumple los filtros. */
export async function leerFilas(tx: Tx, t: Tabla, q: Consulta): Promise<{ filas: Record<string, unknown>[]; total: number; pagina: number; por: number }> {
  const nombres = new Set(t.columnas.map((c) => c.nombre));
  const condiciones: SQL[] = [];
  if (q.persona_id && nombres.has('persona_id')) condiciones.push(sql`${sql.identifier('persona_id')} = ${q.persona_id}`);
  if (q.usuario_id && nombres.has('usuario_id')) condiciones.push(sql`${sql.identifier('usuario_id')} = ${q.usuario_id}`);
  const cf = columnaFecha(t);
  if (cf && q.desde && /^\d{4}-\d{2}-\d{2}$/.test(q.desde)) condiciones.push(sql`${sql.identifier(cf)} >= ${q.desde}::date`);
  if (cf && q.hasta && /^\d{4}-\d{2}-\d{2}$/.test(q.hasta)) condiciones.push(sql`${sql.identifier(cf)} < ${q.hasta}::date + 1`);
  for (const [col, valor] of Object.entries(q.filtros ?? {})) {
    if (!nombres.has(col)) throw new ErrorApi('Columna desconocida: {columna}', 400, { columna: col });
    condiciones.push(valor === 'null' ? sql`${sql.identifier(col)} IS NULL` : sql`${sql.identifier(col)}::text = ${valor}`);
  }
  const buscar = q.buscar?.trim();
  if (buscar) {
    const textos = t.columnas.filter((c) => esTexto(c.tipo) || c.tipo === 'jsonb' || c.tipo === 'text[]');
    if (textos.length) {
      condiciones.push(sql`(${sql.join(textos.map((c) => sql`${sql.identifier(c.nombre)}::text ILIKE ${`%${buscar}%`}`), sql` OR `)})`);
    }
  }
  const donde = condiciones.length ? sql`WHERE ${sql.join(condiciones, sql` AND `)}` : sql``;
  const orden = q.orden && nombres.has(q.orden) ? q.orden : t.clave[0] ?? cf ?? t.columnas[0].nombre;
  const dir = q.dir === 'asc' ? sql`ASC` : sql`DESC`;
  const por = Math.min(500, Math.max(1, Math.round(q.por ?? 50)));
  const pagina = Math.max(1, Math.round(q.pagina ?? 1));
  const lista = sql.join(t.columnas.map((c) => sql.identifier(c.nombre)), sql`, `);
  const tabla = sql.identifier(t.nombre);
  const resultado = await filas<Record<string, unknown>>(
    tx,
    sql`SELECT ${lista} FROM ${tabla} ${donde} ORDER BY ${sql.identifier(orden)} ${dir} NULLS LAST LIMIT ${por} OFFSET ${(pagina - 1) * por}`,
  );
  const total = await una<{ n: number }>(tx, sql`SELECT count(*)::int AS n FROM ${tabla} ${donde}`);
  return { filas: resultado, total: total?.n ?? 0, pagina, por };
}

/** El WHERE de una fila por su clave primaria (tienen que venir todas sus columnas). */
function dondeClave(t: Tabla, clave: Record<string, unknown>): SQL {
  if (!t.clave.length) throw new ErrorApi('Esta tabla no tiene clave: no se puede editar.');
  return sql.join(
    t.clave.map((k) => {
      const v = clave[k];
      if (v === undefined || v === null || v === '') throw new ErrorApi('Falta la clave de la fila ({columna}).', 400, { columna: k });
      return sql`${sql.identifier(k)}::text = ${String(v)}`;
    }),
    sql` AND `,
  );
}

/** Un valor del pedido llevado al tipo de la columna (el tipo sale del catálogo, no del pedido). */
function valorSql(c: Columna, v: unknown): SQL {
  if (v === null || v === undefined || (v === '' && !esTexto(c.tipo))) {
    if (!c.nula) throw new ErrorApi('{columna} no puede quedar vacía.', 400, { columna: c.nombre });
    return sql`NULL`;
  }
  if (c.tipo === 'jsonb' || c.tipo === 'json') {
    let json = v;
    if (typeof v === 'string') {
      try {
        json = JSON.parse(v);
      } catch {
        throw new ErrorApi('{columna}: no es un JSON válido.', 400, { columna: c.nombre });
      }
    }
    return sql`${JSON.stringify(json)}::jsonb`;
  }
  if (c.tipo.endsWith('[]')) {
    const lista = Array.isArray(v) ? v : String(v).split(',').map((x) => x.trim()).filter(Boolean);
    return sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(lista)}::jsonb))::${sql.raw(c.tipo)}`;
  }
  return sql`${String(v)}::${sql.raw(c.tipo)}`;
}

export async function auditar(tx: Tx, usuarioId: number, accion: string, tabla: string | null, clave: unknown, antes: unknown, despues: unknown, detalle: string | null = null) {
  await tx.execute(
    sql`INSERT INTO auditoria_admin (usuario_id, accion, tabla, clave, antes, despues, detalle)
        VALUES (${usuarioId}, ${accion}, ${tabla}, ${clave === null ? null : JSON.stringify(clave)}::jsonb,
                ${antes === null ? null : JSON.stringify(antes)}::jsonb, ${despues === null ? null : JSON.stringify(despues)}::jsonb, ${detalle})`,
  );
}

function exigirEditable(t: Tabla) {
  if (!t.editable) throw new ErrorApi('Esta tabla es solo para mirar.');
}

/** Cambia columnas de una fila y devuelve cómo quedó. */
export async function editarFila(tx: Tx, usuarioId: number, t: Tabla, clave: Record<string, unknown>, cambios: Record<string, unknown>) {
  exigirEditable(t);
  const entradas = Object.entries(cambios);
  if (!entradas.length) throw new ErrorApi('No hay nada para cambiar.');
  const sets = entradas.map(([k, v]) => {
    const c = t.columnas.find((x) => x.nombre === k);
    if (!c) throw new ErrorApi('Columna desconocida: {columna}', 400, { columna: k });
    if (t.clave.includes(k)) throw new ErrorApi('La clave de la fila no se cambia.');
    return sql`${sql.identifier(k)} = ${valorSql(c, v)}`;
  });
  const lista = sql.join(t.columnas.map((c) => sql.identifier(c.nombre)), sql`, `);
  const where = dondeClave(t, clave);
  const antes = await una<Record<string, unknown>>(tx, sql`SELECT ${lista} FROM ${sql.identifier(t.nombre)} WHERE ${where} FOR UPDATE`);
  if (!antes) throw new ErrorApi('No existe.', 404);
  const despues = await una<Record<string, unknown>>(
    tx,
    sql`UPDATE ${sql.identifier(t.nombre)} SET ${sql.join(sets, sql`, `)} WHERE ${where} RETURNING ${lista}`,
  );
  const cambiado = Object.fromEntries(entradas.map(([k]) => [k, antes[k]]));
  const nuevo = Object.fromEntries(entradas.map(([k]) => [k, despues?.[k]]));
  await auditar(tx, usuarioId, 'editar', t.nombre, clave, cambiado, nuevo);
  return despues;
}

/** Borra una fila; con `logico` (si la tabla tiene `borrado`) solo la marca como borrada, como hace la app. */
export async function borrarFila(tx: Tx, usuarioId: number, t: Tabla, clave: Record<string, unknown>, logico: boolean) {
  exigirEditable(t);
  const lista = sql.join(t.columnas.map((c) => sql.identifier(c.nombre)), sql`, `);
  const where = dondeClave(t, clave);
  const antes = await una<Record<string, unknown>>(tx, sql`SELECT ${lista} FROM ${sql.identifier(t.nombre)} WHERE ${where} FOR UPDATE`);
  if (!antes) throw new ErrorApi('No existe.', 404);
  if (logico) {
    if (!t.columnas.some((c) => c.nombre === 'borrado')) throw new ErrorApi('Esta tabla no tiene borrado lógico.');
    await tx.execute(sql`UPDATE ${sql.identifier(t.nombre)} SET borrado = now() WHERE ${where}`);
    await auditar(tx, usuarioId, 'borrar_logico', t.nombre, clave, { borrado: antes.borrado ?? null }, { borrado: 'now()' });
  } else {
    await tx.execute(sql`DELETE FROM ${sql.identifier(t.nombre)} WHERE ${where}`);
    await auditar(tx, usuarioId, 'borrar', t.nombre, clave, antes, null);
  }
}
