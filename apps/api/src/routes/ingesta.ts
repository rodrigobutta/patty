// Datos automáticos: un reloj, un atajo del teléfono o un servicio de clima mandan mediciones con el token de su fuente.
//   POST /api/ingesta   Authorization: Bearer patty_...
//   { "mediciones": [ { "concepto": "Pasos", "inicio": "2026-10-24T00:00:00-03:00", "fin": "...", "valor": 8123 } ] }
// Mandar lo mismo dos veces no duplica: se actualiza el valor (misma fuente, concepto e inicio).
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { normalizar } from 'shared';
import { una, type Tx } from '../db/client.js';
import { mediciones } from '../db/schema.js';
import { ErrorApi } from '../lib/errores.js';
import { fechaLocal, leerInstante } from '../lib/fechas.js';
import { cuerpo, numeroONulo, texto, type C, type Env } from '../lib/http.js';
import { obtenerOCrearConcepto } from './conceptos.js';
import { guardarPuntos } from './ubicacion.js';
import { guardarEscuchas } from '../medios/escuchas.js';
import { guardarAvisos, guardarLlamadasPorHora } from '../avisos/telefono.js';
import { buenDiaDespues, traeSueno } from '../push/buenDia.js';

const CATEGORIA_POR_FUENTE: Record<string, string> = { reloj: 'actividad', telefono: 'pantalla', clima: 'clima', ubicacion: 'lugar', otro: 'otro' };

export interface Fuente {
  id: number;
  persona_id: number;
  tipo: string;
  zona_horaria: string;
}

