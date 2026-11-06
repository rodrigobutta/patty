import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Persona } from 'shared';
import { PaseosPendientes } from './PaseosPendientes';

const persona = { id: 7, zona_horaria: 'America/Argentina/Buenos_Aires' } as Persona;
const hace = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
let pendientes: unknown[] = [];
const pedidos: Array<{ metodo: string; ruta: string; cuerpo: unknown }> = [];

vi.mock('../estado', () => ({ useEstado: () => ({ avisar: vi.fn(), festejar: vi.fn() }) }));
vi.mock('../lib/analytics', () => ({ medir: () => {} }));
vi.mock('../ui/Mapa', () => ({ Mapa: () => <div data-testid="mapa" /> }));
vi.mock('../api', () => ({
  api: async (metodo: string, ruta: string, cuerpo?: unknown) => {
    pedidos.push({ metodo, ruta, cuerpo });
    return metodo === 'GET' ? { pendientes, lista: ['Paseo con los perros', 'Caminata', 'Mandados'], directa: 'Paseo con los perros' } : { ok: true };
  },
}));

beforeEach(() => {
  pedidos.length = 0;
  pendientes = [
    { id: 1, inicio: hace(30), fin: hace(29.8), metros: 380, camino: [] },
    { id: 2, inicio: hace(2), fin: hace(1.6), metros: 1300, camino: [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.4 }] },
  ];
});

describe('paseos sin anotar', () => {
  it('van en una sola tarjeta, todos con el mismo lugar para el mapa y con su día', async () => {
    const { container } = render(<PaseosPendientes persona={persona} vuelta={0} alAnotar={() => {}} />);
    await waitFor(() => expect(container.querySelectorAll('.paseo-item')).toHaveLength(2));
    expect(container.querySelectorAll('.paseo-pendiente')).toHaveLength(1);
    expect(container.querySelectorAll('.paseo-mapita')).toHaveLength(2);
    expect(screen.getAllByTestId('mapa')).toHaveLength(1);
    expect(screen.getByText(/Tenés 2 sin anotar/)).toBeTruthy();
    expect(screen.getByText('Ayer')).toBeTruthy();
    // "Otra cosa" abre el campo solo cuando se lo pide.
    expect(container.querySelector('.otro-puntual')).toBeNull();
    // La más probable va primero, pero sin marcar.
    expect([...container.querySelectorAll('.paseo-item')][0].querySelector('.paseo-opcion')?.textContent).toBe('Paseo con los perros');
    expect(container.querySelector('.activa')).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Otra cosa' })[0]);
    expect(container.querySelector('.otro-puntual')).not.toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'No anotar' })[0]);
    await waitFor(() => expect(container.querySelectorAll('.paseo-item')).toHaveLength(1));
    expect(pedidos.at(-1)).toMatchObject({ metodo: 'POST', ruta: '/api/paseos/1', cuerpo: { descartar: true } });
  });
});
