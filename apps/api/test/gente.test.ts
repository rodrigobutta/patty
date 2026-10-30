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

  it('cada persona guardada puede decir qué es, y los días con alguien de un grupo entran como un rasgo del grupo', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const mama = (await ana.post('/api/gente', { persona_id: personaId, nombre: 'Mamá', relacion: 'familia' })).body;
    expect(mama).toMatchObject({ relacion: 'familia' });
    const juan = (await ana.post('/api/gente', { persona_id: personaId, nombre: 'Juan' })).body;
    expect((await ana.put(`/api/gente/${juan.id}/relacion`, { persona_id: personaId, relacion: 'trabajo' })).body).toMatchObject({ relacion: 'trabajo' });
    expect((await ana.put(`/api/gente/${juan.id}/relacion`, { persona_id: personaId, relacion: 'vecino' })).status).toBe(400);
    expect((await ana.get(`/api/gente?persona=${personaId}`)).body.map((x: any) => [x.nombre, x.relacion]).sort()).toEqual([['Juan', 'trabajo'], ['Mamá', 'familia']]);
    // Renombrar no pierde la relación
    const r = (await ana.put(`/api/gente/${juan.id}`, { persona_id: personaId, nombre: 'Juan Pablo' })).body;
    expect((await ana.get(`/api/gente?persona=${personaId}`)).body.find((x: any) => x.id === r.id)).toMatchObject({ relacion: 'trabajo' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Mamá', categoria_id: categorias.gente });
    const { obtenerDb } = await import('../src/db/client.js');
    const { rasgosDeGente } = await import('../src/patrones/analizar.js');
    const g = await obtenerDb().transaction((tx) => rasgosDeGente(tx, personaId, '2000-01-01', '2100-01-01'));
    expect(g.conceptos.map((c) => c.nombre)).toEqual(['Con la familia']);
    expect(g.filas).toHaveLength(1);
    expect(g.filas[0]).toMatchObject({ veces: 1 });
  });
});

