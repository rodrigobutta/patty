// Las pantallas de alergias: los chips de "¿Algo puntual?", la tarjeta de la temporada, el aviso y Tus datos de salud.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Categoria, Persona } from 'shared';
import { api } from '../api';
import { Perfil } from '../pantallas/Perfil';
import { Puntuales } from '../pantallas/Puntuales';
import { TemporadaAlergia } from '../pantallas/TemporadaAlergia';
import { AvisoAlergia } from '../ui/AvisoAlergia';

const categorias = [{ id: 1, clave: 'animo' }, { id: 2, clave: 'sintoma' }] as Categoria[];
const estado = { categorias, festejar: vi.fn(), avisar: vi.fn(), recargar: vi.fn(async () => {}), usuario: { rol: 'editor' }, persona: null as Persona | null };
vi.mock('../estado', () => ({ useEstado: () => estado }));
vi.mock('../lib/clima', () => ({ anotarClima: vi.fn() }));

const persona = (mas: Partial<Persona> = {}): Persona => ({ id: 7, nombre: 'Ana', zona_horaria: 'America/Argentina/Buenos_Aires', nacimiento: null, notas: null, propia: true, ...mas });

let pedidos: Array<{ metodo: string; ruta: string; cuerpo: any }>;
/** Lo que contesta el servidor falso, por ruta. */
let respuestas: Record<string, unknown>;
beforeEach(() => {
  pedidos = [];
  respuestas = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, o: RequestInit) => {
    pedidos.push({ metodo: o.method ?? 'GET', ruta: String(url), cuerpo: o.body ? JSON.parse(String(o.body)) : undefined });
    const clave = Object.keys(respuestas).find((k) => String(url).includes(k));
    return new Response(JSON.stringify(clave ? respuestas[clave] : {}), { status: 200 });
  }));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const pedido = (ruta: string, metodo = 'POST') => pedidos.find((p) => p.metodo === metodo && p.ruta.includes(ruta));

describe('¿Algo puntual?', () => {
  it('«Con alergia» pregunta cuánto y se anota como el malestar', async () => {
    render(<Puntuales persona={persona()} alGuardar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Con alergia/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bastante' }));
    await waitFor(() => expect(pedido('/api/registros')).toBeTruthy());
    expect(pedido('/api/registros')!.cuerpo).toMatchObject({ persona_id: 7, concepto_nombre: 'Alergia', categoria_id: 2, intensidad: 6 });
  });

  it('uno propio se muestra y se anota en ánimo, con su nombre', async () => {
    render(<Puntuales persona={persona({ estados_puntuales: { propios: [{ nombre: 'Con mocos', emoji: '🤧' }] } })} alGuardar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Con mocos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Poco' }));
    await waitFor(() => expect(pedido('/api/registros')).toBeTruthy());
    expect(pedido('/api/registros')!.cuerpo).toMatchObject({ concepto_nombre: 'Con mocos', categoria_id: 1, intensidad: 3 });
  });

  it('al editar se saca uno de Patty, se agrega uno propio y se saca de nuevo', async () => {
    render(<Puntuales persona={persona()} alGuardar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sacar Con frío' }));
    await waitFor(() => expect(pedido('/api/personas/7', 'PUT')?.cuerpo.estados_puntuales.ocultos).toEqual(['Con frío']));
    await userEvent.type(screen.getByPlaceholderText(/Con mocos/), '🤧 con mocos{Enter}');
    await waitFor(() => expect(pedidos.at(-1)!.cuerpo.estados_puntuales.propios).toEqual([{ nombre: 'Con mocos', emoji: '🤧' }]));
    await userEvent.click(screen.getByRole('button', { name: 'Sacar Con mocos' }));
    await waitFor(() => expect(pedidos.at(-1)!.cuerpo.estados_puntuales.propios).toEqual([]));
    await userEvent.click(screen.getByRole('button', { name: 'Volver a poner Con frío' }));
    await waitFor(() => expect(pedidos.at(-1)!.cuerpo.estados_puntuales.ocultos).toEqual([]));
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.getByRole('button', { name: /Con frío/ })).toBeTruthy();
  });

  it('quien solo mira no puede editar', () => {
    estado.usuario = { rol: 'lector' };
    render(<Puntuales persona={persona()} alGuardar={() => {}} />);
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    estado.usuario = { rol: 'editor' };
  });
});

describe('la temporada de una alergia', () => {
  const primaveral = persona({ alergias: [{ tipo: 'estacional', nombre: '', estacion: 'primavera' }] });
  const tarjeta = (p: Persona, registros: any[] = []) =>
    render(<TemporadaAlergia persona={p} hoy="2026-11-01" registros={registros} categorias={categorias} alAnotar={() => {}} />);
  beforeEach(() => {
    respuestas['/api/seguimientos'] = { activos: [], plantillas: [] };
  });

  it('solo aparece en la temporada, según el hemisferio', () => {
    tarjeta({ ...primaveral, zona_horaria: 'Europe/Madrid' });
    expect(screen.queryByText(/Es primavera/)).toBeNull();
    cleanup();
    tarjeta(persona());
    expect(screen.queryByText(/¿Hoy te pica/)).toBeNull();
    cleanup();
    tarjeta(primaveral);
    expect(screen.getByText(/Es primavera y me contaste/)).toBeTruthy();
  });

  it('contestar anota la alergia con cuánto; «nada» no anota; y por hoy no pregunta más', async () => {
    tarjeta(primaveral);
    await userEvent.click(screen.getByRole('button', { name: 'Mucho' }));
    await waitFor(() => expect(pedido('/api/registros')?.cuerpo).toMatchObject({ concepto_nombre: 'Alergia', categoria_id: 2, intensidad: 9 }));
    await waitFor(() => expect(screen.queryByText(/Es primavera/)).toBeNull());
    cleanup();
    tarjeta(primaveral);
    expect(screen.queryByText(/Es primavera/)).toBeNull();
    localStorage.clear();
    pedidos.length = 0;
    cleanup();
    tarjeta(primaveral);
    await userEvent.click(screen.getByRole('button', { name: 'Nada' }));
    await waitFor(() => expect(screen.queryByText(/Es primavera/)).toBeNull());
    expect(pedido('/api/registros')).toBeUndefined();
  });

  it('si ya anotó la alergia hoy no pregunta', () => {
    tarjeta(primaveral, [{ concepto: 'Alergia' }]);
    expect(screen.queryByText(/Es primavera/)).toBeNull();
  });

  it('el recordatorio se prende solo si lo toca, y se puede callar por la temporada', async () => {
    tarjeta(primaveral);
    const boton = await screen.findByRole('button', { name: /Recordame/ });
    expect(pedido('/api/seguimientos')).toBeUndefined();
    await userEvent.click(boton);
    await waitFor(() => expect(pedido('/api/seguimientos')?.cuerpo.plantilla).toMatchObject({ nombre: 'Temporada de alergia', items: ['sentir', 'alergia'], horarios: ['20:00'], dias: 30 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Recordame/ })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /No me preguntes más/ }));
    expect(screen.queryByText(/Es primavera/)).toBeNull();
    cleanup();
    tarjeta(primaveral);
    expect(screen.queryByText(/Es primavera/)).toBeNull();
  });

  it('si el recordatorio ya está prendido no lo ofrece', async () => {
    respuestas['/api/seguimientos'] = { activos: [{ nombre: 'Temporada de alergia' }], plantillas: [] };
    tarjeta(primaveral);
    await waitFor(() => expect(pedido('/api/seguimientos', 'GET')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /Recordame/ })).toBeNull();
  });
});

