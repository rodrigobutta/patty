// Al arrancar: las categorías y conceptos básicos que falten (nunca pisa lo que ya hay).
import { sql } from 'drizzle-orm';
import { CATEGORIAS_INICIALES, CONCEPTOS_INICIALES, normalizar } from 'shared';
import type { Db } from './db/client.js';
import { categorias, conceptos } from './db/schema.js';

export async function inicializar(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(categorias).values(CATEGORIAS_INICIALES).onConflictDoNothing({ target: categorias.clave });
    const ids = new Map((await tx.select({ id: categorias.id, clave: categorias.clave }).from(categorias)).map((c) => [c.clave, c.id]));
    for (const c of CONCEPTOS_INICIALES) {
      await tx
        .insert(conceptos)
        .values({ categoria_id: ids.get(c.categoria)!, nombre: c.nombre, nombre_norm: normalizar(c.nombre), tipo_valor: c.tipo_valor, unidad: c.unidad })
        .onConflictDoNothing({ target: [conceptos.categoria_id, conceptos.nombre_norm], where: sql`unido_a IS NULL` });
    }
  });
}
