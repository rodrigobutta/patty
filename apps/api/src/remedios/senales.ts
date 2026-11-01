// Lo que la persona toma y lo que eso puede tener que ver con lo que siente: cruza lo anotado con la tabla compartida de efectos. Es
// todo sin IA (la tabla ya está llena, o no hay dato) y se calcula al pedirlo, así no queda nada desactualizado si se borra o se
// cambia algo. Un síntoma no se señala si el remedio se tomó justamente para eso, ni si apareció antes de empezar a tomarlo.
import { sql } from 'drizzle-orm';
import { traducir, type EfectoRemedio, type EstadoSaber, type Idioma, type RemedioVigilado, type SenalEfecto } from 'shared';
import { filas, type Tx } from '../db/client.js';
import { claveRemedio, esElMismoSintoma, nombraA } from './saberes.js';

/** Lo que tomó puede seguir teniendo que ver unos días después. */
const VENTANA_MS = 72 * 3600000;

interface FilaSaber {
  clave: string;
  estado: EstadoSaber;
  efectos: Array<{ nombre: string; nombre_en: string; sinonimos: string[]; urgente: boolean }>;
  interacciones: Array<{ con: string; con_en: string; detalle: string; detalle_en: string }>;
}

async function saberesDe(tx: Tx, claves: string[]): Promise<Map<string, FilaSaber>> {
  if (!claves.length) return new Map();
  const l = await filas<FilaSaber>(tx, sql`SELECT clave, estado, efectos, interacciones FROM saberes_remedio WHERE clave IN (${sql.join(claves.map((c) => sql`${c}`), sql`, `)})`);
  return new Map(l.map((x) => [x.clave, x]));
}

/** Lo que la persona toma, cada cosa con cuándo vale: un tratamiento programado, un suplemento, o las tomas sueltas anotadas. */
interface Uso {
  clave: string;
  nombre: string;
  concepto_id: number | null;
  /** Programado o suplemento: desde cuándo y hasta cuándo se toma (ms). Sin esto, solo cuentan las tomas. */
  desde: number | null;
  hasta: number | null;
  /** Por qué lo toma: un síntoma igual a esto no es un efecto. */
  motivo: string | null;
  tomas: number[];
  /** Los síntomas (concepto) para los que se tomó. */
  para: Set<number>;
}

export async function usosDe(tx: Tx, personaId: number, desdeMs: number, hastaMs: number): Promise<Uso[]> {
  const usos: Uso[] = [];
  const trat = await filas<{ concepto_id: number; nombre: string; inicio: string; fin: string | null; terminado: string | null; motivo: string | null; programado: boolean }>(
    tx,
    sql`SELECT t.concepto_id, c.nombre, t.inicio, t.fin, t.terminado, t.motivo, (t.cada_horas IS NOT NULL OR cardinality(t.horarios) > 0) AS programado
        FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id WHERE t.persona_id = ${personaId} AND t.borrado IS NULL`,
  );
  for (const t of trat) {
    const fin = Math.min(t.fin ? Date.parse(t.fin) : Infinity, t.terminado ? Date.parse(t.terminado) : Infinity);
    usos.push({
      clave: claveRemedio(t.nombre),
      nombre: t.nombre,
      concepto_id: t.concepto_id,
      // Si es "cuando haga falta", tenerlo cargado no es tomarlo: cuentan las tomas anotadas (y su motivo, abajo).
      desde: t.programado ? Date.parse(t.inicio) : null,
      hasta: t.programado && Number.isFinite(fin) ? fin : null,
      motivo: t.motivo,
      tomas: [],
      para: new Set(),
    });
  }
  const sup = await filas<{ nombre: string; desde: string; terminado: string | null }>(
    tx,
    sql`SELECT nombre, desde, terminado FROM suplementos WHERE persona_id = ${personaId} AND borrado IS NULL`,
  );
  for (const s of sup) usos.push({ clave: claveRemedio(s.nombre), nombre: s.nombre, concepto_id: null, desde: Date.parse(s.desde), hasta: s.terminado ? Date.parse(s.terminado) : null, motivo: null, tomas: [], para: new Set() });
  const tomas = await filas<{ concepto_id: number; nombre: string; inicio: string; para: number | null }>(
    tx,
    sql`SELECT r.concepto_id, c.nombre, r.inicio, m.concepto_id AS para
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        LEFT JOIN registros m ON m.id = (r.datos->>'para_registro_id')::bigint
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'medicacion'
          AND r.inicio >= ${new Date(desdeMs - VENTANA_MS).toISOString()} AND r.inicio <= ${new Date(hastaMs).toISOString()}`,
  );
  for (const x of tomas) {
    let u = usos.find((y) => y.concepto_id === x.concepto_id && y.desde === null) ?? usos.find((y) => y.concepto_id === x.concepto_id);
    if (!u) {
      u = { clave: claveRemedio(x.nombre), nombre: x.nombre, concepto_id: x.concepto_id, desde: null, hasta: null, motivo: null, tomas: [], para: new Set() };
      usos.push(u);
    }
    u.tomas.push(Date.parse(x.inicio));
    if (x.para) u.para.add(x.para);
  }
  return usos;
}

