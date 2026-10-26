import { describe, expect, it } from 'vitest';
import { conAdmin } from './ayudas.js';

describe('tu gente', () => {
  it('se da de alta, se anota con quién estuviste, se renombra (moviendo lo anotado) y se saca', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    expect(categorias.gente).toBeTruthy();
    const juan = (await ana.post('/api/gente', { persona_id: personaId, nombre: 'juan' })).body;
    expect(juan).toMatchObject({ nombre: 'Juan' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Juan', categoria_id: categorias.gente });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Mamá', categoria_id: categorias.gente });
    // Mamá entra en la lista porque se anotó, aunque no se dio de alta
    expect((await ana.get(`/api/gente?persona=${personaId}`)).body.map((x: any) => [x.nombre, x.veces])).toEqual([['Juan', 1], ['Mamá', 1]]);
    const r = (await ana.put(`/api/gente/${juan.id}`, { persona_id: personaId, nombre: 'Juan Pablo' })).body;
    const lista = (await ana.get(`/api/gente?persona=${personaId}`)).body;
    expect(lista.find((x: any) => x.id === r.id)).toMatchObject({ nombre: 'Juan Pablo', veces: 1 });
    expect(lista.some((x: any) => x.nombre === 'Juan')).toBe(false);
    await ana.del(`/api/gente/${r.id}?persona=${personaId}`);
    // sale de la lista aunque haya algo anotado con él
    expect((await ana.get(`/api/gente?persona=${personaId}`)).body.map((x: any) => x.nombre)).toEqual(['Mamá']);
  });
});
