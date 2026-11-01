import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tomarCompetenciaPedida } from '../lib/competencias';
import { Competencias } from './Competencias';
import { InvitacionCompetencia } from './InvitacionCompetencia';

const pedidos: Array<{ metodo: string; ruta: string; cuerpo: unknown }> = [];
let respuestas: Record<string, unknown> = {};

vi.mock('../estado', () => ({ useEstado: () => ({ usuario: { id: 1, nombre: 'Ana', apodo: 'Anita', rol: 'editor' }, avisar: () => undefined }) }));
vi.mock('../api', () => ({
  api: async (metodo: string, ruta: string, cuerpo: unknown) => {
    pedidos.push({ metodo, ruta, cuerpo });
    return respuestas[`${metodo} ${ruta}`] ?? {};
  },
}));

beforeEach(() => {
  pedidos.length = 0;
  respuestas = {};
});
afterEach(cleanup);

const invitacion = { id: null, nombre: null, metrica: 'sueno', duracion: 'semana', estado: 'en_curso', dias_restantes: 5, ya_participas: false, invita: 'Beto', tu_apodo: 'Anita' };

describe('aceptar una invitación', () => {
  it('dice exactamente qué número van a ver, y no se suma hasta que se acepta', async () => {
    respuestas['GET /api/competencias/invitacion/ABCD2345'] = invitacion;
    respuestas['POST /api/competencias/invitacion/ABCD2345/aceptar'] = { id: 7 };
    const alCerrar = vi.fn();
    render(<InvitacionCompetencia codigo="ABCD2345" alCerrar={alCerrar} />);
    await screen.findByText(/Beto te desafía a «Horas de sueño de la semana»/);
    expect(screen.getByText('Tu apodo (Anita) y cuántas horas dormiste en total durante la competencia.')).toBeTruthy();
    expect(screen.getByText('Nunca ven tu ánimo, dolores, síntomas, remedios, comidas, peso, ubicación ni mapas.')).toBeTruthy();
    expect(screen.getByText(/Podés salir cuando quieras y deja de compartirse/)).toBeTruthy();
    expect(pedidos.some((p) => p.metodo === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Acepto, quiero jugar' }));
    await waitFor(() => expect(alCerrar).toHaveBeenCalled());
    expect(pedidos.at(-1)).toMatchObject({ metodo: 'POST', cuerpo: { acepto: true } });
    // Y pide abrir esa competencia.
    expect(tomarCompetenciaPedida()).toBe(7);
  });

  it('decir que no tampoco manda nada', async () => {
    respuestas['GET /api/competencias/invitacion/ABCD2345'] = invitacion;
    const alCerrar = vi.fn();
    render(<InvitacionCompetencia codigo="ABCD2345" alCerrar={alCerrar} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ahora no' }));
    expect(alCerrar).toHaveBeenCalled();
    expect(pedidos.some((p) => p.metodo === 'POST')).toBe(false);
  });
});

describe('competencias', () => {
  const lista = [{ id: 3, codigo: 'ABCD2345', nombre: null, metrica: 'pasos', duracion: 'semana', desde: '2026-11-01', hasta: '2026-11-07', estado: 'en_curso', dias_restantes: 3, participantes: 2, mi_posicion: null, mi_valor: null }];

  it('la tabla muestra "sin dato", no cero, y al salir pide confirmación', async () => {
    respuestas['GET /api/competencias'] = lista;
    respuestas['GET /api/competencias/3'] = { ...lista[0], posiciones: [{ posicion: 1, apodo: 'Beto', valor: 9000, yo: false }, { posicion: null, apodo: 'Anita', valor: null, yo: true }] };
    render(<Competencias />);
    fireEvent.click(await screen.findByText('Pasos de la semana'));
    await screen.findByText('Anita (vos)');
    expect(screen.getByText('sin dato')).toBeTruthy();
    expect(screen.getByText(/Todavía no me llegó tu número/)).toBeTruthy();
    // Sin número no hay placa, pero se puede invitar.
    expect(screen.queryByRole('button', { name: /Compartir/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Invitar con el link/ })).toBeTruthy();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Salir de la competencia' }));
    expect(confirmar).toHaveBeenCalled();
    expect(pedidos.some((p) => p.metodo === 'DELETE')).toBe(false);
    confirmar.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salir de la competencia' }));
    await waitFor(() => expect(pedidos.at(-2)).toMatchObject({ metodo: 'DELETE', ruta: '/api/competencias/3/participacion' }));
    confirmar.mockRestore();
  });

  it('crear: solo ofrece hábitos, avisa qué se comparte y manda la aceptación', async () => {
    respuestas['GET /api/competencias'] = [];
    respuestas['POST /api/competencias'] = { id: 9, codigo: 'ABCD2345' };
    respuestas['GET /api/competencias/9'] = { ...lista[0], id: 9, metrica: 'km', duracion: 'mes', posiciones: [{ posicion: null, apodo: 'Anita', valor: null, yo: true }] };
    render(<Competencias />);
    fireEvent.click(await screen.findByRole('button', { name: /Crear una competencia/ }));
    const metricas = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }));
    expect(metricas).toHaveLength(5);
    expect(metricas.map((b) => b.textContent).join(' ')).not.toMatch(/peso|comida|ayuno|calor/i);
    fireEvent.click(screen.getByRole('button', { name: /Km a pie/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Un mes' }));
    expect(screen.getByText('Tu apodo (Anita) y cuántos km hiciste a pie en total durante la competencia (sin mapas ni por dónde fuiste).')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar y crear' }));
    await waitFor(() => expect(pedidos.find((p) => p.metodo === 'POST')).toMatchObject({ cuerpo: { metrica: 'km', duracion: 'mes', acepto: true } }));
    await screen.findByText(/jugás en soledad/);
  });

  it('un link pegado abre la invitación; otra cosa, no', async () => {
    respuestas['GET /api/competencias'] = [];
    respuestas['GET /api/competencias/invitacion/ABCD2345'] = invitacion;
    render(<Competencias />);
    const campo = await screen.findByRole('textbox');
    fireEvent.change(campo, { target: { value: 'cualquier cosa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await screen.findByText('Eso no parece un link de competencia.');
    fireEvent.change(campo, { target: { value: 'https://patty.today/app/?competir=abcd2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await screen.findByText(/Beto te desafía/);
  });
});
