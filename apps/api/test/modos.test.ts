import { afterAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { cerrarDb } from '../src/db/client.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

/** Un pedido a la app armada en un modo, con la cookie de quien ya entró. */
const pedir = (modo: 'app' | 'admin', ruta: string, cookie: string | null) =>
  crearApp(modo).request(ruta, { headers: cookie ? { Cookie: cookie } : {} });

describe('servidores separados (MODO)', () => {
  it('admin: solo entrar, la administración y los usuarios', async () => {
    const { ana } = await conAdmin();
    expect((await pedir('admin', '/api/sesion', ana.cookie)).status).toBe(200);
    expect((await pedir('admin', '/api/admin/resumen', ana.cookie)).status).toBe(200);
    expect((await pedir('admin', '/api/admin/datos/calidad', ana.cookie)).status).toBe(200);
    expect((await pedir('admin', '/api/usuarios', ana.cookie)).status).not.toBe(404);
    expect((await pedir('admin', '/api/personas', ana.cookie)).status).toBe(404);
    expect((await pedir('admin', '/api/registros', ana.cookie)).status).toBe(404);
    expect((await pedir('admin', '/api/admin/resumen', null)).status).toBe(401);
  });

  it('app: sin la administración, y /admin lleva al dominio de la administración', async () => {
    const { ana } = await conAdmin();
    expect((await pedir('app', '/api/admin/resumen', ana.cookie)).status).toBe(404);
    expect((await pedir('app', '/api/personas', ana.cookie)).status).toBe(200);
    const r = await pedir('app', '/admin/', ana.cookie);
    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toBe('https://admin.patty.today');
  });
});
