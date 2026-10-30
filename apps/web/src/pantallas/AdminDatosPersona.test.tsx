import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pendientes = new Map<string, (x: unknown) => void>();
vi.mock('../api', () => ({
  api: vi.fn((_m: string, ruta: string) => {
    if (ruta === '/api/admin/datos/personas') return Promise.resolve([{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Beto' }].map((p) => ({ ...p, zona_horaria: 'UTC', duenos: null, registros: 0, mediciones: 0 })));
    return new Promise((res) => pendientes.set(ruta, res));
  }),
}));
vi.mock('../estado', () => ({ useEstado: () => ({ avisar: () => {} }) }));

import { AdminDatosPersona } from './AdminDatosPersona';

const ultimos = (nombre: string) => ({ datos: [], telefonos: [], fuentes: [{ id: 1, tipo: 'telefono', nombre, activo: true, ultimo_uso: null, creado: '', ultimo_dato: null, semana: 0 }] });
const cobertura = { hoy: '2026-10-30', origenes: [], dias: [{ fecha: '2026-10-30' }] };
const props = { fecha: null, alCambiar: () => {}, abrirTabla: () => {} };
const llega = (ruta: string, x: unknown) => act(async () => pendientes.get(ruta)?.(x));

describe('Persona 360', () => {
  beforeEach(() => pendientes.clear());

  it('una respuesta vieja de otra persona no pisa a la elegida', async () => {
    const { rerender } = render(<AdminDatosPersona {...props} persona={1} />);
    await waitFor(() => expect(pendientes.has('/api/admin/datos/personas/1/ultimos')).toBe(true));
    rerender(<AdminDatosPersona {...props} persona={2} />);
    await waitFor(() => expect(pendientes.has('/api/admin/datos/personas/2/ultimos')).toBe(true));
    // Llega primero la de la persona nueva y después, tarde, la de la anterior.
    await llega('/api/admin/datos/personas/2/ultimos', ultimos('Teléfono de Beto'));
    await llega('/api/admin/datos/personas/2/cobertura?dias=60', cobertura);
    await llega('/api/admin/datos/personas/1/ultimos', ultimos('Teléfono de Ana'));
    await llega('/api/admin/datos/personas/1/cobertura?dias=60', cobertura);
    expect(screen.getByText('Teléfono de Beto')).toBeTruthy();
    expect(screen.queryByText('Teléfono de Ana')).toBeNull();
  });
});
