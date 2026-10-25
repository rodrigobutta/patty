import { apodoDe } from 'shared';
import { describe, expect, it } from 'vitest';

describe('apodos', () => {
  it('saca el diminutivo del primer nombre, o usa el elegido', () => {
    expect(apodoDe('Rodrigo Butta')).toBe('Rodri');
    expect(apodoDe('maría josé pérez')).toBe('Majo');
    expect(apodoDe('Juan Pablo Gómez')).toBe('Juampi');
    expect(apodoDe('Ignacio')).toBe('Nacho');
    expect(apodoDe('Zoilo Ramírez')).toBe('Zoilo');
    expect(apodoDe('flor.garcia92@gmail.com')).toBe('Flor');
    expect(apodoDe('Rodrigo', 'Rodo')).toBe('Rodo');
    expect(apodoDe('Rodrigo', '  ')).toBe('Rodri');
  });
});
