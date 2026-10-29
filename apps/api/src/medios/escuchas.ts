// Lo que sonó o se miró en el teléfono (ver la tabla escuchas): se guardan los tramos que manda la app de Android y,
// por cada día tocado, se recalculan las mediciones de la fuente: una por sesión («Música escuchada», «Podcasts
// escuchados», «Series y videos en el teléfono»), con los minutos que sonó. Así un disco entero es una sola cosa y no
// doce, y mandar dos veces lo mismo no duplica nada.
import { sql } from 'drizzle-orm';
import { agruparEscuchas, conceptoDeEscucha, CONCEPTOS_ESCUCHA, type SesionEscucha, type TipoEscucha, type TramoEscucha } from 'shared';
import { filas, type Tx } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty } from '../lib/fechas.js';
import { texto } from '../lib/http.js';
import { conceptoMedido, type Fuente } from '../routes/ingesta.js';

/** Los tramos viejos se borran solos. */
const DIAS_GUARDADOS = 90;
const MAX_TRAMO_MS = 12 * 3600 * 1000;

const ms = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Valida un tramo que llega del teléfono (tiempos en ms o ISO). Los que no sirven se saltean. */
export function leerTramo(x: unknown, ahora = Date.now()): TramoEscucha | null {
  const d = x as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const inicio = ms(d.inicio);
  const fin = ms(d.fin);
  const paquete = texto(d.paquete).slice(0, 120);
  if (!paquete || inicio === null || fin === null || fin <= inicio || fin - inicio > MAX_TRAMO_MS) return null;
  if (inicio < ahora - DIAS_GUARDADOS * 86400000 || fin > ahora + 3600000) return null;
  return {
    paquete,
    app: texto(d.app).slice(0, 60) || paquete,
    titulo: texto(d.titulo).slice(0, 200),
    artista: texto(d.artista).slice(0, 120),
    album: texto(d.album).slice(0, 200),
    inicio,
    fin,
  };
}

export async function guardarEscuchas(tx: Tx, f: Fuente, lista: unknown[]): Promise<{ guardadas: number; sesiones: number }> {
  if (lista.length > 3000) throw new ErrorApi('Mandá una lista "escuchas" (hasta 3000 por vez).');
  const tramos = lista.map((x) => leerTramo(x)).filter((x): x is TramoEscucha => x !== null);
  const fechas = new Set<string>();
  for (const x of tramos) {
    const fecha = diaDePatty(new Date(x.inicio), f.zona_horaria);
    fechas.add(fecha);
    await tx.execute(sql`
      INSERT INTO escuchas (persona_id, fuente_id, paquete, app, titulo, artista, album, inicio, fin, fecha)
      VALUES (${f.persona_id}, ${f.id}, ${x.paquete}, ${x.app}, ${x.titulo}, ${x.artista}, ${x.album},
              ${new Date(x.inicio).toISOString()}, ${new Date(x.fin).toISOString()}, ${fecha})
      ON CONFLICT (persona_id, paquete, inicio) DO UPDATE SET fin = greatest(escuchas.fin, excluded.fin),
        titulo = excluded.titulo, artista = excluded.artista, album = excluded.album, app = excluded.app`);
  }
  await tx.execute(sql`DELETE FROM escuchas WHERE persona_id = ${f.persona_id} AND inicio < now() - make_interval(days => ${DIAS_GUARDADOS})`);
  const sesiones = await recalcularEscuchas(tx, f, [...fechas]);
  await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${f.id}`);
  return { guardadas: tramos.length, sesiones };
}

/** Los tramos de una persona en un día, como sesiones (para el Día). */
export async function sesionesDelDia(tx: Tx, personaId: number, fecha: string, fuenteId?: number): Promise<SesionEscucha[]> {
  const l = await filas<{ paquete: string; app: string; titulo: string; artista: string; album: string; inicio: string; fin: string }>(
    tx,
    sql`SELECT paquete, app, titulo, artista, album, inicio, fin FROM escuchas
        WHERE persona_id = ${personaId} AND fecha = ${fecha} ${fuenteId ? sql`AND fuente_id = ${fuenteId}` : sql``} ORDER BY inicio`,
  );
  return agruparEscuchas(l.map((x) => ({ ...x, inicio: new Date(x.inicio).getTime(), fin: new Date(x.fin).getTime() })));
}

const CATEGORIA: Record<TipoEscucha, string> = { musica: 'musica', podcast: 'musica', video: 'pantalla' };

/** Rehace las mediciones de esos días de la fuente: una por sesión de al menos un minuto. Devuelve cuántas quedaron. */
export async function recalcularEscuchas(tx: Tx, f: Fuente, fechas: string[]): Promise<number> {
  if (!fechas.length) return 0;
  const cache = new Map<string, number>();
  const ids = new Map<TipoEscucha, number>();
  for (const t of ['musica', 'podcast', 'video'] as const) ids.set(t, await conceptoMedido(tx, f, conceptoDeEscucha(t), CATEGORIA[t], 'min', cache));
  await tx.execute(sql`DELETE FROM mediciones WHERE persona_id = ${f.persona_id} AND fuente_id = ${f.id}
                       AND concepto_id IN ${[...ids.values()]} AND fecha IN ${fechas}`);
  let n = 0;
  for (const fecha of fechas) {
    for (const s of await sesionesDelDia(tx, f.persona_id, fecha, f.id)) {
      if (s.minutos < 1) continue;
      await tx.execute(sql`
        INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fin, fecha, valor, unidad)
        VALUES (${f.persona_id}, ${ids.get(s.tipo)!}, ${f.id}, ${new Date(s.inicio).toISOString()}, ${new Date(s.fin).toISOString()}, ${fecha}, ${Math.round(s.minutos)}, 'min')
        ON CONFLICT (persona_id, concepto_id, inicio, fuente_id) DO UPDATE SET valor = excluded.valor, fin = excluded.fin`);
      n++;
    }
  }
  return n;
}

/** Borra todo lo escuchado de una persona (los tramos y lo calculado con ellos). */
export async function borrarEscuchas(tx: Tx, personaId: number): Promise<void> {
  await tx.execute(sql`DELETE FROM escuchas WHERE persona_id = ${personaId}`);
  await tx.execute(sql`DELETE FROM mediciones m USING conceptos c WHERE m.persona_id = ${personaId} AND c.id = m.concepto_id
                       AND c.nombre IN ${CONCEPTOS_ESCUCHA} AND m.fuente_id IN (SELECT id FROM fuentes WHERE persona_id = ${personaId} AND tipo = 'telefono')`);
}
