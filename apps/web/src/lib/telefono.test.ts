import { medicionesDelDia } from './telefono';

const desde = new Date('2026-10-24T03:00:00Z');
const hasta = new Date('2026-10-25T03:00:00Z');

describe('datos del teléfono de un día', () => {
  it('manda el tiempo de pantalla, las apps de 5 minutos o más y las llamadas', () => {
    const m = medicionesDelDia(
      desde,
      hasta,
      { minutos: 95.6, apps: [{ paquete: 'com.instagram.android', nombre: 'Instagram', minutos: 40.2 }, { paquete: 'x', nombre: 'Calculadora', minutos: 2 }] },
      { entrantes: 2, salientes: 3, perdidas: 1, segundos: 610 },
    );
    expect(m.map((x) => [x.concepto, x.valor])).toEqual([
      ['Tiempo de pantalla', 96],
      ['Uso de Instagram', 40],
      ['Llamadas', 5],
      ['Llamadas perdidas', 1],
      ['Minutos en llamadas', 10],
    ]);
    expect(m[0]).toMatchObject({ categoria: 'pantalla', unidad: 'min', inicio: desde.toISOString(), fin: hasta.toISOString() });
    expect(m[2].categoria).toBe('comunicacion');
  });

  it('sin permiso de uso o de llamadas manda solo lo otro', () => {
    expect(medicionesDelDia(desde, hasta, null, { entrantes: 0, salientes: 0, perdidas: 0, segundos: 0 })).toHaveLength(3);
    expect(medicionesDelDia(desde, hasta, null, null)).toEqual([]);
  });
});
