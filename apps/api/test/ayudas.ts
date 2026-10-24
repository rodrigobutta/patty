// Ayudas para las pruebas: base limpia y pedidos a la app sin levantar un servidor.
import { sql } from 'drizzle-orm';
import { crearApp } from '../src/app.js';
import { obtenerDb } from '../src/db/client.js';
import { aplicarMigraciones } from '../src/db/migrar.js';
import { inicializar } from '../src/inicializar.js';

export async function baseLimpia(): Promise<void> {
  const db = obtenerDb();
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await aplicarMigraciones(db);
  await inicializar(db);
}

const app = crearApp();

export interface Respuesta<T = any> {
  status: number;
  body: T;
  cookie: string | null;
}

/** Un navegador de mentira: guarda la cookie de sesión entre pedidos. */
export class Cliente {
  cookie: string | null = null;
  headers: Record<string, string> = {};

  async pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    const h: Record<string, string> = { ...this.headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
    const r = await app.request(ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const set = r.headers.get('Set-Cookie');
    if (set) this.cookie = set.split(';')[0];
    const texto = await r.text();
    return { status: r.status, body: texto ? JSON.parse(texto) : null, cookie: set };
  }
  /** Un pedido con el cuerpo tal cual (audio, por ejemplo). */
  async pedirCrudo<T = any>(metodo: string, ruta: string, cuerpo: Uint8Array, tipo: string): Promise<Respuesta<T>> {
    const h: Record<string, string> = { ...this.headers, 'Content-Type': tipo };
    if (this.cookie) h.Cookie = this.cookie;
    const r = await app.request(ruta, { method: metodo, headers: h, body: cuerpo });
    const texto = await r.text();
    return { status: r.status, body: texto ? JSON.parse(texto) : null, cookie: r.headers.get('Set-Cookie') };
  }
  get = <T = any>(ruta: string) => this.pedir<T>('GET', ruta);
  post = <T = any>(ruta: string, c?: unknown) => this.pedir<T>('POST', ruta, c ?? {});
  put = <T = any>(ruta: string, c?: unknown) => this.pedir<T>('PUT', ruta, c ?? {});
  del = <T = any>(ruta: string) => this.pedir<T>('DELETE', ruta);
}

/** Base limpia con un administrador ("ana") que ya entró y una persona para anotar. */
export async function conAdmin(): Promise<{ ana: Cliente; personaId: number; categorias: Record<string, number> }> {
  await baseLimpia();
  const ana = new Cliente();
  const r = await ana.post('/api/configurar', { usuario: 'ana', nombre: 'Ana', clave: 'secreta1' });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  const p = await ana.post('/api/personas', { nombre: 'Rodrigo' });
  const cats = await ana.get<Array<{ id: number; clave: string }>>('/api/conceptos/categorias');
  return { ana, personaId: p.body.id, categorias: Object.fromEntries(cats.body.map((c) => [c.clave, c.id])) };
}
