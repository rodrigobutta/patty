// El aviso preventivo: si hoy se juntaron las causas de uno de los patrones de la persona (todas las de una
// combinación), el búho avisa antes de que pase ("Ojo: hoy se juntaron comida frita, calor y período. Otras veces, al
// día siguiente apareció el dolor de panza"). Solo los patrones que miran a otro día (desfase de 1 o más): si es el
// mismo día, ya es tarde para avisar. Se revisa a la tarde (de 16 a 21, una vez por hora) y cada efecto se avisa una
// sola vez por día. También se ve en el Día (GET /api/preventivo).
import { sql } from 'drizzle-orm';
import { esIdioma, nombreRasgo, traducir, type Idioma, type Modo, type TipoValor } from 'shared';
import { filas, una, type Db } from '../db/client.js';
import { diaDePatty, minutosDelDia, sumarDias } from '../lib/fechas.js';
import { hayEnvio, type Aviso } from '../push/firebase.js';
import { avisarUnaVez } from '../push/recordatorios.js';
import { datosDePersona } from './analizar.js';
import { rasgosDelDia } from './motor.js';

/** Las horas (de la persona) en que se revisa: de tarde, cuando ya pasó buena parte del día, y antes de dormir. */
const DESDE_HORA = 16;
const HASTA_HORA = 21;
/** Los patrones que se muestran como firmes en Patrones (los confirmados, aunque no lleguen). */
const Q_FIRME = 0.1;
/** Solo se revisa a quien anotó algo en estos últimos días. */
const DIAS_ACTIVO = 3;

interface Causa {
  id: number;
  nombre: string;
  tipo: TipoValor;
  modo: Modo;
}

/** Un patrón cuyas causas se juntaron hoy. */
export interface Preventivo {
  hallazgo_id: number;
  efecto_id: number;
  efecto: string;
  efecto_tipo: TipoValor;
  efecto_modo: Modo;
  desfase_dias: number;
  causas: Causa[];
}

/**
 * Los patrones que se pueden adelantar: firmes o confirmados, que no se descartaron ni son obvios, miran a otro día, se siguen
 * viendo y valen para cualquier fecha (no un antes y después).
 */
// Los de componentes no: son una estimación, y "hoy comiste mucha sal, cuidate" se leería como un consejo de dieta.
const FILTRO = sql`h.componente IS NULL AND h.desfase_dias >= 1 AND h.fecha_desde IS NULL AND NOT h.ya_no AND (h.estado = 'confirmado' OR (h.estado = 'nuevo' AND h.q_valor <= ${Q_FIRME}))`;

/**
 * Los patrones de la persona cuyas causas están todas hoy. Si varios llevan al mismo efecto (el simple y la
 * combinación), queda el que junta más cosas: dice más.
 */
export async function preventivosDeHoy(db: Db, p: { id: number; nombre: string; zona_horaria: string }, ahora = new Date()): Promise<Preventivo[]> {
  const patrones = await filas<Omit<Preventivo, 'causas'> & { causa: Causa; extra: Causa[] }>(
    db,
    sql`SELECT h.id AS hallazgo_id, h.efecto_id, ef.nombre AS efecto, ef.tipo_valor AS efecto_tipo, h.efecto_modo, h.desfase_dias,
               jsonb_build_object('id', ca.id, 'nombre', ca.nombre, 'tipo', ca.tipo_valor, 'modo', h.causa_modo) AS causa,
               coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'tipo', c.tipo_valor, 'modo', e->>'modo'))
                         FROM jsonb_array_elements(h.causas_extra) e JOIN conceptos c ON c.id = (e->>'id')::int), '[]'::jsonb) AS extra
        FROM hallazgos h JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
        WHERE h.persona_id = ${p.id} AND ${FILTRO}
        ORDER BY h.puntaje DESC`,
  );
  if (!patrones.length) return [];
  const hoy = diaDePatty(ahora, p.zona_horaria);
  const desde = sumarDias(hoy, -364);
  const { datos, conceptos } = await datosDePersona(db, { ...p, rol: 'dueno' }, desde, hoy, { componentes: false });
  const presentes = rasgosDelDia(datos, conceptos, desde, hoy);
  const porEfecto = new Map<string, Preventivo>();
  for (const x of patrones) {
    const causas = [x.causa, ...x.extra];
    if (!causas.every((c) => presentes.has(`${c.id}|${c.modo}`))) continue;
    const clave = `${x.efecto_id}|${x.efecto_modo}`;
    const antes = porEfecto.get(clave);
    if (antes && antes.causas.length >= causas.length) continue;
    const { causa: _c, extra: _e, ...resto } = x;
    porEfecto.set(clave, { ...resto, causas });
  }
  return [...porEfecto.values()];
}

