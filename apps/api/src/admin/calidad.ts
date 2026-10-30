// Los chequeos de calidad de los datos (administración → Datos → Calidad): cada uno es una consulta que devuelve las
// filas con problemas (duplicados, fechas que no cuadran, valores fuera de rango, huecos de sincronización, procesos que
// no corrieron) y, cuando hay un arreglo seguro, la corrección. Las correcciones corren en una transacción y quedan en
// `auditoria_admin`; las que usan la IA (resúmenes, contextos) van de a pocas por vez.
import { sql, type SQL } from 'drizzle-orm';
import { COMO_ME_SENTI, COMO_ME_SIENTO, esIdioma } from 'shared';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { armarContexto } from '../ia/contexto.js';
import { resumirNoche } from '../ia/resumirNoche.js';
import { auditar } from './tablas.js';

export type Gravedad = 'alta' | 'media' | 'baja' | 'info';

export interface Chequeo {
  clave: string;
  titulo: string;
  descripcion: string;
  gravedad: Gravedad;
  /** La tabla donde están las filas, para abrirlas en el navegador de tablas. */
  tabla: string;
  /** Las filas con el problema (cada una con algo para identificarla). */
  consulta: SQL;
  /** El arreglo, si hay uno seguro: devuelve cuántas filas tocó. */
  corregir?: (db: Db, tx: Tx) => Promise<number>;
  /** Qué hace el arreglo, para el botón. */
  arreglo?: string;
  /** Si el arreglo usa la IA (cuesta y tarda: se hace de a pocos). */
  ia?: boolean;
}

/** El día de Patty (de 5 a 5) de un instante, en la zona de la persona. */
const diaPatty = (instante: SQL, zona: SQL) => sql`((${instante} AT TIME ZONE ${zona}) - interval '5 hours')::date`;
const diaLocal = (instante: SQL, zona: SQL) => sql`(${instante} AT TIME ZONE ${zona})::date`;
/** Cuántas cosas que usan la IA se arreglan por vez. */
const LOTE_IA = 10;

const CONTEXTO_PENDIENTE = sql`
  SELECT r.id, r.persona_id, p.nombre AS persona, c.nombre AS concepto, r.intensidad, r.creado, p.zona_horaria,
         (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
  FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id JOIN personas p ON p.id = r.persona_id
  WHERE r.borrado IS NULL AND r.creado > now() - interval '30 days' AND r.creado < now() - interval '1 hour'
    AND (k.clave = 'sintoma' OR (c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI}) AND r.intensidad <= 4))
    AND NOT EXISTS (SELECT 1 FROM contexto_registro x WHERE x.registro_id = r.id)
  ORDER BY r.creado DESC`;

const NOCHES_SIN_RESUMEN = sql`
  SELECT s.persona_id, p.nombre AS persona, to_char(s.noche, 'YYYY-MM-DD') AS noche, count(*)::int AS etapas, p.zona_horaria,
         (SELECT u.idioma FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id WHERE pu.persona_id = p.id ORDER BY (pu.rol = 'dueno') DESC, u.id LIMIT 1) AS idioma
  FROM sueno_etapas s JOIN personas p ON p.id = s.persona_id
  WHERE s.noche > current_date - 15 AND s.noche < ${diaPatty(sql`now()`, sql`p.zona_horaria`)}
    AND NOT EXISTS (SELECT 1 FROM resumen_noche rn WHERE rn.persona_id = s.persona_id AND rn.noche = s.noche)
  GROUP BY s.persona_id, p.nombre, s.noche, p.zona_horaria, p.id ORDER BY s.noche DESC`;