/** Si lo estaba tomando cuando pasó eso. */
function loTomaba(u: Uso, t: number): boolean {
  if (u.tomas.some((x) => x <= t && t - x <= VENTANA_MS)) return true;
  return u.desde !== null && u.desde <= t && (u.hasta === null || t <= u.hasta + VENTANA_MS);
}

/** Cruza síntomas con lo que tomaba: pura. Un síntoma con un remedio da una sola señal; lo urgente gana. */
export function cruzar(
  sintomas: Array<{ registro_id: number; concepto_id: number; sintoma: string; fecha: string; inicio: string }>,
  usos: Uso[],
  saberes: Map<string, Pick<FilaSaber, 'efectos'>>,
  apartadas: Set<string>,
  idioma: Idioma,
): SenalEfecto[] {
  const salida: SenalEfecto[] = [];
  for (const s of sintomas) {
    const t = Date.parse(s.inicio);
    const ya = new Set<string>();
    for (const u of usos.filter((x) => loTomaba(x, t))) {
      if (ya.has(u.clave) || apartadas.has(`${s.concepto_id}|${u.clave}`)) continue;
      // Si lo toma para eso, que siga apareciendo no es un efecto. Mirando todas las filas de ese remedio: puede tener más de una.
      const delMismo = usos.filter((x) => x.clave === u.clave);
      if (delMismo.some((x) => x.para.has(s.concepto_id) || (x.motivo && (esElMismoSintoma(s.sintoma, x.motivo) || esElMismoSintoma(x.motivo, s.sintoma))))) continue;
      const coinciden = (saberes.get(u.clave)?.efectos ?? []).filter((e) => [e.nombre, e.nombre_en, ...e.sinonimos].some((n) => n && esElMismoSintoma(s.sintoma, n)));
      if (!coinciden.length) continue;
      const e = coinciden.find((x) => x.urgente) ?? coinciden[0];
      ya.add(u.clave);
      salida.push({
        registro_id: s.registro_id,
        concepto_id: s.concepto_id,
        sintoma: s.sintoma,
        fecha: s.fecha,
        clave: u.clave,
        remedio: u.nombre,
        efecto: idioma === 'en' && e.nombre_en ? e.nombre_en : e.nombre,
        urgente: e.urgente,
      });
    }
  }
  return salida;
}

async function apartadasDe(tx: Tx, personaId: number): Promise<Set<string>> {
  const l = await filas<{ concepto_id: number; clave: string }>(tx, sql`SELECT concepto_id, clave FROM senales_apartadas WHERE persona_id = ${personaId}`);
  return new Set(l.map((x) => `${x.concepto_id}|${x.clave}`));
}

type Sintoma = { registro_id: number; concepto_id: number; sintoma: string; fecha: string; inicio: string };

async function senalesDeSintomas(tx: Tx, personaId: number, sintomas: Sintoma[], idioma: Idioma): Promise<SenalEfecto[]> {
  if (!sintomas.length) return [];
  const instantes = sintomas.map((s) => Date.parse(s.inicio));
  const usos = await usosDe(tx, personaId, Math.min(...instantes), Math.max(...instantes));
  const saberes = await saberesDe(tx, [...new Set(usos.map((u) => u.clave))]);
  return cruzar(sintomas, usos, saberes, await apartadasDe(tx, personaId), idioma);
}

