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
});