export const CHEQUEOS: Chequeo[] = [
  {
    clave: 'registros_duplicados',
    titulo: 'Anotaciones repetidas',
    descripcion: 'La misma cosa, a la misma hora y con el mismo valor, anotada más de una vez (por un doble toque o un reintento de la cola sin conexión).',
    gravedad: 'alta',
    tabla: 'registros',
    consulta: sql`
      SELECT r.id, r.persona_id, p.nombre AS persona, c.nombre AS concepto, r.inicio, r.valor, r.intensidad, r.origen, r.creado,
             (SELECT min(o.id) FROM registros o WHERE o.borrado IS NULL AND o.persona_id = r.persona_id AND o.concepto_id = r.concepto_id AND o.inicio = r.inicio
                AND o.valor IS NOT DISTINCT FROM r.valor AND o.intensidad IS NOT DISTINCT FROM r.intensidad AND o.nota IS NOT DISTINCT FROM r.nota) AS original
      FROM registros r JOIN personas p ON p.id = r.persona_id JOIN conceptos c ON c.id = r.concepto_id
      WHERE r.borrado IS NULL AND EXISTS (
        SELECT 1 FROM registros o WHERE o.borrado IS NULL AND o.id < r.id AND o.persona_id = r.persona_id AND o.concepto_id = r.concepto_id
          AND o.inicio = r.inicio AND o.valor IS NOT DISTINCT FROM r.valor AND o.intensidad IS NOT DISTINCT FROM r.intensidad AND o.nota IS NOT DISTINCT FROM r.nota)
      ORDER BY r.creado DESC`,
    arreglo: 'Borrar las repetidas (queda la primera; se marcan como borradas, no se pierden)',
    corregir: async (_db, tx) =>
      (
        await filas(
          tx,
          sql`UPDATE registros r SET borrado = now() WHERE r.borrado IS NULL AND EXISTS (
                SELECT 1 FROM registros o WHERE o.borrado IS NULL AND o.id < r.id AND o.persona_id = r.persona_id AND o.concepto_id = r.concepto_id
                  AND o.inicio = r.inicio AND o.valor IS NOT DISTINCT FROM r.valor AND o.intensidad IS NOT DISTINCT FROM r.intensidad AND o.nota IS NOT DISTINCT FROM r.nota)
              RETURNING r.id`,
        )
      ).length,
  },
  {
    clave: 'registros_fecha',
    titulo: 'Anotaciones en el día equivocado',
    descripcion: 'El día guardado (`fecha`) no es el de la hora de la anotación en la zona de la persona (ni el día de Patty, de 5 a 5, ni el del calendario). El motor de patrones las cuenta en otro día.',
    gravedad: 'alta',
    tabla: 'registros',
    consulta: sql`
      SELECT r.id, r.persona_id, p.nombre AS persona, c.nombre AS concepto, r.inicio, to_char(r.fecha, 'YYYY-MM-DD') AS fecha,
             to_char(${diaPatty(sql`r.inicio`, sql`p.zona_horaria`)}, 'YYYY-MM-DD') AS deberia
      FROM registros r JOIN personas p ON p.id = r.persona_id JOIN conceptos c ON c.id = r.concepto_id
      WHERE r.borrado IS NULL AND r.fecha <> ${diaPatty(sql`r.inicio`, sql`p.zona_horaria`)} AND r.fecha <> ${diaLocal(sql`r.inicio`, sql`p.zona_horaria`)}
      ORDER BY r.inicio DESC`,
    arreglo: 'Pasarlas a su día de Patty',
    corregir: async (_db, tx) =>
      (
        await filas(
          tx,
          sql`UPDATE registros r SET fecha = ${diaPatty(sql`r.inicio`, sql`p.zona_horaria`)} FROM personas p
              WHERE p.id = r.persona_id AND r.borrado IS NULL
                AND r.fecha <> ${diaPatty(sql`r.inicio`, sql`p.zona_horaria`)} AND r.fecha <> ${diaLocal(sql`r.inicio`, sql`p.zona_horaria`)}
              RETURNING r.id`,
        )
      ).length,
  },
  {
    clave: 'registros_fin_antes',
    titulo: 'Anotaciones que terminan antes de empezar',
    descripcion: 'El fin es anterior al inicio (una actividad o un malestar con las horas al revés): la duración da negativa.',
    gravedad: 'media',
    tabla: 'registros',
    consulta: sql`
      SELECT r.id, r.persona_id, p.nombre AS persona, c.nombre AS concepto, r.inicio, r.fin
      FROM registros r JOIN personas p ON p.id = r.persona_id JOIN conceptos c ON c.id = r.concepto_id
      WHERE r.borrado IS NULL AND r.fin < r.inicio ORDER BY r.inicio DESC`,
    arreglo: 'Dejarlas sin fin',
    corregir: async (_db, tx) => (await filas(tx, sql`UPDATE registros SET fin = NULL WHERE borrado IS NULL AND fin < inicio RETURNING id`)).length,
  },
  {
    clave: 'registros_intensidad',
    titulo: 'Intensidades fuera de 0 a 10',
    descripcion: 'La intensidad de un dolor o del ánimo va de 0 a 10; otra cosa rompe los promedios y los umbrales.',
    gravedad: 'media',
    tabla: 'registros',
    consulta: sql`
      SELECT r.id, r.persona_id, p.nombre AS persona, c.nombre AS concepto, r.intensidad, r.inicio
      FROM registros r JOIN personas p ON p.id = r.persona_id JOIN conceptos c ON c.id = r.concepto_id
      WHERE r.borrado IS NULL AND (r.intensidad < 0 OR r.intensidad > 10) ORDER BY r.inicio DESC`,
    arreglo: 'Llevarlas al borde (0 o 10)',
    corregir: async (_db, tx) =>
      (await filas(tx, sql`UPDATE registros SET intensidad = greatest(0, least(10, intensidad)) WHERE borrado IS NULL AND (intensidad < 0 OR intensidad > 10) RETURNING id`)).length,
  },
  {
    clave: 'registros_futuro',
    titulo: 'Anotaciones en el futuro',
    descripcion: 'Empiezan más de un día después de ahora: casi siempre una fecha mal interpretada (al contarle a Patty o en un teléfono con la hora mal).',
    gravedad: 'media',
    tabla: 'registros',
    consulta: sql`
      SELECT r.id, r.persona_id, p.nombre AS persona, c.nombre AS concepto, r.inicio, r.origen, r.creado
      FROM registros r JOIN personas p ON p.id = r.persona_id JOIN conceptos c ON c.id = r.concepto_id
      WHERE r.borrado IS NULL AND r.inicio > now() + interval '1 day' ORDER BY r.inicio DESC`,
  },
  {
    clave: 'registros_concepto_unido',
    titulo: 'Anotaciones de cosas que se unieron con otra',
    descripcion: 'Apuntan a un concepto que se unió con otro (dos nombres para lo mismo): deberían haber pasado al que quedó, si no el análisis las ve separadas.',
    gravedad: 'alta',
    tabla: 'registros',
    consulta: sql`
      SELECT r.id, r.persona_id, p.nombre AS persona, c.nombre AS concepto, c.unido_a, d.nombre AS unido_con
      FROM registros r JOIN personas p ON p.id = r.persona_id JOIN conceptos c ON c.id = r.concepto_id LEFT JOIN conceptos d ON d.id = c.unido_a
      WHERE r.borrado IS NULL AND c.unido_a IS NOT NULL ORDER BY r.id DESC`,
    arreglo: 'Pasarlas al concepto que quedó',
    corregir: async (_db, tx) => {
      let n = 0;
      // Una unión puede apuntar a otra que también se unió: se sigue la cadena (unas pocas vueltas alcanzan).
      for (let i = 0; i < 5; i++) {
        const r = await filas(tx, sql`UPDATE registros r SET concepto_id = c.unido_a FROM conceptos c WHERE c.id = r.concepto_id AND c.unido_a IS NOT NULL RETURNING r.id`);
        if (!r.length) break;
        n += r.length;
      }
      return n;
    },
  },
  {
    clave: 'mediciones_concepto_unido',
    titulo: 'Datos automáticos de cosas que se unieron con otra',
    descripcion: 'Como el anterior, en las mediciones del teléfono, el reloj o el clima.',
    gravedad: 'media',
    tabla: 'mediciones',
    consulta: sql`
      SELECT m.id, m.persona_id, p.nombre AS persona, c.nombre AS concepto, c.unido_a, m.inicio, m.valor
      FROM mediciones m JOIN personas p ON p.id = m.persona_id JOIN conceptos c ON c.id = m.concepto_id
      WHERE c.unido_a IS NOT NULL ORDER BY m.id DESC`,
    arreglo: 'Pasarlas al concepto que quedó (las que ya existen allá se borran)',
    corregir: async (_db, tx) => {
      let n = 0;
      for (let i = 0; i < 5; i++) {
        const movidas = await filas(
          tx,
          sql`UPDATE mediciones m SET concepto_id = c.unido_a FROM conceptos c
              WHERE c.id = m.concepto_id AND c.unido_a IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM mediciones o WHERE o.persona_id = m.persona_id AND o.concepto_id = c.unido_a AND o.inicio = m.inicio AND o.fuente_id = m.fuente_id)
              RETURNING m.id`,
        );
        const repetidas = await filas(
          tx,
          sql`DELETE FROM mediciones m USING conceptos c WHERE c.id = m.concepto_id AND c.unido_a IS NOT NULL
                AND EXISTS (SELECT 1 FROM mediciones o WHERE o.persona_id = m.persona_id AND o.concepto_id = c.unido_a AND o.inicio = m.inicio AND o.fuente_id = m.fuente_id)
              RETURNING m.id`,
        );
        if (!movidas.length && !repetidas.length) break;
        n += movidas.length + repetidas.length;
      }
      return n;
    },
  },
  {
    clave: 'mediciones_fecha',
    titulo: 'Datos automáticos en el día equivocado',
    descripcion: 'El día guardado está a más de un día del de la hora de la medición (en la zona de la persona).',
    gravedad: 'media',
    tabla: 'mediciones',
    consulta: sql`
      SELECT m.id, m.persona_id, p.nombre AS persona, c.nombre AS concepto, m.inicio, to_char(m.fecha, 'YYYY-MM-DD') AS fecha,
             to_char(${diaLocal(sql`m.inicio`, sql`p.zona_horaria`)}, 'YYYY-MM-DD') AS deberia
      FROM mediciones m JOIN personas p ON p.id = m.persona_id JOIN conceptos c ON c.id = m.concepto_id
      WHERE abs(m.fecha - ${diaLocal(sql`m.inicio`, sql`p.zona_horaria`)}) > 1 ORDER BY m.inicio DESC`,
    arreglo: 'Pasarlos al día de su hora',
    corregir: async (_db, tx) =>
      (
        await filas(
          tx,
          sql`UPDATE mediciones m SET fecha = ${diaLocal(sql`m.inicio`, sql`p.zona_horaria`)} FROM personas p
              WHERE p.id = m.persona_id AND abs(m.fecha - ${diaLocal(sql`m.inicio`, sql`p.zona_horaria`)}) > 1 RETURNING m.id`,
        )
      ).length,
  },
  {
    clave: 'mediciones_fuera_de_rango',
    titulo: 'Datos automáticos imposibles',
    descripcion: 'Valores negativos, más de 24 horas o 1440 minutos en un solo dato, porcentajes de más de 100, más de 100.000 pasos o pulso fuera de 25 a 250.',
    gravedad: 'media',
    tabla: 'mediciones',
    consulta: sql`
      SELECT m.id, m.persona_id, p.nombre AS persona, c.nombre AS concepto, m.valor, coalesce(m.unidad, c.unidad) AS unidad, m.inicio, f.tipo AS fuente
      FROM mediciones m JOIN personas p ON p.id = m.persona_id JOIN conceptos c ON c.id = m.concepto_id JOIN fuentes f ON f.id = m.fuente_id
      WHERE (m.valor < 0 AND c.nombre_norm NOT LIKE 'temperatura%')
         OR (coalesce(m.unidad, c.unidad) = 'min' AND m.valor > 1440)
         OR (coalesce(m.unidad, c.unidad) = 'h' AND m.valor > 24)
         OR (coalesce(m.unidad, c.unidad) = '%' AND m.valor > 100)
         OR (c.nombre_norm = 'pasos' AND m.valor > 100000)
         OR (c.nombre_norm LIKE 'pulso%' AND (m.valor < 25 OR m.valor > 250))
         OR (c.nombre_norm LIKE 'temperatura%' AND (m.valor < -60 OR m.valor > 60))
      ORDER BY m.inicio DESC`,
    arreglo: 'Borrarlos',
    corregir: async (_db, tx) =>
      (
        await filas(
          tx,
          sql`DELETE FROM mediciones m USING conceptos c WHERE c.id = m.concepto_id AND (
                (m.valor < 0 AND c.nombre_norm NOT LIKE 'temperatura%')
                OR (coalesce(m.unidad, c.unidad) = 'min' AND m.valor > 1440)
                OR (coalesce(m.unidad, c.unidad) = 'h' AND m.valor > 24)
                OR (coalesce(m.unidad, c.unidad) = '%' AND m.valor > 100)
                OR (c.nombre_norm = 'pasos' AND m.valor > 100000)
                OR (c.nombre_norm LIKE 'pulso%' AND (m.valor < 25 OR m.valor > 250))
                OR (c.nombre_norm LIKE 'temperatura%' AND (m.valor < -60 OR m.valor > 60)))
              RETURNING m.id`,
        )
      ).length,
  },
  {
    clave: 'fuentes_sin_sincronizar',
    titulo: 'Teléfonos y relojes que dejaron de mandar',
    descripcion: 'Fuentes activas (teléfono, reloj, ubicación) sin datos en las últimas 48 horas: permiso sacado, app cerrada por el sistema o sincronización rota.',
    gravedad: 'alta',
    tabla: 'fuentes',
    consulta: sql`
      SELECT f.id, f.persona_id, p.nombre AS persona, f.tipo, f.nombre, f.ultimo_uso, f.creado
      FROM fuentes f JOIN personas p ON p.id = f.persona_id
      WHERE f.activo AND f.tipo IN ('telefono', 'reloj', 'ubicacion') AND coalesce(f.ultimo_uso, f.creado) < now() - interval '48 hours'
      ORDER BY f.ultimo_uso DESC NULLS LAST`,
  },
  {
    clave: 'dias_sin_automaticos',
    titulo: 'Días sin datos automáticos',
    descripcion: 'En los últimos 14 días, días completos sin ninguna medición de una fuente que sí mandó antes y después: huecos que habría que volver a pedir al teléfono.',
    gravedad: 'media',
    tabla: 'mediciones',
    consulta: sql`
      WITH f AS (
        SELECT f.id, f.persona_id, f.tipo, f.nombre, min(m.fecha) AS primero, max(m.fecha) AS ultimo
        FROM fuentes f JOIN mediciones m ON m.fuente_id = f.id
        WHERE f.activo AND f.tipo IN ('telefono', 'reloj') AND m.fecha > current_date - 15 GROUP BY f.id)
      SELECT f.id AS fuente_id, f.persona_id, p.nombre AS persona, f.tipo, f.nombre, to_char(d, 'YYYY-MM-DD') AS dia
      FROM f JOIN personas p ON p.id = f.persona_id, generate_series(f.primero, f.ultimo, interval '1 day') d
      WHERE NOT EXISTS (SELECT 1 FROM mediciones m WHERE m.fuente_id = f.id AND m.fecha = d::date)
      ORDER BY d DESC`,
  },
  {
    clave: 'sueno_duplicado',
    titulo: 'Etapas de sueño repetidas',
    descripcion: 'La misma etapa con el mismo inicio y fin guardada dos veces (el reloj la mandó de nuevo): duplica las horas dormidas.',
    gravedad: 'alta',
    tabla: 'sueno_etapas',
    consulta: sql`
      SELECT s.id, s.persona_id, p.nombre AS persona, to_char(s.noche, 'YYYY-MM-DD') AS noche, s.etapa, s.inicio, s.fin
      FROM sueno_etapas s JOIN personas p ON p.id = s.persona_id
      WHERE EXISTS (SELECT 1 FROM sueno_etapas o WHERE o.persona_id = s.persona_id AND o.inicio = s.inicio AND o.fin = s.fin AND o.etapa = s.etapa AND o.id < s.id)
      ORDER BY s.inicio DESC`,
    arreglo: 'Borrar las repetidas',
    corregir: async (_db, tx) =>
      (
        await filas(
          tx,
          sql`DELETE FROM sueno_etapas s USING sueno_etapas o
              WHERE o.persona_id = s.persona_id AND o.inicio = s.inicio AND o.fin = s.fin AND o.etapa = s.etapa AND o.id < s.id RETURNING s.id`,
        )
      ).length,
  },
  {
    clave: 'sueno_superpuesto',
    titulo: 'Etapas de sueño que se pisan',
    descripcion: 'Dos etapas distintas de la misma persona que ocupan el mismo rato (dos relojes, o una fuente mandada con otro formato).',
    gravedad: 'baja',
    tabla: 'sueno_etapas',
    consulta: sql`
      SELECT s.id, s.persona_id, p.nombre AS persona, to_char(s.noche, 'YYYY-MM-DD') AS noche, s.etapa, s.inicio, s.fin, o.id AS pisa_a, o.etapa AS etapa_otra
      FROM sueno_etapas s JOIN sueno_etapas o ON o.persona_id = s.persona_id AND o.id < s.id AND o.inicio < s.fin AND s.inicio < o.fin
        AND NOT (o.inicio = s.inicio AND o.fin = s.fin AND o.etapa = s.etapa)
      JOIN personas p ON p.id = s.persona_id
      ORDER BY s.inicio DESC`,
  },
  {
    clave: 'noches_sin_resumen',
    titulo: 'Noches sin resumen de la IA',
    descripcion: 'Noches de los últimos 15 días con etapas de sueño pero sin el resumen y la calidad de la IA (el proceso de las 10 no corrió o el reloj sincronizó tarde).',
    gravedad: 'media',
    tabla: 'resumen_noche',
    consulta: NOCHES_SIN_RESUMEN,
    ia: true,
    arreglo: `Armar los resúmenes que faltan (de a ${LOTE_IA}, con la IA)`,
    corregir: async (db) => {
      let n = 0;
      for (const x of await filas<{ persona_id: number; persona: string; noche: string; zona_horaria: string; idioma: string | null }>(db, sql`${NOCHES_SIN_RESUMEN} LIMIT ${LOTE_IA}`)) {
        if (await resumirNoche(db, { id: x.persona_id, nombre: x.persona, zona_horaria: x.zona_horaria }, x.noche, esIdioma(x.idioma) ? x.idioma : 'es')) n++;
      }
      return n;
    },
  },
  {
    clave: 'contextos_pendientes',
    titulo: 'Malestares sin "¿Qué pasó antes?"',
    descripcion: 'Dolores y malos momentos de los últimos 30 días sin el contexto de las 72 horas previas. El proceso solo mira los de los últimos 2 días: los más viejos ya no se arman solos.',
    gravedad: 'baja',
    tabla: 'registros',
    consulta: CONTEXTO_PENDIENTE,
    ia: true,
    arreglo: `Armar los que faltan (de a ${LOTE_IA}, con la IA)`,
    corregir: async (db) => {
      let n = 0;
      for (const x of await filas<{ id: number; zona_horaria: string; idioma: string | null }>(db, sql`${CONTEXTO_PENDIENTE} LIMIT ${LOTE_IA}`)) {
        if (await armarContexto(db, x.id, x.zona_horaria, esIdioma(x.idioma) ? x.idioma : 'es')) n++;
      }
      return n;
    },
  },
  {
    clave: 'tomas_huerfanas',
    titulo: 'Tomas marcadas sin su anotación',
    descripcion: 'Tomas de remedios marcadas como tomadas cuyo registro de medicación no existe o se borró: el remedio no entra a los patrones.',
    gravedad: 'media',
    tabla: 'tomas',
    consulta: sql`
      SELECT t.id, t.tratamiento_id, p.nombre AS persona, c.nombre AS remedio, t.programada, t.registro_id
      FROM tomas t JOIN tratamientos tr ON tr.id = t.tratamiento_id JOIN personas p ON p.id = tr.persona_id JOIN conceptos c ON c.id = tr.concepto_id
      LEFT JOIN registros r ON r.id = t.registro_id
      WHERE t.estado = 'tomada' AND (r.id IS NULL OR r.borrado IS NOT NULL) ORDER BY t.programada DESC`,
  },
  {
    clave: 'conceptos_usos',
    titulo: 'Contadores de uso desfasados',
    descripcion: 'El contador `usos` de un concepto no coincide con sus anotaciones: el autocompletar ordena mal las sugerencias.',
    gravedad: 'baja',
    tabla: 'conceptos',
    consulta: sql`
      SELECT c.id, c.nombre, c.usos, coalesce(x.n, 0)::int AS anotaciones
      FROM conceptos c LEFT JOIN (SELECT concepto_id, count(*) AS n FROM registros WHERE borrado IS NULL GROUP BY concepto_id) x ON x.concepto_id = c.id
      WHERE c.unido_a IS NULL AND c.usos <> coalesce(x.n, 0) ORDER BY abs(c.usos - coalesce(x.n, 0)) DESC`,
    arreglo: 'Recalcular los contadores',
    corregir: async (_db, tx) =>
      (
        await filas(
          tx,
          sql`UPDATE conceptos c SET usos = coalesce(x.n, 0)
              FROM conceptos c2 LEFT JOIN (SELECT concepto_id, count(*)::int AS n FROM registros WHERE borrado IS NULL GROUP BY concepto_id) x ON x.concepto_id = c2.id
              WHERE c2.id = c.id AND c.unido_a IS NULL AND c.usos <> coalesce(x.n, 0) RETURNING c.id`,
        )
      ).length,
  },
  {
    clave: 'conceptos_nombre_repetido',
    titulo: 'Mismo nombre en varias categorías',
    descripcion: 'Un concepto con el mismo nombre en dos categorías ("Café" en Comida y en Bebida): el análisis los trata como cosas distintas. Se unen desde la app o editando `unido_a`.',
    gravedad: 'baja',
    tabla: 'conceptos',
    consulta: sql`
      SELECT c.id, c.nombre, k.nombre AS categoria, c.usos, (SELECT count(*) FROM conceptos o WHERE o.nombre_norm = c.nombre_norm AND o.unido_a IS NULL)::int AS iguales
      FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
      WHERE c.unido_a IS NULL AND EXISTS (SELECT 1 FROM conceptos o WHERE o.nombre_norm = c.nombre_norm AND o.id <> c.id AND o.unido_a IS NULL)
      ORDER BY c.nombre_norm, c.usos DESC`,
  },
  {
    clave: 'hallazgos_concepto_unido',
    titulo: 'Patrones con cosas que se unieron',
    descripcion: 'Hallazgos cuya causa o efecto es un concepto unido con otro: se van a recalcular con el próximo análisis, pero hoy se muestran con el nombre viejo.',
    gravedad: 'baja',
    tabla: 'hallazgos',
    consulta: sql`
      SELECT h.id, h.persona_id, p.nombre AS persona, ca.nombre AS causa, ef.nombre AS efecto, h.estado
      FROM hallazgos h JOIN personas p ON p.id = h.persona_id JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
      WHERE ca.unido_a IS NOT NULL OR ef.unido_a IS NOT NULL ORDER BY h.id DESC`,
  },
  {
    clave: 'personas_sin_dueno',
    titulo: 'Personas sin dueño',
    descripcion: 'Personas que no tienen ningún usuario como dueño: nadie las ve como propias (quedaron así al borrar una cuenta).',
    gravedad: 'media',
    tabla: 'personas',
    consulta: sql`
      SELECT p.id, p.nombre, p.creado, (SELECT count(*) FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL)::int AS registros
      FROM personas p WHERE NOT EXISTS (SELECT 1 FROM persona_usuarios pu WHERE pu.persona_id = p.id AND pu.rol = 'dueno') ORDER BY p.id`,
  },
  {
    clave: 'puntos_viejos',
    titulo: 'Puntos de ubicación de más de 90 días',
    descripcion: 'Las coordenadas se tienen que borrar a los 90 días (lo promete la app). Se borran cuando el teléfono manda puntos nuevos: si dejó de mandar, quedan.',
    gravedad: 'alta',
    tabla: 'puntos',
    consulta: sql`
      SELECT x.persona_id, p.nombre AS persona, count(*)::int AS puntos, min(x.instante) AS desde, max(x.instante) AS hasta
      FROM puntos x JOIN personas p ON p.id = x.persona_id WHERE x.instante < now() - interval '90 days' GROUP BY x.persona_id, p.nombre ORDER BY puntos DESC`,
    arreglo: 'Borrarlos',
    corregir: async (_db, tx) => (await filas(tx, sql`DELETE FROM puntos WHERE instante < now() - interval '90 days' RETURNING id`)).length,
  },
  {
    clave: 'escuchas_viejas',
    titulo: 'Escuchas de más de 90 días',
    descripcion: 'Lo que se escuchó o miró se guarda 90 días; se borra cuando llegan escuchas nuevas, así que si dejaron de llegar, queda.',
    gravedad: 'media',
    tabla: 'escuchas',
    consulta: sql`
      SELECT x.persona_id, p.nombre AS persona, count(*)::int AS escuchas, min(x.inicio) AS desde, max(x.inicio) AS hasta
      FROM escuchas x JOIN personas p ON p.id = x.persona_id WHERE x.inicio < now() - interval '90 days' GROUP BY x.persona_id, p.nombre ORDER BY escuchas DESC`,
    arreglo: 'Borrarlas',
    corregir: async (_db, tx) => (await filas(tx, sql`DELETE FROM escuchas WHERE inicio < now() - interval '90 days' RETURNING id`)).length,
  },
  {
    clave: 'avisos_fallidos',
    titulo: 'Avisos que no llegaron',
    descripcion: 'Avisos push de los últimos 7 días que fallaron (teléfono dado de baja o error de Firebase).',
    gravedad: 'info',
    tabla: 'avisos_historial',
    consulta: sql`
      SELECT h.id, h.usuario_id, u.nombre AS usuario, h.tipo, h.titulo, h.resultado, h.creado
      FROM avisos_historial h JOIN usuarios u ON u.id = h.usuario_id WHERE h.resultado <> 'ok' AND h.creado > now() - interval '7 days' ORDER BY h.creado DESC`,
  },
  {
    clave: 'errores_dia',
    titulo: 'Errores en las últimas 24 horas',
    descripcion: 'Del servidor, de la app y de los procesos. El detalle está en Salud.',
    gravedad: 'info',
    tabla: 'errores',
    consulta: sql`SELECT e.id, e.origen, e.donde, e.mensaje, e.creado FROM errores e WHERE e.creado > now() - interval '24 hours' ORDER BY e.creado DESC`,
  },
];

