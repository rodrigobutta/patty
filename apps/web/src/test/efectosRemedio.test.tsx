// Cómo se ve lo que Patty tiene en cuenta de lo que se toma: rotulado como IA, como posibilidad y sin inventar lo que no sabe.
import { render, screen, waitFor } from '@testing-library/react';
import { esTextoSeguro, type Persona, type RemedioVigilado, type SenalEfecto } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EfectosVigilados, SenalesEfecto } from '../pantallas/EfectosRemedio';

const api = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ api }));
vi.mock('../estado', () => ({ useEstado: () => ({ avisar: () => {} }) }));

const persona = { id: 1, zona_horaria: 'America/Argentina/Buenos_Aires' } as Persona;
const remedio = (r: Partial<RemedioVigilado>): RemedioVigilado => ({ clave: 'x', nombre: 'X', tratamiento_ids: [1], suplemento_ids: [], estado: 'conocido', efectos: [], interacciones: [], ...r });

describe('los efectos de un remedio', () => {
  it('muestra lo que vigila, destaca lo urgente y lo rotula como información general de IA', () => {
    const { container } = render(<EfectosVigilados remedio={remedio({ efectos: [{ nombre: 'Mareos', urgente: false }, { nombre: 'Falta de aire', urgente: true }], interacciones: [{ con: 'Alcohol', detalle: 'Puede dar más sueño.', tambien_toma: true }] })} />);
    expect(screen.getByText('Mareos')).toBeTruthy();
    expect(screen.getByText('Falta de aire').closest('ul')?.className).toContain('consultar');
    const texto = container.textContent ?? '';
    expect(texto).toContain('generada con IA');
    expect(texto).toContain('no un diagnóstico');
    expect(texto).toContain('hablalo con tu médico');
    expect(esTextoSeguro(texto)).toBe(true);
  });

  it('si no se sabe, dice que no se sabe; si falta averiguar, lo dice', () => {
    const a = render(<EfectosVigilados remedio={remedio({ estado: 'desconocido' })} />);
    expect(a.container.textContent).toContain('No tengo información');
    a.unmount();
    const b = render(<EfectosVigilados remedio={remedio({ estado: 'pendiente' })} />);
    expect(b.container.textContent).toContain('Todavía no tengo información');
  });
});

describe('cuando lo anotado coincide con un efecto', () => {
  beforeEach(() => api.mockReset());
  const senal: SenalEfecto = { registro_id: 9, concepto_id: 3, sintoma: 'Dolor de panza', fecha: '2026-10-30', clave: 'ibuprofeno', remedio: 'Ibuprofeno', efecto: 'Dolor de panza', urgente: false };

  it('lo señala como posibilidad, con el médico y sin sugerir cambiar nada', async () => {
    api.mockResolvedValue([senal]);
    const { container } = render(<SenalesEfecto persona={persona} fecha="2026-10-30" />);
    await waitFor(() => expect(container.textContent).toContain('puede tener relación con Ibuprofeno'));
    expect(api).toHaveBeenCalledWith('GET', '/api/remedios/senales?persona=1&fecha=2026-10-30');
    expect(container.textContent).toContain('Lo tengo en cuenta');
    expect(container.textContent).toContain('tu médico');
    expect(esTextoSeguro(container.textContent ?? '')).toBe(true);
  });

  it('lo urgente se destaca, y sin señales no muestra nada', async () => {
    api.mockResolvedValue([{ ...senal, urgente: true }]);
    const a = render(<SenalesEfecto persona={persona} registroId={9} />);
    await waitFor(() => expect(a.container.querySelector('.senal-efecto.urgente')).toBeTruthy());
    expect(a.container.textContent).toContain('guardia');
    a.unmount();
    api.mockResolvedValue([]);
    const b = render(<SenalesEfecto persona={persona} registroId={9} />);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(b.container.textContent).toBe('');
  });
});
