import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { cerrarDb, filas, obtenerDb } from '../src/db/client.js';
import { sumarDias } from '../src/lib/fechas.js';
import { analizarDeNoche, avisarHallazgosNuevos } from '../src/patrones/noche.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('patrones de noche', () => {
  it('a las 4 analiza a quien anotó, una vez; a las 9 el búho avisa lo nuevo y queda en el historial que ve la administración', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const tomate = (await ana.post('/api/conceptos', { nombre: 'Tomate', categoria_id: categorias.comida })).body.concepto.id;
    const cafe = (await ana.post('/api/conceptos', { nombre: 'Café', categoria_id: categorias.bebida })).body.concepto.id;
    const dolor = (await ana.post('/api/conceptos', { nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma })).body.concepto.id;
    // El día en Argentina (pasada la medianoche UTC, el de UTC ya es mañana y lo anotado quedaba en el futuro).
    const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const desde = sumarDias(hoy, -46);
    for (let i = 0; i < 45; i++) {
      const dia = sumarDias(desde, i);
      await ana.post('/api/registros', { persona_id: personaId, concepto_id: cafe, inicio: `${dia}T11:00:00Z`, valor: 1 });
      if (i % 3 === 0) await ana.post('/api/registros', { persona_id: personaId, concepto_id: tomate, inicio: `${dia}T16:00:00Z` });
      if ((i >= 2 && (i - 2) % 3 === 0) || i === 10) {
        await ana.post('/api/registros', { persona_id: personaId, concepto_id: dolor, inicio: `${dia}T21:00:00Z`, intensidad: 3 });
      }
    }
    const db = obtenerDb();
    // Buenos Aires es UTC-3: las 7 UTC son las 4 de allá.
    expect(await analizarDeNoche(db, new Date(`${hoy}T05:10:00Z`))).toBe(0);
    expect(await analizarDeNoche(db, new Date(`${hoy}T07:10:00Z`))).toBe(1);
    expect(await analizarDeNoche(db, new Date(`${hoy}T07:20:00Z`))).toBe(0);
    const [a] = await filas<{ origen: string; nuevos: number[] }>(db, sql`SELECT origen, nuevos FROM analisis WHERE persona_id = ${personaId}`);
    expect(a.origen).toBe('noche');
    expect(a.nuevos.length).toBeGreaterThan(0);

    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, x) => {
      enviados.push(x);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel-ana', plataforma: 'android' });
    expect(await avisarHallazgosNuevos(db, new Date(`${hoy}T11:10:00Z`))).toBe(0); // las 8: todavía no
    expect(await avisarHallazgosNuevos(db, new Date(`${hoy}T12:10:00Z`))).toBe(1);
    expect(await avisarHallazgosNuevos(db, new Date(`${hoy}T12:20:00Z`))).toBe(0); // una sola vez
    expect(enviados[0]).toMatchObject({ titulo: '🦉 Encontré algo en tus datos', datos: { tipo: 'hallazgo', persona_id: String(personaId) } });
    expect(enviados[0].cuerpo).toMatch(/Tomate|Dolor de cabeza/i);

    const [u] = await filas<{ id: number }>(db, sql`SELECT usuario_id AS id FROM dispositivos WHERE token = 'tel-ana'`);
    const d = (await ana.get(`/api/admin/usuarios/${u.id}`)).body;
    expect(d.analisis[0]).toMatchObject({ origen: 'noche' });
    expect(d.hallazgos.length).toBeGreaterThan(0);
    expect(d.avisos[0]).toMatchObject({ tipo: 'hallazgo', titulo: '🦉 Encontré algo en tus datos', resultado: 'ok' });
  });
});
