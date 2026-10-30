import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Hallazgo, Persona } from 'shared';
import { Patrones } from './Patrones';

const base: Hallazgo = {
  id: 1, persona_id: 1, causa_id: 1, efecto_id: 2, causa: 'Mate', efecto: 'Dolor de cabeza', causa_modo: 'presente', efecto_modo: 'presente', causa_tipo: 'evento', efecto_tipo: 'intensidad',
  desfase_dias: 1, soporte: 20, dias_causa: 40, dias_evaluados: 300, prob_con: 0.5, prob_sin: 0.1, lift: 5, p_valor: 0.001, q_valor: 0.01, puntaje: 5, explicacion: 'Algo de la IA.', estado: 'nuevo', detectado: '2026-10-30',
};
let lista: Hallazgo[] = [];

vi.mock('../estado', () => ({ useEstado: () => ({ sesion: { ia: false }, usuario: { id: 1, rol: 'admin' } }) }));
vi.mock('../api', () => ({ api: async (_m: string, ruta: string) => (ruta.startsWith('/api/hallazgos') ? lista : ruta.startsWith('/api/analisis') ? null : []) }));
vi.mock('./Semanas', () => ({ ListaSemanas: () => null }));
vi.mock('./ComentariosDePatty', () => ({ LoQueVoyNotando: () => null }));
vi.mock('./MapaDescubrir', () => ({ MapaDescubrir: () => null }));
vi.mock('./Calendario', () => ({ Calendario: () => null }));
vi.mock('./Buscar', () => ({ Buscar: () => null }));
vi.mock('./Numeros', () => ({ Numeros: () => null }));
vi.mock('./Preguntar', () => ({ Preguntar: () => null }));

const persona = { id: 1, nombre: 'Ana' } as Persona;

describe('la tarjeta de un patrón', () => {
  it('uno del motor no lleva marca de origen', async () => {
    lista = [{ ...base, origen: 'motor' }];
    render(<Patrones persona={persona} progreso={null} />);
    expect(await screen.findByText('Algo de la IA.')).toBeTruthy();
    expect(screen.queryByText('🦉 Lo sospechó Patty y los datos lo confirman')).toBeNull();
    expect(screen.getByText(/al día siguiente/)).toBeTruthy();
  });

  it('un antes y después de una hipótesis: su origen, su fecha, y antes y después en vez de con y sin', async () => {
    lista = [{ ...base, origen: 'hipotesis', fecha_desde: '2026-03-02', fecha_hasta: null, desfase_dias: 0, prob_con: 0.1, prob_sin: 0.5, lift: 0.2, soporte: 18, dias_causa: 180 }];
    render(<Patrones persona={persona} progreso={null} />);
    expect(await screen.findByText('🦉 Lo sospechó Patty y los datos lo confirman')).toBeTruthy();
    expect(screen.getByText(/desde el .*2026/)).toBeTruthy();
    expect(screen.getByText(/18 de 180 días/)).toBeTruthy();
    expect(screen.getByText('después 10%')).toBeTruthy();
    expect(screen.getByText('antes 50%')).toBeTruthy();
    expect(screen.getByText(/menos dolor de cabeza/)).toBeTruthy();
  });

  it('lo que ya no se ve se avisa', async () => {
    lista = [{ ...base, ya_no: true }];
    render(<Patrones persona={persona} progreso={null} />);
    expect(await screen.findByText('🕰️ Pasaba antes: en los últimos meses ya no se ve')).toBeTruthy();
  });
});
