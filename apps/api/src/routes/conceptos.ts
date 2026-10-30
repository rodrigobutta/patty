// El catálogo de cosas que se pueden anotar. Al escribir se sugieren las que ya existen (por nombre, por alias o
// parecidas: "tomat", "tomates" y "tomáte" encuentran "Tomate"); si no está, se crea ahí mismo.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { nombreLindo, normalizar, TIPOS_VALOR, type Categoria, type Concepto, type Sugerencia, type TipoValor } from 'shared';
import { exigirRol } from '../auth/sesion.js';
import { CONCEPTOS_COMPONENTES_NORM } from '../componentes/lista.js';
import { filas, una, type Tx } from '../db/client.js';
import { categorias, conceptoAlias, conceptos } from '../db/schema.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, idParam, texto, type Env } from '../lib/http.js';

const COLUMNAS = sql`c.id, c.categoria_id, c.nombre, c.tipo_valor, c.unidad, c.cantidad_decidida, c.usos`;
/** Lo que entra solo a los patrones y no se anota nunca ("Días con mucha sal"): no se sugiere. */
const SIN_COMPONENTES = sql`AND c.nombre_norm NOT IN ${CONCEPTOS_COMPONENTES_NORM}`;
const escaparLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

export async function buscarConceptos(
  tx: Tx,
  q: string,
  opciones: { categoriaId?: number | null; limite?: number } = {},
): Promise<Sugerencia[]> {
  const t = normalizar(q);
  const limite = Math.min(Math.max(opciones.limite ?? 8, 1), 30);
  const cat = opciones.categoriaId ? sql`AND c.categoria_id = ${opciones.categoriaId}` : sql``;
  if (!t) {
    // Sin texto: los más usados (y los usados hace poco primero, a igual uso).
    return filas<Sugerencia>(
      tx,
      sql`SELECT ${COLUMNAS}, 'empieza' AS coincide FROM conceptos c WHERE c.unido_a IS NULL ${cat} ${SIN_COMPONENTES}
          ORDER BY c.usos DESC, c.ultimo_uso DESC NULLS LAST, c.nombre LIMIT ${limite}`,
    );
  }
  const prefijo = escaparLike(t) + '%';
  const palabra = '% ' + escaparLike(t) + '%';
  return filas<Sugerencia>(
    tx,
    sql`SELECT ${COLUMNAS},
          CASE WHEN c.nombre_norm = ${t} THEN 'exacto'
               WHEN c.nombre_norm LIKE ${prefijo} OR c.nombre_norm LIKE ${palabra} THEN 'empieza'
               WHEN a.alias_norm IS NOT NULL THEN 'alias'
               ELSE 'parecido' END AS coincide
        FROM conceptos c
        LEFT JOIN LATERAL (
          SELECT ca.alias_norm FROM concepto_alias ca
          WHERE ca.concepto_id = c.id AND (ca.alias_norm LIKE ${prefijo} OR ${t} <% ca.alias_norm)
          LIMIT 1
        ) a ON true
        WHERE c.unido_a IS NULL ${cat} ${SIN_COMPONENTES}
          AND (c.nombre_norm LIKE ${prefijo} OR c.nombre_norm LIKE ${palabra} OR ${t} <% c.nombre_norm OR ${t} % c.nombre_norm OR a.alias_norm IS NOT NULL)
        ORDER BY (c.nombre_norm = ${t}) DESC,
                 (c.nombre_norm LIKE ${prefijo}) DESC,
                 greatest(word_similarity(${t}, c.nombre_norm), similarity(${t}, c.nombre_norm)) DESC,
                 c.usos DESC,
                 c.nombre
        LIMIT ${limite}`,
  );
}

async function categoria(tx: Tx, id: unknown): Promise<Categoria> {
  const c = await una<Categoria>(tx, sql`SELECT * FROM categorias WHERE id = ${Number(id) || 0}`);
  if (!c) throw new ErrorApi('Elegí una categoría.');
  return c;
}

/**
 * El concepto con ese nombre en esa categoría (o uno de sus alias); si no existe, lo crea con el tipo de valor y la
 * unidad de la categoría. Es lo que hace el formulario cuando se escribe algo que no estaba.
 */