export const chequeoDe = (clave: string) => CHEQUEOS.find((c) => c.clave === clave);

/** Cuántas filas tiene cada chequeo (todos juntos; la base es chica). */
export async function contarChequeos(db: Db) {
  const res = [];
  for (const c of CHEQUEOS) {
    const n = (await una<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM (${c.consulta}) x`))?.n ?? 0;
    res.push({ clave: c.clave, titulo: c.titulo, descripcion: c.descripcion, gravedad: c.gravedad, tabla: c.tabla, arreglo: c.arreglo ?? null, ia: Boolean(c.ia), n });
  }
  return res;
}

export async function ejemplosDe(db: Db, c: Chequeo, limite = 100) {
  return filas<Record<string, unknown>>(db, sql`SELECT * FROM (${c.consulta}) x LIMIT ${limite}`);
}

/** Corre el arreglo de un chequeo y lo deja en la auditoría. Los que usan la IA no van en una transacción (tardan). */
export async function corregirChequeo(db: Db, c: Chequeo, usuarioId: number): Promise<number> {
  if (!c.corregir) return 0;
  const correr = c.corregir;
  const antes = (await una<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM (${c.consulta}) x`))?.n ?? 0;
  const n = c.ia
    ? await correr(db, db)
    : await db.transaction(async (tx) => correr(db, tx));
  await auditar(db, usuarioId, 'corregir', c.tabla, { chequeo: c.clave }, { problemas: antes }, { corregidas: n }, c.arreglo ?? null);
  return n;
}
