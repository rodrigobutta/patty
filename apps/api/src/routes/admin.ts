// Administración (solo administradores): cómo viene el uso de Patty mientras se prueba. Un resumen general, los
// usuarios con su actividad, el detalle de cada uno y lo último que se anotó en toda la app.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { gzipSync } from 'node:zlib';
import { exigirRol } from '../auth/sesion.js';
import { VERSION } from '../lib/version.js';

/** Cuándo arrancó este servidor (para ver en Salud si se reinició). */
const ARRANCO = new Date().toISOString();
import { filas, una } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';
import { compararVersiones, limitesDe, PLANES, USOS_IA, type VersionApp } from 'shared';
import { config } from '../config.js';
import type { Aviso } from '../push/firebase.js';
import { mandarAviso } from '../push/mandar.js';
import { avisarA, avisoVersion, desactualizados, guardarVersionApp } from '../push/versionApp.js';
import { hayEnvio } from '../push/firebase.js';

/** Los registros de los últimos 14 días, por día, para la rayita de actividad. */
const ULTIMOS_DIAS = 14;

/** Manda un aviso a los teléfonos de esos usuarios (o de todos). Devuelve a cuántos llegó. */
export const rutasAdmin = new Hono<Env>()
  .use('*', async (c, next) => {
    exigirRol(c.var.usuario, 'admin');
    await next();
  })
  .get('/beta', async (c) =>
    // Los pedidos de invitación a la beta, los nuevos primero.
    c.json(
      await filas(
        c.var.db,
        sql`SELECT id, nombre, email, motivo, estado, idioma, creado FROM solicitudes_beta
            ORDER BY (estado = 'nueva') DESC, creado DESC LIMIT 300`,
      ),
    ),
  )
  .put('/beta/:id', async (c) => {
    const estado = texto((await cuerpo(c)).estado);
    if (!['nueva', 'invitada', 'descartada'].includes(estado)) throw new ErrorApi('Estado inválido.');
    await c.var.db.execute(sql`UPDATE solicitudes_beta SET estado = ${estado} WHERE id = ${idParam(c)}`);
    return c.json({ ok: true });
  })
  .get('/salud', async (c) => {
    // Cómo anda todo: cada proceso que corre solo, los errores de las últimas 48 horas, cuántos por origen y el tamaño
    // de las tablas más grandes.
    const db = c.var.db;
    const procesos = await filas(db, sql`SELECT * FROM procesos ORDER BY nombre`);
    const errores = await filas(
      db,
      sql`SELECT e.id, e.origen, e.mensaje, e.detalle, e.donde, e.version, e.creado, u.nombre AS usuario
          FROM errores e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.creado > now() - interval '48 hours' ORDER BY e.creado DESC LIMIT 150`,
    );
    const porOrigen = await filas(
      db,
      sql`SELECT origen, count(*) FILTER (WHERE creado > now() - interval '24 hours')::int AS dia, count(*) FILTER (WHERE creado > now() - interval '7 days')::int AS semana
          FROM errores GROUP BY origen`,
    );
    const tablas = await filas(
      db,
      sql`SELECT relname AS tabla, n_live_tup::int AS filas, pg_total_relation_size(relid)::bigint AS bytes
          FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`,
    );
    const base = await una<{ bytes: number }>(db, sql`SELECT pg_database_size(current_database())::bigint AS bytes`);
    return c.json({ procesos, errores, porOrigen, tablas, base: Number(base?.bytes ?? 0), version: VERSION, arranco: ARRANCO });
  })
  .get('/uso-ia', async (c) => {
    // Cuánto usa la IA cada uno: lo de hoy por tipo (contra su límite), los tokens y el costo estimado de los últimos 30
    // días, y lo que gasta Patty sola (resúmenes, comentarios).
    const db = c.var.db;
    const precios = config.iaPrecios;
    const usuarios = await filas<{ id: number; nombre: string; usuario: string; rol: string; plan: string; limites: Record<string, number> | null }>(
      db,
      sql`SELECT id, nombre, usuario, rol, plan, limites FROM usuarios WHERE activo ORDER BY nombre`,
    );
    const hoy = await filas<{ usuario_id: number; tipo: string; n: number }>(
      db,
      sql`SELECT usuario_id, tipo, count(*)::int AS n FROM uso_ia WHERE fecha = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires' - interval '5 hours')::date AND usuario_id IS NOT NULL GROUP BY usuario_id, tipo`,
    );
    const mes = await filas<{ usuario_id: number | null; entrada: number; salida: number; pedidos: number }>(
      db,
      sql`SELECT usuario_id, sum(entrada)::bigint AS entrada, sum(salida)::bigint AS salida, count(*)::int AS pedidos
          FROM uso_ia WHERE fecha > current_date - 30 AND tipo <> 'voz' GROUP BY usuario_id`,
    );
    const costo = (e: number, s: number) => Math.round(((Number(e) * precios.entrada + Number(s) * precios.salida) / 1e6) * 100) / 100;
    const sola = mes.find((m) => m.usuario_id === null);
    return c.json({
      precios,
      usuarios: usuarios.map((u) => {
        const m = mes.find((x) => x.usuario_id === u.id);
        return {
          ...u,
          efectivos: limitesDe(u.plan, u.limites),
          hoy: Object.fromEntries(hoy.filter((h) => h.usuario_id === u.id).map((h) => [h.tipo, h.n])),
          pedidos_mes: m?.pedidos ?? 0,
          tokens_mes: m ? Number(m.entrada) + Number(m.salida) : 0,
          costo_mes: m ? costo(m.entrada, m.salida) : 0,
        };
      }),
      patty_sola: sola ? { pedidos: sola.pedidos, costo_mes: costo(sola.entrada, sola.salida) } : { pedidos: 0, costo_mes: 0 },
    });
  })
  .put('/usuarios/:id/plan', async (c) => {
    // { plan, limites? }: el plan de uso de la IA de un usuario y, si se quiere, límites propios para algunos usos.
    const id = idParam(c);
    const d = await cuerpo(c);
    const plan = texto(d.plan);
    if (!PLANES[plan]) throw new ErrorApi('Plan inválido.');
    const limites = d.limites && typeof d.limites === 'object'
      ? Object.fromEntries(Object.entries(d.limites as Record<string, unknown>).filter(([k, v]) => (USOS_IA as readonly string[]).includes(k) && Number(v) >= 0).map(([k, v]) => [k, Math.round(Number(v))]))
      : null;
    await c.var.db.execute(sql`UPDATE usuarios SET plan = ${plan}, limites = ${limites && Object.keys(limites).length ? JSON.stringify(limites) : null}::jsonb WHERE id = ${id}`);
    return c.json({ ok: true });
  })
  .get('/respaldo', async (c) => {
    // Un respaldo de toda la base como JSON comprimido (una lista de filas por tabla), para bajarlo y guardarlo aparte.
    const db = c.var.db;
    const tablas = await filas<{ tabla: string }>(db, sql`SELECT table_name AS tabla FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`);
    const datos: Record<string, unknown[]> = {};
    for (const { tabla } of tablas) {
      if (tabla === 'sesiones') continue; // las sesiones no se respaldan (son llaves de entrada)
      datos[tabla] = await filas(db, sql`SELECT * FROM ${sql.identifier(tabla)}`);
    }
    const cuerpoGz = gzipSync(Buffer.from(JSON.stringify({ version: VERSION, fecha: new Date().toISOString(), tablas: datos })));
    return new Response(cuerpoGz, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="patty-respaldo-${new Date().toISOString().slice(0, 10)}.json.gz"`,
      },
    });
  })
  .get('/resumen', async (c) => {
    const db = c.var.db;
    const r = await una<Record<string, number>>(
      db,
      sql`SELECT
            (SELECT count(*) FROM usuarios WHERE activo)::int AS usuarios,
            (SELECT count(*) FROM usuarios WHERE activo AND ultimo_acceso > now() - interval '1 day')::int AS activos_hoy,
            (SELECT count(*) FROM usuarios WHERE activo AND ultimo_acceso > now() - interval '7 days')::int AS activos_semana,
            (SELECT count(*) FROM personas)::int AS personas,
            (SELECT count(*) FROM registros WHERE borrado IS NULL AND creado > now() - interval '1 day')::int AS registros_hoy,
            (SELECT count(*) FROM registros WHERE borrado IS NULL AND creado > now() - interval '7 days')::int AS registros_semana,
            (SELECT count(*) FROM registros WHERE borrado IS NULL)::int AS registros_total,
            (SELECT count(*) FROM mediciones WHERE creado > now() - interval '1 day')::int AS mediciones_hoy,
            (SELECT count(*) FROM dispositivos WHERE plataforma = 'android')::int AS telefonos_android,
            (SELECT count(*) FROM dispositivos WHERE plataforma = 'ios')::int AS telefonos_ios,
            (SELECT count(*) FROM tratamientos WHERE borrado IS NULL AND terminado IS NULL AND (fin IS NULL OR fin > now()))::int AS tratamientos_activos,
            (SELECT count(*) FROM supervisiones WHERE estado = 'aceptada')::int AS supervisiones,
            (SELECT count(*) FROM analisis WHERE creado > now() - interval '7 days')::int AS analisis_semana`,
    );
    const porDia = await filas<{ fecha: string; registros: number; usuarios: number }>(
      db,
      sql`SELECT to_char(d, 'YYYY-MM-DD') AS fecha,
                 (SELECT count(*) FROM registros r WHERE r.borrado IS NULL AND r.creado::date = d)::int AS registros,
                 (SELECT count(DISTINCT r.creado_por) FROM registros r WHERE r.creado::date = d)::int AS usuarios
          FROM generate_series(current_date - ${ULTIMOS_DIAS - 1}::int, current_date, interval '1 day') d ORDER BY d`,
    );
    return c.json({ ...r, por_dia: porDia });
  })
  .get('/usuarios', async (c) => {
    return c.json(
      await filas(
        c.var.db,
        sql`SELECT u.id, u.usuario, u.nombre, u.email, u.foto, u.rol, u.activo, u.creado, u.ultimo_acceso,
                   (SELECT count(*) FROM persona_usuarios pu WHERE pu.usuario_id = u.id AND pu.rol = 'dueno')::int AS personas,
                   (SELECT count(*) FROM registros r WHERE r.creado_por = u.id AND r.borrado IS NULL)::int AS registros,
                   (SELECT count(*) FROM registros r WHERE r.creado_por = u.id AND r.borrado IS NULL AND r.creado > now() - interval '7 days')::int AS registros_semana,
                   (SELECT max(r.creado) FROM registros r WHERE r.creado_por = u.id) AS ultimo_registro,
                   (SELECT string_agg(DISTINCT d.plataforma, ',') FROM dispositivos d WHERE d.usuario_id = u.id) AS telefonos,
                   (SELECT json_build_object('plataforma', i.plataforma, 'estado', i.estado, 'actualizado', i.actualizado)
                      FROM instalaciones i WHERE i.usuario_id = u.id ORDER BY (i.plataforma <> 'web') DESC, i.actualizado DESC LIMIT 1) AS instalacion,
                   (SELECT count(*) FROM supervisiones s WHERE s.supervisor_id = u.id AND s.estado = 'aceptada')::int AS supervisa,
                   (SELECT count(*) FROM supervisiones s WHERE s.supervisado_id = u.id AND s.estado = 'aceptada')::int AS supervisado
            FROM usuarios u ORDER BY u.ultimo_acceso DESC NULLS LAST, u.nombre`,
      ),
    );
  })
  .get('/usuarios/:id', async (c) => {
    const db = c.var.db;
    const id = idParam(c);
    const u = await una(db, sql`SELECT id, usuario, nombre, email, rol, activo, creado, ultimo_acceso FROM usuarios WHERE id = ${id}`);
    if (!u) throw new ErrorApi('No existe.', 404);
    const personas = await filas(
      db,
      sql`SELECT p.id, p.nombre, p.zona_horaria, to_char(p.nacimiento, 'YYYY-MM-DD') AS nacimiento, p.sexo, p.altura_cm, p.peso_kg, p.condiciones, pu.rol,
                 (SELECT count(*) FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL)::int AS registros,
                 (SELECT count(DISTINCT r.fecha) FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL)::int AS dias,
                 (SELECT count(*) FROM mediciones m WHERE m.persona_id = p.id)::int AS mediciones,
                 (SELECT string_agg(DISTINCT f.tipo, ', ') FROM fuentes f WHERE f.persona_id = p.id AND f.ultimo_uso IS NOT NULL) AS fuentes,
                 (SELECT json_agg(x ORDER BY x.fecha) FROM (
                    SELECT to_char(d, 'YYYY-MM-DD') AS fecha, (SELECT count(*) FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL AND r.fecha = d::date)::int AS n
                    FROM generate_series(current_date - ${ULTIMOS_DIAS - 1}::int, current_date, interval '1 day') d) x) AS por_dia
          FROM persona_usuarios pu JOIN personas p ON p.id = pu.persona_id WHERE pu.usuario_id = ${id} ORDER BY pu.rol, p.nombre`,
    );
    const ultimos = await filas(
      db,
      sql`SELECT r.id, r.inicio, r.creado, r.origen, r.valor, r.unidad, r.intensidad, r.nota, c.nombre AS concepto, k.icono, p.nombre AS persona
          FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id JOIN personas p ON p.id = r.persona_id
          WHERE r.creado_por = ${id} AND r.borrado IS NULL ORDER BY r.creado DESC LIMIT 40`,
    );
    const telefonos = await filas(db, sql`SELECT plataforma, avisos_hasta, creado, actualizado FROM dispositivos WHERE usuario_id = ${id} ORDER BY actualizado DESC`);
    const instalaciones = await filas(db, sql`SELECT plataforma, estado, creado, actualizado FROM instalaciones WHERE usuario_id = ${id} ORDER BY actualizado DESC`);
    const tratamientos = await filas(
      db,
      sql`SELECT t.id, c.nombre AS remedio, t.dosis, t.unidad, t.cada_horas, t.horarios, t.inicio, t.fin, t.terminado, p.nombre AS persona
          FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id JOIN personas p ON p.id = t.persona_id
          JOIN persona_usuarios pu ON pu.persona_id = t.persona_id AND pu.usuario_id = ${id}
          WHERE t.borrado IS NULL ORDER BY t.inicio DESC LIMIT 20`,
    );
    const supervisiones = await filas(
      db,
      sql`SELECT s.estado, CASE WHEN s.supervisor_id = ${id} THEN 'supervisa' ELSE 'lo supervisa' END AS relacion, o.nombre AS otro, s.creado
          FROM supervisiones s JOIN usuarios o ON o.id = CASE WHEN s.supervisor_id = ${id} THEN s.supervisado_id ELSE s.supervisor_id END
          WHERE s.supervisor_id = ${id} OR s.supervisado_id = ${id}`,
    );
    // Lo que Patty le dice: los análisis de patrones de sus personas (con resumen y sugerencias), lo que encontró y los
    // avisos que le llegaron.
    const ids = personas.map((p) => (p as { id: number }).id);
    const analisisDe = ids.length
      ? await filas(
          db,
          sql`SELECT a.id, a.persona_id, a.origen, a.creado, a.desde, a.hasta, a.dias, a.resumen, a.sugerencias, jsonb_array_length(a.nuevos)::int AS nuevos,
                     (SELECT count(*) FROM hallazgos h WHERE h.analisis_id = a.id)::int AS hallazgos
              FROM analisis a WHERE a.persona_id IN ${ids} ORDER BY a.creado DESC LIMIT 15`,
        )
      : [];
    const hallazgosDe = ids.length
      ? await filas(
          db,
          sql`SELECT h.id, h.persona_id, h.explicacion, h.estado, h.puntaje, h.detectado, ca.nombre AS causa, ef.nombre AS efecto
              FROM hallazgos h JOIN conceptos ca ON ca.id = h.causa_id JOIN conceptos ef ON ef.id = h.efecto_id
              WHERE h.persona_id IN ${ids} ORDER BY (h.estado = 'descartado'), h.puntaje DESC LIMIT 20`,
        )
      : [];
    const avisos = await filas(
      db,
      sql`SELECT id, persona_id, tipo, titulo, cuerpo, resultado, creado FROM avisos_historial WHERE usuario_id = ${id} ORDER BY creado DESC LIMIT 60`,
    );
    const uso = await filas(
      db,
      sql`SELECT to_char(d, 'YYYY-MM-DD') AS fecha, coalesce(x.segundos, 0)::int AS segundos, coalesce(x.aperturas, 0)::int AS aperturas
          FROM generate_series(current_date - ${ULTIMOS_DIAS - 1}::int, current_date, interval '1 day') d
          LEFT JOIN uso_diario x ON x.usuario_id = ${id} AND x.fecha = d::date ORDER BY d`,
    );
    const preguntasDe = await filas(
      db,
      sql`SELECT id, pregunta, respuesta, creado FROM preguntas WHERE usuario_id = ${id} ORDER BY creado DESC LIMIT 30`,
    );
    const comentariosDe = ids.length
      ? await filas(
          db,
          sql`SELECT id, persona_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, emoji, texto, estado, to_char(creado AT TIME ZONE (SELECT p.zona_horaria FROM personas p WHERE p.id = comentarios.persona_id), 'HH24:MI') AS hora FROM comentarios
              WHERE persona_id IN ${ids} ORDER BY fecha DESC, id LIMIT 40`,
        )
      : [];
    const fueraDe = ids.length
      ? await filas(
          db,
          sql`SELECT id, persona_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, emoji, texto, estado FROM fuera_de_lo_normal
              WHERE persona_id IN ${ids} ORDER BY fecha DESC, id LIMIT 30`,
        )
      : [];
    return c.json({ usuario: u, personas, ultimos, telefonos, instalaciones, tratamientos, supervisiones, analisis: analisisDe, hallazgos: hallazgosDe, avisos, uso, preguntas: preguntasDe, comentarios: comentariosDe, fuera: fueraDe });
  })
  .get('/uso', async (c) => {
    // La actividad general de los últimos `dias` días: cuánto se usa la app, cuánto se anota y qué hace Patty.
    const db = c.var.db;
    const dias = Math.min(90, Math.max(7, Number(c.req.query('dias')) || 30));
    const zona = 'America/Argentina/Buenos_Aires';
    const por_dia = await filas(
      db,
      sql`WITH d AS (SELECT (current_date - g)::date AS fecha FROM generate_series(0, ${dias - 1}::int) g)
          SELECT to_char(d.fecha, 'YYYY-MM-DD') AS fecha,
                 (SELECT count(*) FROM uso_diario u WHERE u.fecha = d.fecha AND u.segundos > 0)::int AS usuarios,
                 (SELECT coalesce(sum(u.segundos), 0) FROM uso_diario u WHERE u.fecha = d.fecha)::int AS segundos,
                 (SELECT coalesce(sum(u.aperturas), 0) FROM uso_diario u WHERE u.fecha = d.fecha)::int AS aperturas,
                 (SELECT count(*) FROM registros r WHERE r.borrado IS NULL AND (r.creado AT TIME ZONE ${zona})::date = d.fecha)::int AS registros,
                 (SELECT count(DISTINCT r.creado_por) FROM registros r WHERE r.borrado IS NULL AND (r.creado AT TIME ZONE ${zona})::date = d.fecha)::int AS anotaron,
                 (SELECT count(*) FROM avisos_historial h WHERE (h.creado AT TIME ZONE ${zona})::date = d.fecha)::int AS avisos,
                 (SELECT count(*) FROM preguntas q WHERE (q.creado AT TIME ZONE ${zona})::date = d.fecha)::int AS preguntas,
                 (SELECT count(*) FROM analisis a WHERE (a.creado AT TIME ZONE ${zona})::date = d.fecha)::int AS analisis
          FROM d ORDER BY d.fecha`,
    );
    const desde = sql`current_date - ${dias - 1}::int`;
    const pantallas = await filas(
      db,
      sql`SELECT k AS pantalla, sum(v::int)::int AS segundos FROM uso_diario, jsonb_each_text(pantallas) AS x(k, v)
          WHERE fecha >= ${desde} GROUP BY k ORDER BY segundos DESC`,
    );
    const origenes = await filas(
      db,
      sql`SELECT r.origen, count(*)::int AS n FROM registros r WHERE r.borrado IS NULL AND r.creado >= ${desde} GROUP BY r.origen ORDER BY n DESC`,
    );
    const categorias = await filas(
      db,
      sql`SELECT k.icono, k.nombre, count(*)::int AS n FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE r.borrado IS NULL AND r.creado >= ${desde} GROUP BY k.icono, k.nombre ORDER BY n DESC`,
    );
    const avisos = await filas(
      db,
      sql`SELECT coalesce(tipo, 'otro') AS tipo, count(*)::int AS n, count(*) FILTER (WHERE resultado <> 'ok')::int AS fallidos
          FROM avisos_historial WHERE creado >= ${desde} GROUP BY 1 ORDER BY n DESC`,
    );
    const usuarios = await filas(
      db,
      sql`SELECT u.id, u.nombre,
                 coalesce((SELECT sum(x.segundos) FROM uso_diario x WHERE x.usuario_id = u.id AND x.fecha >= ${desde}), 0)::int AS segundos,
                 (SELECT count(*) FROM uso_diario x WHERE x.usuario_id = u.id AND x.fecha >= ${desde} AND x.segundos > 0)::int AS dias,
                 (SELECT count(*) FROM registros r WHERE r.creado_por = u.id AND r.borrado IS NULL AND r.creado >= ${desde})::int AS registros,
                 (SELECT count(*) FROM preguntas q WHERE q.usuario_id = u.id AND q.creado >= ${desde})::int AS preguntas
          FROM usuarios u WHERE u.activo ORDER BY segundos DESC, registros DESC`,
    );
    const ultimasPreguntas = await filas(
      db,
      sql`SELECT q.id, q.pregunta, q.respuesta, q.creado, u.nombre AS usuario FROM preguntas q JOIN usuarios u ON u.id = q.usuario_id
          ORDER BY q.creado DESC LIMIT 20`,
    );
    return c.json({ dias, por_dia, pantallas, origenes, categorias, avisos, usuarios, preguntas: ultimasPreguntas });
  })
  .get('/actividad', async (c) => {
    // Lo último que se anotó en toda la app (de todos), para ver en vivo cómo se usa.
    return c.json(
      await filas(
        c.var.db,
        sql`SELECT r.id, r.inicio, r.creado, r.origen, r.valor, r.unidad, r.intensidad, c.nombre AS concepto, k.icono, p.nombre AS persona, u.nombre AS usuario
            FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id JOIN personas p ON p.id = r.persona_id
            LEFT JOIN usuarios u ON u.id = r.creado_por
            WHERE r.borrado IS NULL ORDER BY r.creado DESC LIMIT 80`,
      ),
    );
  })
  .post('/avisos', async (c) => {
    // {titulo, cuerpo, usuario_id?}: un aviso a un usuario o, sin usuario, a todos.
    const d = await cuerpo(c);
    const titulo = texto(d.titulo).slice(0, 80) || 'Patty';
    const mensaje = texto(d.cuerpo).slice(0, 400);
    if (!mensaje) throw new ErrorApi('Escribí el mensaje.');
    const usuario = d.usuario_id ? Number(d.usuario_id) : null;
    return c.json(await avisarA(c.var.db, usuario ? [usuario] : null, { titulo, cuerpo: mensaje, datos: { tipo: 'anuncio', cara: 'feliz' } }));
  })
  .get('/version-app', async (c) => {
    const v = (await una<{ valor: VersionApp }>(c.var.db, sql`SELECT valor FROM ajustes WHERE clave = 'version_app'`))?.valor ?? null;
    return c.json({ actual: v, desactualizados: v ? (await desactualizados(c.var.db, v.version)).length : null });
  })
  .put('/version-app', async (c) => {
    // {version, url, avisar}: la última versión de la app de Android y de dónde bajarla; con `avisar`, un aviso a
    // quienes tienen una más vieja (al tocarlo se abre el link).
    const d = await cuerpo(c);
    const version = texto(d.version);
    const url = texto(d.url);
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new ErrorApi('La versión tiene que ser como 1.4.0.');
    if (!/^https:\/\//.test(url)) throw new ErrorApi('El link tiene que empezar con https://');
    await guardarVersionApp(c.var.db, { version, url });
    const viejos = await desactualizados(c.var.db, version);
    const r = d.avisar && viejos.length
      ? await avisarA(c.var.db, viejos, avisoVersion(version, url))
      : { enviados: 0, telefonos: 0 };
    return c.json({ desactualizados: viejos.length, ...r });
  });
