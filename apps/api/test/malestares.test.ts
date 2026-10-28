import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { seguirMalestares } from '../src/patrones/malestares.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('malestares con duración', () => {
  it('el malestar del momento queda abierto; Patty pregunta si sigue, y "ya se me pasó" lo cierra con su fin', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const ahora = Date.now();
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, intensidad: 6, inicio: new Date(ahora - 3 * 3600000).toISOString() })).body;
    // Uno de ayer (contado después) no queda abierto, ni lo que no es un malestar.
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de panza', categoria_id: categorias.sintoma, intensidad: 4, inicio: new Date(ahora - 30 * 3600000).toISOString() });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.bebida, inicio: new Date(ahora - 3600000).toISOString() });
    expect((await ana.get(`/api/registros/abiertos?persona=${personaId}`)).body.map((x: any) => x.concepto)).toEqual(['Dolor de cabeza']);

    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    const db = obtenerDb();
    // A las 15 de Buenos Aires (de día): pregunta; enseguida no vuelve a preguntar.
    const tarde = new Date(new Date().toISOString().slice(0, 10) + 'T18:00:00Z');
    // Para que el malestar tenga 3 horas a esa hora, se corre el inicio.
    await db.execute(sql`UPDATE registros SET inicio = ${new Date(tarde.getTime() - 3 * 3600000).toISOString()} WHERE id = ${r.id}`);
    expect(await seguirMalestares(db, tarde)).toBe(1);
    expect(await seguirMalestares(db, new Date(tarde.getTime() + 60000))).toBe(0);
    expect(enviados[0]).toMatchObject({ titulo: '🦉 ¿Seguís con dolor de cabeza?', datos: { tipo: 'malestar' } });
    expect(enviados[0].acciones?.map((a) => a.titulo)).toEqual(['Ya se me pasó', 'Sigo igual', 'Peor']);
    // De noche no pregunta.
    expect(await seguirMalestares(db, new Date(tarde.getTime() + 8 * 3600000))).toBe(0);

    expect((await ana.post(`/api/registros/${r.id}/seguir`, { estado: 'igual' })).status).toBe(200);
    const fin = (await ana.post(`/api/registros/${r.id}/seguir`, { estado: 'paso' })).body;
    expect(fin.fin).not.toBeNull();
    expect((await ana.get(`/api/registros/abiertos?persona=${personaId}`)).body).toEqual([]);
  });
});
