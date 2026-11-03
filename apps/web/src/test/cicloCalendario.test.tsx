// La tarjeta del ciclo y su calendario: preguntar "¿te vino?" sin insistir, marcar un día pasado con cuánto duró,
// corregir y borrar un período, lo anotado separado de lo estimado, y que no aparezca para un varón.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resumenCiclo, type Categoria, type Persona, type RespuestaCiclo } from 'shared';
import { CicloDelDia } from '../pantallas/CicloDelDia';

const categorias = [{ id: 1, clave: 'ciclo' }, { id: 2, clave: 'sintoma' }] as Categoria[];
const estado = { categorias, festejar: vi.fn(), avisar: vi.fn(), usuario: { rol: 'editor' } };
vi.mock('../estado', () => ({ useEstado: () => estado }));

let siguienteId = 100;
const persona = (mas: Partial<Persona> = {}): Persona => ({ id: siguienteId++, nombre: 'Ana', zona_horaria: 'America/Argentina/Buenos_Aires', nacimiento: null, notas: null, propia: true, ...mas });

/** Lo que devolvería GET /api/ciclo: el mismo cálculo de shared, con lo de las fases vacío. */
function ciclo(dias: string[], hoy: string, fines: string[] = [], respuestas: RespuestaCiclo[] = []) {
  const vacio = { dias: 0, animo: null, molestias: null, sueno: null };
  return {
    ...resumenCiclo(dias, hoy, { fines, respuestas }),
    por_fase: { menstrual: [], folicular: [], ovulatoria: [], lutea: [], premenstrual: [] },
    cruce: { menstrual: vacio, folicular: vacio, ovulatoria: vacio, lutea: vacio, premenstrual: vacio },
  };
}

let pedidos: Array<{ metodo: string; ruta: string; cuerpo: any }>;
let respuesta: unknown;
beforeEach(() => {
  pedidos = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, o: RequestInit) => {
    pedidos.push({ metodo: o.method ?? 'GET', ruta: String(url), cuerpo: o.body ? JSON.parse(String(o.body)) : undefined });
    return new Response(JSON.stringify(String(url).includes('/api/ciclo?') ? respuesta : { ok: true }), { status: 200 });
  }));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const posts = (ruta: string) => pedidos.filter((p) => p.metodo === 'POST' && p.ruta.includes(ruta));
const celda = (fecha: string) => document.querySelector(`.calendario-ciclo [data-fecha="${fecha}"]`) as HTMLElement;

// Dos ciclos de 28 días con el fin confirmado; el último empezó el 24/10. La próxima, estimada para el 21/11.
const DIAS = ['2026-09-26', '2026-10-24'];
const FINES = ['2026-09-30', '2026-10-27'];

