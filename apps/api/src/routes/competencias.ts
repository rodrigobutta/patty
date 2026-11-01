// Las competencias entre personas: se crea una (qué se mide y por cuánto), se invita con un link y cada uno acepta
// viendo qué número van a ver los demás. Todo lo que muestra sale de acá y se valida acá: solo quien participa ve la
// tabla, y de cada uno viaja el apodo, el puesto y el número de esa métrica, nada más. Al salir se borra la participación
// y su número deja de compartirse; los números no se guardan, se calculan en cada pedido.
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  apodoDe,
  conPosiciones,
  DURACIONES_COMPETENCIA,
  esDuracionCompetencia,
  esMetricaCompetencia,
  mejorRacha,
  METRICAS,
  nombreCompetenciaPermitido,
  PUNTOS_RACHA,
  totalConTope,
  type DuracionCompetencia,
  type MetricaCompetencia,
} from 'shared';
import { exigirRol } from '../auth/sesion.js';
import { filas, una, type Tx } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, sumarDias } from '../lib/fechas.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';
import { horasDeSueno } from './estadisticas.js';
import { puntosDe } from './puntos.js';

/** Sin 0/O ni 1/I/L, que se confunden al dictarlos o copiarlos. */
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_PARTICIPANTES = 50;
const MAX_NOMBRE = 40;

interface Competencia {
  id: number;
  codigo: string;
  nombre: string | null;
  metrica: MetricaCompetencia;
  duracion: DuracionCompetencia;
  desde: string;
  hasta: string;
  zona_horaria: string;
}

const COLUMNAS = sql`c.id, c.codigo, c.nombre, c.metrica, c.duracion, to_char(c.desde, 'YYYY-MM-DD') AS desde, to_char(c.hasta, 'YYYY-MM-DD') AS hasta, c.zona_horaria`;

/** La persona propia del usuario (la misma que el tablero): sus números son los que cuentan, nunca los de alguien que supervisa. */
async function personaPropia(tx: Tx, usuarioId: number): Promise<number> {
  const p = await una<{ id: number }>(
    tx,
    sql`SELECT p.id FROM personas p JOIN persona_usuarios pu ON pu.persona_id = p.id AND pu.usuario_id = ${usuarioId} AND pu.rol = 'dueno' ORDER BY p.id LIMIT 1`,
  );
  if (!p) throw new ErrorApi('Para competir primero tenés que crear tu persona.');
  return p.id;
}

/** El número de una persona en una competencia: null si no tiene ningún dato ("sin dato", no cero). */
async function valorDe(tx: Tx, c: Competencia, personaId: number, zona: string): Promise<number | null> {
  const hoy = diaDePatty(new Date(), zona);
  const hasta = c.hasta < hoy ? c.hasta : hoy;
  if (hasta < c.desde) return null;
  if (c.metrica === 'racha') {
    return mejorRacha((await puntosDe(tx, { id: personaId, zona_horaria: zona }, c.desde, hasta)).map((d) => d.puntos), PUNTOS_RACHA);
  }
  if (c.metrica === 'dias') {
    const r = await una<{ n: number }>(
      tx,
      sql`SELECT count(DISTINCT fecha)::int AS n FROM registros WHERE persona_id = ${personaId} AND borrado IS NULL AND fecha BETWEEN ${c.desde} AND ${hasta}`,
    );
    return r?.n ? r.n : null;
  }
  if (c.metrica === 'sueno') {
    return totalConTope('sueno', (await horasDeSueno(tx, personaId, c.desde, hasta)).map((d) => d.horas));
  }
  // Pasos o km: lo de cada día, sumado por fuente; con dos aparatos (el reloj y el teléfono) vale el que más contó, sin sumarlos.
  const dias = await filas<{ v: number }>(
    tx,
    sql`SELECT max(x.s)::float AS v FROM (
          SELECT m.fecha, m.fuente_id, sum(m.valor) AS s FROM mediciones m JOIN conceptos k ON k.id = m.concepto_id
          WHERE m.persona_id = ${personaId} AND k.nombre = ${METRICAS[c.metrica].concepto!} AND m.fecha BETWEEN ${c.desde} AND ${hasta}
          GROUP BY m.fecha, m.fuente_id) x
        GROUP BY x.fecha`,
  );
  return totalConTope(c.metrica, dias.map((d) => d.v));
}

