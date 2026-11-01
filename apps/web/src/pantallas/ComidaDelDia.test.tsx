import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Categoria, ComidaDelDia, ComponenteDelDia, Persona, Registro } from 'shared';
import { ComidaDelDiaHoja, comidasAnotadas, lineaComidas } from './ComidaDelDia';
import { WidgetsDelDia } from './WidgetsDelDia';

const comp = (clave: string, de: 'tabla' | 'ia', unidad: ComponenteDelDia['unidad'], valor: number | null, nivel: ComponenteDelDia['nivel'] = null, alimentos: string[] = []): ComponenteDelDia => ({ clave, de, unidad, valor, nivel, alimentos });
const datos = (x: Partial<ComidaDelDia> = {}): ComidaDelDia => ({
  fecha: '2026-10-30',
  en_curso: true,
  comidas: [],
  cobertura: { comidas: 3, resueltas: 3, aproximadas: 0, sin_dato: 0, pendientes: 0 },
  componentes: [comp('sal', 'tabla', 'mg', 3437.6, 'mucho', ['Milanesa', 'Empanadas']), comp('calorias', 'tabla', 'kcal', 1837, 'normal', ['Milanesa']), comp('gluten', 'ia', null, 2.6, 'normal'), comp('alcohol', 'tabla', 'g', 0), comp('fibra', 'tabla', 'g', null)],
  destacado: { clave: 'sal', nivel: 'mucho' },
  semana: { dias: [], componentes: [{ clave: 'sal', valores: [1, 2, null, 3, 4, 5, 6], niveles: [], promedio: 2000, promedio_anterior: 1000, cambio: 'mas' }, { clave: 'alcohol', valores: [], niveles: [], promedio: 1, promedio_anterior: 40, cambio: 'menos' }, { clave: 'fibra', valores: [], niveles: [], promedio: 10, promedio_anterior: 10, cambio: 'igual' }] },
  patrones: [],
  ...x,
});

let respuesta: ComidaDelDia = datos();
const pedidos: string[] = [];
vi.mock('../estado', () => ({ useEstado: () => ({ sesion: { ia: false }, usuario: { id: 1, rol: 'admin' } }) }));
vi.mock('../api', () => ({
  api: async (_m: string, ruta: string) => {
    pedidos.push(ruta);
    return respuesta;
  },
}));

const categorias = [{ id: 1, clave: 'comida' }, { id: 2, clave: 'bebida' }] as Categoria[];
const reg = (id: number, concepto: string, categoria_id: number, hora: string, fecha = '2026-10-30') => ({ id, concepto, categoria_id, fecha, inicio: `${fecha}T${hora}:00-03:00`, valor: null, unidad: null }) as Registro;

const dias14 = Array.from({ length: 14 }, (_, i) => `2026-10-${String(17 + i).padStart(2, '0')}`);
const consumo = (x: Partial<NonNullable<ComidaDelDia['consumo']>> = {}): NonNullable<ComidaDelDia['consumo']> => ({
  dias: dias14,
  comidas_por_dia: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 2, 1],
  elementos: [{ nombre: 'Pan', veces: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1], total: 4, dias: 3, dias_desde: 0, seguidos: 1 }, { nombre: 'Queso', veces: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], total: 1, dias: 1, dias_desde: 3, seguidos: 0 }],
  sin_aparecer: [{ nombre: 'Lentejas', dias_desde: 20, veces: 4 }],
  distintos: 2,
  sin_desglosar: 2,
  ...x,
});

describe('lo que más se viene comiendo y la lectura', () => {
  it('una fila por elemento y un cuadrito por día, con cuántas veces y hace cuánto', () => {
    const { container } = render(<ComidaDelDiaHoja datos={datos({ consumo: consumo() })} />);
    expect(screen.getByText('Lo que más comiste')).toBeTruthy();
    expect(screen.getByText('4 veces · hoy')).toBeTruthy();
    expect(screen.getByText('1 vez · hace 3 días')).toBeTruthy();
    const filas = container.querySelectorAll('.comida-celdas');
    expect(filas).toHaveLength(2);
    expect(filas[0].querySelectorAll('button')).toHaveLength(14);
    expect(filas[0].querySelectorAll('button')[11].textContent).toBe('2');
    expect(filas[0].querySelectorAll('button')[11].className).toContain('veces-2');
    expect(filas[0].querySelectorAll('button')[0].className).toContain('sin-dato'); // ese día no se sabe, no es que no hubo
    expect(screen.getByText('Lentejas:')).toBeTruthy();
    expect(screen.getByText(/No entran en la cuenta 2 comidas/)).toBeTruthy();
  });

  it('tocar un cuadrito dice qué fue ese día', () => {
    const { container } = render(<ComidaDelDiaHoja datos={datos({ consumo: consumo() })} />);
    fireEvent.click(container.querySelectorAll('.comida-celdas')[0].querySelectorAll('button')[11]);
    expect(container.querySelector('.comida-detalle')?.textContent).toMatch(/Pan, .*: 2 veces/);
  });

  it('al mirar un día pasado no dice "hoy" ni "hace rato"', () => {
    render(<ComidaDelDiaHoja datos={datos({ en_curso: false, consumo: consumo() })} />);
    expect(screen.getByText('4 veces')).toBeTruthy();
    expect(screen.queryByText('Hace rato que no aparece')).toBeNull();
  });

  it('muestra la lectura; una respuesta guardada de antes (sin estos datos) no rompe nada', () => {
    render(<ComidaDelDiaHoja datos={datos({ lectura: { fecha: '2026-10-30', texto: 'Viene mucho pan.', origen: 'ia' } })} />);
    expect(screen.getByText('Viene mucho pan.')).toBeTruthy();
    expect(screen.queryByText('Lo que más comiste')).toBeNull();
  });
});

