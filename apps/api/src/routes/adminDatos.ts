// Administración → Datos (solo administradores): para auditar qué tan bien se guarda todo y corregirlo.
//   /personas, /personas/:id/cobertura, /personas/:id/dia   la persona 360: qué llega de cada fuente, día por día
//   /tablas, /tablas/:tabla (+ /editar, /borrar)            navegador de todas las tablas, con edición auditada
//   /calidad, /calidad/:clave (+ /corregir)                 chequeos de calidad con sus arreglos
//   /ia, /hallazgos                                         lo que produjo la IA y los patrones de todos
//   /auditoria                                              lo que cambiaron los administradores
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { exigirRol } from '../auth/sesion.js';
import { chequeoDe, contarChequeos, corregirChequeo, ejemplosDe } from '../admin/calidad.js';
import { borrarFila, editarFila, leerFilas, listarTablas, tablaDe } from '../admin/tablas.js';
import { filas, una } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha } from '../lib/fechas.js';
import { cuerpo, idParam, type Env } from '../lib/http.js';

const numero = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const rutasAdminDatos = new Hono<Env>()
  .use('*', async (c, next) => {
    exigirRol(c.var.usuario, 'admin');
    await next();
  })
  .get('/personas', async (c) =>
    c.json(
      await filas(
        c.var.db,
        sql`SELECT p.id, p.nombre, p.zona_horaria, p.creado,
                   (SELECT string_agg(u.nombre, ', ' ORDER BY u.nombre) FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id WHERE pu.persona_id = p.id AND pu.rol = 'dueno') AS duenos,
                   (SELECT count(*) FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL)::int AS registros,
                   (SELECT count(*) FROM mediciones m WHERE m.persona_id = p.id)::int AS mediciones,
                   (SELECT max(r.creado) FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL) AS ultimo_registro,
                   (SELECT max(m.creado) FROM mediciones m WHERE m.persona_id = p.id) AS ultima_medicion,
                   (SELECT json_agg(json_build_object('id', f.id, 'tipo', f.tipo, 'nombre', f.nombre, 'activo', f.activo, 'ultimo_uso', f.ultimo_uso) ORDER BY f.tipo)
                      FROM fuentes f WHERE f.persona_id = p.id) AS fuentes
            FROM personas p ORDER BY greatest((SELECT max(r.creado) FROM registros r WHERE r.persona_id = p.id), (SELECT max(m.creado) FROM mediciones m WHERE m.persona_id = p.id)) DESC NULLS LAST, p.nombre`,
      ),
    ),
  )
  .get('/personas/:id/cobertura', async (c) => {
    // Cuánto llegó de cada cosa, día por día: para ver de un vistazo los huecos (un teléfono que dejó de mandar, un
    // reloj que no sincronizó, días sin anotar).
    const db = c.var.db;
    const id = idParam(c);
    const p = await una<{ zona_horaria: string }>(db, sql`SELECT zona_horaria FROM personas WHERE id = ${id}`);
    if (!p) throw new ErrorApi('No existe.', 404);
    const dias = Math.min(180, Math.max(7, numero(c.req.query('dias')) ?? 60));
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const filasDias = await filas<Record<string, number | string>>(
      db,
      sql`WITH d AS (SELECT (${hoy}::date - g)::date AS fecha FROM generate_series(0, ${dias - 1}::int) g)
          SELECT to_char(d.fecha, 'YYYY-MM-DD') AS fecha,
                 (SELECT count(*) FROM registros r WHERE r.persona_id = ${id} AND r.borrado IS NULL AND r.fecha = d.fecha AND r.origen = 'manual')::int AS manual,
                 (SELECT count(*) FROM registros r WHERE r.persona_id = ${id} AND r.borrado IS NULL AND r.fecha = d.fecha AND r.origen <> 'manual')::int AS ia,
                 (SELECT count(*) FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id WHERE m.persona_id = ${id} AND m.fecha = d.fecha AND f.tipo = 'telefono')::int AS telefono,
                 (SELECT count(*) FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id WHERE m.persona_id = ${id} AND m.fecha = d.fecha AND f.tipo = 'reloj')::int AS reloj,
                 (SELECT count(*) FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id WHERE m.persona_id = ${id} AND m.fecha = d.fecha AND f.tipo = 'clima')::int AS clima,
                 (SELECT count(*) FROM mediciones m JOIN fuentes f ON f.id = m.fuente_id WHERE m.persona_id = ${id} AND m.fecha = d.fecha AND f.tipo IN ('ubicacion', 'otro'))::int AS lugares,
                 (SELECT count(*) FROM puntos x WHERE x.persona_id = ${id} AND x.fecha = d.fecha)::int AS puntos,
                 (SELECT count(*) FROM sueno_etapas s WHERE s.persona_id = ${id} AND s.noche = d.fecha)::int AS sueno,
                 (SELECT count(*) FROM resumen_noche rn WHERE rn.persona_id = ${id} AND rn.noche = d.fecha)::int AS resumen_noche,
                 (SELECT count(*) FROM escuchas e WHERE e.persona_id = ${id} AND e.fecha = d.fecha)::int AS escuchas,
                 (SELECT count(*) FROM comentarios k WHERE k.persona_id = ${id} AND k.fecha = d.fecha)::int AS comentarios
          FROM d ORDER BY d.fecha`,
    );
    return c.json({ hoy, dias: filasDias });
  })
  .get('/personas/:id/dia', async (c) => {
    // Todo lo que hay de un día de la persona, crudo, con la tabla y la clave de cada cosa para poder editarla.
    const db = c.var.db;
    const id = idParam(c);
    const p = await una<{ id: number; nombre: string; zona_horaria: string }>(db, sql`SELECT id, nombre, zona_horaria FROM personas WHERE id = ${id}`);
    if (!p) throw new ErrorApi('No existe.', 404);
    const fecha = esFecha(c.req.query('fecha')) ? c.req.query('fecha')! : diaDePatty(new Date(), p.zona_horaria);
    const zona = p.zona_horaria;
    const hora = (col: string) => sql`to_char(${sql.identifier(col)} AT TIME ZONE ${zona}, 'HH24:MI')`;
    const [registros, mediciones, sueno, resumenNoche, escuchas, puntos, tomas, comentarios, fuera, paseos, contextos, avisos] = await Promise.all([
      filas(
        db,
        sql`SELECT r.id, ${hora('inicio')} AS hora, r.inicio, r.fin, r.valor, r.intensidad, r.unidad, r.nota, r.origen, r.datos, r.borrado, r.creado,
                   c.id AS concepto_id, c.nombre AS concepto, k.icono, k.nombre AS categoria, u.nombre AS creado_por
            FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id LEFT JOIN usuarios u ON u.id = r.creado_por
            WHERE r.persona_id = ${id} AND r.fecha = ${fecha} ORDER BY r.inicio`,
      ),
      filas(
        db,
        sql`SELECT m.id, ${hora('inicio')} AS hora, m.inicio, m.fin, m.valor, coalesce(m.unidad, c.unidad) AS unidad, m.creado, c.nombre AS concepto, k.icono, f.tipo AS fuente, f.nombre AS fuente_nombre
            FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id JOIN categorias k ON k.id = c.categoria_id JOIN fuentes f ON f.id = m.fuente_id
            WHERE m.persona_id = ${id} AND m.fecha = ${fecha} ORDER BY f.tipo, c.nombre, m.inicio`,
      ),
      filas(db, sql`SELECT s.id, ${hora('inicio')} AS hora, s.inicio, s.fin, s.etapa, round(extract(epoch FROM s.fin - s.inicio) / 60)::int AS minutos FROM sueno_etapas s WHERE s.persona_id = ${id} AND s.noche = ${fecha} ORDER BY s.inicio`),
      filas(db, sql`SELECT persona_id, to_char(noche, 'YYYY-MM-DD') AS noche, texto, calidad, creado FROM resumen_noche WHERE persona_id = ${id} AND noche = ${fecha}`),
      filas(db, sql`SELECT e.id, ${hora('inicio')} AS hora, e.app, e.titulo, e.artista, round(extract(epoch FROM e.fin - e.inicio) / 60)::int AS minutos FROM escuchas e WHERE e.persona_id = ${id} AND e.fecha = ${fecha} ORDER BY e.inicio`),
      filas(db, sql`SELECT x.id, ${hora('instante')} AS hora, x.lat, x.lon, x.precision_m FROM puntos x WHERE x.persona_id = ${id} AND x.fecha = ${fecha} ORDER BY x.instante`),
      filas(
        db,
        sql`SELECT t.id, ${hora('programada')} AS hora, t.estado, t.registro_id, c.nombre AS remedio
            FROM tomas t JOIN tratamientos tr ON tr.id = t.tratamiento_id JOIN conceptos c ON c.id = tr.concepto_id
            WHERE tr.persona_id = ${id} AND ((t.programada AT TIME ZONE ${zona}) - interval '5 hours')::date = ${fecha} ORDER BY t.programada`,
      ),
      filas(db, sql`SELECT id, emoji, texto, estado, creado FROM comentarios WHERE persona_id = ${id} AND fecha = ${fecha} ORDER BY id`),
      filas(db, sql`SELECT id, clave, emoji, texto, datos, estado FROM fuera_de_lo_normal WHERE persona_id = ${id} AND fecha = ${fecha} ORDER BY id`),
      filas(db, sql`SELECT id, ${hora('inicio')} AS hora, metros, estado, registro_id FROM paseos_detectados WHERE persona_id = ${id} AND ((inicio AT TIME ZONE ${zona}) - interval '5 hours')::date = ${fecha} ORDER BY inicio`),
      filas(
        db,
        sql`SELECT x.registro_id, x.texto, x.items, x.creado FROM contexto_registro x JOIN registros r ON r.id = x.registro_id WHERE r.persona_id = ${id} AND r.fecha = ${fecha}`,
      ),
      filas(
        db,
        sql`SELECT h.id, to_char(h.creado AT TIME ZONE ${zona}, 'HH24:MI') AS hora, h.tipo, h.titulo, h.cuerpo, h.resultado, u.nombre AS usuario
            FROM avisos_historial h JOIN usuarios u ON u.id = h.usuario_id
            WHERE h.persona_id = ${id} AND ((h.creado AT TIME ZONE ${zona}) - interval '5 hours')::date = ${fecha} ORDER BY h.creado`,
      ),
    ]);
    return c.json({ persona: p, fecha, registros, mediciones, sueno, resumen_noche: resumenNoche[0] ?? null, escuchas, puntos, tomas, comentarios, fuera, paseos, contextos, avisos });
  })
  .get('/tablas', async (c) => c.json(await listarTablas(c.var.db)))
  .get('/tablas/:tabla', async (c) => {
    const t = await tablaDe(c.var.db, c.req.param('tabla'));
    const q = c.req.query();
    const filtros = Object.fromEntries(Object.entries(q).filter(([k]) => k.startsWith('f.')).map(([k, v]) => [k.slice(2), v]));
    return c.json({
      tabla: t,
      ...(await leerFilas(c.var.db, t, {
        pagina: numero(q.pagina),
        por: numero(q.por),
        orden: q.orden,
        dir: q.dir,
        persona_id: numero(q.persona_id),
        usuario_id: numero(q.usuario_id),
        desde: q.desde,
        hasta: q.hasta,
        buscar: q.buscar,
        filtros,
      })),
    });
  })
  .post('/tablas/:tabla/editar', async (c) => {
    // { clave: {id: 5}, cambios: {valor: 3} }
    const d = await cuerpo(c);
    const db = c.var.db;
    const fila = await db.transaction(async (tx) => editarFila(tx, c.var.usuario.id, await tablaDe(tx, c.req.param('tabla')), objeto(d.clave), objeto(d.cambios)));
    return c.json(fila);
  })
  .post('/tablas/:tabla/borrar', async (c) => {
    // { clave: {id: 5}, logico?: true }
    const d = await cuerpo(c);
    await c.var.db.transaction(async (tx) => borrarFila(tx, c.var.usuario.id, await tablaDe(tx, c.req.param('tabla')), objeto(d.clave), d.logico === true));
    return c.json({ ok: true });
  })
  .get('/calidad', async (c) => c.json(await contarChequeos(c.var.db)))
  .get('/calidad/:clave', async (c) => {
    const ch = chequeoDe(c.req.param('clave'));
    if (!ch) throw new ErrorApi('No existe.', 404);
    return c.json(await ejemplosDe(c.var.db, ch));
  })
  .post('/calidad/:clave/corregir', async (c) => {
    const ch = chequeoDe(c.req.param('clave'));
    if (!ch) throw new ErrorApi('No existe.', 404);
    if (!ch.corregir) throw new ErrorApi('Este chequeo no tiene un arreglo automático.');
    return c.json({ corregidas: await corregirChequeo(c.var.db, ch, c.var.usuario.id) });
  })
  .get('/ia', async (c) => {
    // Lo último que produjo la IA (y el motor), de todos o de una persona: análisis, resúmenes, comentarios, contextos,
    // lo fuera de lo normal y las preguntas, en una sola línea de tiempo; más el consumo por tipo y los procesos.
    const db = c.var.db;
    const persona = numero(c.req.query('persona_id'));
    const dias = Math.min(90, Math.max(1, numero(c.req.query('dias')) ?? 14));
    const tipo = c.req.query('tipo') ?? '';
    const de = (col = 'persona_id') => (persona ? sql`AND ${sql.identifier(col)} = ${persona}` : sql``);
    const desde = sql`now() - make_interval(days => ${dias})`;
    const partes = {
      analisis: sql`SELECT 'analisis' AS tipo, a.id::text AS id, a.persona_id, a.creado, a.resumen AS texto,
                           json_build_object('origen', a.origen, 'dias', a.dias, 'pares', a.pares_evaluados, 'nuevos', jsonb_array_length(a.nuevos), 'sugerencias', a.sugerencias) AS datos
                    FROM analisis a WHERE a.creado > ${desde} ${de()}`,
      resumen_noche: sql`SELECT 'resumen_noche', persona_id::text || '|' || to_char(noche, 'YYYY-MM-DD'), persona_id, creado, texto, json_build_object('noche', to_char(noche, 'YYYY-MM-DD'), 'calidad', calidad)
                         FROM resumen_noche WHERE creado > ${desde} ${de()}`,
      resumen_semana: sql`SELECT 'resumen_semana', persona_id::text || '|' || to_char(semana, 'YYYY-MM-DD'), persona_id, creado, titulo || ' — ' || texto, json_build_object('semana', to_char(semana, 'YYYY-MM-DD'), 'destacados', destacados, 'sugerencias', sugerencias)
                          FROM resumen_semana WHERE creado > ${desde} ${de()}`,
      comentarios: sql`SELECT 'comentarios', id::text, persona_id, creado, emoji || ' ' || texto, json_build_object('estado', estado, 'fecha', to_char(fecha, 'YYYY-MM-DD'))
                       FROM comentarios WHERE creado > ${desde} ${de()}`,
      contexto_registro: sql`SELECT 'contexto_registro', registro_id::text, persona_id, creado, texto, json_build_object('items', jsonb_array_length(items))
                             FROM contexto_registro WHERE creado > ${desde} ${de()}`,
      fuera_de_lo_normal: sql`SELECT 'fuera_de_lo_normal', id::text, persona_id, creado, emoji || ' ' || texto, json_build_object('clave', clave, 'datos', datos, 'estado', estado)
                              FROM fuera_de_lo_normal WHERE creado > ${desde} ${de()}`,
      preguntas: sql`SELECT 'preguntas', id::text, persona_id, creado, pregunta || ' → ' || respuesta, json_build_object('usuario_id', usuario_id)
                     FROM preguntas WHERE creado > ${desde} ${de()}`,
      registros_ia: sql`SELECT 'registros_ia', r.id::text, r.persona_id, r.creado, c.nombre || coalesce(' · ' || r.nota, ''), json_build_object('valor', r.valor, 'intensidad', r.intensidad, 'origen', r.origen)
                        FROM registros r JOIN conceptos c ON c.id = r.concepto_id WHERE r.origen <> 'manual' AND r.borrado IS NULL AND r.creado > ${desde} ${persona ? sql`AND r.persona_id = ${persona}` : sql``}`,
    } as const;
    const elegidas = tipo in partes ? [partes[tipo as keyof typeof partes]] : Object.values(partes);
    const linea = await filas(
      db,
      sql`SELECT x.*, p.nombre AS persona FROM (${sql.join(elegidas, sql` UNION ALL `)}) x (tipo, id, persona_id, creado, texto, datos)
          LEFT JOIN personas p ON p.id = x.persona_id ORDER BY x.creado DESC LIMIT 300`,
    );
    const consumo = await filas(
      db,
      sql`SELECT tipo, count(*)::int AS pedidos, sum(entrada)::bigint AS entrada, sum(salida)::bigint AS salida, count(DISTINCT usuario_id)::int AS usuarios
          FROM uso_ia WHERE creado > ${desde} GROUP BY tipo ORDER BY pedidos DESC`,
    );
    const procesos = await filas(db, sql`SELECT * FROM procesos ORDER BY nombre`);
    return c.json({ dias, linea, consumo, procesos });
  })
  .get('/hallazgos', async (c) => {
    // Los patrones de todas las personas, con la estadística con la que se decidieron.
    const persona = numero(c.req.query('persona_id'));
    const estado = c.req.query('estado');
    return c.json(
      await filas(
        c.var.db,
        sql`SELECT h.id, h.persona_id, p.nombre AS persona, ca.nombre AS causa, h.causa_modo, h.causas_extra, ef.nombre AS efecto, h.efecto_modo,
                   h.umbral, h.protege, h.desfase_dias, h.soporte, h.dias_causa, h.dias_evaluados, h.prob_con, h.prob_sin, h.lift, h.p_valor, h.q_valor,
                   h.puntaje, h.explicacion, h.estado, h.analisis_id, h.detectado, h.actualizado
            FROM hallazgos h JOIN personas p ON p.id = h.persona_id JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
            WHERE true ${persona ? sql`AND h.persona_id = ${persona}` : sql``} ${estado ? sql`AND h.estado = ${estado}` : sql``}
            ORDER BY h.puntaje DESC LIMIT 500`,
      ),
    );
  })
  .get('/auditoria', async (c) =>
    c.json(
      await filas(
        c.var.db,
        sql`SELECT a.id, a.accion, a.tabla, a.clave, a.antes, a.despues, a.detalle, a.creado, u.nombre AS usuario
            FROM auditoria_admin a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.creado DESC LIMIT 300`,
      ),
    ),
  );
