import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fuenteApagada, HojaActivar, WidgetApagado } from './FuenteApagada';
import type { EstadoTelefono } from '../lib/estadoTelefono';

const estado = (p: Partial<EstadoTelefono['permisos']>): EstadoTelefono => ({
  plataforma: 'android',
  permisos: { avisos: 'si', ubicacion: 'siempre', uso_apps: 'si', llamadas: 'si', salud: 3, ...p },
  activos: { ubicacion: true, clima: true, telefono: true, salud: true, recordatorios: true, encuesta: true, push: true },
  ultimos: { telefono: null, salud: null },
});

describe('fuentes sin permiso', () => {
  it('se apaga la que no tiene el permiso del todo', () => {
    expect(fuenteApagada('ubicacion', estado({ ubicacion: 'en_uso' }))).toBe(true);
    expect(fuenteApagada('ubicacion', estado({}))).toBe(false);
    expect(fuenteApagada('salud', estado({ salud: 0 }))).toBe(true);
    expect(fuenteApagada('telefono', estado({ llamadas: 'no' }))).toBe(true);
    expect(fuenteApagada('salud', null)).toBe(false); // todavía no se sabe: no se muestra gris
  });

  it('el widget gris abre la hoja con qué trae y cómo activarlo', async () => {
    const tocar = vi.fn();
    render(<WidgetApagado fuente="salud" alTocar={tocar} />);
    await userEvent.click(screen.getByRole('button', { name: /Tocá para activar/ }));
    expect(tocar).toHaveBeenCalled();
    render(<HojaActivar fuente="ubicacion" persona={{ id: 1, nombre: 'Ana', zona_horaria: 'America/Argentina/Buenos_Aires' } as never} alCerrar={() => {}} alActivar={() => {}} />);
    expect(screen.getByText('Tus viajes y cuánto tardaste')).toBeTruthy();
    expect(screen.getByText('3 viajes · 12 km')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activar' })).toBeTruthy();
  });
});
