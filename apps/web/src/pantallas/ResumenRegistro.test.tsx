import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Persona, Registro } from 'shared';
import { ResumenRegistro } from './ResumenRegistro';
import { compartibleRegistro } from '../lib/tarjetasDelDia';

const persona = { id: 1, nombre: 'Ana', zona_horaria: 'UTC' } as Persona;
const ruta = (ini: string, fin: string, tipo: string) => ({
  inicio: ini, fin, minutos: 40, km: tipo === 'a_pie' ? 2.5 : 12, kmh: 4, pasos: 3200,
  puntos: [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.4 }],
  origen: { lat: -34.6, lon: -58.4, lugar: 'Casa' }, destino: { lat: -34.61, lon: -58.4, lugar: 'Plaza' },
});
vi.mock('../estado', () => ({ useEstado: () => ({ usuario: { id: 1, rol: 'admin' } }) }));
vi.mock('../api', () => ({
  api: async (_m: string, r: string) =>
    r.includes('tipo=a_pie')
      ? { rutas: [ruta('2026-11-10T09:02:00Z', '2026-11-10T09:42:00Z', 'a_pie'), ruta('2026-11-10T18:00:00Z', '2026-11-10T18:20:00Z', 'a_pie')], lugares: [], viajes: 0, km: 0 }
      : { rutas: [ruta('2026-11-10T13:00:00Z', '2026-11-10T13:30:00Z', 'vehiculo')], lugares: [], viajes: 0, km: 0 },
}));
let rutasDelMapa: unknown[] = [];
vi.mock('../ui/Mapa', () => ({
  Mapa: (p: { rutas: unknown[] }) => {
    rutasDelMapa = p.rutas;
    return <div data-testid="mapa" />;
  },
}));

const paseo = {
  id: 7, persona_id: 1, concepto_id: 1, concepto: 'Paseo con los perros', categoria_id: 3, inicio: '2026-11-10T09:00:00Z', fin: '2026-11-10T09:45:00Z',
  fecha: '2026-11-10', valor: null, intensidad: null, unidad: null, nota: 'Fuimos hasta la plaza', origen: 'manual',
  detalles: [{ pregunta: '¿Con correa?', respuestas: ['Sí'] }],
} as Registro;

describe('El resumen de algo anotado', () => {
  it('muestra lo que fue y el recorrido de ese rato, y desde ahí se edita', async () => {
    const alEditar = vi.fn();
    render(<ResumenRegistro persona={persona} registro={paseo} frase="Paseo con los perros" gente={['Juli']} alCerrar={() => {}} alEditar={alEditar} />);
    expect(screen.getByText('09:00 → 09:45')).toBeInTheDocument();
    expect(screen.getByText('Fuimos hasta la plaza')).toBeInTheDocument();
    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(screen.getByText('Juli')).toBeInTheDocument();
    // Solo la caminata de ese rato (no la de la tarde ni el viaje del mediodía), con sus datos.
    await screen.findByTestId('mapa');
    expect(rutasDelMapa).toHaveLength(1);
    expect(await screen.findByText('2,5 km')).toBeInTheDocument();
    expect(screen.getByText('Plaza')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }));
    expect(alEditar).toHaveBeenCalled();
  });

  it('sin recorrido en ese rato no hay mapa, y quien solo mira no tiene Editar', async () => {
    render(<ResumenRegistro persona={persona} registro={{ ...paseo, inicio: '2026-11-10T22:00:00Z', fin: null, nota: null }} frase="x" alCerrar={() => {}} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('mapa')).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });

  it('la imagen para compartir lleva lo del recorrido de ese rato, lo contestado y la nota, y lo avisa', async () => {
    const c = await compartibleRegistro({ persona, concepto: paseo.concepto, inicio: paseo.inicio, fin: paseo.fin, fecha: paseo.fecha, detalles: [{ nombre: 'Con quién', valor: 'Juli' }], nota: paseo.nota });
    if (c.tarjeta.tipo !== 'actividad') throw new Error('tipo');
    expect(c.tarjeta.datos.map((d) => d.valor)).toEqual(['45 min', '2,5 km', '4 km/h', '3.200']);
    expect(c.tarjeta.detalles).toEqual([{ nombre: 'Recorrido', valor: 'Casa → Plaza' }, { nombre: 'Con quién', valor: 'Juli' }]);
    expect(c.tarjeta.nota).toBe('Fuimos hasta la plaza');
    expect(c.tarjeta.camino?.length).toBe(2);
    expect(c.opcion?.sin).toMatchObject({ camino: undefined });
    expect(c.nota).toMatch(/lleva lo que anotaste/);
  });
});