/** La tabla de posiciones. Lista blanca: de cada uno viaja esto y nada más (ni foto, ni ids, ni otros datos). */
async function posiciones(tx: Tx, c: Competencia, usuarioId: number) {
  const participantes = await filas<{ usuario_id: number; persona_id: number; nombre: string; apodo: string | null; zona_horaria: string }>(
    tx,
    sql`SELECT pa.usuario_id, pa.persona_id, u.nombre, u.apodo, p.zona_horaria FROM competencia_participantes pa
        JOIN usuarios u ON u.id = pa.usuario_id AND u.activo JOIN personas p ON p.id = pa.persona_id
        WHERE pa.competencia_id = ${c.id}`,
  );
  const conValor = [];
  for (const x of participantes) {
    conValor.push({ apodo: apodoDe(x.nombre, x.apodo), valor: await valorDe(tx, c, x.persona_id, x.zona_horaria), yo: x.usuario_id === usuarioId });
  }
  return conPosiciones(conValor).map((f) => ({ posicion: f.posicion, apodo: f.apodo, valor: f.valor, yo: f.yo }));
}

/** Si ya terminó y, si no, cuántos días faltan contando hoy (en la zona de quien la creó). */
function cuandoTermina(c: Competencia) {
  const hoy = diaDePatty(new Date(), c.zona_horaria);
  const terminada = hoy > c.hasta;
  return {
    estado: terminada ? ('terminada' as const) : ('en_curso' as const),
    dias_restantes: terminada ? 0 : Math.round((Date.parse(c.hasta) - Date.parse(hoy)) / 86400000) + 1,
  };
}

const resumen = (c: Competencia) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  metrica: c.metrica,
  duracion: c.duracion,
  desde: c.desde,
  hasta: c.hasta,
  ...cuandoTermina(c),
});

/** Una competencia en la que participa este usuario: si no participa, para él no existe. */
async function propia(tx: Tx, id: number, usuarioId: number): Promise<Competencia> {
  const c = await una<Competencia>(
    tx,
    sql`SELECT ${COLUMNAS} FROM competencias c JOIN competencia_participantes pa ON pa.competencia_id = c.id AND pa.usuario_id = ${usuarioId} WHERE c.id = ${id}`,
  );
  if (!c) throw new ErrorApi('No existe.', 404);
  return c;
}

async function porCodigo(tx: Tx, crudo: string): Promise<Competencia> {
  const codigo = crudo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const c = codigo ? await una<Competencia>(tx, sql`SELECT ${COLUMNAS} FROM competencias c WHERE c.codigo = ${codigo}`) : null;
  if (!c) throw new ErrorApi('Esa invitación no existe.', 404);
  return c;
}

