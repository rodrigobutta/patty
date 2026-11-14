import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registro } from 'shared';
import { LineaDelDia } from './MalestaresAbiertos';
import { api } from '../api';

vi.mock('../api', () => ({ api: vi.fn() }));
vi.mock('../estado', () => ({ useEstado: () => ({ festejar: () => {}, avisar: () => {} }) }));
const pedir = vi.mocked(api);

const persona = { id: 1, nombre: 'Ana', zona_horaria: 'America/Argentina/Buenos_Aires' } as never;
const categorias = [{ id: 1, clave: 'actividad' }, { id: 2, clave: 'sintoma' }] as never;
let id = 0;
const reg = (concepto: string, inicio: string, fin: string, categoria_id = 1, d: Partial<Registro> = {}): Registro =>
  ({ id: ++id, persona_id: 1, concepto_id: 1, concepto, categoria_id, inicio, fin, fecha: '2026-11-10', valor: null, intensidad: null, unidad: null, nota: null, origen: 'manual', ...d }) as Registro;

beforeEach(() => {
  pedir.mockReset();
  pedir.mockResolvedValue([]);
});

describe('La línea del día', () => {
  it('la misma actividad de varias veces va en una sola fila, con una barra por vez', async () => {
    const registros = [
      reg('Caminar', '2026-11-10T09:00:00-03:00', '2026-11-10T09:30:00-03:00'),
      reg('Leer', '2026-11-10T11:00:00-03:00', '2026-11-10T12:00:00-03:00'),
      reg('Caminar', '2026-11-10T18:00:00-03:00', '2026-11-10T18:45:00-03:00'),
      reg('Dolor de cabeza', '2026-11-10T13:00:00-03:00', '2026-11-10T14:00:00-03:00', 2, { intensidad: 3 }),
      reg('Dolor de cabeza', '2026-11-10T20:00:00-03:00', '2026-11-10T21:00:00-03:00', 2, { intensidad: 3 }),
    ];
    const { container } = render(<LineaDelDia persona={persona} fecha="2026-11-10" hoy="2026-11-11" registros={registros} categorias={categorias} vuelta={0} alCambiar={() => {}} alEditar={() => {}} />);
    const items = container.querySelectorAll('.gantt-item');
    // Caminar (2 veces) + Leer + los dos dolores, cada uno aparte.
    expect(items).toHaveLength(4);
    const caminar = [...items].find((i) => i.textContent?.includes('Caminar'))!;
    expect(caminar.querySelectorAll('.gantt-barra')).toHaveLength(2);
    expect(caminar.textContent).toContain('×2');
    expect(caminar.textContent).toContain('2 veces');
    // Al tocarla, cada vez con su horario y su botón de editar.
    await userEvent.click(screen.getByRole('button', { name: /Caminar/ }));
    expect(caminar.querySelectorAll('.gantt-vez')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Editar/ })).toHaveLength(2);
  });
});
