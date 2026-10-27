import { afterEach, vi } from 'vitest';
import { diaLocal, mandarPunto, ponerLugares, ponerSeguimiento, seguimientoActivado } from './ubicacion';

describe('seguimiento de la ubicación', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ponerSeguimiento(false);
    ponerLugares([]);
  });

  it('viene apagado', () => {
    expect(seguimientoActivado()).toBe(false);
    ponerSeguimiento(true);
    expect(seguimientoActivado()).toBe(true);
  });

  it('manda el primer punto, y después solo si se movió más de 150 m o cambió de lugar', async () => {
    const f = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    const t = Date.parse('2026-10-24T15:00:00Z');
    expect(await mandarPunto(1, { latitude: -34.6, longitude: -58.4, accuracy: 20 }, t)).toBe(true);
    const [ruta, pedido] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(ruta).toBe('/api/ubicacion');
    expect(JSON.parse(pedido.body as string)).toEqual({
      persona_id: 1,
      puntos: [{ lat: -34.6, lon: -58.4, precision: 20, instante: '2026-10-24T15:00:00.000Z' }],
    });
    expect(await mandarPunto(1, { latitude: -34.6008, longitude: -58.4 }, t + 60000)).toBe(false); // 90 m
    ponerLugares([{ id: 1, persona_id: 1, concepto_id: 9, nombre: 'Casa', lat: -34.6, lon: -58.4, radio_m: 50 }]);
    expect(await mandarPunto(1, { latitude: -34.6008, longitude: -58.4 }, t + 120000)).toBe(true); // salió de casa (radio 50 m)
    expect(await mandarPunto(1, { latitude: -34.615, longitude: -58.4 }, t + 180000)).toBe(true); // 1,3 km
    expect(await mandarPunto(2, { latitude: -34.615, longitude: -58.4 }, t + 180000)).toBe(true); // otra persona
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('si el servidor falla no lo da por mandado y no tira error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"x"}', { status: 500 })));
    expect(await mandarPunto(1, { latitude: -34.6, longitude: -58.4 })).toBe(false);
  });

  it('el día arranca a las 5', () => {
    expect(diaLocal(new Date(2026, 9, 24, 4, 30).getTime())).toBe('2026-10-23');
    expect(diaLocal(new Date(2026, 9, 24, 5, 30).getTime())).toBe('2026-10-24');
  });
});
