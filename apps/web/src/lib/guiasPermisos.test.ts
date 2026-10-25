import { describe, expect, it } from 'vitest';
import { marcaDelTelefono, pasosPara } from './guiasPermisos';

describe('guías de permisos', () => {
  it('reconoce la marca por el modelo del navegador', () => {
    expect(marcaDelTelefono('Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A) AppleWebKit/537.36')).toBe('samsung');
    expect(marcaDelTelefono('Mozilla/5.0 (Linux; Android 13; Redmi Note 12 Build/TKQ1) AppleWebKit/537.36')).toBe('xiaomi');
    expect(marcaDelTelefono('Mozilla/5.0 (Linux; Android 14; moto g84 5G Build/U1TC) AppleWebKit/537.36')).toBe('motorola');
    expect(marcaDelTelefono('Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A) AppleWebKit/537.36')).toBe('pixel');
    expect(marcaDelTelefono('Mozilla/5.0 (Linux; Android 12; ONEPLUS A6013) AppleWebKit/537.36')).toBe('android');
  });
  it('da pasos distintos según la marca', () => {
    expect(pasosPara('ubicacion', 'samsung')[0]).toBe('Abrí Ajustes → Aplicaciones → Patty.');
    expect(pasosPara('ubicacion', 'iphone')[2]).toContain('«Siempre»');
    expect(pasosPara('telefono', 'iphone')).toEqual([]);
  });
});
