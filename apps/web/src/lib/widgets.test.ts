import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limpiarAjustesWidgets, moverWidget, ordenDeWidgets, ponerWidgetVisible, vecinoDeWidget, WIDGETS, widgetsVisibles, type AjustesWidgets } from 'shared';
import { ErrorApi } from '../api';
import { olvidarGuardado } from './guardado';
import { cambiarWidgets, olvidarLoVistoDelServidor, useAjustesWidgets } from './widgets';

const pedidos: unknown[] = [];
let respuesta: () => Promise<unknown> = async () => ({});
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  api: async (_m: string, _r: string, cuerpo: unknown) => {
    pedidos.push(cuerpo);
    return respuesta();
  },
}));

describe('el orden de los widgets', () => {
  it('sin nada elegido, todos en el orden de siempre', () => {
    expect(ordenDeWidgets({})).toEqual([...WIDGETS]);
    expect(ordenDeWidgets(null)).toEqual([...WIDGETS]);
    expect(widgetsVisibles(undefined)).toEqual([...WIDGETS]);
  });

  it('un widget nuevo (que no estaba cuando se eligió) aparece al final y visible', () => {
    const elegido = { orden: ['sueno', 'clima', 'remedios', 'animo', 'ubicacion', 'pasos', 'telefono', 'reuniones', 'comida'] };
    const orden = ordenDeWidgets(elegido);
    expect(orden.slice(0, 3)).toEqual(['sueno', 'clima', 'remedios']);
    expect(orden.slice(-3)).toEqual(['cuerpo', 'escuchas', 'malestares']);
    expect(widgetsVisibles(elegido)).toContain('malestares');
  });

  it('lo guardado por una versión más nueva no se muestra, pero no se pierde al mover', () => {
    const a = { orden: ['clima', 'futuro', 'sueno'], ocultos: ['otro_futuro'] };
    expect(ordenDeWidgets(a)).not.toContain('futuro');
    const movido = moverWidget(a, 'sueno', 'clima');
    expect(movido.orden!.slice(0, 3)).toEqual(['sueno', 'clima', 'futuro']);
    expect(ponerWidgetVisible(movido, 'clima', false).ocultos).toEqual(['otro_futuro', 'clima']);
  });

  it('mover: hacia atrás queda antes del destino y hacia adelante, después', () => {
    const a = { orden: [...WIDGETS] };
    expect(ordenDeWidgets(moverWidget(a, 'sueno', 'clima')).slice(2, 4)).toEqual(['sueno', 'clima']);
    expect(ordenDeWidgets(moverWidget(a, 'clima', 'pasos')).slice(2, 5)).toEqual(['ubicacion', 'pasos', 'clima']);
    expect(ordenDeWidgets(moverWidget(a, 'clima', 'clima'))).toEqual([...WIDGETS]);
  });

  it('subir y bajar saltan a los ocultos y a los que no se ven', () => {
    const a = ponerWidgetVisible({ orden: ['clima', 'pasos', 'sueno', 'comida'] }, 'pasos', false);
    const mostrados = widgetsVisibles(a).filter((w) => ['clima', 'sueno', 'comida'].includes(w));
    expect(vecinoDeWidget(mostrados, 'sueno', -1)).toBe('clima');
    expect(vecinoDeWidget(mostrados, 'clima', -1)).toBeNull();
    expect(vecinoDeWidget(mostrados, 'comida', 1)).toBeNull();
    // El oculto conserva su lugar entre los que se movieron.
    expect(ordenDeWidgets(moverWidget(a, 'sueno', 'clima')).slice(0, 3)).toEqual(['sueno', 'clima', 'pasos']);
  });

  it('ocultar y volver a mostrar', () => {
    const a = ponerWidgetVisible({}, 'clima', false);
    expect(widgetsVisibles(a)).not.toContain('clima');
    expect(ordenDeWidgets(a)).toContain('clima');
    expect(widgetsVisibles(ponerWidgetVisible(a, 'clima', true))).toContain('clima');
  });

  it('solo se acepta la forma correcta, sin repetidos', () => {
    expect(limpiarAjustesWidgets({ orden: ['clima', 'clima', 'futuro'], ocultos: [], x: 1 })).toEqual({ orden: ['clima', 'futuro'], ocultos: [] });
    for (const malo of [null, 'x', [], { orden: 'clima' }, { orden: [1] }, { ocultos: ['<b>'] }, { orden: Array.from({ length: 61 }, (_, i) => `w${i}`) }]) {
      expect(limpiarAjustesWidgets(malo)).toBeNull();
    }
  });
});

describe('lo elegido en el teléfono y en el servidor', () => {
  beforeEach(() => {
    olvidarGuardado();
    olvidarLoVistoDelServidor();
    pedidos.length = 0;
    respuesta = async () => ({});
  });
  const persona = (widgets?: AjustesWidgets) => ({ id: 7, widgets });

  it('un cambio se ve ya y se sube; el servidor no lo pisa con lo que tenía de antes', async () => {
    const { result, rerender } = renderHook((p) => useAjustesWidgets(p), { initialProps: persona({ orden: ['clima'] }) });
    await act(() => cambiarWidgets(7, { orden: ['sueno'] }));
    expect(result.current).toEqual({ orden: ['sueno'] });
    expect(pedidos).toEqual([{ widgets: { orden: ['sueno'] } }]);
    rerender(persona({ orden: ['clima'] }));
    expect(result.current).toEqual({ orden: ['sueno'] });
  });

  it('lo cambiado en otro dispositivo gana si acá no hay nada pendiente', async () => {
    const { result, rerender } = renderHook((p) => useAjustesWidgets(p), { initialProps: persona({ orden: ['clima'] }) });
    await waitFor(() => expect(result.current).toEqual({ orden: ['clima'] }));
    rerender(persona({ orden: ['comida'] }));
    expect(result.current).toEqual({ orden: ['comida'] });
  });

  it('sin señal queda pendiente, gana a lo del servidor y se sube al volver', async () => {
    respuesta = () => Promise.reject(new ErrorApi('sin señal', 0));
    const { result, rerender } = renderHook((p) => useAjustesWidgets(p), { initialProps: persona({ orden: ['clima'] }) });
    await act(() => cambiarWidgets(7, { orden: ['sueno'] }));
    rerender(persona({ orden: ['comida'] }));
    expect(result.current).toEqual({ orden: ['sueno'] });
    await act(async () => {}); // Que termine el reintento que acaba de fallar.
    respuesta = async () => ({});
    pedidos.length = 0;
    await act(async () => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(pedidos).toEqual([{ widgets: { orden: ['sueno'] } }]));
  });

  it('si el servidor lo rechaza vuelve a lo de antes y avisa', async () => {
    respuesta = () => Promise.reject(new ErrorApi('No podés', 403));
    const { result } = renderHook((p) => useAjustesWidgets(p), { initialProps: persona({ orden: ['clima'] }) });
    await act(async () => {
      await expect(cambiarWidgets(7, { orden: ['sueno'] })).rejects.toThrow('No podés');
    });
    expect(result.current).toEqual({ orden: ['clima'] });
  });
});
