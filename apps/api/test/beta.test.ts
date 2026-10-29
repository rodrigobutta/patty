import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

describe('pedir una invitación a la beta', () => {
  it('sin cuenta: se guarda y la ve el admin; mail inválido no; el campo trampa se ignora; el mismo mail no se repite', async () => {
    const { ana } = await conAdmin();
    const visita = new Cliente();
    visita.headers['x-forwarded-for'] = '10.0.0.1';
    expect((await visita.post('/api/beta', { nombre: 'Lucía', email: 'no-es-un-mail' })).status).toBe(400);
    expect((await visita.post('/api/beta', { nombre: '', email: 'lucia@mail.com' })).status).toBe(400);
    expect((await visita.post('/api/beta', { nombre: 'Lucía', email: 'Lucia@Mail.com', motivo: 'Tengo migrañas y quiero ver qué las dispara' })).status).toBe(201);
    expect((await visita.post('/api/beta', { nombre: 'Lucía', email: 'lucia@mail.com' })).status).toBe(201);
    expect((await visita.post('/api/beta', { nombre: 'Bot', email: 'bot@spam.com', web: 'http://spam' })).status).toBe(201);
    const l = (await ana.get('/api/admin/beta')).body;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ nombre: 'Lucía', email: 'lucia@mail.com', estado: 'nueva', motivo: 'Tengo migrañas y quiero ver qué las dispara' });
    expect((await ana.put(`/api/admin/beta/${l[0].id}`, { estado: 'invitada' })).status).toBe(200);
    expect((await ana.get('/api/admin/beta')).body[0].estado).toBe('invitada');
    // Solo un admin la ve.
    expect((await visita.get('/api/admin/beta')).status).toBe(401);
  });
});
