import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Persona, QuincenaSueno as Quincena } from 'shared';
import { QuincenaSueno } from './GraficoSueno';

let respuesta: Quincena;
vi.mock('../api', () => ({ api: async () => respuesta }));
vi.mock('../estado', () => ({ useEstado: () => ({}) }));

const noches = (horas: Array<number | null>) => horas.map((h, i) => ({ fecha: `2026-10-${String(20 + i).padStart(2, '0')}`, horas: h, calidad: null }));

describe('el sueño de las últimas dos semanas', () => {
  it('dice el promedio, contra las dos semanas de antes, la hora de dormir y la nota', async () => {
    respuesta = { noches: noches([7, 7.5, null, 6.5, ...Array(11).fill(7)]), horas: 7, antes: 6.5, calidad: 6.4, acostarse: 24 * 60 + 40 };
    const { container } = render(<QuincenaSueno persona={{ id: 1 } as Persona} fecha="2026-11-03" />);
    await screen.findByText('Dormiste 7 h por noche, en promedio');
    expect(screen.getByText('30 min más que las dos semanas anteriores')).toBeTruthy();
    expect(screen.getByText('Te solés dormir cerca de las 00:40')).toBeTruthy();
    expect(screen.getByText(/14 de 15 noches/)).toBeTruthy();
    expect(container.querySelectorAll('.quincena-barras span')).toHaveLength(15);
    expect(container.querySelectorAll('.quincena-barras span.sin')).toHaveLength(1);
  });

  it('con menos de tres noches no muestra nada', async () => {
    respuesta = { noches: noches([7, null, 6, ...Array(12).fill(null)]), horas: 6.5, antes: null, calidad: null, acostarse: null };
    const { container } = render(<QuincenaSueno persona={{ id: 1 } as Persona} fecha="2026-11-03" />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
