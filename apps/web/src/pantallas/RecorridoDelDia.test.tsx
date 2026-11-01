import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Persona } from 'shared';
import { RecorridoDelDia } from './RecorridoDelDia';

const persona = { id: 1, nombre: 'Ana', zona_horaria: 'America/Argentina/Buenos_Aires' } as Persona;

const ruta = (hora: string, x: Record<string, unknown> = {}) => ({
  inicio: `2026-10-30T${hora}:00.000Z`,
  fin: `2026-10-30T${hora.slice(0, 2)}:30:00.000Z`,
  minutos: 25,
  km: 1.5,
  kmh: 3.6,
  pasos: null,
  metros: 1500,
  puntos: [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.4 }],
  origen: { lat: -34.6, lon: -58.4, lugar: 'Casa' },
  destino: { lat: -34.61, lon: -58.4, lugar: null },
  ...x,
});

let rutas: unknown[] = [];
const pedidos: string[] = [];
vi.mock('../estado', () => ({ useEstado: () => ({ usuario: { id: 1, rol: 'admin' } }) }));
vi.mock('../api', () => ({
  api: async (_m: string, r: string) => {
    pedidos.push(r);
    if (r.includes('/direccion')) return { direccion: 'Av. Cabildo 2100' };
    return { rutas, lugares: [{ nombre: 'Casa', lat: -34.6, lon: -58.4, radio_m: 100 }, { nombre: 'Club', lat: -34.7, lon: -58.5, radio_m: 100 }], viajes: 0, km: 0 };
  },
}));
let mapa: { rutas: Array<{ inicio: string }>; puntos: Array<{ etiqueta?: string }> };
vi.mock('../ui/Mapa', () => ({
  Mapa: (p: typeof mapa) => {
    mapa = p;
    return <div data-testid="mapa" />;
  },
}));

const verMapa = () => mapa.rutas.map((x) => x.inicio.slice(11, 16));

describe('el recorrido del día', () => {
  beforeEach(() => {
    pedidos.length = 0;
  });
  afterEach(() => {
    rutas = [];
  });

  it('un día sin datos no muestra nada', async () => {
    const { container } = render(<RecorridoDelDia persona={persona} fecha="2026-10-30" tipo="a_pie" />);
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    expect(container.innerHTML).toBe('');
  });

  it('con uno solo no hay nada que elegir: van sus datos directo', async () => {
    rutas = [ruta('12:00', { pasos: 2100 })];
    render(<RecorridoDelDia persona={persona} fecha="2026-10-30" tipo="a_pie" />);
    expect(await screen.findByText('Horario')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Todo' })).toBeNull();
    expect(screen.getByText('09:00 → 09:30')).toBeTruthy();
    expect(screen.getByText('25 min')).toBeTruthy();
    expect(screen.getByText(/1[.,]5 km$/)).toBeTruthy();
    expect(screen.getByText(/3[.,]6 km\/h/)).toBeTruthy();
    expect(screen.getByText(/^2[.,]?100$/)).toBeTruthy();
    expect(screen.getByText('Casa')).toBeTruthy();
    expect(await screen.findByText('Av. Cabildo 2100')).toBeTruthy();
    expect(verMapa()).toEqual(['12:00']);
  });

  it('primero todo junto; al elegir uno, su mapa y sus datos; volver a Todo es un toque', async () => {
    rutas = [ruta('12:00'), ruta('18:00', { km: 0.8, minutos: 12, origen: { lat: -34.7, lon: -58.5, lugar: 'Club' }, destino: { lat: -34.7, lon: -58.5, lugar: 'Club' } })];
    render(<RecorridoDelDia persona={persona} fecha="2026-10-30" tipo="a_pie" />);
    const selector = within(await screen.findByRole('group', { name: 'Cuál ver' }));
    expect(selector.getByRole('button', { name: 'Todo' }).getAttribute('aria-pressed')).toBe('true');
    expect(verMapa()).toEqual(['12:00', '18:00']);
    expect(mapa.puntos.map((p) => p.etiqueta)).toEqual(['Casa', 'Club']);
    expect(screen.queryByText('Horario')).toBeNull();
    expect(pedidos.some((p) => p.includes('/direccion'))).toBe(false); // las direcciones, recién al elegir

    await userEvent.click(selector.getByRole('button', { name: /15:00/ }));
    expect(verMapa()).toEqual(['18:00']);
    expect(mapa.puntos.map((p) => p.etiqueta)).toEqual(['Club']);
    expect(screen.getByText('15:00 → 15:30')).toBeTruthy();
    expect(screen.getByText('12 min')).toBeTruthy();
    expect(screen.queryByText('Pasos')).toBeNull(); // no se sabe: no aparece

    await userEvent.click(selector.getByRole('button', { name: 'Todo' }));
    expect(verMapa()).toEqual(['12:00', '18:00']);
    expect(screen.queryByText('Horario')).toBeNull();
  });
});
