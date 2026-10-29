import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HojaCompartir } from './HojaCompartir';

vi.mock('../estado', () => ({ useEstado: () => ({ usuario: { id: 7, rol: 'admin' } }) }));
vi.mock('../lib/tarjetaCompartir', () => ({ imagenDeTarjeta: async () => new Blob(['png'], { type: 'image/png' }) }));

describe('hoja para compartir', () => {
  it('muestra la imagen antes y la manda al menú de compartir con el link de invitación', async () => {
    URL.createObjectURL = () => 'blob:vista';
    URL.revokeObjectURL = () => {};
    const share = vi.fn(async (_d: ShareData) => {});
    Object.assign(navigator, { canShare: () => true, share });
    render(
      <HojaCompartir
        que="patron"
        tarjeta={{ tipo: 'grande', arriba: 'Mi racha en Patty', emoji: '🔥', numero: '12', texto: 'días seguidos anotando mi día' }}
        alCerrar={() => {}}
      />,
    );
    expect(screen.getByText('La imagen no lleva tu nombre ni lo que anotaste: solo esto.')).toBeTruthy();
    const vista = await screen.findByAltText('Así se va a ver la imagen');
    expect(vista.getAttribute('src')).toBe('blob:vista');
    await userEvent.click(screen.getByRole('button', { name: '📤 Compartir' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const datos = share.mock.calls[0][0];
    expect(datos.files?.[0].name).toBe('patty-patron.png');
    expect(datos.text).toMatch(/https:\/\/patty\.today\/\?ref=[0-9a-f]{8}$/);
  });

  it('lo que se puede sacar (el mapa) arma la otra imagen y manda esa', async () => {
    let n = 0;
    URL.createObjectURL = () => `blob:vista-${++n}`;
    URL.revokeObjectURL = () => {};
    const share = vi.fn(async (_d: ShareData) => {});
    Object.assign(navigator, { canShare: () => true, share });
    const base = { tipo: 'actividad' as const, arriba: 'Martes 27 de octubre', titulo: 'Caminata', cuando: '18:05 – 18:47', datos: [] };
    render(
      <HojaCompartir
        que="actividad"
        tarjeta={{ ...base, camino: [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.4 }] }}
        opcion={{ rotulo: 'Mostrar el mapa de por dónde fui', sin: base }}
        alCerrar={() => {}}
      />,
    );
    expect((await screen.findByAltText('Así se va a ver la imagen')).getAttribute('src')).toBe('blob:vista-1');
    await userEvent.click(screen.getByLabelText('Mostrar el mapa de por dónde fui'));
    await waitFor(() => expect(screen.getByAltText('Así se va a ver la imagen').getAttribute('src')).toBe('blob:vista-2'));
    await userEvent.click(screen.getByRole('button', { name: '📤 Compartir' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].files?.[0].name).toBe('patty-actividad.png');
  });
});
