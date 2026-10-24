import { afterEach, vi } from 'vitest';
import { anotarClima, climaActivado, horasRecientes, ponerClima } from './clima';

function conUbicacion(coords: { latitude: number; longitude: number } | null) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, mal: PositionErrorCallback) =>
        coords ? ok({ coords } as GeolocationPosition) : mal({ code: 1 } as GeolocationPositionError),
    },
  });
}

describe('clima automático', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ponerClima(true);
  });

  it('manda la ubicación y las horas de lo anotado', async () => {
    conUbicacion({ latitude: -34.6, longitude: -58.4 });
    const f = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await anotarClima(3, ['2026-10-24T14:20:00.000Z']);
    expect(f).toHaveBeenCalledTimes(1);
    const [ruta, pedido] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(ruta).toBe('/api/clima');
    expect(JSON.parse(pedido.body as string)).toEqual({ persona_id: 3, lat: -34.6, lon: -58.4, inicios: ['2026-10-24T14:20:00.000Z'] });
  });

  it('no manda nada si está apagado o no hay permiso, y nunca falla', async () => {
    const f = vi.fn(async () => new Response('{"error":"x"}', { status: 502 }));
    vi.stubGlobal('fetch', f);
    conUbicacion(null);
    await anotarClima(3, []);
    expect(f).not.toHaveBeenCalled();

    conUbicacion({ latitude: -34.6, longitude: -58.4 });
    ponerClima(false);
    expect(climaActivado()).toBe(false);
    await anotarClima(3, []);
    expect(f).not.toHaveBeenCalled();

    ponerClima(true);
    await expect(anotarClima(3, [])).resolves.toBeUndefined(); // el servidor falló: se ignora
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('clima de las últimas horas', () => {
  it('pide cada hora desde hace 47 horas hasta la actual (48 en total)', () => {
    const h = horasRecientes(Date.parse('2026-10-24T16:50:58Z'));
    expect(h).toHaveLength(48);
    expect(h[0]).toBe('2026-10-22T17:00:00.000Z');
    expect(h[47]).toBe('2026-10-24T16:00:00.000Z');
  });
});
