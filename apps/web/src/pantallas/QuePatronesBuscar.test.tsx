import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Persona } from 'shared';
import { QuePatronesBuscar } from './QuePatronesBuscar';

const pedidos: Array<{ ruta: string; cuerpo: unknown }> = [];
vi.mock('../estado', () => ({ useEstado: () => ({ recargar: async () => undefined }) }));
vi.mock('../api', () => ({
  api: async (_m: string, ruta: string, cuerpo: unknown) => {
    pedidos.push({ ruta, cuerpo });
    return {};
  },
}));

describe('qué patrones buscar', () => {
  it('los componentes de lo que comés vienen prendidos, y se apagan', async () => {
    render(<QuePatronesBuscar persona={{ id: 1, nombre: 'Ana', patrones: {} } as Persona} puedeEscribir />);
    expect(screen.getByText('🧂 Componentes de lo que comés')).toBeTruthy();
    const interruptor = screen.getByRole('checkbox', { name: /Patty estima de qué están hechas tus comidas/ }) as HTMLInputElement;
    expect(interruptor.checked).toBe(true);
    fireEvent.click(interruptor);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect((pedidos[0].cuerpo as { patrones: { componentes: boolean } }).patrones.componentes).toBe(false);
  });
});
