import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsejoDelDia, Meta, Persona } from 'shared';
import { planBase } from 'shared';
import { MetaDelDia } from './MetaDelDia';
import { Metas, textoMedida } from './Metas';

const persona = { id: 7 } as Persona;
const meta = (x: Partial<Meta> = {}): Meta => ({ id: 1, persona_id: 7, texto: 'Dormir mejor', emoji: '😴', clave: 'dormir_mejor', estado: 'activa', plan: planBase('Dormir mejor', 'dormir_mejor', 'es'), medico: false, medidas: [], ...x });
const consejo = (x: Partial<ConsejoDelDia> = {}): ConsejoDelDia => ({ id: 9, meta_id: 1, fecha: '2026-11-01', tipo: 'pregunta', texto: '¿Te acostaste temprano?', estado: 'nuevo', respuesta: null, objetivo: 'Dormir mejor', emoji: '😴', medida: null, otros: 0, ...x });

let lista: Meta[] = [];
let delDia: ConsejoDelDia | null = null;
let conIa = false;
const pedidos: Array<{ metodo: string; ruta: string; cuerpo: any }> = [];
const avisar = vi.fn();
const festejar = vi.fn();
const irAMas = vi.fn();

vi.mock('../estado', () => ({ useEstado: () => ({ avisar, festejar, sesion: { ia: conIa } }) }));
vi.mock('../lib/analytics', () => ({ medir: () => {} }));
vi.mock('../lib/navegar', () => ({ irAMas: (s: string) => irAMas(s) }));
vi.mock('../api', () => ({
  api: async (metodo: string, ruta: string, cuerpo?: any) => {
    pedidos.push({ metodo, ruta, cuerpo });
    if (ruta.startsWith('/api/metas/dia')) return metodo === 'GET' ? delDia : { ok: true };
    if (metodo === 'GET') return lista;
    if (ruta.endsWith('/plan')) return { ...meta({ id: Number(ruta.split('/')[3]), plan: { ...planBase('x', null, 'es'), resumen: 'Plan a medida', origen: 'ia' } }), aviso: undefined };
    if (metodo === 'POST') return meta({ id: 2, texto: cuerpo.texto, clave: cuerpo.clave ?? null });
    if (metodo === 'PUT') return meta({ estado: cuerpo.estado });
    return { ok: true };
  },
}));

beforeEach(() => {
  lista = [];
  delDia = null;
  conIa = false;
  pedidos.length = 0;
  vi.clearAllMocks();
});

