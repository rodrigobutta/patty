import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Categoria, DatoAutomatico, Persona, Registro } from 'shared';
import { olvidarGuardado } from '../lib/guardado';
import { olvidarLoVistoDelServidor } from '../lib/widgets';
import { ElegirWidgets } from './ElegirWidgets';
import { TIEMPO_AGARRE } from './OrganizarWidgets';
import { WidgetsDelDia } from './WidgetsDelDia';

const pedidos: Array<{ metodo: string; ruta: string; cuerpo: any }> = [];
vi.mock('../estado', () => ({ useEstado: () => ({ sesion: { ia: false }, usuario: { id: 1, rol: 'admin' }, avisar: () => {} }) }));
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  api: async (metodo: string, ruta: string, cuerpo: unknown) => {
    if (metodo !== 'GET') pedidos.push({ metodo, ruta, cuerpo });
    return ruta.includes('escuchas') ? [] : {};
  },
}));

vi.mock('./ClimaDelDia', () => ({ ClimaDelDia: () => null }));

// jsdom no trae PointerEvent.
class PunteroDePrueba extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(tipo: string, init: MouseEventInit & { pointerId?: number; isPrimary?: boolean } = {}) {
    super(tipo, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}
(window as unknown as { PointerEvent: unknown }).PointerEvent = PunteroDePrueba;

const dato = (tipo_fuente: string, concepto: string, suma: number): DatoAutomatico =>
  ({ fuente: tipo_fuente, tipo_fuente, concepto, categoria_id: concepto === 'Pasos' ? 1 : 2, unidad: null, cantidad: 1, suma, minimo: suma, maximo: suma }) as DatoAutomatico;
const AUTOMATICOS = [dato('clima', 'Temperatura máxima', 30), dato('reloj', 'Pasos', 5000), dato('telefono', 'Llamadas', 2)];
const categorias = [{ id: 1, clave: 'actividad' }, { id: 5, clave: 'sintoma' }] as Categoria[];
const props = { automaticos: AUTOMATICOS, registros: [] as Registro[], categorias, apagadas: [], alActivar: () => {}, fecha: '2026-11-01' };
const persona = (widgets?: Persona['widgets']) => ({ id: 1, nombre: 'Ana', zona_horaria: 'America/Argentina/Buenos_Aires', propia: true, widgets, patrones: {} }) as Persona;

const nombres = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-widget]')].map((x) => x.dataset.widget);
const celda = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-widget="${id}"]`)!;
const apretar = (el: HTMLElement, x = 10, y = 10) => fireEvent.pointerDown(el, { clientX: x, clientY: y, button: 0 });
const esperarAgarre = () => act(() => void vi.advanceTimersByTime(TIEMPO_AGARRE + 1));

beforeEach(() => {
  olvidarGuardado();
  olvidarLoVistoDelServidor();
  pedidos.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('qué widgets se ven', () => {
  it('respeta el orden y lo oculto; lo no elegido va al final', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona({ orden: ['telefono', 'clima'], ocultos: ['pasos'] })} />);
    expect(nombres(container)).toEqual(['telefono', 'clima']);
    const { container: otro } = render(<WidgetsDelDia {...props} persona={persona({ orden: ['pasos', 'clima'] })} />);
    expect(nombres(otro)).toEqual(['pasos', 'clima', 'telefono']);
  });

  it('los que se dibujan solos ocupan su lugar del orden, y si no tienen qué mostrar no cuentan', () => {
    const Nada = () => null;
    const { container } = render(
      <WidgetsDelDia {...props} persona={persona({ orden: ['clima', 'remedios', 'animo'] })} propios={{ remedios: <button className="widget-auto">r</button>, animo: <Nada /> }} />,
    );
    expect(nombres(container).slice(0, 3)).toEqual(['clima', 'remedios', 'animo']);
    expect(celda(container, 'animo').childElementCount).toBe(0); // Con `:empty` no ocupa lugar.
  });

  it('con el widget oculto no se dibuja el que se dibuja solo', () => {
    render(<WidgetsDelDia {...props} persona={persona({ ocultos: ['remedios'] })} propios={{ remedios: <button>remedios propio</button> }} />);
    expect(screen.queryByText('remedios propio')).toBeNull();
  });
});

describe('los widgets nuevos', () => {
  const hojaDe = (nombre: RegExp) => fireEvent.click(screen.getByRole('button', { name: nombre }));

  it('pulso y cuerpo: el pulso, el oxígeno y su detalle, que deja de repetirse en el sueño', () => {
    const automaticos = [dato('reloj', 'Pulso en reposo', 58), dato('reloj', 'Oxígeno en sangre', 97.5), dato('reloj', 'Horas de sueño', 7)];
    render(<WidgetsDelDia {...props} automaticos={automaticos} persona={persona()} />);
    expect(screen.getByRole('button', { name: 'Pulso y cuerpo: 58 lpm, 97,5 % de oxígeno' })).toBeTruthy();
    hojaDe(/^Sueño:/);
    const detalle = document.querySelector('.detalle-auto')?.textContent;
    expect(detalle).toContain('Horas de sueño');
    expect(detalle).not.toContain('Oxígeno');
  });

  it('pulso y cuerpo oculto: lo suyo sigue en la hoja del sueño', () => {
    const automaticos = [dato('reloj', 'Pulso en reposo', 58), dato('reloj', 'Horas de sueño', 7)];
    render(<WidgetsDelDia {...props} automaticos={automaticos} persona={persona({ ocultos: ['cuerpo'] })} />);
    hojaDe(/^Sueño:/);
    expect(document.querySelector('.detalle-auto')?.textContent).toContain('Pulso en reposo');
  });

  it('solo pulso, sin noche: aparece igual (antes no se veía en ninguna parte)', () => {
    render(<WidgetsDelDia {...props} automaticos={[dato('reloj', 'Pulso promedio', 72)]} persona={persona()} />);
    expect(screen.getByRole('button', { name: 'Pulso y cuerpo: 72 lpm' })).toBeTruthy();
  });

  it('lo que sonó: suma el tiempo, dice qué fue y sale de la hoja del teléfono', () => {
    const automaticos = [dato('telefono', 'Música escuchada', 50), dato('telefono', 'Podcasts escuchados', 30), dato('telefono', 'Llamadas', 2)];
    render(<WidgetsDelDia {...props} automaticos={automaticos} persona={persona()} />);
    expect(screen.getByRole('button', { name: 'Lo que sonó: 1 h 20 min, Música · Podcasts' })).toBeTruthy();
    hojaDe(/^Uso del teléfono:/);
    const detalle = document.querySelector('.detalle-auto')?.textContent;
    expect(detalle).toContain('Llamadas');
    expect(detalle).not.toContain('Música');
  });

  it('malestares: los de ese día, con la intensidad más alta; la fiebre medida no cuenta', () => {
    const reg = (id: number, concepto: string, intensidad: number | null, valor: number | null, fecha = '2026-11-01') =>
      ({ id, concepto, categoria_id: 5, fecha, inicio: `${fecha}T13:00:00-03:00`, intensidad, valor, unidad: null }) as Registro;
    const registros = [reg(1, 'Dolor de cabeza', 4, null), reg(2, 'Acidez', 7, null), reg(3, 'Temperatura corporal', null, 38), reg(4, 'Mareo', 9, null, '2026-10-31')];
    render(<WidgetsDelDia {...props} registros={registros} persona={persona()} />);
    expect(screen.getByRole('button', { name: 'Malestares: 2 malestares, hasta 7 de 10' })).toBeTruthy();
    hojaDe(/^Malestares:/);
    expect(document.querySelector('.detalle-auto')?.textContent).toContain('13:00 · 7/10');
  });

  it('sin datos no aparecen', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} />);
    for (const id of ['cuerpo', 'escuchas', 'malestares']) expect(celda(container, id)).toBeNull();
  });
});

describe('mantener apretado', () => {
  beforeEach(() => void vi.useFakeTimers());

  it('un toque corto abre el detalle, como siempre', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} puedeOrganizar />);
    const c = celda(container, 'clima');
    const b = c.querySelector('button')!;
    apretar(b);
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.pointerUp(b);
    fireEvent.click(b);
    act(() => void vi.advanceTimersByTime(TIEMPO_AGARRE));
    expect(screen.getByRole('dialog', { name: 'Clima' })).toBeTruthy();
  });

  it('apretado y soltado sin mover: abren las opciones y no el detalle', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} puedeOrganizar />);
    const b = celda(container, 'clima').querySelector('button')!;
    apretar(b);
    esperarAgarre();
    expect(celda(container, 'clima').className).toContain('agarrado');
    fireEvent.pointerUp(b);
    fireEvent.click(b);
    expect(screen.getByRole('dialog', { name: 'Opciones de Clima' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Clima' })).toBeNull();
  });

  it('si el dedo se mueve antes de tiempo es scroll: no se agarra y el navegador sigue', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} puedeOrganizar />);
    const b = celda(container, 'clima').querySelector('button')!;
    apretar(b, 10, 10);
    fireEvent.pointerMove(b, { clientX: 10, clientY: 40 });
    esperarAgarre();
    expect(celda(container, 'clima').className).not.toContain('agarrado');
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    b.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    fireEvent.pointerUp(b);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('si el navegador se queda con el gesto antes de tiempo (scroll), no pasa nada', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} puedeOrganizar />);
    const b = celda(container, 'clima').querySelector('button')!;
    apretar(b);
    fireEvent.pointerCancel(b);
    esperarAgarre();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('si se lo queda ya agarrado, abren las opciones para no dejarlo a mitad de camino', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} puedeOrganizar />);
    const b = celda(container, 'clima').querySelector('button')!;
    apretar(b);
    esperarAgarre();
    fireEvent.pointerMove(b, { clientX: 100, clientY: 10 });
    fireEvent.pointerCancel(b);
    expect(screen.getByRole('dialog', { name: 'Opciones de Clima' })).toBeTruthy();
    expect(celda(container, 'clima').style.transform).toBe('');
    expect(pedidos).toEqual([]);
  });

  it('arrastrar reordena sin tocar el DOM hasta soltar, no hace scroll ni cambia de día ni abre el detalle', async () => {
    const cambioDeDia = vi.fn();
    const { container } = render(
      <div onTouchEnd={cambioDeDia}>
        <WidgetsDelDia {...props} persona={persona({ orden: ['clima', 'pasos', 'telefono'] })} puedeOrganizar />
      </div>,
    );
    // Clima, pasos y teléfono, en una fila.
    ['clima', 'pasos', 'telefono'].forEach((id, i) => {
      celda(container, id).getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 90, top: 0, bottom: 90, width: 90, height: 90, x: i * 100, y: 0, toJSON: () => ({}) });
    });
    const c = celda(container, 'clima');
    const b = c.querySelector('button')!;
    apretar(b, 10, 10);
    esperarAgarre();
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    b.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    fireEvent.pointerMove(b, { clientX: 150, clientY: 10 });
    expect(celda(container, 'clima').style.order).toBe('1');
    expect(celda(container, 'pasos').style.order).toBe('0');
    expect(nombres(container).slice(0, 2)).toEqual(['clima', 'pasos']); // El DOM, igual: si no, se pierde el dedo.
    expect(pedidos).toEqual([]);
    fireEvent.pointerUp(b, { clientX: 150, clientY: 10 });
    fireEvent.touchEnd(b, { changedTouches: [{ clientX: 150, clientY: 10 }] });
    fireEvent.click(b);
    expect(cambioDeDia).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(celda(container, 'clima').style.transform).toBe('');
    expect(nombres(container).slice(0, 3)).toEqual(['pasos', 'clima', 'telefono']);
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(pedidos[0].ruta).toBe('/api/personas/1');
    expect(pedidos[0].cuerpo.widgets.orden.slice(0, 3)).toEqual(['pasos', 'clima', 'telefono']);
  });

  it('un toque dentro de la hoja de un widget (va por portal) no lo agarra', () => {
    function ConHoja() {
      const [abierta] = useState(true);
      return <button className="widget-auto">r{abierta ? createPortal(<button>dentro de la hoja</button>, document.body) : null}</button>;
    }
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} puedeOrganizar propios={{ remedios: <ConHoja /> }} />);
    apretar(screen.getByText('dentro de la hoja'));
    esperarAgarre();
    expect(celda(container, 'remedios').className).not.toContain('agarrado');
  });

  it('quien solo mira no organiza', () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} />);
    const b = celda(container, 'clima').querySelector('button')!;
    apretar(b);
    esperarAgarre();
    fireEvent.pointerUp(b);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(b, { key: 'ArrowDown', altKey: true });
    expect(pedidos).toEqual([]);
  });
});

describe('sin arrastrar', () => {
  it('click derecho: opciones, con subir y bajar entre los que se ven', async () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona({ orden: ['clima', 'remedios', 'pasos', 'telefono'] })} puedeOrganizar />);
    fireEvent.contextMenu(celda(container, 'clima').querySelector('button')!);
    expect(screen.getByText(/Lugar 1 de 3/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Antes/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Después/ }));
    await waitFor(() => expect(pedidos).toHaveLength(1));
    // "Remedios" hoy no se ve: se salta, y conserva su lugar relativo.
    expect(pedidos[0].cuerpo.widgets.orden.slice(0, 4)).toEqual(['remedios', 'pasos', 'clima', 'telefono']);
    expect(nombres(container).slice(0, 3)).toEqual(['pasos', 'clima', 'telefono']);
    expect(screen.getByText(/Lugar 2 de 3/)).toBeTruthy();
  });

  it('ocultar desde las opciones', async () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona()} puedeOrganizar />);
    fireEvent.contextMenu(celda(container, 'pasos').querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar este widget' }));
    expect(celda(container, 'pasos')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(pedidos[0].cuerpo.widgets.ocultos).toEqual(['pasos']));
  });

  it('Alt + flechas lo mueve con el teclado y el foco lo sigue', async () => {
    const { container } = render(<WidgetsDelDia {...props} persona={persona({ orden: ['clima', 'pasos', 'telefono'] })} puedeOrganizar />);
    const b = celda(container, 'clima').querySelector('button')!;
    b.focus();
    fireEvent.keyDown(b, { key: 'ArrowRight', altKey: true });
    expect(nombres(container).slice(0, 2)).toEqual(['pasos', 'clima']);
    expect(document.activeElement).toBe(celda(container, 'clima').querySelector('button'));
    expect(screen.getByText('Clima: lugar 2 de 3')).toBeTruthy();
    await waitFor(() => expect(pedidos).toHaveLength(1));
  });
});

describe('Más: elegir widgets', () => {
  it('prende, apaga y sube; todos aparecen aunque hoy no tengan datos', async () => {
    render(<ElegirWidgets persona={persona({ orden: ['clima', 'pasos'] })} puedeEscribir />);
    expect(screen.getByRole('checkbox', { name: 'Lo que sonó' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Movimiento' }));
    await waitFor(() => expect(pedidos.at(-1)!.cuerpo.widgets.ocultos).toEqual(['pasos']));
    expect((screen.getByRole('checkbox', { name: 'Movimiento' }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Subir Movimiento' }));
    await waitFor(() => expect(pedidos.at(-1)!.cuerpo.widgets.orden.slice(0, 2)).toEqual(['pasos', 'clima']));
    expect((screen.getByRole('button', { name: 'Subir Movimiento' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al orden de siempre' }));
    await waitFor(() => expect(pedidos.at(-1)!.cuerpo.widgets).toEqual({}));
  });

  it('quien no puede escribir solo mira', () => {
    render(<ElegirWidgets persona={persona()} puedeEscribir={false} />);
    expect((screen.getByRole('checkbox', { name: 'Clima' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Volver al orden de siempre' })).toBeNull();
  });
});