describe('la tarjeta del ciclo', () => {
  it('al llegar la fecha pregunta "¿te vino?" aunque esté plegada, y "todavía no" lo guarda', async () => {
    respuesta = ciclo(DIAS, '2026-11-21', FINES);
    const alCambiar = vi.fn();
    render(<CicloDelDia persona={persona()} registros={[]} vuelta={0} alCambiar={alCambiar} />);
    expect(await screen.findByText('¿Te vino? Hoy era la fecha estimada.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Todavía no' }));
    await waitFor(() => expect(posts('/api/ciclo/respuesta')).toHaveLength(1));
    expect(posts('/api/ciclo/respuesta')[0].cuerpo).toMatchObject({ tipo: 'todavia_no' });
    expect(alCambiar).toHaveBeenCalled();
  });

  it('"sí, hoy" marca el inicio en el día de Patty que dice el servidor (no en el del reloj)', async () => {
    respuesta = ciclo(DIAS, '2026-11-21', FINES);
    render(<CicloDelDia persona={persona()} registros={[]} vuelta={0} alCambiar={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, hoy' }));
    await waitFor(() => expect(posts('/api/ciclo/inicio')).toHaveLength(1));
    expect(posts('/api/ciclo/inicio')[0].cuerpo).toMatchObject({ fecha: '2026-11-21' });
  });

  it('"vino otro día" abre el calendario para elegirlo; uno viejo pregunta cuánto duró', async () => {
    respuesta = ciclo(DIAS, '2026-11-24', FINES);
    render(<CicloDelDia persona={persona()} registros={[]} vuelta={0} alCambiar={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Vino otro día' }));
    expect(screen.getByText('Tocá el día en que te vino.')).toBeInTheDocument();
    await userEvent.click(celda('2026-11-19'));
    await userEvent.click(screen.getByRole('button', { name: '🩸 Me vino este día' }));
    await userEvent.click(screen.getByRole('button', { name: '5 días' }));
    await waitFor(() => expect(posts('/api/ciclo/inicio')).toHaveLength(1));
    expect(posts('/api/ciclo/inicio')[0].cuerpo).toMatchObject({ fecha: '2026-11-19', dias: 5 });
  });

  it('pasados los días que suele durar, pregunta si terminó', async () => {
    respuesta = ciclo([...DIAS, '2026-11-21', '2026-11-22'], '2026-11-25', FINES);
    render(<CicloDelDia persona={persona()} registros={[]} vuelta={0} alCambiar={() => {}} />);
    expect(await screen.findByText('¿Ya terminó tu período?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sí, el/ }));
    await waitFor(() => expect(posts('/api/ciclo/fin')[0]?.cuerpo).toMatchObject({ fecha: '2026-11-22' }));
  });

  it('no aparece si la persona dijo ser varón y no hay nada anotado', async () => {
    respuesta = ciclo([], '2026-11-21');
    const { container } = render(<CicloDelDia persona={persona({ sexo: 'masculino' })} registros={[]} vuelta={0} alCambiar={() => {}} />);
    await waitFor(() => expect(pedidos.some((p) => p.ruta.includes('/api/ciclo?'))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('el calendario del ciclo', () => {
  async function abrir(hoy = '2026-11-03') {
    respuesta = ciclo(DIAS, hoy, FINES);
    localStorage.setItem('ciclo-abierto', 'si');
    render(<CicloDelDia persona={persona()} registros={[]} vuelta={0} alCambiar={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: '📅 Calendario del ciclo' }));
    return screen.getByRole('dialog', { name: 'Calendario del ciclo' });
  }

  it('distingue lo anotado de lo estimado, también al pasar de mes', async () => {
    const hoja = await abrir();
    expect(within(hoja).getByText('Noviembre de 2026')).toBeInTheDocument();
    expect(celda('2026-11-21').className).toContain('estimado');
    expect(celda('2026-11-07').className).toContain('ovulacion');
    expect(celda('2026-11-03').className).toContain('hoy');
    expect(celda('2026-11-03').className).toContain('fertil');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Mes anterior' }));
    expect(within(hoja).getByText('Octubre de 2026')).toBeInTheDocument();
    expect(celda('2026-10-24').className).toContain('confirmado');
    expect(celda('2026-10-27').className).toContain('confirmado');
    expect(celda('2026-10-28').className).not.toContain('confirmado');
    // Las cuentas de sus ciclos, y que es orientativo.
    expect(within(hoja).getByText(/Tu último ciclo duró 28 días/)).toBeInTheDocument();
    expect(within(hoja).getByText(/no sirve como método anticonceptivo/)).toBeInTheDocument();
  });

  it('un período anotado se corrige tocando el día bueno, o se borra', async () => {
    const hoja = await abrir();
    await userEvent.click(within(hoja).getByRole('button', { name: 'Mes anterior' }));
    await userEvent.click(celda('2026-10-24'));
    expect(within(hoja).getByText('Período anotado')).toBeInTheDocument();
    await userEvent.click(within(hoja).getByRole('button', { name: 'Corregir el primer día' }));
    await userEvent.click(celda('2026-10-23'));
    await waitFor(() => expect(posts('/api/ciclo/mover')[0]?.cuerpo).toMatchObject({ inicio: '2026-10-24', fecha: '2026-10-23' }));

    vi.stubGlobal('confirm', () => true);
    await userEvent.click(celda('2026-10-25'));
    await userEvent.click(within(hoja).getByRole('button', { name: 'Borrar este período' }));
    await waitFor(() => expect(posts('/api/ciclo/borrar')[0]?.cuerpo).toMatchObject({ inicio: '2026-10-24' }));
  });

  it('un día futuro solo se mira: no se puede marcar', async () => {
    const hoja = await abrir();
    await userEvent.click(celda('2026-11-21'));
    expect(within(hoja).getByText('Próxima menstruación (estimada)')).toBeInTheDocument();
    expect(within(hoja).queryByRole('button', { name: '🩸 Me vino este día' })).toBeNull();
  });
});