/** Lo que dice el aviso (y la tarjeta del Día), en el idioma de quien lo lee. */
export function textoPreventivo(x: Preventivo, i: Idioma): { titulo: string; cuerpo: string } {
  const nombres = x.causas.map((c) => `«${nombreRasgo(c.nombre, c.tipo, c.modo, i)}»`);
  const causas = nombres.length > 1 ? traducir(i, '{a} y {b}', { a: nombres.slice(0, -1).join(', '), b: nombres[nombres.length - 1] }) : nombres[0];
  const cuando = x.desfase_dias === 1 ? traducir(i, 'al día siguiente') : traducir(i, '{n} días después', { n: x.desfase_dias });
  const vars = { causas, cuando, efecto: nombreRasgo(x.efecto, x.efecto_tipo, x.efecto_modo, i) };
  return {
    titulo: x.desfase_dias === 1 ? traducir(i, '🦉 Ojo con mañana') : traducir(i, '🦉 Ojo con los próximos días'),
    cuerpo: x.causas.length > 1
      ? traducir(i, 'Hoy se juntaron {causas}. Otras veces que pasó, {cuando} apareció «{efecto}». Si podés, cuidate un poco.', vars)
      : traducir(i, 'Hoy hubo {causas}. Otras veces, {cuando} apareció «{efecto}». Si podés, cuidate un poco.', vars),
  };
}

/** El aviso push; tocarlo abre el Día, donde está la tarjeta. */
export function avisoPreventivo(personaId: number, x: Preventivo, i: Idioma): Aviso {
  return {
    ...textoPreventivo(x, i),
    conApodo: true,
    datos: { tipo: 'preventivo', persona_id: String(personaId), cara: 'espera' },
    etiqueta: `preventivo|${personaId}|${x.efecto_id}`,
  };
}

/**
 * Cada minuto: a la tarde, una vez por hora, revisa a quienes tienen patrones que se pueden adelantar y les avisa lo
 * que se juntó hoy. A los teléfonos de quienes anotan a la persona (no a quienes la supervisan) y que no lo apagaron.
 * Devuelve cuántos avisos mandó.
 */
export async function avisarPreventivos(db: Db, ahora = new Date()): Promise<number> {
  if (!hayEnvio()) return 0;
  const lista = await filas<{ id: number; nombre: string; zona_horaria: string }>(
    db,
    sql`SELECT p.id, p.nombre, p.zona_horaria FROM personas p
        WHERE EXISTS (SELECT 1 FROM hallazgos h WHERE h.persona_id = p.id AND ${FILTRO})
          AND EXISTS (SELECT 1 FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL
                      AND r.creado > ${ahora.toISOString()}::timestamptz - make_interval(days => ${DIAS_ACTIVO}))`,
  );
  let enviados = 0;
  for (const p of lista) {
    const hora = Math.floor(minutosDelDia(ahora, p.zona_horaria) / 60);
    if (hora < DESDE_HORA || hora > HASTA_HORA) continue;
    const hoy = diaDePatty(ahora, p.zona_horaria);
    if (!(await una(db, sql`INSERT INTO avisos_enviados (clave) VALUES (${`preventivo-revision|${p.id}|${hoy}|${hora}`}) ON CONFLICT DO NOTHING RETURNING clave`))) continue;
    const telefonos = await filas<{ id: number; token: string; avisos_hasta: string | null; idioma: string }>(
      db,
      sql`SELECT d.id, d.token, d.avisos_hasta, u.idioma FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id
          WHERE u.activo AND u.avisar_preventivo
            AND EXISTS (SELECT 1 FROM accesos a WHERE a.persona_id = ${p.id} AND a.usuario_id = u.id AND NOT a.por_supervision)`,
    );
    if (!telefonos.length) continue;
    for (const x of await preventivosDeHoy(db, p, ahora)) {
      for (const d of telefonos) {
        const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
        if (await avisarUnaVez(db, d, `preventivo|${p.id}|${x.efecto_id}|${x.efecto_modo}|${hoy}`, avisoPreventivo(p.id, x, i))) enviados++;
      }
    }
  }
  return enviados;
}
