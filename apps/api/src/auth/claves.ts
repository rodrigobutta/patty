// Claves con PBKDF2-SHA256, guardadas como "pbkdf2$<iteraciones>$<sal>$<hash hex>" (el mismo formato que Quincho).
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const ITERACIONES = 200000;

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16).toString('hex');
  const h = (await pbkdf2Async(Buffer.from(clave, 'utf8'), Buffer.from(sal, 'utf8'), ITERACIONES, 32, 'sha256')).toString('hex');
  return `pbkdf2$${ITERACIONES}$${sal}$${h}`;
}

export async function claveOk(clave: unknown, guardada: unknown): Promise<boolean> {
  if (typeof clave !== 'string' || typeof guardada !== 'string') return false;
  const partes = guardada.split('$');
  if (partes.length !== 4) return false;
  const [, it, sal, h] = partes;
  if (!/^\s*[+-]?\d+\s*$/.test(it)) return false;
  const iteraciones = Number(it);
  if (iteraciones < 1) return false;
  const calc = (await pbkdf2Async(Buffer.from(clave, 'utf8'), Buffer.from(sal, 'utf8'), iteraciones, 32, 'sha256')).toString('hex');
  const a = Buffer.from(calc);
  const b = Buffer.from(h);
  return a.length === b.length && timingSafeEqual(a, b);
}