describe('Objetivos en Más', () => {
  it('sin objetivos muestra las sugerencias, y elegir una la crea y muestra su plan', async () => {
    render(<Metas persona={persona} puedeEscribir />);
    fireEvent.click(await screen.findByRole('button', { name: /Comer menos grasas/ }));
    await screen.findByText('Activos');
    expect(pedidos.find((p) => p.metodo === 'POST')?.cuerpo).toEqual({ persona_id: 7, texto: 'Comer menos grasas', clave: 'menos_grasas' });
    // Sin IA, no intenta armar nada más.
    expect(pedidos.some((p) => p.ruta.endsWith('/plan'))).toBe(false);
  });

  it('un objetivo con palabras propias', async () => {
    render(<Metas persona={persona} puedeEscribir />);
    const input = await screen.findByLabelText('Otro objetivo, con tus palabras');
    fireEvent.change(input, { target: { value: 'Aprender a tejer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await screen.findByText('Aprender a tejer');
  });

  it('con IA, al crear le pide el plan a medida', async () => {
    conIa = true;
    render(<Metas persona={persona} puedeEscribir />);
    fireEvent.click(await screen.findByRole('button', { name: /Moverme más/ }));
    await screen.findByText('Plan a medida');
    expect(pedidos.find((p) => p.ruta.endsWith('/plan'))?.cuerpo).toEqual({ rehacer: false });
  });

  it('el plan con lo que mide cada paso; se pausa y se cumple', async () => {
    lista = [meta({ medidas: [{ nombre: 'Horas de sueño', como: 'promedio', unidad: 'h', ahora: 6.5, antes: 7 }] })];
    render(<Metas persona={persona} puedeEscribir />);
    fireEvent.click(await screen.findByRole('button', { name: /Dormir mejor/ }));
    expect(screen.getByText(/Horas de sueño: 6.5 h por día/)).toBeTruthy();
    expect(screen.getByText('Se mide con: Tiempo de pantalla')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '¡Lo cumplí!' }));
    await waitFor(() => expect(festejar).toHaveBeenCalled());
    expect(pedidos.at(-1)).toMatchObject({ metodo: 'PUT', ruta: '/api/metas/1', cuerpo: { estado: 'cumplida' } });
    await screen.findByText('Cumplidos');
  });

  it('lo médico aclara que no reemplaza al médico', async () => {
    lista = [meta({ texto: 'Bajar la presión', medico: true })];
    render(<Metas persona={persona} puedeEscribir />);
    fireEvent.click(await screen.findByRole('button', { name: /Bajar la presión/ }));
    expect(screen.getByText(/no reemplaza a tu médico/)).toBeTruthy();
  });

  it('quien solo puede mirar no ve cómo cambiarlos', async () => {
    lista = [meta()];
    render(<Metas persona={persona} puedeEscribir={false} />);
    fireEvent.click(await screen.findByRole('button', { name: /Dormir mejor/ }));
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
    expect(screen.queryByLabelText('Otro objetivo, con tus palabras')).toBeNull();
  });

  it('cómo se dice un dato', () => {
    expect(textoMedida({ nombre: 'Días con mucha grasa', como: 'dias', unidad: null, ahora: 2, antes: 4 })).toBe('Días con mucha grasa: 2 de 7 días (la semana pasada: 4)');
    expect(textoMedida({ nombre: 'Pasos', como: 'promedio', unidad: null, ahora: 5000, antes: null })).toMatch(/^Pasos: 5.000 por día$|^Pasos: 5,000 por día$/);
    expect(textoMedida({ nombre: 'Pasos', como: 'promedio', unidad: null, ahora: null, antes: 4 })).toContain('todavía sin datos');
  });
});

describe('El seguimiento en el Día', () => {
  it('sin objetivos no ocupa lugar', async () => {
    const { container } = render(<MetaDelDia persona={persona} hoy="2026-11-01" puedeEscribir />);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(container.firstChild).toBeNull();
  });

  it('una pregunta se contesta y hasta mañana', async () => {
    delDia = consejo();
    const { container } = render(<MetaDelDia persona={persona} hoy="2026-11-01" puedeEscribir />);
    fireEvent.click(await screen.findByRole('button', { name: 'Más o menos' }));
    expect(container.firstChild).toBeNull();
    expect(pedidos.at(-1)).toMatchObject({ metodo: 'PUT', ruta: '/api/metas/dia/9', cuerpo: { respuesta: 'mas_o_menos' } });
  });

  it('un consejo se cierra; y si ya se contestó hoy, no vuelve', async () => {
    delDia = consejo({ tipo: 'consejo', texto: 'Probá cenar temprano.', otros: 2, medida: { nombre: 'Pasos', como: 'dias', unidad: null, ahora: 1, antes: 0 } });
    const primero = render(<MetaDelDia persona={persona} hoy="2026-11-01" puedeEscribir />);
    await screen.findByText('Probá cenar temprano.');
    expect(screen.getByText(/2 objetivos más/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(primero.container.firstChild).toBeNull();
    expect(pedidos.at(-1)?.cuerpo).toEqual({ estado: 'visto' });
    delDia = consejo({ estado: 'respondido', respuesta: 'si' });
    const segundo = render(<MetaDelDia persona={persona} hoy="2026-11-01" puedeEscribir />);
    await waitFor(() => expect(pedidos.at(-1)?.metodo).toBe('GET'));
    expect(segundo.container.firstChild).toBeNull();
  });

  it('tocarlo lleva a los objetivos', async () => {
    delDia = consejo();
    render(<MetaDelDia persona={persona} hoy="2026-11-01" puedeEscribir />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mirar tus objetivos' }));
    expect(irAMas).toHaveBeenCalledWith('objetivos');
  });
});
