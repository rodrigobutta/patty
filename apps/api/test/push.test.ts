import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { revisarTomas } from '../src/push/recordatorios.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('avisos push de remedios', () => {
  it('manda la toma y el "¿la tomaste?" una sola vez, solo después de lo que el teléfono ya tiene programado', async () => {
    const { ana, personaId } = await conAdmin();
    const enviados: Array<{ token: string; a: Aviso }> = [];
    usarEnvioPrueba(async (token, a) => {
      enviados.push({ token, a });
      return token === 'viejo' ? 'invalido' : 'ok';
    });
    const t = await ana.post('/api/tratamientos', {
      persona_id: personaId, concepto_nombre: 'Vitamina D', dosis: 1, unidad: 'comprimido', horarios: ['09:00'], inicio: '2026-10-01T03:00:00.000Z',
    });
    expect(t.status).toBe(201);
    expect((await ana.post('/api/dispositivos', { token: 'tel-1', plataforma: 'android', avisos_hasta: '2026-10-05T00:00:00.000Z' })).status).toBe(200);
    await ana.post('/api/dispositivos', { token: 'viejo', plataforma: 'android' });
    const db = obtenerDb();

    // 9:00 en Buenos Aires = 12:00 UTC. El 3 el teléfono ya lo tenía: no se manda.
    expect(await revisarTomas(db, new Date('2026-10-03T12:01:00.000Z'))).toBe(0);
    expect(enviados.map((e) => e.token)).toEqual(['viejo']); // y el token que ya no sirve se olvida
    enviados.length = 0;
    expect(await revisarTomas(db, new Date('2026-10-08T12:01:00.000Z'))).toBe(1);
    expect(await revisarTomas(db, new Date('2026-10-08T12:02:00.000Z'))).toBe(0); // no se repite
    expect(enviados[0]).toMatchObject({ token: 'tel-1', a: { titulo: '💊 Vitamina D 1 comprimido', cuerpo: 'Es la hora de la toma de las 09:00.', canal: 'remedios' } });
    expect(await revisarTomas(db, new Date('2026-10-08T12:31:00.000Z'))).toBe(1);
    expect(enviados[1].a.titulo).toBe('¿Tomaste Vitamina D?');

    // Marcada: no se insiste.
    await ana.post(`/api/tratamientos/${t.body.id}/tomas`, { programada: '2026-10-09T12:00:00.000Z', estado: 'tomada' });
    expect(await revisarTomas(db, new Date('2026-10-09T12:31:00.000Z'))).toBe(0);
  });
});
