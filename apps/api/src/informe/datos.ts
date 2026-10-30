// Lo que va en el informe para el médico, ya calculado: quién es, qué malestares tuvo (cuántas veces, qué tan fuertes,
// cuánto duraron), qué remedios tomó y para qué, cómo durmió, cómo estuvo de ánimo, el ciclo si lo anota y los
// patrones que encontró Patty. Sale de lo mismo que usan Números, el Calendario y Patrones; el PDF lo dibuja pdf.ts.
import { sql } from 'drizzle-orm';
import { COMO_ME_SENTI, COMO_ME_SIENTO, estadoDe, nombreRasgo, resumenCiclo, traducir, traducirDato, type EstadoAnimo, type Hallazgo, type Idioma } from 'shared';
import { filas, una, type Tx } from '../db/client.js';
import type { PersonaAcceso } from '../lib/acceso.js';
import { diaDePatty, localAInstante, sumarDias } from '../lib/fechas.js';
import { listarHallazgos } from '../patrones/analizar.js';
import { diasDeMenstruacion } from '../routes/ciclo.js';
import { horaPromedio, horasDeSueno } from '../routes/estadisticas.js';
import { DESPERTAR } from '../routes/sueno.js';
import { COLUMNAS, DESDE, tomasDe, type Fila } from '../routes/tratamientos.js';

/** Los períodos que se pueden pedir (días hacia atrás desde hoy). */
export const PERIODOS_INFORME = [7, 30, 90] as const;
/** Los patrones con q hasta este valor son "firmes" (como en Patrones); el resto puede ser casualidad y no va. */
const Q_FIRME = 0.1;
const MAX_HALLAZGOS = 8;

export type Franja = 'manana' | 'tarde' | 'noche';

export interface MalestarInforme {
  nombre: string;
  dias: number;
  veces: number;
  intensidad_prom: number | null;
  intensidad_max: number | null;
  /** Para lo que se mide (temperatura corporal): el valor más alto y su unidad. */
  valor_max: number | null;
  unidad: string | null;
  /** Cuánto duró, en minutos, de los que tienen fin anotado (y cuántos lo tienen). */
  minutos_prom: number | null;
  con_duracion: number;
  /** En qué parte del día aparece más. */
  franja: Franja | null;
  ultima: string;
}

export interface RemedioInforme {
  nombre: string;
  veces: number;
  dias: number;
  /** La dosis más común ("400 mg") si se anotó. */
  dosis: string | null;
  /** Los malestares para los que se tomó (lo que se eligió al anotarlo) y el motivo del tratamiento. */
  para: string[];
}

export interface TratamientoInforme {
  remedio: string;
  dosis: string | null;
  /** "Cada 8 h", "8:00 y 20:00" o "Si hace falta". */
  como: string;
  motivo: string | null;
  programadas: number;
  tomadas: number;
  terminado: boolean;
}

