import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

describe('los widgets de cada persona', () => {
  it('se guardan en la persona y vuelven en otro dispositivo; sin elegir, vacío', async () => {
    const { ana } = await conAdmin();
    const id = (await ana.post('/api/personas', { nombre: 'Ana' })).body.id as number;
    const de = async (c: Cliente) => (await c.get('/api/personas')).body.find((p: { id: number }) => p.id === id).widgets;
    expect(await de(ana)).toEqual({});
    const elegido = { orden: ['sueno', 'clima', 'uno_futuro'], ocultos: ['comida'] };
    const r = await ana.put(`/api/personas/${id}`, { widgets: elegido });
    expect(r.status).toBe(200);
    const otroDispositivo = new Cliente();
    otroDispositivo.cookie = ana.cookie;
    expect(await de(otroDispositivo)).toEqual(elegido);
    // Cambiar otra cosa de la persona no los toca.
    await ana.put(`/api/personas/${id}`, { notas: 'hola' });
    expect(await de(ana)).toEqual(elegido);
    // Y son de esa persona.
    const beto = (await ana.post('/api/personas', { nombre: 'Beto' })).body.id as number;
    expect((await ana.get('/api/personas')).body.find((p: { id: number }) => p.id === beto).widgets).toEqual({});
  });

  it('rechaza lo que no tiene la forma correcta', async () => {
    const { ana } = await conAdmin();
    const id = (await ana.post('/api/personas', { nombre: 'Ana' })).body.id as number;
    for (const malo of [null, 'clima', [], { orden: 'clima' }, { orden: [1] }, { ocultos: ['<script>'] }]) {
      expect((await ana.put(`/api/personas/${id}`, { widgets: malo })).status).toBe(400);
    }
  });

  it('alguien sin acceso a la persona no puede cambiarlos', async () => {
    const { ana } = await conAdmin();
    const id = (await ana.post('/api/personas', { nombre: 'Ana' })).body.id as number;
    await ana.post('/api/usuarios', { usuario: 'otra', nombre: 'Otra', email: 'otra@x.com', clave: 'secreta1', rol: 'editor' });
    const otra = new Cliente();
    await otra.post('/api/entrar', { usuario: 'otra', clave: 'secreta1' });
    const r = await otra.put(`/api/personas/${id}`, { widgets: { ocultos: ['clima'] } });
    expect([403, 404]).toContain(r.status);
    expect((await ana.get('/api/personas')).body.find((p: { id: number }) => p.id === id).widgets).toEqual({});
  });
});