export async function conceptoMedido(tx: Tx, f: Fuente, nombre: string, categoria: string, unidad: string | null, cache: Map<string, number>) {
  const clave = `${normalizar(nombre)}|${categoria}`;
  const ya = cache.get(clave);
  if (ya) return ya;
  // Primero, uno que ya exista con ese nombre en cualquier categoría (Pasos, Temperatura...).
  let id = (
    await una<{ id: number }>(
      tx,
      sql`SELECT id FROM conceptos WHERE nombre_norm = ${normalizar(nombre)} AND unido_a IS NULL ORDER BY usos DESC, id LIMIT 1`,
    )
  )?.id;
  if (!id) {
    const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = ${categoria || CATEGORIA_POR_FUENTE[f.tipo]}`);
    if (!cat) throw new ErrorApi('Categoría desconocida: {categoria}', 400, { categoria });
    id = (await obtenerOCrearConcepto(tx, { nombre, categoriaId: cat.id, tipoValor: 'medida', unidad })).concepto.id;
  }
  cache.set(clave, id);
  return id;
}

async function fuenteDelPedido(c: C): Promise<Fuente> {
  const token = /^Bearer\s+(patty_\S+)$/i.exec(c.req.header('Authorization') ?? '')?.[1];
  if (!token) throw new ErrorApi('Falta el token de la fuente.', 401);
  const hash = createHash('sha256').update(token).digest('hex');
  const f = await una<Fuente>(
    c.var.db,
    sql`SELECT f.id, f.persona_id, f.tipo, p.zona_horaria FROM fuentes f JOIN personas p ON p.id = f.persona_id
        WHERE f.token_hash = ${hash} AND f.activo`,
  );
  if (!f) throw new ErrorApi('Token de fuente inválido.', 401);
  return f;
}

/** El formato del plugin de ubicación de la app nativa, llevado al de Patty (los demás pasan como vienen). */
export function puntoDeLaApp(x: unknown): unknown {
  const p = x as Record<string, unknown> | null;
  if (!p || p.lat !== undefined || p.latitude === undefined) return x;
  return {
    lat: p.latitude,
    lon: p.longitude,
    precision: p.accuracy ?? undefined,
    instante: typeof p.time === 'number' ? new Date(p.time).toISOString() : undefined,
  };
}

export const rutasIngesta = new Hono<Env>()
  // Un atajo del teléfono ("al salir de casa", "al llegar al trabajo") manda dónde está: { "lat": -34.6, "lon": -58.4 }.
  // También acepta { "puntos": [...] } como la web, y lo que manda sola la app nativa en segundo plano
  // ({ latitude, longitude, accuracy, time }). Corre aunque Patty esté cerrada.
  .post('/ubicacion', async (c) => {
    const f = await fuenteDelPedido(c);
    const d = await cuerpo(c);
    const lista = (Array.isArray(d.puntos) ? d.puntos : [d]).map(puntoDeLaApp);
    const r = await c.var.db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${f.id}`);
      return guardarPuntos(tx, { id: f.persona_id, zona_horaria: f.zona_horaria }, lista);
    });
    return c.json({ ok: true, ...r });
  })
  // Lo que sonó o se miró en el teléfono (la app de Android, con el acceso a las notificaciones): un tramo por tema o
  // capítulo, { "escuchas": [{ paquete, app, titulo, artista, album, inicio, fin }] }. Ver medios/escuchas.ts.
  .post('/escuchas', async (c) => {
    const f = await fuenteDelPedido(c);
    const lista = (await cuerpo(c)).escuchas;
    if (!Array.isArray(lista)) throw new ErrorApi('Mandá una lista "escuchas" (hasta 3000 por vez).');
    const r = await c.var.db.transaction((tx) => guardarEscuchas(tx, f, lista));
    return c.json({ ok: true, ...r });
  })
  // Lo que avisan las apps del teléfono (la app de Android, con el acceso a las notificaciones): cuántos avisos por
  // hora y app, y lo que se entendió de los avisos de pedidos, viajes y ejercicio. Nunca el texto. Ver avisos/telefono.ts.
  //   { "conteos": [{ paquete, app, hora, n, sonoras, apagada, mensajes }], "eventos": [{ tipo, app, evento, instante, deporte?, km?, minutos? }] }
  .post('/avisos', async (c) => {
    const f = await fuenteDelPedido(c);
    const d = await cuerpo(c);
    const conteos = d.conteos ?? [];
    const eventos = d.eventos ?? [];
    if (!Array.isArray(conteos) || !Array.isArray(eventos)) throw new ErrorApi('Mandá listas "conteos" y "eventos".');
    const r = await c.var.db.transaction((tx) => guardarAvisos(tx, f, conteos, eventos));
    return c.json({ ok: true, ...r });
  })
  // Cuántas llamadas hubo en cada hora (la app de Android; también las horas sin ninguna, con 0): para el gráfico por
  // hora del Día. Nunca números ni nombres.   { "horas": [{ hora, n }] }
  .post('/llamadas', async (c) => {
    const f = await fuenteDelPedido(c);
    const horas = (await cuerpo(c)).horas;
    if (!Array.isArray(horas)) throw new ErrorApi('Mandá una lista "horas".');
    const n = await c.var.db.transaction((tx) => guardarLlamadasPorHora(tx, f, horas));
    return c.json({ ok: true, horas: n });
  })
  .post('/', async (c) => {
    const f = await fuenteDelPedido(c);
    const lista = (await cuerpo(c)).mediciones;
    if (!Array.isArray(lista) || lista.length > 5000) throw new ErrorApi('Mandá una lista "mediciones" (hasta 5000 por vez).');
    const n = await c.var.db.transaction(async (tx) => {
      const cache = new Map<string, number>();
      // Por clave (concepto + inicio): si en el mismo lote viene dos veces, vale la última.
      const porClave = new Map<string, typeof mediciones.$inferInsert>();
      for (const [i, m] of (lista as Array<Record<string, unknown>>).entries()) {
        const nombre = texto(m?.concepto);
        const valor = numeroONulo(m?.valor, `mediciones[${i}].valor`);
        if (!nombre || valor === null) throw new ErrorApi('mediciones[{i}]: falta "concepto" o "valor".', 400, { i });
        const inicio = leerInstante(m.inicio, `mediciones[${i}].inicio`);
        const unidad = texto(m.unidad) || null;
        const conceptoId = await conceptoMedido(tx, f, nombre, texto(m.categoria), unidad, cache);
        porClave.set(`${conceptoId}|${inicio.getTime()}`, {
          persona_id: f.persona_id,
          fuente_id: f.id,
          concepto_id: conceptoId,
          inicio: inicio.toISOString(),
          fin: m.fin ? leerInstante(m.fin, `mediciones[${i}].fin`).toISOString() : null,
          // Día calendario (no el de 5 a 5): los resúmenes diarios de los dispositivos vienen con inicio a las 0:00.
          fecha: fechaLocal(inicio, f.zona_horaria),
          valor,
          unidad,
        });
      }
      const filas = [...porClave.values()];
      for (let i = 0; i < filas.length; i += 500) {
        await tx
          .insert(mediciones)
          .values(filas.slice(i, i + 500))
          .onConflictDoUpdate({
            target: [mediciones.persona_id, mediciones.concepto_id, mediciones.inicio, mediciones.fuente_id],
            set: { valor: sql`excluded.valor`, fin: sql`excluded.fin`, unidad: sql`excluded.unidad` },
          });
      }
      await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${f.id}`);
      return lista.length;
    });
    // Llegó la noche: si es la mañana, el aviso de buen día con el reporte de sueño (sin hacer esperar la respuesta).
    if (traeSueno(lista)) buenDiaDespues(c.var.db, f.persona_id);
    return c.json({ ok: true, recibidas: n });
  });