export async function obtenerOCrearConcepto(
  tx: Tx,
  datos: { nombre: string; categoriaId: unknown; tipoValor?: unknown; unidad?: unknown; usuarioId?: number },
): Promise<{ concepto: Concepto; nuevo: boolean }> {
  const nombre = nombreLindo(datos.nombre);
  const norm = normalizar(nombre);
  if (!norm) throw new ErrorApi('Escribí qué fue.');
  if (nombre.length > 80) throw new ErrorApi('El nombre es muy largo (máximo 80 letras).');
  const cat = await categoria(tx, datos.categoriaId);
  const existente = () =>
    una<Concepto>(
      tx,
      sql`SELECT ${COLUMNAS} FROM conceptos c
          WHERE c.categoria_id = ${cat.id} AND c.unido_a IS NULL
            AND (c.nombre_norm = ${norm} OR EXISTS (SELECT 1 FROM concepto_alias a WHERE a.concepto_id = c.id AND a.alias_norm = ${norm}))
          ORDER BY (c.nombre_norm = ${norm}) DESC LIMIT 1`,
    );
  const ya = await existente();
  if (ya) return { concepto: ya, nuevo: false };
  const tipo = datos.tipoValor === undefined || datos.tipoValor === null ? cat.tipo_valor : (datos.tipoValor as TipoValor);
  if (!TIPOS_VALOR.includes(tipo)) throw new ErrorApi('Tipo de valor inválido.');
  const unidad = datos.unidad === undefined ? cat.unidad : texto(datos.unidad) || null;
  const [n] = await tx
    .insert(conceptos)
    .values({ categoria_id: cat.id, nombre, nombre_norm: norm, tipo_valor: tipo, unidad, creado_por: datos.usuarioId })
    .onConflictDoNothing({ target: [conceptos.categoria_id, conceptos.nombre_norm], where: sql`unido_a IS NULL` })
    .returning({ id: conceptos.id });
  if (!n) return { concepto: (await existente())!, nuevo: false }; // lo creó otro pedido al mismo tiempo
  return { concepto: (await una<Concepto>(tx, sql`SELECT ${COLUMNAS} FROM conceptos c WHERE c.id = ${n.id}`))!, nuevo: true };
}

export async function agregarAlias(tx: Tx, conceptoId: number, alias: string): Promise<void> {
  const norm = normalizar(alias);
  if (!norm) return;
  await tx.insert(conceptoAlias).values({ concepto_id: conceptoId, alias: alias.trim(), alias_norm: norm }).onConflictDoNothing();
}

