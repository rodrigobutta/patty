import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

describe('la línea del widget', () => {
  it('sin nada, null; después cuántas cosas lleva hoy; un malestar abierto pasa adelante', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    expect((await ana.get(`/api/widget?persona=${personaId}`)).body).toEqual({ linea: null });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: new Date().toISOString() });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Agua', categoria_id: categorias.bebida, inicio: new Date().toISOString() });
    expect((await ana.get(`/api/widget?persona=${personaId}`)).body).toEqual({ linea: 'Hoy anotaste 2 cosas' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, intensidad: 6, inicio: new Date().toISOString() });
    expect((await ana.get(`/api/widget?persona=${personaId}`)).body.linea).toMatch(/^🤕 Dolor de cabeza desde las \d\d:\d\d$/);
  });
});
