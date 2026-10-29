import { describe, expect, it } from 'vitest';
import { anonimo } from './analytics';
import { invitadoPor, linkInvitacion, medirLlegadaInvitada, SITIO } from './compartir';
import { partirEnLineas } from './tarjetaCompartir';

describe('compartir', () => {
  it('parte los textos de la tarjeta en renglones que entran', () => {
    const medir = (s: string) => s.length * 10;
    expect(partirEnLineas('Comida frita', 200, medir)).toEqual(['Comida frita']);
    expect(partirEnLineas('Dolor de cabeza fuerte a la tarde', 120, medir)).toEqual(['Dolor de', 'cabeza', 'fuerte a la', 'tarde']);
    // Una palabra que no entra sola queda en su renglón (no se pierde).
    expect(partirEnLineas('Otorrinolaringología sí', 50, medir)).toEqual(['Otorrinolaringología', 'sí']);
    expect(partirEnLineas('  ', 100, medir)).toEqual([]);
  });

  it('la invitación lleva el código anónimo de quien invita (el comienzo de su id de Analytics)', async () => {
    expect(await linkInvitacion()).toBe(SITIO);
    const link = await linkInvitacion(42);
    expect(link).toMatch(/^https:\/\/patty\.today\/\?ref=[0-9a-f]{8}$/);
    expect(link.endsWith((await anonimo(42)).slice(0, 8))).toBe(true);
    expect(await linkInvitacion(43)).not.toBe(link);
  });

  it('al llegar con ?ref= recuerda quién invitó; con cualquier otra cosa, no', () => {
    localStorage.clear();
    history.replaceState(null, '', '/?ref=<script>');
    medirLlegadaInvitada();
    expect(invitadoPor()).toBeNull();
    history.replaceState(null, '', '/?ref=0A1B2C3D');
    medirLlegadaInvitada();
    expect(invitadoPor()).toBe('0a1b2c3d');
    history.replaceState(null, '', '/');
  });
});