const SELECT_SINTOMA = sql`SELECT r.id AS registro_id, r.concepto_id, c.nombre AS sintoma, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.inicio
  FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id`;

/** Las señales de un día. */
export async function senalesDelDia(tx: Tx, personaId: number, fecha: string, idioma: Idioma): Promise<SenalEfecto[]> {
  const sintomas = await filas<Sintoma>(tx, sql`${SELECT_SINTOMA} WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'sintoma' AND r.fecha = ${fecha} ORDER BY r.inicio`);
  return senalesDeSintomas(tx, personaId, sintomas, idioma);
}

/** Las señales de un síntoma anotado. */
export async function senalesDelRegistro(tx: Tx, personaId: number, registroId: number, idioma: Idioma): Promise<SenalEfecto[]> {
  const sintomas = await filas<Sintoma>(tx, sql`${SELECT_SINTOMA} WHERE r.id = ${registroId} AND r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'sintoma'`);
  return senalesDeSintomas(tx, personaId, sintomas, idioma);
}

/** Las señales de un período, para los patrones y para el contexto de la IA. */
export async function senalesEntre(tx: Tx, personaId: number, desde: string, hasta: string, idioma: Idioma): Promise<SenalEfecto[]> {
  const sintomas = await filas<Sintoma>(tx, sql`${SELECT_SINTOMA} WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'sintoma' AND r.fecha BETWEEN ${desde} AND ${hasta} ORDER BY r.inicio DESC LIMIT 2000`);
  return senalesDeSintomas(tx, personaId, sintomas, idioma);
}

/** Lo que la persona toma ahora, con lo que se está vigilando de cada cosa. */
export async function remediosVigilados(tx: Tx, personaId: number, idioma: Idioma): Promise<RemedioVigilado[]> {
  const trat = await filas<{ id: number; nombre: string }>(
    tx,
    sql`SELECT t.id, c.nombre FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id
        WHERE t.persona_id = ${personaId} AND t.borrado IS NULL AND t.terminado IS NULL AND (t.fin IS NULL OR t.fin > now()) ORDER BY t.inicio DESC`,
  );
  const sup = await filas<{ id: number; nombre: string }>(tx, sql`SELECT id, nombre FROM suplementos WHERE persona_id = ${personaId} AND borrado IS NULL AND terminado IS NULL ORDER BY desde DESC`);
  const por = new Map<string, RemedioVigilado>();
  const fila = (nombre: string) => {
    const clave = claveRemedio(nombre);
    if (!por.has(clave)) por.set(clave, { clave, nombre, tratamiento_ids: [], suplemento_ids: [], estado: 'pendiente', efectos: [], interacciones: [] });
    return por.get(clave)!;
  };
  for (const t of trat) fila(t.nombre).tratamiento_ids.push(t.id);
  for (const s of sup) fila(s.nombre).suplemento_ids.push(s.id);
  const claves = [...por.keys()];
  const saberes = await saberesDe(tx, claves);
  for (const r of por.values()) {
    const s = saberes.get(r.clave);
    if (!s) continue;
    r.estado = s.estado;
    const en = idioma === 'en';
    r.efectos = s.efectos.map<EfectoRemedio>((e) => ({ nombre: en && e.nombre_en ? e.nombre_en : e.nombre, urgente: e.urgente })).sort((a, b) => Number(b.urgente) - Number(a.urgente));
    r.interacciones = s.interacciones
      .map((i) => ({
        con: en && i.con_en ? i.con_en : i.con,
        detalle: en && i.detalle_en ? i.detalle_en : i.detalle,
        tambien_toma: claves.some((c) => c !== r.clave && (nombraA(i.con, c) || nombraA(i.con_en, c))),
      }))
      .sort((a, b) => Number(b.tambien_toma) - Number(a.tambien_toma));
  }
  return [...por.values()];
}

/** "Figura entre los efectos posibles de…": la razón de una hipótesis que sale de la tabla de efectos, no de la IA. */
export const razonDeEfecto = (remedio: string, efecto: string, idioma: Idioma) =>
  traducir(idioma, '«{efecto}» figura entre los efectos posibles de {remedio} (información general generada con IA), y también lo anotaste. Vale la pena ver si tiene relación.', { efecto, remedio });
