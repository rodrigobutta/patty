import type { SQL } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;
/** Una transacción o la base directa: las dos tienen la misma interfaz de consultas. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

let cliente: ReturnType<typeof postgres> | undefined;
let db: Db | undefined;

export function obtenerDb(): Db {
  if (!db) {
    // Cada servicio con su propio tamaño: la app atiende pedidos (10), el worker corre de a un proceso (4), el admin poco (2).
    const max = { completo: 10, app: 10, worker: 4, admin: 2 }[config.modo];
    cliente = postgres(config.databaseUrl, { max, onnotice: () => {} });
    db = drizzle(cliente, { schema });
  }
  return db;
}

let clienteAdmin: ReturnType<typeof postgres> | undefined;
let dbAdmin: Db | undefined;

/**
 * La base para la administración: una conexión aparte y chica (3), con un tiempo máximo por consulta. Así una consulta
 * pesada del admin (un chequeo de calidad, una tabla grande) nunca le saca conexiones ni tiempo a la app.
 */
export function obtenerDbAdmin(): Db {
  if (!dbAdmin) {
    clienteAdmin = postgres(config.databaseUrl, { max: 3, onnotice: () => {}, connection: { statement_timeout: 30000, application_name: 'patty-admin' } });
    dbAdmin = drizzle(clienteAdmin, { schema });
  }
  return dbAdmin;
}

export async function cerrarDb(): Promise<void> {
  await Promise.all([cliente?.end({ timeout: 5 }), clienteAdmin?.end({ timeout: 5 })]);
  cliente = undefined;
  db = undefined;
  clienteAdmin = undefined;
  dbAdmin = undefined;
}

/** Filas de una consulta en SQL crudo. */
export async function filas<T>(tx: Tx, q: SQL): Promise<T[]> {
  return [...((await tx.execute(q)) as unknown as T[])];
}

export async function una<T>(tx: Tx, q: SQL): Promise<T | null> {
  return (await filas<T>(tx, q))[0] ?? null;
}