export const rutasCompetencias = new Hono<Env>()
  .get('/', async (c) => {
    // Las mías, la más nueva primero: con mi puesto y mi número.
    const u = c.var.usuario;
    const l = await filas<Competencia>(
      c.var.db,
      sql`SELECT ${COLUMNAS} FROM competencias c JOIN competencia_participantes pa ON pa.competencia_id = c.id AND pa.usuario_id = ${u.id}
          ORDER BY c.hasta DESC, c.id DESC LIMIT 20`,
    );
    const r = [];
    for (const x of l) {
      const tabla = await posiciones(c.var.db, x, u.id);
      const yo = tabla.find((f) => f.yo);
      r.push({ ...resumen(x), participantes: tabla.length, mi_posicion: yo?.posicion ?? null, mi_valor: yo?.valor ?? null });
    }
    return c.json(r);
  })
  .post('/', async (c) => {
    // {metrica, duracion: 'semana' | 'mes', nombre?, acepto: true}: quien la crea también participa, y también acepta.
    const u = c.var.usuario;
    exigirRol(u, 'editor');
    const d = await cuerpo(c);
    if (!esMetricaCompetencia(d.metrica)) throw new ErrorApi('Eso no se puede medir en una competencia.');
    if (!esDuracionCompetencia(d.duracion)) throw new ErrorApi('Elegí una semana o un mes.');
    if (d.acepto !== true) throw new ErrorApi('Para participar tenés que aceptar qué se comparte.');
    const nombre = texto(d.nombre).slice(0, MAX_NOMBRE) || null;
    if (nombre && !nombreCompetenciaPermitido(nombre)) throw new ErrorApi('Ese nombre no va: acá se compite por hábitos, no por el peso ni por comer menos.');
    const { metrica, duracion } = d;
    const r = await c.var.db.transaction(async (tx) => {
      const personaId = await personaPropia(tx, u.id);
      const zona = (await una<{ zona_horaria: string }>(tx, sql`SELECT zona_horaria FROM personas WHERE id = ${personaId}`))!.zona_horaria;
      const desde = diaDePatty(new Date(), zona);
      const hasta = sumarDias(desde, DURACIONES_COMPETENCIA[duracion] - 1);
      for (let i = 0; i < 20; i++) {
        const codigo = Array.from(randomBytes(8), (b) => LETRAS[b % LETRAS.length]).join('');
        const nueva = await una<{ id: number }>(
          tx,
          sql`INSERT INTO competencias (codigo, nombre, metrica, duracion, desde, hasta, zona_horaria, creador_id)
              VALUES (${codigo}, ${nombre}, ${metrica}, ${duracion}, ${desde}, ${hasta}, ${zona}, ${u.id})
              ON CONFLICT (codigo) DO NOTHING RETURNING id`,
        );
        if (nueva) {
          await tx.execute(sql`INSERT INTO competencia_participantes (competencia_id, usuario_id, persona_id) VALUES (${nueva.id}, ${u.id}, ${personaId})`);
          return { id: nueva.id, codigo };
        }
      }
      throw new ErrorApi('No pude generar el código, probá de nuevo.');
    });
    return c.json(r, 201);
  })
  .get('/invitacion/:codigo', async (c) => {
    // Lo que se ve antes de aceptar: de qué se trata y quién invita. Ningún número ni quién más está.
    const u = c.var.usuario;
    const x = await porCodigo(c.var.db, c.req.param('codigo'));
    const invita = await una<{ nombre: string; apodo: string | null }>(
      c.var.db,
      sql`SELECT o.nombre, o.apodo FROM competencias k JOIN usuarios o ON o.id = k.creador_id AND o.activo
          JOIN competencia_participantes pa ON pa.competencia_id = k.id AND pa.usuario_id = o.id WHERE k.id = ${x.id}`,
    );
    const yo = await una<{ nombre: string; apodo: string | null }>(c.var.db, sql`SELECT nombre, apodo FROM usuarios WHERE id = ${u.id}`);
    const ya = await una(c.var.db, sql`SELECT 1 AS x FROM competencia_participantes WHERE competencia_id = ${x.id} AND usuario_id = ${u.id}`);
    const { codigo: _codigo, ...sinCodigo } = resumen(x);
    return c.json({
      ...sinCodigo,
      // El id solo le sirve a quien ya está: a los demás, nada que puedan usar.
      id: ya ? x.id : null,
      ya_participas: Boolean(ya),
      invita: invita ? apodoDe(invita.nombre, invita.apodo) : null,
      tu_apodo: apodoDe(yo!.nombre, yo!.apodo),
    });
  })
  .post('/invitacion/:codigo/aceptar', async (c) => {
    // {acepto: true}: sin eso no se suma nadie. Mientras no termine se puede volver a entrar (aceptando de nuevo).
    const u = c.var.usuario;
    exigirRol(u, 'editor');
    if ((await cuerpo(c)).acepto !== true) throw new ErrorApi('Para participar tenés que aceptar qué se comparte.');
    const x = await porCodigo(c.var.db, c.req.param('codigo'));
    if (cuandoTermina(x).estado === 'terminada') throw new ErrorApi('Esta competencia ya terminó.');
    const n = await una<{ n: number }>(c.var.db, sql`SELECT count(*)::int AS n FROM competencia_participantes WHERE competencia_id = ${x.id}`);
    if (n!.n >= MAX_PARTICIPANTES) throw new ErrorApi('Esta competencia ya está llena.');
    const personaId = await personaPropia(c.var.db, u.id);
    await c.var.db.execute(
      sql`INSERT INTO competencia_participantes (competencia_id, usuario_id, persona_id) VALUES (${x.id}, ${u.id}, ${personaId}) ON CONFLICT DO NOTHING`,
    );
    return c.json({ id: x.id }, 201);
  })
  .get('/:id', async (c) => {
    const x = await propia(c.var.db, idParam(c), c.var.usuario.id);
    return c.json({ ...resumen(x), posiciones: await posiciones(c.var.db, x, c.var.usuario.id) });
  })
  .delete('/:id/participacion', async (c) => {
    // Salir: en cualquier momento, sin preguntas, y su número deja de verse. Si no queda nadie, la competencia se borra.
    const id = idParam(c);
    const salio = await una(c.var.db, sql`DELETE FROM competencia_participantes WHERE competencia_id = ${id} AND usuario_id = ${c.var.usuario.id} RETURNING 1 AS x`);
    if (!salio) throw new ErrorApi('No existe.', 404);
    await c.var.db.execute(sql`DELETE FROM competencias c WHERE c.id = ${id} AND NOT EXISTS (SELECT 1 FROM competencia_participantes pa WHERE pa.competencia_id = c.id)`);
    return c.json({ ok: true });
  });
