import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

describe('borrar la cuenta', () => {
  it('pide el nombre de usuario; borra la cuenta y sus personas, con todo lo anotado', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida });
    expect((await ana.del('/api/cuenta')).status).toBe(400);
    const r = await ana.pedir('DELETE', '/api/cuenta', { usuario: 'ANA' });
    expect(r.status).toBe(200);
    const db = obtenerDb();
    const cuenta = async (t: string) => Number(([...(await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`)))][0] as any).n);
    expect(await cuenta('usuarios')).toBe(0);
    expect(await cuenta('personas')).toBe(0);
    expect(await cuenta('registros')).toBe(0);
    expect((await ana.get('/api/registros?persona=1')).status).toBe(401);
  });
});
