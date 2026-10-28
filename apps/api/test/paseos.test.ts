import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { sugerirPaseos } from '../src/patrones/paseos.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

const CASA = { lat: -34.6, lon: -58.4 };
/** Una vuelta a pie de casa a casa (unos 1,2 km en ~16 min), que empieza en `t0`. */
const vuelta = (t0: number) =>
  [[0, 0], [0.0027, 0], [0.0027, 0.0027], [0, 0.0027], [0, 0]].map(([a, b], k) => ({ lat: CASA.lat + a, lon: CASA.lon + b, instante: new Date(t0 + k * 4 * 60000).toISOString() }));

describe('paseos detectados', () => {
  it('una vuelta a pie se sugiere para anotar; con las respuestas que se repiten, pregunta directo', async () => {
    const { ana, personaId } = await conAdmin();
    await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Casa', lat: CASA.lat, lon: CASA.lon, radio_m: 100 });
    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    const db = obtenerDb();
    const ahora = Date.now();

    for (let k = 0; k < 4; k++) {
      const t0 = ahora - (4 - k) * 40 * 60000;
      await ana.post('/api/ubicacion', { persona_id: personaId, puntos: vuelta(t0) });
      const cuando = new Date(t0 + 16 * 60000 + 12 * 60000);
      expect(await sugerirPaseos(db, cuando)).toBe(1);
      expect(await sugerirPaseos(db, new Date(cuando.getTime() + 60000))).toBe(0); // una vez
      const a = enviados.at(-1)!;
      if (k < 3) {
        expect(a.titulo).toMatch(/Saliste a caminar \d+ min/);
        expect(a.acciones!.map((x) => x.titulo)).toEqual(['Paseo con los perros', 'Caminata', 'No anotar']);
        const r = await ana.post(a.acciones![0].pedidos[0].ruta, a.acciones![0].pedidos[0].cuerpo);
        expect(r.body.registro).toMatchObject({ concepto: 'Paseo con los perros', unidad: 'min' });
      } else {
        expect(a.titulo).toBe('🦉 ¿Paseo con los perros?');
        expect(a.acciones!.map((x) => x.titulo)).toEqual(['Sí', 'Caminata', 'No anotar']);
      }
    }
    expect((await ana.get(`/api/paseos?persona=${personaId}`)).body).toMatchObject({ directa: 'Paseo con los perros' });
  });
});
