import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TendenciaDia, Tendencias } from 'shared';
import { TendenciasDelDia } from './TendenciasDelDia';
import { api } from '../api';
import { alPedirIrAlDia, fechaPedidaParaVer, olvidarFechaPedida } from '../lib/avisos';
import { guardar, olvidarGuardado } from '../lib/guardado';

vi.mock('../api', () => ({ api: vi.fn() }));
const pedir = vi.mocked(api);

const persona = { id: 1, nombre: 'Ana', zona_horaria: 'America/Argentina/Buenos_Aires' } as never;
const dia = (fecha: string, d: Partial<TendenciaDia> = {}): TendenciaDia => ({ fecha, animo: null, sueno: null, pasos: null, ejercicio: null, pantalla: null, temperatura: null, pulso: null, malestares: null, nombres_malestares: [], ...d });
const FECHAS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const semana = (d: Record<string, Partial<TendenciaDia>> = {}): Tendencias => ({ desde: FECHAS[0], hasta: FECHAS[6], dias: FECHAS.map((f) => dia(f, d[f])) });
const CON_DATOS = semana({
  '2026-10-30': { animo: 4, sueno: 6, pasos: 3000, malestares: 1, nombres_malestares: ['Dolor de cabeza'] },
  '2026-10-31': { animo: 8, sueno: 7.5, pasos: 8432 },
});
const VACIA = semana();

beforeEach(() => {
  pedir.mockReset();
  olvidarGuardado();
  olvidarFechaPedida();
  window.scrollTo = vi.fn();
});

describe('Cómo venís', () => {
  it('sin datos suficientes da un mensaje claro, no un gráfico vacío', async () => {
    pedir.mockResolvedValue(semana({ '2026-10-30': { pasos: 100 } }));
    const { container } = render(<TendenciasDelDia persona={persona} vuelta={0} />);
    expect(await screen.findByText(/pocos datos de esta semana/)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('dibuja solo lo que tiene datos reales, en el principal y en los chicos', async () => {
    pedir.mockResolvedValue(CON_DATOS);
    const { container } = render(<TendenciasDelDia persona={persona} vuelta={0} />);
    await screen.findByRole('group', { name: /Varias cosas a la vez/ });
    const tiras = [...container.querySelectorAll('[data-tira]')].map((e) => e.getAttribute('data-tira'));
    expect(tiras).toEqual(['animo', 'sueno', 'pasos']);
    expect([...container.querySelectorAll('[data-chico]')].map((e) => e.getAttribute('data-chico'))).toEqual(tiras);
    // Los valores reales, no los normalizados: el promedio en horas.
    expect(screen.getByText('6 h 45 min')).toBeInTheDocument();
  });

  it('tocar un día muestra sus valores con unidad, y lleva a ese día', async () => {
    pedir.mockResolvedValue(CON_DATOS);
    const yendo = vi.fn();
    const soltar = alPedirIrAlDia(yendo);
    render(<TendenciasDelDia persona={persona} vuelta={0} />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^viernes,? 30 de octubre/ }));
    const detalle = screen.getByRole('heading', { name: /^viernes,? 30 de octubre/ }).parentElement!;
    expect(detalle).toHaveTextContent('4 /10');
    expect(detalle).toHaveTextContent('6 h');
    expect(detalle).toHaveTextContent('3.000 pasos');
    // Un malestar suelto no alcanza para dibujarse, pero ese día pasó y se dice.
    expect(detalle).toHaveTextContent('Dolor de cabeza');
    expect(detalle).not.toHaveTextContent('Ejercicio');
    await u.click(screen.getByRole('button', { name: 'Ver este día' }));
    expect(fechaPedidaParaVer()).toBe('2026-10-30');
    expect(yendo).toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalled();
    soltar();
  });

  it('un día sin un dato dice "sin dato", no cero', async () => {
    pedir.mockResolvedValue(semana({ '2026-10-30': { animo: 4, sueno: 6 }, '2026-10-31': { animo: 8, sueno: 7 }, '2026-11-01': { animo: 7 } }));
    render(<TendenciasDelDia persona={persona} vuelta={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /^domingo,? 1 de noviembre/ }));
    const detalle = screen.getByRole('heading', { name: /^domingo,? 1 de noviembre/ }).parentElement!;
    expect(detalle).toHaveTextContent('sin dato');
  });

  it('abre con lo guardado y lo actualiza en segundo plano', async () => {
    guardar('/api/estadisticas/tendencias?persona=1&dias=7', CON_DATOS);
    let contestar!: (t: Tendencias) => void;
    pedir.mockReturnValue(new Promise((r) => { contestar = r as never; }));
    const { container } = render(<TendenciasDelDia persona={persona} vuelta={0} />);
    // Sin esperar a la red ya se ve el gráfico.
    expect(container.querySelector('[data-tira="animo"]')).not.toBeNull();
    await act(async () => contestar(VACIA));
    expect(screen.getByText(/pocos datos de esta semana/)).toBeInTheDocument();
  });

  it('el selector pide el mes, con su propio guardado', async () => {
    pedir.mockResolvedValue(VACIA);
    render(<TendenciasDelDia persona={persona} vuelta={0} />);
    await screen.findByText(/pocos datos de esta semana/);
    await userEvent.click(screen.getByRole('button', { name: 'Mes' }));
    await waitFor(() => expect(pedir).toHaveBeenCalledWith('GET', '/api/estadisticas/tendencias?persona=1&dias=30'));
    expect(await screen.findByText(/pocos datos de este mes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('una respuesta vieja no pisa al período elegido después', async () => {
    let semanaTarde!: (t: Tendencias) => void;
    pedir.mockImplementation((_m, ruta) => (ruta.endsWith('dias=7') ? new Promise((r) => { semanaTarde = r as never; }) : Promise.resolve({ ...VACIA })) as never);
    const { container } = render(<TendenciasDelDia persona={persona} vuelta={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mes' }));
    await screen.findByText(/pocos datos de este mes/);
    await act(async () => semanaTarde(CON_DATOS));
    expect(container.querySelector('[data-tira]')).toBeNull();
  });

  it('sin red y sin nada guardado lo dice', async () => {
    pedir.mockRejectedValue(new Error('sin red'));
    render(<TendenciasDelDia persona={persona} vuelta={0} />);
    expect(await screen.findByText(/No pude traer los gráficos/)).toBeInTheDocument();
  });

  it('sin red pero con lo guardado, sigue mostrándolo', async () => {
    guardar('/api/estadisticas/tendencias?persona=1&dias=7', CON_DATOS);
    pedir.mockRejectedValue(new Error('sin red'));
    const { container } = render(<TendenciasDelDia persona={persona} vuelta={0} />);
    await waitFor(() => expect(pedir).toHaveBeenCalled());
    expect(container.querySelector('[data-tira="animo"]')).not.toBeNull();
  });
});
