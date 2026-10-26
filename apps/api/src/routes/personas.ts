// Las personas de las que se anota el día, y sus fuentes de datos automáticos (reloj, teléfono, clima).
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Persona } from 'shared';
import { exigirRol } from '../auth/sesion.js';
import { filas } from '../db/client.js';
import { fuentes, personas, personaUsuarios } from '../db/schema.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { esFecha, zonaValida, zonaCanonica } from '../lib/fechas.js';
import { cuerpo, idParam, numeroONulo, texto, type Env } from '../lib/http.js';

function datosPersona(d: Record<string, unknown>, nueva: boolean) {
  const v: Partial<typeof personas.$inferInsert> = {};
  if (nueva || 'nombre' in d) {
    v.nombre = texto(d.nombre);
    if (!v.nombre) throw new ErrorApi('Poné el nombre de la persona.');
  }
  if ('zona_horaria' in d) {
    v.zona_horaria = zonaCanonica(texto(d.zona_horaria));
    if (!zonaValida(v.zona_horaria)) throw new ErrorApi('Zona horaria inválida.');
  }
  if ('nacimiento' in d) {
    v.nacimiento = texto(d.nacimiento) || null;
    if (v.nacimiento && !esFecha(v.nacimiento)) throw new ErrorApi('Fecha de nacimiento inválida.');
  }
  if ('notas' in d) v.notas = texto(d.notas) || null;
  if ('sexo' in d) {
    const sexo = texto(d.sexo) || null;
    if (sexo && !['femenino', 'masculino', 'otro'].includes(sexo)) throw new ErrorApi('Sexo inválido.');
    v.sexo = sexo as typeof v.sexo;
  }
  if ('altura_cm' in d) {
    const a = numeroONulo(d.altura_cm, 'altura');
    if (a !== null && (a < 40 || a > 250)) throw new ErrorApi('La altura va en centímetros (por ejemplo, 165).');
    v.altura_cm = a === null ? null : Math.round(a);
  }
  if ('peso_kg' in d) {
    const p = numeroONulo(d.peso_kg, 'peso');
    if (p !== null && (p < 2 || p > 400)) throw new ErrorApi('El peso va en kilos (por ejemplo, 70).');
    v.peso_kg = p;
  }
  if ('condiciones' in d) {
    const lista = Array.isArray(d.condiciones) ? d.condiciones.map((x) => texto(x)).filter(Boolean) : [];
    if (lista.length > 30 || lista.some((x) => x.length > 80)) throw new ErrorApi('Demasiadas condiciones o muy largas.');
    v.condiciones = [...new Set(lista)];
  }
  return v;
}

export const rutasPersonas = new Hono<Env>()
  .get('/', async (c) => {
    const u = c.var.usuario;
    return c.json(
      await filas<Persona>(
        c.var.db,
        sql`SELECT p.id, p.nombre, p.zona_horaria, to_char(p.nacimiento, 'YYYY-MM-DD') AS nacimiento, p.sexo, p.altura_cm, p.peso_kg, p.condiciones, p.notas,
              EXISTS (SELECT 1 FROM persona_usuarios d WHERE d.persona_id = p.id AND d.usuario_id = ${u.id} AND d.rol = 'dueno') AS propia,
              EXISTS (SELECT 1 FROM accesos a WHERE a.persona_id = p.id AND a.usuario_id = ${u.id} AND a.por_supervision) AS supervisada
            FROM personas p
            -- Solo las propias, las compartidas y las que supervisa: ser administrador no muestra los datos de los demás.
            WHERE EXISTS (SELECT 1 FROM accesos pu WHERE pu.persona_id = p.id AND pu.usuario_id = ${u.id})
            ORDER BY p.nombre`,
      ),
    );
  })
  .post('/', async (c) => {
    exigirRol(c.var.usuario, 'editor');
    const v = datosPersona(await cuerpo(c), true) as typeof personas.$inferInsert;
    const p = await c.var.db.transaction(async (tx) => {
      const [p] = await tx.insert(personas).values({ ...v, creado_por: c.var.usuario.id }).returning();
      await tx.insert(personaUsuarios).values({ persona_id: p.id, usuario_id: c.var.usuario.id, rol: 'dueno' });
      return p;
    });
    return c.json(p, 201);
  })
  .put('/:id', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, idParam(c), true);
    const [r] = await c.var.db.update(personas).set(datosPersona(await cuerpo(c), false)).where(sql`id = ${p.id}`).returning();
    return c.json(r);
  })
  .get('/:id/fuentes', async (c) => {
    const p = await persona(c.var.db, c.var.usuario, idParam(c), false);
    return c.json(await filas(c.var.db, sql`SELECT id, tipo, nombre, activo, ultimo_uso, creado FROM fuentes WHERE persona_id = ${p.id} ORDER BY id`));
  })
  .post('/:id/fuentes', async (c) => {
    // El token se muestra una sola vez: es lo que configura el reloj o el atajo del teléfono para mandar datos.
    const p = await persona(c.var.db, c.var.usuario, idParam(c), true);
    const d = await cuerpo(c);
    const tipo = texto(d.tipo) as (typeof fuentes.$inferInsert)['tipo'];
    if (!['reloj', 'telefono', 'clima', 'otro'].includes(tipo)) throw new ErrorApi('Tipo de fuente inválido.');
    const token = 'patty_' + randomBytes(24).toString('base64url');
    const [f] = await c.var.db
      .insert(fuentes)
      .values({ persona_id: p.id, tipo, nombre: texto(d.nombre) || tipo, token_hash: createHash('sha256').update(token).digest('hex') })
      .returning({ id: fuentes.id, tipo: fuentes.tipo, nombre: fuentes.nombre });
    return c.json({ ...f, token }, 201);
  });