export const rutasConceptos = new Hono<Env>()
  .get('/categorias', async (c) => c.json(await c.var.db.select().from(categorias).orderBy(categorias.orden, categorias.id)))
  .get('/buscar', async (c) => {
    const categoriaId = Number(c.req.query('categoria')) || null;
    return c.json(await buscarConceptos(c.var.db, c.req.query('q') ?? '', { categoriaId, limite: Number(c.req.query('limite')) || 8 }));
  })
  .post('/', async (c) => {
    exigirRol(c.var.usuario, 'editor');
    const d = await cuerpo(c);
    const r = await obtenerOCrearConcepto(c.var.db, {
      nombre: texto(d.nombre),
      categoriaId: d.categoria_id,
      tipoValor: d.tipo_valor,
      unidad: d.unidad,
      usuarioId: c.var.usuario.id,
    });
    return c.json(r, r.nuevo ? 201 : 200);
  })
  .put('/:id', async (c) => {
    // Cambiar el nombre deja el anterior como alias: lo que se escriba con el nombre viejo sigue encontrándolo.
    exigirRol(c.var.usuario, 'editor');
    const id = idParam(c);
    const d = await cuerpo(c);
    await c.var.db.transaction(async (tx) => {
      const antes = await una<{ nombre: string; categoria_id: number }>(tx, sql`SELECT nombre, categoria_id FROM conceptos WHERE id = ${id} AND unido_a IS NULL`);
      if (!antes) throw new ErrorApi('No existe.', 404);
      const cambios: Partial<typeof conceptos.$inferInsert> = {};
      if (texto(d.nombre)) {
        cambios.nombre = nombreLindo(texto(d.nombre));
        cambios.nombre_norm = normalizar(cambios.nombre);
        // Si ahora es otra cosa, es otra comida para la tabla compartida.
        if (cambios.nombre_norm !== normalizar(antes.nombre)) cambios.alimento_id = null;
      }
      if ('unidad' in d) cambios.unidad = texto(d.unidad) || null;
      if ('padre_id' in d) cambios.padre_id = Number(d.padre_id) || null;
      if (d.categoria_id !== undefined) cambios.categoria_id = (await categoria(tx, d.categoria_id)).id;
      if (d.tipo_valor !== undefined) {
        if (!TIPOS_VALOR.includes(d.tipo_valor as TipoValor)) throw new ErrorApi('Tipo de valor inválido.');
        cambios.tipo_valor = d.tipo_valor as TipoValor;
      }
      // Elegir si lleva cantidad (o decir que no) cierra la pregunta para siempre.
      if (d.tipo_valor !== undefined || d.cantidad_decidida === true) cambios.cantidad_decidida = true;
      await tx.update(conceptos).set(cambios).where(sql`id = ${id}`);
      if (cambios.nombre_norm && cambios.nombre_norm !== normalizar(antes.nombre)) await agregarAlias(tx, id, antes.nombre);
    });
    return c.json(await una(c.var.db, sql`SELECT ${COLUMNAS} FROM conceptos c WHERE c.id = ${id}`));
  })
  .post('/:id/alias', async (c) => {
    exigirRol(c.var.usuario, 'editor');
    await agregarAlias(c.var.db, idParam(c), texto((await cuerpo(c)).alias));
    return c.json({ ok: true });
  })
  .post('/:id/unir', async (c) => {
    // Dos nombres para lo mismo ("Tomate" y "Tomates"): todo lo del primero pasa al segundo, y el nombre queda de alias.
    exigirRol(c.var.usuario, 'editor');
    const id = idParam(c);
    const en = Number((await cuerpo(c)).en);
    if (!en || en === id) throw new ErrorApi('Elegí con qué concepto unirlo.');
    await c.var.db.transaction(async (tx) => {
      const [a, b] = await Promise.all([
        una<{ nombre: string; usos: number }>(tx, sql`SELECT nombre, usos FROM conceptos WHERE id = ${id} AND unido_a IS NULL`),
        una(tx, sql`SELECT 1 AS x FROM conceptos WHERE id = ${en} AND unido_a IS NULL`),
      ]);
      if (!a || !b) throw new ErrorApi('No existe.', 404);
      await tx.execute(sql`UPDATE registros SET concepto_id = ${en} WHERE concepto_id = ${id}`);
      await tx.execute(sql`UPDATE tratamientos SET concepto_id = ${en} WHERE concepto_id = ${id}`);
      await tx.execute(sql`UPDATE mediciones m SET concepto_id = ${en} WHERE concepto_id = ${id}
                           AND NOT EXISTS (SELECT 1 FROM mediciones o WHERE o.persona_id = m.persona_id AND o.concepto_id = ${en}
                                           AND o.inicio = m.inicio AND o.fuente_id = m.fuente_id)`);
      await tx.execute(sql`DELETE FROM mediciones WHERE concepto_id = ${id}`);
      // Los hallazgos se recalculan en el próximo análisis.
      await tx.execute(sql`DELETE FROM hallazgos WHERE causa_id = ${id} OR efecto_id = ${id}`);
      await tx.execute(sql`UPDATE concepto_alias SET concepto_id = ${en} WHERE concepto_id = ${id}
                           AND alias_norm NOT IN (SELECT alias_norm FROM concepto_alias WHERE concepto_id = ${en})`);
      await tx.execute(sql`UPDATE conceptos SET unido_a = ${en} WHERE id = ${id}`);
      await tx.execute(sql`UPDATE conceptos SET usos = usos + ${a.usos} WHERE id = ${en}`);
      await agregarAlias(tx, en, a.nombre);
    });
    return c.json({ ok: true });
  });
