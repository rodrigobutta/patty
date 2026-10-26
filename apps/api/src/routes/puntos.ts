// Los puntos de cada día (lo que se anotó y lo que llegó solo), la racha de días buenos y el tablero: con la familia
// (quienes supervisás o te supervisan, con una meta de la semana entre todos) y con todos los que usan Patty.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { apodoDe, calcularPuntos, PUNTOS_RACHA, type PuntosDia } from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { diaDePatty, minutosDelDia, sumarDias } from '../lib/fechas.js';
import type { Env } from '../lib/http.js';
import { COLUMNAS, DESDE, tomasDe, type Fila } from './tratamientos.js';

/** Los puntos de cada día entre `desde` y `hasta` (AAAA-MM-DD), en orden. */
export async function puntosDe(tx: Tx, p: { id: number; zona_horaria: string }, desde: string, hasta: string): Promise<PuntosDia[]> {
  const registros = await filas<{ fecha: string; categoria: string; inicio: string; concepto: string }>(
    tx,
    sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, k.clave AS categoria, r.inicio, c.nombre AS concepto FROM registros r
        JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hasta}`,
  );
  const medidas = await filas<{ fecha: string; categoria: string }>(
    tx,
    sql`SELECT DISTINCT to_char(m.fecha, 'YYYY-MM-DD') AS fecha, k.clave AS categoria FROM mediciones m
        JOIN conceptos c ON c.id = m.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE m.persona_id = ${p.id} AND m.fecha BETWEEN ${desde} AND ${hasta} AND k.clave IN ('sueno', 'actividad')`,
  );
  // Las tomas del período que ya tocaban (las de más tarde hoy todavía no restan).
  const tratamientos = await filas<Fila>(tx, sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.persona_id = ${p.id} AND t.borrado IS NULL`);
  const ahora = new Date();
  const tomas = (await tomasDe(tx, tratamientos, new Date(Date.parse(`${desde}T00:00:00Z`) - 86400000), ahora)).map((t) => ({
    fecha: diaDePatty(new Date(t.programada), p.zona_horaria),
    marcada: t.estado !== null,
  }));
  const r: PuntosDia[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const delDia = tomas.filter((t) => t.fecha === f);
    r.push(
      calcularPuntos({
        fecha: f,
        registros: registros.filter((x) => x.fecha === f).map((x) => ({ categoria: x.categoria, concepto: x.concepto, minutos: minutosDelDia(new Date(x.inicio), p.zona_horaria) })),
        medidas: medidas.filter((x) => x.fecha === f).map((x) => x.categoria),
        tomas: { total: delDia.length, marcadas: delDia.filter((t) => t.marcada).length },
      }),
    );
  }
  return r;
}

/** Días seguidos con al menos PUNTOS_RACHA puntos (hoy cuenta si ya llegó; si no, la racha sigue viva desde ayer). */
export function racha(dias: PuntosDia[]): number {
  let n = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    if (dias[i].puntos >= PUNTOS_RACHA) n++;
    else if (i === dias.length - 1) continue;
    else break;
  }
  return n;
}

interface Participante {
  usuario_id: number;
  nombre: string;
  apodo: string | null;
  foto: string | null;
  persona_id: number;
  zona_horaria: string;
}

/** Los usuarios con su persona propia (la primera), para el tablero. */
const PARTICIPANTES = sql`SELECT DISTINCT ON (u.id) u.id AS usuario_id, u.nombre, u.apodo, u.foto, p.id AS persona_id, p.zona_horaria
  FROM usuarios u JOIN persona_usuarios pu ON pu.usuario_id = u.id AND pu.rol = 'dueno' JOIN personas p ON p.id = pu.persona_id
  WHERE u.activo`;

async function puntosSemana(tx: Tx, x: Participante): Promise<{ semana: number; hoy: number }> {
  const hoy = diaDePatty(new Date(), x.zona_horaria);
  const dias = await puntosDe(tx, { id: x.persona_id, zona_horaria: x.zona_horaria }, sumarDias(hoy, -6), hoy);
  return { semana: dias.reduce((a, b) => a + b.puntos, 0), hoy: dias.at(-1)!.puntos };
}

export const rutasPuntos = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1: los puntos de hoy (con lo que suma cada cosa), los de la última semana y la racha.
    const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const dias = await puntosDe(c.var.db, p, sumarDias(hoy, -59), hoy);
    return c.json({ hoy: dias.at(-1)!, semana: dias.slice(-7), racha: racha(dias) });
  })
  .get('/tablero', async (c) => {
    // La familia (quienes supervisás o te supervisan) y todos los que quieren aparecer en el general, por los puntos
    // de los últimos 7 días.
    const u = c.var.usuario;
    const familia = await filas<Participante>(
      c.var.db,
      sql`${PARTICIPANTES} AND (u.id = ${u.id} OR u.id IN (
            SELECT supervisado_id FROM supervisiones WHERE supervisor_id = ${u.id} AND estado = 'aceptada'
            UNION SELECT supervisor_id FROM supervisiones WHERE supervisado_id = ${u.id} AND estado = 'aceptada'))
          ORDER BY u.id, p.id`,
    );
    const general = await filas<Participante>(c.var.db, sql`${PARTICIPANTES} AND (u.ranking OR u.id = ${u.id}) ORDER BY u.id, p.id`);
    const cache = new Map<number, { semana: number; hoy: number }>();
    const de = async (x: Participante) => {
      if (!cache.has(x.usuario_id)) cache.set(x.usuario_id, await puntosSemana(c.var.db, x));
      return cache.get(x.usuario_id)!;
    };
    const fila = async (x: Participante) => ({
      usuario_id: x.usuario_id,
      apodo: apodoDe(x.nombre, x.apodo),
      foto: x.foto,
      yo: x.usuario_id === u.id,
      ...(await de(x)),
    });
    const ordenar = <T extends { semana: number }>(l: T[]) => l.sort((a, b) => b.semana - a.semana);
    const fam = ordenar(await Promise.all(familia.map(fila)));
    const gen = ordenar(await Promise.all(general.map(fila)));
    const posicion = gen.findIndex((x) => x.yo) + 1;
    return c.json({
      familia: fam,
      // La meta de la semana entre todos: 60 puntos por día cada uno.
      meta_familia: { suma: fam.reduce((a, b) => a + b.semana, 0), meta: fam.length * 7 * 60 },
      general: { posicion, total: gen.length, top: gen.slice(0, 10) },
      ranking: (await una<{ ranking: boolean }>(c.var.db, sql`SELECT ranking FROM usuarios WHERE id = ${u.id}`))?.ranking ?? true,
    });
  });
