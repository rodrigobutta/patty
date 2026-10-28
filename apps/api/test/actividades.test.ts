import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { finPorUbicacion, sugerirFinDeActividades } from '../src/patrones/actividades.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('actividades en curso', () => {
  it('la caminata anotada en el momento queda en curso; con la ubicación Patty sugiere cerrarla donde terminó', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const ahora = Date.now();
    const inicio = ahora - 50 * 60000;
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Caminata', categoria_id: categorias.actividad, inicio: new Date(inicio).toISOString() })).body;
    // Con los minutos dichos, no queda en curso.
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Yoga', categoria_id: categorias.actividad, valor: 45, inicio: new Date(ahora - 3600000).toISOString() });
    expect((await ana.get(`/api/registros/abiertos?persona=${personaId}`)).body.map((x: any) => x.concepto)).toEqual(['Caminata']);

    // Sale de casa, camina 1,5 km y vuelve; el último punto es en casa, hace 20 minutos.
    const casa = { lat: -34.6, lon: -58.4 };
    await ana.post('/api/ubicacion/lugares', { persona_id: personaId, nombre: 'Casa', lat: casa.lat, lon: casa.lon, radio_m: 120 });
    const puntos = [0, 5, 10, 15, 20, 25, 30].map((m, k) => ({
      lat: casa.lat + [0, 0.003, 0.006, 0.008, 0.005, 0.002, 0][k],
      lon: casa.lon,
      instante: new Date(inicio + m * 60000).toISOString(),
    }));
    await ana.post('/api/ubicacion', { persona_id: personaId, puntos });
    expect(finPorUbicacion(inicio, puntos.map((p) => ({ ...p, instante: Date.parse(p.instante) })), [{ id: 1, nombre: 'Casa', ...casa, radio_m: 120 }], ahora)).toEqual({ fin: inicio + 30 * 60000, lugar: 'Casa' });

    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    const db = obtenerDb();
    expect(await sugerirFinDeActividades(db, new Date(ahora))).toBe(1);
    expect(await sugerirFinDeActividades(db, new Date(ahora + 60000))).toBe(0); // mismo fin: no repite
    expect(enviados[0].titulo).toBe('🦉 ¿Terminaste (caminata)?');
    expect(enviados[0].cuerpo).toMatch(/llegaste a Casa/);
    const si = enviados[0].acciones![0];
    expect(si.pedidos[0]).toMatchObject({ ruta: `/api/registros/${r.id}/seguir`, cuerpo: { estado: 'paso', fin: new Date(inicio + 30 * 60000).toISOString() } });

    // Lo acepta: queda cerrada a esa hora, con sus 30 minutos.
    const hecho = (await ana.post(si.pedidos[0].ruta, si.pedidos[0].cuerpo)).body;
    expect(Date.parse(hecho.fin)).toBe(inicio + 30 * 60000);
    expect(Number(hecho.valor)).toBe(30);
    expect((await ana.get(`/api/registros/abiertos?persona=${personaId}`)).body).toEqual([]);
  });
});
