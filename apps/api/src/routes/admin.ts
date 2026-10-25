// Administración (solo administradores): cómo viene el uso de Patty mientras se prueba. Un resumen general, los
// usuarios con su actividad, el detalle de cada uno y lo último que se anotó en toda la app.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { exigirRol } from '../auth/sesion.js';
import { filas, una } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { idParam, type Env } from '../lib/http.js';

/** Los registros de los últimos 14 días, por día, para la rayita de actividad. */
const ULTIMOS_DIAS = 14;

export const rutasAdmin = new Hono<Env>()
  .use('*', async (c, next) => {
    exigirRol(c.var.usuario, 'admin');
    await next();
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
    return c.json({ usuario: u, personas, ultimos, telefonos, instalaciones, tratamientos, supervisiones });
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
  });
