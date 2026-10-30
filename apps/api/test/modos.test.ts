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

describe('worker', () => {
  it('su HTTP solo dice que está vivo', async () => {
    const { appWorker } = await import('../src/app.js');
    const r = await appWorker().request('/api/sesion');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ worker: true });
    expect((await appWorker().request('/api/personas')).status).toBe(404);
  });
});

describe('entrar con el mail', () => {
  it('sirve el usuario o el mail, con la misma clave', async () => {
    const { ana } = await conAdmin();
    await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', email: 'Beto@Mail.com', clave: 'secreta2', rol: 'admin' });
    const r = await crearApp('admin').request('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'beto@mail.com', clave: 'secreta2' }) });
    expect(r.status).toBe(200);
    const mal = await crearApp('admin').request('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'beto@mail.com', clave: 'otra' }) });
    expect(mal.status).toBe(401);
  });
});

describe('app.patty.today', () => {
  it('la raíz abre la app; en patty.today sigue la presentación', async () => {
    const r = await crearApp('app').request('https://app.patty.today/');
    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toBe('/app/');
    expect((await crearApp('app').request('https://patty.today/')).status).not.toBe(302);
  });
});
