import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { correr } from '../src/lib/salud.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

describe('salud', () => {
  it('anota cómo corre cada proceso y sus errores; los de la app llegan sin sesión; se baja un respaldo', async () => {
    const { ana } = await conAdmin();
    const db = obtenerDb();
    await correr(db, 'Bien', async () => 3);
    await correr(db, 'Mal', async () => {
      throw new Error('se rompió');
    });
    await correr(db, 'Mal', async () => 0);
    expect((await new Cliente().post('/api/errores', { mensaje: 'x is undefined', detalle: 'at f()', donde: '#dia', version: '1.0.0' })).body).toEqual({ ok: true });
    // El ruido de la red no llega desde la app (lo filtra el cliente), pero un mensaje vacío se rechaza.
    expect((await new Cliente().post('/api/errores', { mensaje: '' })).status).toBe(400);

    const s = (await ana.get('/api/admin/salud')).body;
    const bien = s.procesos.find((p: any) => p.nombre === 'Bien');
    const mal = s.procesos.find((p: any) => p.nombre === 'Mal');
    expect(bien).toMatchObject({ ultimo_ok: true, corridas: 1, fallas: 0, procesados: 3 });
    expect(bien.ultimo_trabajo).not.toBeNull();
    // La última corrida anduvo, pero queda el error de antes y la cuenta de fallas.
    expect(mal).toMatchObject({ ultimo_ok: true, ultimo_error: 'se rompió', corridas: 2, fallas: 1 });
    expect(s.errores.map((e: any) => [e.origen, e.mensaje])).toEqual(expect.arrayContaining([['proceso', 'se rompió'], ['app', 'x is undefined']]));
    expect(s.porOrigen.find((o: any) => o.origen === 'app').dia).toBe(1);

    // Solo los administradores.
    expect((await new Cliente().get('/api/admin/salud')).status).toBe(401);

    const { crearApp } = await import('../src/app.js');
    const crudo = await crearApp().request('/api/admin/respaldo', { headers: { Cookie: ana.cookie! } });
    expect(crudo.headers.get('Content-Type')).toBe('application/gzip');
    const json = JSON.parse(gunzipSync(Buffer.from(await crudo.arrayBuffer())).toString());
    expect(json.tablas.usuarios).toHaveLength(1);
    expect(json.tablas.sesiones).toBeUndefined();
  });
});
