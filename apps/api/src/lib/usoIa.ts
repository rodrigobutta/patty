// Cuánto usa la IA cada uno: cada pedido queda anotado (quién, para qué, cuántos tokens) y lo que pide la persona
// (contar, foto, dictar, preguntar, buscar patrones) tiene un límite por día según su plan (shared: PLANES; en el admin
// se cambia el plan o los límites de cada usuario). Quién y para qué se sabe por el contexto del pedido (AsyncLocalStorage):
// lo pone la API al entrar cada pedido y los procesos al correr.
import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { limitesDe, NOMBRES_USO_IA, type UsoIa } from 'shared';
import { obtenerDb, una, type Db } from '../db/client.js';
import { ErrorApi } from './errores.js';
import { diaDePatty } from './fechas.js';

interface Contexto { usuarioId: number | null; tipo: string }
const almacen = new AsyncLocalStorage<Contexto>();

/** Corre `f` sabiendo quién y para qué (los pedidos a la IA adentro quedan anotados así). */
export const conUso = <T>(ctx: Contexto, f: () => T): T => almacen.run(ctx, f);

const ZONA = 'America/Argentina/Buenos_Aires';
const hoy = () => diaDePatty(new Date(), ZONA);

/** Cuántas veces usó hoy cada cosa. */
export async function usoDeHoy(db: Db, usuarioId: number): Promise<Record<string, number>> {
  const l = await (await import('../db/client.js')).filas<{ tipo: string; n: number }>(
    db,
    sql`SELECT tipo, count(*)::int AS n FROM uso_ia WHERE usuario_id = ${usuarioId} AND fecha = ${hoy()} GROUP BY tipo`,
  );
  return Object.fromEntries(l.map((x) => [x.tipo, x.n]));
}

/**
 * Antes de usar la IA para algo con límite: si ya llegó al de hoy, un error que se lee bien; si no, lo que siga en
 * este pedido queda anotado como ese uso. Los administradores no tienen límite.
 */
export async function controlarLimite(db: Db, usuario: { id: number; rol: string }, tipo: UsoIa): Promise<void> {
  const ctx = almacen.getStore();
  if (ctx) ctx.tipo = tipo;
  if (usuario.rol === 'admin') return;
  const u = await una<{ plan: string; limites: Record<string, number> | null }>(db, sql`SELECT plan, limites FROM usuarios WHERE id = ${usuario.id}`);
  const limite = limitesDe(u?.plan, u?.limites)[tipo];
  const n = (await una<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM uso_ia WHERE usuario_id = ${usuario.id} AND fecha = ${hoy()} AND tipo = ${tipo}`))?.n ?? 0;
  if (n >= limite) {
    throw new ErrorApi('Llegaste al límite de hoy para «{que}» ({n} por día). Mañana se renueva.', 429, { que: NOMBRES_USO_IA[tipo], n: limite });
  }
}

/** Anota un pedido a la IA (lo llama el cliente de la IA; sin contexto, va como "otro"). */
export async function anotarUso(entrada: number, salida: number, tipo?: string): Promise<void> {
  const ctx = almacen.getStore();
  try {
    await obtenerDb().execute(
      sql`INSERT INTO uso_ia (usuario_id, tipo, fecha, entrada, salida) VALUES (${ctx?.usuarioId ?? null}, ${tipo ?? ctx?.tipo ?? 'otro'}, ${hoy()}, ${entrada}, ${salida})`,
    );
  } catch (e) {
    console.error('No se pudo anotar el uso de la IA:', e instanceof Error ? e.message : e);
  }
}