export interface DatosInforme {
  idioma: Idioma;
  persona: { nombre: string; edad: number | null; sexo: string | null; altura_cm: number | null; peso_kg: number | null; condiciones: string[] };
  desde: string;
  hasta: string;
  dias: number;
  dias_anotados: number;
  generado: string;
  malestares: MalestarInforme[];
  remedios: RemedioInforme[];
  tratamientos: TratamientoInforme[];
  sueno: {
    noches: Array<{ fecha: string; horas: number }>;
    promedio: number | null;
    minimo: number | null;
    maximo: number | null;
    /** Horas promedio de acostarse y levantarse (minutos del día). */
    acoste: number | null;
    levante: number | null;
    /** Noches en que contó que se despertó. */
    despertares: number;
  } | null;
  animo: {
    dias: number;
    promedio: number;
    por_estado: Record<EstadoAnimo['clave'], number>;
    /** Promedio por tramo (un día si el período es corto, una semana si no), para el gráfico. */
    tramos: Array<{ desde: string; hasta: string; promedio: number | null }>;
    tendencia: 'mejora' | 'empeora' | 'estable' | null;
  } | null;
  ciclo: {
    duracion_ciclo: number;
    duracion_periodo: number;
    ciclos: number;
    regular: boolean | null;
    /** Inicios de menstruación dentro del período. */
    inicios: string[];
    proxima: string | null;
  } | null;
  hallazgos: Array<{ causa: string; efecto: string; cuando: string; detalle: string; texto: string; confirmado: boolean }>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const prom = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

function edadDe(nacimiento: string | null, hoy: string): number | null {
  if (!nacimiento) return null;
  const [a, m, d] = nacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  const edad = ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
  return edad >= 0 && edad < 130 ? edad : null;
}

const dosisTexto = (valor: number | null, unidad: string | null, idioma: Idioma) =>
  valor === null ? null : `${valor.toLocaleString(idioma === 'en' ? 'en-US' : 'es-AR')}${unidad ? ` ${traducirDato(unidad, idioma)}` : ''}`;

/** Junta todo lo del informe de una persona para los últimos `dias` días (contando hoy). */
export async function datosInforme(tx: Tx, p: PersonaAcceso, dias: number, idioma: Idioma): Promise<DatosInforme> {
  const t = (texto: string, vars?: Record<string, string | number>) => traducir(idioma, texto, vars);
  const dato = (n: string) => traducirDato(n, idioma);
  const hasta = diaDePatty(new Date(), p.zona_horaria);
  const desde = sumarDias(hasta, -(dias - 1));
  const enRango = sql`r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hasta}`;

  const per = await una<{ nombre: string; nacimiento: string | null; sexo: string | null; altura_cm: number | null; peso_kg: number | null; condiciones: string[] }>(
    tx,
    sql`SELECT nombre, to_char(nacimiento, 'YYYY-MM-DD') AS nacimiento, sexo, altura_cm, peso_kg, condiciones FROM personas WHERE id = ${p.id}`,
  );
  const anotados = await una<{ n: number }>(tx, sql`SELECT count(DISTINCT r.fecha)::int AS n FROM registros r WHERE ${enRango}`);

  // Malestares: lo de «Dolores y molestias», con la parte del día en que aparece más (en la zona de la persona).
  const malestares = await filas<MalestarInforme & { manana: number; tarde: number; noche: number }>(
    tx,
    sql`SELECT c.nombre, count(DISTINCT r.fecha)::int AS dias, count(*)::int AS veces,
               avg(r.intensidad)::float AS intensidad_prom, max(r.intensidad)::int AS intensidad_max,
               max(r.valor) FILTER (WHERE c.tipo_valor = 'medida')::float AS valor_max, max(coalesce(r.unidad, c.unidad)) AS unidad,
               avg(extract(epoch FROM r.fin - r.inicio) / 60) FILTER (WHERE r.fin > r.inicio)::float AS minutos_prom,
               count(*) FILTER (WHERE r.fin > r.inicio)::int AS con_duracion,
               count(*) FILTER (WHERE extract(hour FROM r.inicio AT TIME ZONE ${p.zona_horaria}) BETWEEN 5 AND 11)::int AS manana,
               count(*) FILTER (WHERE extract(hour FROM r.inicio AT TIME ZONE ${p.zona_horaria}) BETWEEN 12 AND 18)::int AS tarde,
               count(*) FILTER (WHERE extract(hour FROM r.inicio AT TIME ZONE ${p.zona_horaria}) NOT BETWEEN 5 AND 18)::int AS noche,
               to_char(max(r.fecha), 'YYYY-MM-DD') AS ultima
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE ${enRango} AND k.clave = 'sintoma'
        GROUP BY c.id, c.nombre ORDER BY count(DISTINCT r.fecha) DESC, count(*) DESC LIMIT 25`,
  );

  // Remedios tomados, con la dosis más común y para qué (el malestar elegido al anotarlo).
  const remedios = await filas<{ id: number; nombre: string; veces: number; dias: number; valor: number | null; unidad: string | null }>(
    tx,
    sql`SELECT c.id, c.nombre, count(*)::int AS veces, count(DISTINCT r.fecha)::int AS dias,
               mode() WITHIN GROUP (ORDER BY r.valor)::float AS valor, mode() WITHIN GROUP (ORDER BY coalesce(r.unidad, c.unidad)) AS unidad
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE ${enRango} AND k.clave = 'medicacion'
        GROUP BY c.id, c.nombre ORDER BY count(*) DESC LIMIT 25`,
  );
  const para = await filas<{ concepto_id: number; para: string; veces: number }>(
    tx,
    sql`SELECT r.concepto_id, mc.nombre AS para, count(*)::int AS veces
        FROM registros r JOIN registros m ON m.id = (r.datos->>'para_registro_id')::bigint AND m.borrado IS NULL
        JOIN conceptos mc ON mc.id = m.concepto_id
        WHERE ${enRango} AND r.datos ? 'para_registro_id'
        GROUP BY r.concepto_id, mc.nombre ORDER BY count(*) DESC`,
  );

  // Tratamientos que estuvieron vigentes en el período, con cuántas tomas programadas se tomaron.
  const desdeI = localAInstante(desde, '05:00', p.zona_horaria);
  const hastaI = new Date(Math.min(Date.now(), localAInstante(sumarDias(hasta, 1), '05:00', p.zona_horaria).getTime()));
  const trat = await filas<Fila>(
    tx,
    sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.persona_id = ${p.id} AND t.borrado IS NULL AND t.inicio < ${hastaI.toISOString()}
          AND (t.fin IS NULL OR t.fin >= ${desdeI.toISOString()}) AND (t.terminado IS NULL OR t.terminado >= ${desdeI.toISOString()})
        ORDER BY t.inicio`,
  );
  const tomas = await tomasDe(tx, trat, desdeI, hastaI);
  const motivos = new Map<number, string[]>();
  for (const x of trat) if (x.motivo) motivos.set(x.concepto_id, [...(motivos.get(x.concepto_id) ?? []), x.motivo]);

  // Sueño.
  const noches = await horasDeSueno(tx, p.id, desde, hasta);
  const horas = await filas<{ nombre: string; valor: number }>(
    tx,
    sql`SELECT c.nombre, r.valor FROM registros r JOIN conceptos c ON c.id = r.concepto_id
        WHERE ${enRango} AND c.nombre IN ('Me acosté', 'Me levanté') AND r.valor IS NOT NULL`,
  );
  const despertares = await una<{ n: number }>(
    tx,
    sql`SELECT count(DISTINCT r.fecha)::int AS n FROM registros r JOIN conceptos c ON c.id = r.concepto_id WHERE ${enRango} AND c.nombre = ${DESPERTAR}`,
  );
  const acoste = horaPromedio(horas.filter((h) => h.nombre === 'Me acosté').map((h) => h.valor), true);
  const levante = horaPromedio(horas.filter((h) => h.nombre === 'Me levanté').map((h) => h.valor), false);

  // Ánimo: el promedio de cada día (de 1 a 10, más alto, mejor).
  const animo = await filas<{ fecha: string; valor: number }>(
    tx,
    sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, avg(r.intensidad)::float AS valor FROM registros r JOIN conceptos c ON c.id = r.concepto_id
        WHERE ${enRango} AND c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI}) AND r.intensidad IS NOT NULL GROUP BY r.fecha ORDER BY r.fecha`,
  );
  const largoTramo = dias <= 14 ? 1 : 7;
  const tramos: NonNullable<DatosInforme['animo']>['tramos'] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, largoTramo)) {
    const fin = sumarDias(f, largoTramo - 1) > hasta ? hasta : sumarDias(f, largoTramo - 1);
    const p2 = prom(animo.filter((a) => a.fecha >= f && a.fecha <= fin).map((a) => a.valor));
    tramos.push({ desde: f, hasta: fin, promedio: p2 === null ? null : r1(p2) });
  }
  const porEstado = { muy_bien: 0, bien: 0, mal: 0, muy_mal: 0 };
  for (const a of animo) porEstado[estadoDe(Math.round(a.valor)).clave]++;
  // La tendencia: la primera mitad de los días con ánimo contra la segunda.
  const mitad = Math.floor(animo.length / 2);
  const antes = prom(animo.slice(0, mitad).map((a) => a.valor));
  const despues = prom(animo.slice(animo.length - mitad).map((a) => a.valor));
  const tendencia = animo.length < 4 || antes === null || despues === null ? null : despues - antes >= 1 ? 'mejora' : antes - despues >= 1 ? 'empeora' : 'estable';

  // Ciclo menstrual, si lo anota.
  const menstruacion = await diasDeMenstruacion(tx, p.id);
  const ciclo = menstruacion.length ? resumenCiclo(menstruacion, hasta) : null;

  // Patrones: los firmes (o los que la persona dijo que le pasan), menos los que marcó como sin sentido.
  const hallazgos = (await listarHallazgos(tx, p.id))
    .filter((h) => h.estado !== 'descartado' && !h.fecha_desde && !h.ya_no && (h.q_valor <= Q_FIRME || h.estado === 'confirmado'))
    // Primero los que dijo que le pasan; al final los que marcó como obvios.
    .sort((a, b) => Number(b.estado === 'confirmado') - Number(a.estado === 'confirmado') || Number(a.estado === 'obvio') - Number(b.estado === 'obvio') || b.puntaje - a.puntaje)
    .slice(0, MAX_HALLAZGOS);
  const cuando = (d: number) => (d === 0 ? t('el mismo día') : d === 1 ? t('al día siguiente') : t('{n} días después', { n: d }));
  const causaDe = (h: Hallazgo) =>
    [{ nombre: h.causa, tipo: h.causa_tipo, modo: h.causa_modo }, ...(h.causas_extra ?? [])].map((c) => nombreRasgo(c.nombre, c.tipo, c.modo, idioma)).join(' + ');

  return {
    idioma,
    persona: {
      nombre: per?.nombre ?? p.nombre,
      edad: edadDe(per?.nacimiento ?? null, hasta),
      sexo: per?.sexo ?? null,
      altura_cm: per?.altura_cm ?? null,
      peso_kg: per?.peso_kg ?? null,
      condiciones: per?.condiciones ?? [],
    },
    desde,
    hasta,
    dias,
    dias_anotados: anotados?.n ?? 0,
    generado: new Date().toISOString(),
    malestares: malestares.map(({ manana, tarde, noche, ...m }) => ({
      ...m,
      nombre: dato(m.nombre),
      intensidad_prom: m.intensidad_prom === null ? null : r1(m.intensidad_prom),
      minutos_prom: m.minutos_prom === null ? null : Math.round(m.minutos_prom),
      franja: m.veces < 2 ? null : manana >= tarde && manana >= noche ? 'manana' : tarde >= noche ? 'tarde' : 'noche',
    })),
    remedios: remedios.map((r) => ({
      nombre: dato(r.nombre),
      veces: r.veces,
      dias: r.dias,
      dosis: dosisTexto(r.valor, r.unidad, idioma),
      para: [...new Set([...para.filter((x) => x.concepto_id === r.id).map((x) => dato(x.para)), ...(motivos.get(r.id) ?? [])])],
    })),
    tratamientos: trat.map((x) => {
      const suyas = tomas.filter((tm) => tm.tratamiento_id === x.id);
      return {
        remedio: dato(x.remedio),
        dosis: dosisTexto(x.dosis, x.unidad, idioma),
        como: x.cada_horas ? t('Cada {n} h', { n: x.cada_horas }) : x.horarios?.length ? x.horarios.join(' · ') : t('Si hace falta'),
        motivo: x.motivo,
        programadas: suyas.length,
        tomadas: suyas.filter((tm) => tm.estado === 'tomada').length,
        terminado: Boolean(x.terminado),
      };
    }),
    sueno:
      noches.length || acoste !== null || levante !== null
        ? {
            noches,
            promedio: noches.length ? r1(prom(noches.map((n) => n.horas))!) : null,
            minimo: noches.length ? Math.min(...noches.map((n) => n.horas)) : null,
            maximo: noches.length ? Math.max(...noches.map((n) => n.horas)) : null,
            acoste,
            levante,
            despertares: despertares?.n ?? 0,
          }
        : null,
    animo: animo.length ? { dias: animo.length, promedio: r1(prom(animo.map((a) => a.valor))!), por_estado: porEstado, tramos, tendencia } : null,
    ciclo: ciclo
      ? {
          duracion_ciclo: ciclo.duracion_ciclo,
          duracion_periodo: ciclo.duracion_periodo,
          ciclos: ciclo.ciclos,
          regular: ciclo.regular,
          inicios: ciclo.periodos.map((x) => x.inicio).filter((f) => f >= desde && f <= hasta),
          proxima: ciclo.proxima,
        }
      : null,
    hallazgos: hallazgos.map((h) => ({
      causa: h.componente ? t('{causa} (estimación)', { causa: causaDe(h) }) : causaDe(h),
      efecto: nombreRasgo(h.efecto, h.efecto_tipo, h.efecto_modo, idioma),
      cuando: cuando(h.desfase_dias),
      detalle: t('Pasó {n} de {total} veces: {con}% de las veces, contra {sin}% sin eso.', {
        n: h.soporte,
        total: h.dias_causa,
        con: Math.round(h.prob_con * 100),
        sin: Math.round(h.prob_sin * 100),
      }),
      texto:
        h.explicacion ??
        t('{efecto} apareció más seguido {cuando} de {causa}.', {
          efecto: nombreRasgo(h.efecto, h.efecto_tipo, h.efecto_modo, idioma),
          cuando: cuando(h.desfase_dias),
          causa: causaDe(h).toLocaleLowerCase(idioma === 'en' ? 'en-US' : 'es-AR'),
        }),
      confirmado: h.estado === 'confirmado',
    })),
  };
}
