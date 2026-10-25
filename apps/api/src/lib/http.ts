// Lo que comparten las rutas: el tipo del contexto de Hono y cómo leer el pedido.
import type { Context } from 'hono';
import type { Idioma, Usuario } from 'shared';
import type { Db } from '../db/client.js';
import { ErrorApi } from './errores.js';

export interface Env {
  Variables: {
    db: Db;
    usuario: Usuario;
    token: string | null;
    /** El idioma de quien pide (X-Idioma, o Accept-Language): los errores y los textos se arman en ese idioma. */
    idioma: Idioma;
  };
}

export type C = Context<Env>;

/** El cuerpo JSON del pedido (siempre un objeto). */
export async function cuerpo(c: C): Promise<Record<string, unknown>> {
  let d: unknown;
  try {
    d = await c.req.json();
  } catch {
    throw new ErrorApi('El pedido no es un JSON válido.');
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new ErrorApi('El pedido tiene que ser un objeto JSON.');
  return d as Record<string, unknown>;
}

export function idParam(c: C, nombre = 'id'): number {
  const n = Number(c.req.param(nombre));
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApi('No existe.', 404);
  return n;
}

export const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

export function numeroONulo(v: unknown, campo: string): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new ErrorApi(`${campo}: tiene que ser un número.`);
  return n;
}

export const esHttps = (c: C): boolean => c.req.header('X-Forwarded-Proto') === 'https' || new URL(c.req.url).protocol === 'https:';
