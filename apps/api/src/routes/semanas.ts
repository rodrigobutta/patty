// Los resúmenes de cada semana (ver ia/resumirSemana.ts): se arman el domingo a la noche; acá se leen.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { filas } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { type Env } from '../lib/http.js';

export const rutasSemanas = new Hono<Env>().get('/', async (c) => {
  // ?persona=1: los últimos (el más nuevo primero).
  const p = await persona(c.var.db, c.var.usuario, Number(c.req.query('persona')), false);
  return c.json(
    await filas(
      c.var.db,
      sql`SELECT to_char(semana, 'YYYY-MM-DD') AS semana, titulo, texto, destacados, sugerencias, numeros, creado
          FROM resumen_semana WHERE persona_id = ${p.id} ORDER BY semana DESC LIMIT 12`,
    ),
  );
});