describe('la hoja de lo que se comió', () => {
  it('muestra números redondos con su unidad, palabras para lo estimado de a platos, y dice que es una estimación', () => {
    render(<ComidaDelDiaHoja datos={datos()} />);
    expect(screen.getByText(/Es una estimación a partir de lo que anotaste hasta ahora/)).toBeTruthy();
    expect(screen.getByText(/3\.450 mg/)).toBeTruthy();
    expect(screen.getByText(/1\.840 kcal/)).toBeTruthy();
    expect(screen.getByText('Bastante')).toBeTruthy();
    expect(screen.getByText('0 g')).toBeTruthy();
    expect(screen.getByText('más que lo habitual')).toBeTruthy();
    expect(screen.queryByText('Fibra')).toBeNull(); // lo que no se sabe, no se muestra
    expect(screen.getByText('Lo que más aportó')).toBeTruthy();
    expect(screen.getByText(/Milanesa, Empanadas/)).toBeTruthy();
  });

  it('nunca juzga: sin metas, sin consejos', () => {
    const { container } = render(<ComidaDelDiaHoja datos={datos()} />);
    expect(container.textContent).not.toMatch(/te pasaste|meta|objetivo|deberías|conviene|cuidate|exceso|demasiad/i);
  });

  it('cuenta la semana contra la anterior', () => {
    render(<ComidaDelDiaHoja datos={datos()} />);
    expect(screen.getByText('Esta semana comiste con más sal que la anterior.')).toBeTruthy();
    expect(screen.getByText('Esta semana tomaste menos alcohol que la anterior.')).toBeTruthy();
  });

  it('dice si falta calcular algo, y sin nada resuelto no muestra tarjetas', () => {
    const { container } = render(
      <ComidaDelDiaHoja datos={datos({ cobertura: { comidas: 1, resueltas: 0, aproximadas: 0, sin_dato: 0, pendientes: 1 }, componentes: [comp('sal', 'tabla', 'mg', null)], destacado: null })} />,
    );
    expect(screen.getByText(/Todavía estoy calculando 1 comida/)).toBeTruthy();
    expect(container.querySelector('.clima-tarjeta')).toBeNull();
  });

  it('con poca historia hay valores sin niveles, y lo avisa', () => {
    render(<ComidaDelDiaHoja datos={datos({ en_curso: false, componentes: [comp('sal', 'tabla', 'mg', 800)], destacado: null })} />);
    expect(screen.getByText('800 mg')).toBeTruthy();
    expect(screen.queryByText(/que lo habitual/)).toBeNull();
    expect(screen.getByText(/Con más días anotados/)).toBeTruthy();
  });
});

describe('el widget en el Día', () => {
  const persona = (patrones = {}) => ({ id: 1, nombre: 'Ana', patrones }) as Persona;
  const props = { automaticos: [], categorias, apagadas: [], alActivar: () => {}, fecha: '2026-10-30' };

  it('cuenta como la lista del Día: lo del mismo minuto es una comida, y el agua no cuenta', () => {
    const n = comidasAnotadas([reg(1, 'Café', 2, '08:00'), reg(2, 'Tostadas', 1, '08:00'), reg(3, 'Milanesa', 1, '13:00'), reg(4, 'Ensalada', 1, '13:00'), reg(5, 'Agua', 2, '15:00'), reg(6, 'Mate', 2, '17:00')], categorias, '2026-10-30');
    expect(n).toMatchObject({ comidas: 2, bebidas: 1 });
    expect(lineaComidas(n)).toBe('2 comidas');
    expect(lineaComidas({ comidas: 0, bebidas: 1 })).toBe('1 bebida');
    expect(comidasAnotadas([reg(5, 'Agua', 2, '15:00')], categorias, '2026-10-30')).toMatchObject({ comidas: 0, bebidas: 0 });
  });

  it('aparece con lo más notable en palabras', async () => {
    respuesta = datos();
    render(<WidgetsDelDia {...props} persona={persona()} registros={[reg(1, 'Milanesa', 1, '13:00')]} />);
    expect(await screen.findByText('1 comida')).toBeTruthy();
    expect(await screen.findByText('mucha sal')).toBeTruthy();
  });

  it('sin nada notable, solo la línea; y sigue estando aunque se esté calculando', async () => {
    respuesta = datos({ destacado: null, cobertura: { comidas: 1, resueltas: 0, aproximadas: 0, sin_dato: 0, pendientes: 1 } });
    pedidos.length = 0;
    render(<WidgetsDelDia {...props} persona={persona()} registros={[reg(1, 'Cosa rara', 1, '13:00')]} />);
    expect(await screen.findByText('1 comida')).toBeTruthy();
    await waitFor(() => expect(pedidos).toContain('/api/componentes/dia?persona=1&fecha=2026-10-30'));
  });

  it('sin comidas no está; y con el interruptor apagado tampoco, ni se pide nada', async () => {
    pedidos.length = 0;
    const { container, rerender } = render(<WidgetsDelDia {...props} persona={persona()} registros={[]} />);
    expect(container.querySelector('.widget-auto')).toBeNull();
    rerender(<WidgetsDelDia {...props} persona={persona({ componentes: false })} registros={[reg(1, 'Milanesa', 1, '13:00')]} />);
    expect(container.querySelector('.widget-auto')).toBeNull();
    expect(pedidos).toEqual([]);
  });
});
