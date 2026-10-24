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
    cliente = postgres(config.databaseUrl, { max: 10, onnotice: () => {} });
    db = drizzle(cliente, { schema });
  }
  return db;
}

export async function cerrarDb(): Promise<void> {
  await cliente?.end({ timeout: 5 });
  cliente = undefined;
  db = undefined;
}

/** Filas de una consulta en SQL crudo. */
export async function filas<T>(tx: Tx, q: SQL): Promise<T[]> {
  return [...((await tx.execute(q)) as unknown as T[])];
}

export async function una<T>(tx: Tx, q: SQL): Promise<T | null> {
  return (await filas<T>(tx, q))[0] ?? null;
}
