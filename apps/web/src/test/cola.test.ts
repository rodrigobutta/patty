import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { contadosPendientes, guardarContado, pendientes, sacarContado, sePuedeEncolar, subirPendientes } from '../lib/cola';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('anotar sin señal', () => {
  it('lo anotado con un toque queda en la cola y se sube en orden cuando vuelve la señal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const r = await api<{ id: number; pendiente: boolean }>('POST', '/api/registros', { persona_id: 1, concepto_nombre: 'Café' });
    expect(r).toMatchObject({ pendiente: true, concepto_nombre: 'Café' });
    await api('POST', '/api/tratamientos/3/tomas', { programada: 'x', estado: 'tomada' });
    // Lo que no se puede guardar para después sigue dando el error.
    await expect(api('GET', '/api/registros?persona=1')).rejects.toThrow();
    await expect(api('POST', '/api/registros/interpretar', { texto: 'hola' })).rejects.toThrow();
    expect(pendientes().map((p) => p.ruta)).toEqual(['/api/registros', '/api/tratamientos/3/tomas']);

    // Vuelve la señal: el primero se sube, el segundo el servidor lo rechaza (se descarta); la cola queda vacía.
    const enviados: string[] = [];
    const n = await subirPendientes(async (p) => {
      enviados.push(p.ruta);
      return new Response('{}', { status: p.ruta === '/api/registros' ? 201 : 404 });
    });
    expect(n).toBe(1);
    expect(enviados).toEqual(['/api/registros', '/api/tratamientos/3/tomas']);
    expect(pendientes()).toEqual([]);
  });

  it('si todavía no hay señal, la cola queda como estaba', async () => {
    localStorage.setItem('patty-cola', JSON.stringify([{ metodo: 'POST', ruta: '/api/registros', cuerpo: {}, creado: 1 }]));
    expect(await subirPendientes(async () => { throw new TypeError('sin red'); })).toBe(0);
    expect(pendientes()).toHaveLength(1);
  });

  it('qué se puede encolar, y lo contado con palabras se guarda aparte', () => {
    expect(sePuedeEncolar('POST', '/api/registros/varios')).toBe(true);
    expect(sePuedeEncolar('PUT', '/api/registros/12')).toBe(true);
    expect(sePuedeEncolar('DELETE', '/api/tratamientos/3/tomas?programada=x')).toBe(true);
    expect(sePuedeEncolar('POST', '/api/registros/foto')).toBe(false);
    guardarContado({ persona_id: 1, texto: 'Comí milanesas', fecha: '2026-10-27', momento: '2026-10-27T15:00:00Z' });
    const [c] = contadosPendientes();
    expect(c.texto).toBe('Comí milanesas');
    sacarContado(c.id);
    expect(contadosPendientes()).toEqual([]);
  });
});