describe('el aviso cuando algo choca', () => {
  it('aparece con cualquier cosa anotada que traiga el aviso, y se cierra', async () => {
    estado.persona = persona();
    render(<AvisoAlergia />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    respuestas['/api/registros'] = { id: 1, avisos_alergia: [{ que: 'Barrita de maní', alergia: 'Maní' }] };
    await act(() => api('POST', '/api/registros', {}));
    const aviso = await screen.findByRole('alertdialog');
    expect(aviso.textContent).toContain('Anotaste «Barrita de maní» y me contaste que tenés alergia a maní.');
    expect(aviso.textContent).toContain('consultalo con quien te atiende');
    // Sin recomendar remedios.
    expect(aviso.textContent).not.toMatch(/antihistam|tomá|tomate un/i);
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('nombra a la persona si lo anota otro', async () => {
    estado.persona = persona({ propia: false, nombre: 'Abuela' });
    render(<AvisoAlergia />);
    respuestas['/api/registros'] = [{ id: 1, avisos_alergia: [{ que: 'Amoxidal', alergia: 'Penicilina' }] }];
    await act(() => api('POST', '/api/registros/varios', {}));
    expect((await screen.findByRole('alertdialog')).textContent).toContain('Abuela tiene alergia a penicilina');
  });

  it('una lectura no avisa', async () => {
    render(<AvisoAlergia />);
    respuestas['/api/registros'] = { avisos_alergia: [{ que: 'x', alergia: 'y' }] };
    await api('GET', '/api/registros');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Tus datos de salud', () => {
  it('declara, muestra y saca alergias; lo que quedó escrito se guarda igual', async () => {
    render(<Perfil persona={persona({ alergias: [{ tipo: 'alimento', nombre: 'Maní' }] })} enLinea alTerminar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Primaveral/ }));
    await userEvent.click(screen.getByRole('button', { name: /A un medicamento/ }));
    await userEvent.type(screen.getByPlaceholderText(/penicilina/), 'penicilina');
    await userEvent.click(screen.getByRole('button', { name: 'Sacar Maní' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(pedido('/api/personas/7', 'PUT')).toBeTruthy());
    expect(pedido('/api/personas/7', 'PUT')!.cuerpo.alergias).toEqual([
      { tipo: 'estacional', nombre: '', estacion: 'primavera' },
      { tipo: 'medicamento', nombre: 'Penicilina' },
    ]);
  });

  it('en la bienvenida no se pregunta (es corta), y sus alergias no se pierden', () => {
    render(<Perfil persona={persona()} bienvenida alTerminar={() => {}} />);
    expect(screen.queryByText(/alguna alergia/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alergias' })).toBeNull();
  });
});
