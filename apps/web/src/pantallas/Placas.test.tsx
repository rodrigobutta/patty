// Dónde aparece el botón de compartir y qué termina en la imagen, mirando lo que le llega a quien la dibuja.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComidaDelDia, ConsejoDelDia, Meta, Persona, SesionEscucha, TendenciaDia } from 'shared';
import { planBase } from 'shared';
import type { Tarjeta } from '../lib/tarjetaCompartir';
import { ClimaDelDia } from './ClimaDelDia';
import { ComidaDelDiaHoja } from './ComidaDelDia';
import { EscuchasDelDia } from './EscuchasDelDia';
import { MetaDelDia } from './MetaDelDia';
import { Metas } from './Metas';
import { RecorridoDelDia } from './RecorridoDelDia';
import { TendenciasDelDia } from './TendenciasDelDia';

const persona = { id: 1, nombre: 'Ana Pérez', zona_horaria: 'America/Argentina/Buenos_Aires' } as Persona;
const dibujadas: Tarjeta[] = [];
let rol = 'admin';
const respuestas: Record<string, unknown> = {};

vi.mock('../estado', () => ({ useEstado: () => ({ usuario: { id: 1, rol }, sesion: { ia: false, usuario: { id: 1, rol } }, avisar: () => {}, festejar: () => {} }) }));
vi.mock('../lib/analytics', () => ({ medir: () => {} }));
vi.mock('../lib/tarjetaCompartir', () => ({
  imagenDeTarjeta: async (d: Tarjeta) => {
    dibujadas.push(d);
    return new Blob(['png'], { type: 'image/png' });
  },
}));
vi.mock('../ui/Mapa', () => ({ Mapa: () => <div data-testid="mapa" /> }));
vi.mock('../api', () => ({
  API_BASE: '',
  api: async (_m: string, ruta: string) => {
    const k = Object.keys(respuestas).find((x) => ruta.includes(x));
    if (k) return respuestas[k];
    throw new Error(`sin respuesta para ${ruta}`);
  },
}));

const boton = () => screen.queryByRole('button', { name: '📤 Compartir' });
/** Toca Compartir, espera la vista previa y devuelve lo que se mandó a dibujar. */
async function dibujada(): Promise<string> {
  await userEvent.click(boton()!);
  await waitFor(() => expect(dibujadas.length).toBeGreaterThan(0));
  return JSON.stringify(dibujadas);
}

beforeEach(() => {
  rol = 'admin';
  dibujadas.length = 0;
  for (const k of Object.keys(respuestas)) delete respuestas[k];
  URL.createObjectURL = () => 'blob:vista';
  URL.revokeObjectURL = () => {};
});

describe('cada caminata o viaje elegido', () => {
  const ruta = (hora: string) => ({
    inicio: `2026-10-30T${hora}:00.000Z`,
    fin: `2026-10-30T${hora.slice(0, 2)}:30:00.000Z`,
    minutos: 25,
    km: 1.5,
    kmh: 3.6,
    pasos: 2000,
    puntos: [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.4 }],
    origen: { lat: -34.6, lon: -58.4, lugar: 'Casa' },
    destino: { lat: -34.61, lon: -58.4, lugar: null },
  });
  const camino = [{ lat: -34.6, lon: -58.4 }, { lat: -34.605, lon: -58.4 }, { lat: -34.61, lon: -58.4 }];

  it('con varias, el botón aparece recién al elegir una, y la imagen lleva el mapa que se puede sacar, sin el nombre de los lugares', async () => {
    respuestas['/recorrido'] = { rutas: [ruta('12:00'), ruta('18:00')], lugares: [{ nombre: 'Casa', lat: -34.6, lon: -58.4, radio_m: 100 }], viajes: 0, km: 0 };
    respuestas['/direccion'] = { direccion: 'Av. Cabildo 2100' };
    respuestas['/camino'] = { camino, km: 1.5 };
    render(<RecorridoDelDia persona={persona} fecha="2026-10-30" tipo="a_pie" />);
    const elegir = await screen.findByRole('button', { name: /09:00/ });
    expect(boton()).toBeNull();
    await userEvent.click(elegir);
    await screen.findByText('Av. Cabildo 2100');
    const hecho = await dibujada();
    expect(dibujadas[0]).toMatchObject({ tipo: 'actividad', titulo: 'Caminata', camino });
    expect(hecho).not.toMatch(/Casa|Cabildo|Ana/);
    expect(screen.getByLabelText('Mostrar el mapa de por dónde fui')).toBeTruthy();
  });

  it('en vehículo es un viaje, y un lector no comparte', async () => {
    respuestas['/recorrido'] = { rutas: [ruta('12:00')], lugares: [], viajes: 1, km: 1.5 };
    respuestas['/direccion'] = { direccion: null };
    respuestas['/camino'] = { camino, km: 1.5 };
    const { unmount } = render(<RecorridoDelDia persona={persona} fecha="2026-10-30" tipo="vehiculo" />);
    await screen.findByTestId('mapa');
    await dibujada();
    expect(dibujadas[0]).toMatchObject({ tipo: 'actividad', titulo: 'Viaje' });
    unmount();
    rol = 'lector';
    render(<RecorridoDelDia persona={persona} fecha="2026-10-30" tipo="vehiculo" />);
    await screen.findByTestId('mapa');
    expect(boton()).toBeNull();
  });
});

describe('la comida', () => {
  const datos = (x: Partial<ComidaDelDia> = {}): ComidaDelDia => ({
    fecha: '2026-10-30',
    en_curso: true,
    comidas: [],
    cobertura: { comidas: 3, resueltas: 3, aproximadas: 0, sin_dato: 0, pendientes: 0 },
    componentes: [{ clave: 'sal', de: 'tabla', unidad: 'mg', valor: 3437, nivel: 'mucho', alimentos: ['Milanesa'] }],
    destacado: { clave: 'sal', nivel: 'mucho' },
    semana: { dias: [], componentes: [] },
    patrones: [],
    lectura: { texto: 'Venís con mucha sal.' },
    consumo: {
      dias: ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
      comidas_por_dia: [1, 2, 3, 2],
      elementos: [{ nombre: 'Pan', veces: [1, 1, 1, 1], total: 4, dias: 4, dias_desde: 0, seguidos: 4 }, { nombre: 'Queso', veces: [0, 1, 0, 0], total: 1, dias: 1, dias_desde: 2, seguidos: 0 }, { nombre: 'Magnesio', veces: [1, 1, 1, 1], total: 4, dias: 4, dias_desde: 0, seguidos: 4 }],
      sin_aparecer: [],
      distintos: 3,
      sin_desglosar: 0,
    },
    ...x,
  }) as ComidaDelDia;

  it('lo más comido, sin componentes, ni lectura, ni suplementos; y avisa que lleva lo anotado', async () => {
    render(<ComidaDelDiaHoja datos={datos()} />);
    const hecho = await dibujada();
    expect(hecho).toContain('Pan');
    expect(hecho).not.toMatch(/Magnesio|sal|Milanesa/i);
    expect(screen.getByText(/La imagen lleva lo que más comiste/)).toBeTruthy();
  });

  it('sin el desglose no hay botón, y un lector tampoco lo ve', () => {
    const { unmount } = render(<ComidaDelDiaHoja datos={datos({ consumo: undefined })} />);
    expect(boton()).toBeNull();
    unmount();
    rol = 'lector';
    render(<ComidaDelDiaHoja datos={datos()} />);
    expect(boton()).toBeNull();
  });
});

describe('cómo venís', () => {
  const FECHAS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
  const semana = (d: Partial<TendenciaDia>) => ({ desde: FECHAS[0], hasta: FECHAS[6], dias: FECHAS.map((fecha) => ({ fecha, animo: null, sueno: null, pasos: null, ejercicio: null, pantalla: null, temperatura: null, pulso: null, malestares: null, nombres_malestares: [], ...d })) });

  it('la imagen lleva los hábitos y nada de ánimo, malestares, pulso ni temperatura', async () => {
    respuestas['/tendencias'] = semana({ animo: 3, sueno: 7, pasos: 8000, temperatura: 38, pulso: 90, malestares: 2, nombres_malestares: ['Migraña'] });
    render(<TendenciasDelDia persona={persona} vuelta={0} puedeCompartir />);
    await screen.findByRole('group', { name: /Varias cosas a la vez/ });
    const hecho = await dibujada();
    expect(hecho).toMatch(/Sueño/);
    expect(hecho).toMatch(/Pasos/);
    expect(hecho).not.toMatch(/Ánimo|Malestar|Migraña|Pulso|Temperatura/);
  });

  it('con solo datos sensibles, o sin poder compartir, no hay botón', async () => {
    respuestas['/tendencias'] = semana({ animo: 3, pulso: 90 });
    const { unmount } = render(<TendenciasDelDia persona={persona} vuelta={0} puedeCompartir />);
    await screen.findByRole('group', { name: /Varias cosas a la vez/ });
    expect(boton()).toBeNull();
    unmount();
    respuestas['/tendencias'] = semana({ sueno: 7 });
    render(<TendenciasDelDia persona={persona} vuelta={0} />);
    await screen.findByRole('group', { name: /Varias cosas a la vez/ });
    expect(boton()).toBeNull();
  });
});

describe('los objetivos', () => {
  const meta = (x: Partial<Meta> = {}): Meta => ({ id: 1, persona_id: 1, texto: 'Moverme más', emoji: '🚶', clave: 'moverme_mas', estado: 'cumplida', plan: planBase('Moverme más', 'moverme_mas', 'es'), medico: false, medidas: [], ...x });
  const abrir = async (texto: string) => userEvent.click(await screen.findByRole('button', { name: new RegExp(texto), expanded: false }));

  it('uno cumplido se comparte; el plan y sus números no van', async () => {
    respuestas['/api/metas'] = [meta({ medidas: [{ nombre: 'Pasos', como: 'promedio', unidad: null, ahora: 5000, antes: 4000 }] })];
    render(<Metas persona={persona} puedeEscribir />);
    await abrir('Moverme más');
    const hecho = await dibujada();
    expect(hecho).toContain('Moverme más');
    expect(hecho).not.toMatch(/5000|caminata|Ana/i);
  });

  it('uno activo no tiene placa de cumplido, ni uno que suena médico, ni quien solo mira', async () => {
    respuestas['/api/metas'] = [meta({ estado: 'activa' })];
    const a = render(<Metas persona={persona} puedeEscribir />);
    await abrir('Moverme más');
    expect(boton()).toBeNull();
    a.unmount();
    respuestas['/api/metas'] = [meta({ texto: 'Bajar la presión', medico: true })];
    const b = render(<Metas persona={persona} puedeEscribir />);
    await abrir('Bajar la presión');
    expect(boton()).toBeNull();
    b.unmount();
    respuestas['/api/metas'] = [meta({ texto: 'Bajar de peso' })];
    const c = render(<Metas persona={persona} puedeEscribir />);
    await abrir('Bajar de peso');
    expect(boton()).toBeNull();
    c.unmount();
    respuestas['/api/metas'] = [meta()];
    render(<Metas persona={persona} puedeEscribir={false} />);
    await abrir('Moverme más');
    expect(boton()).toBeNull();
  });

  const consejo = (x: Partial<ConsejoDelDia> = {}): ConsejoDelDia => ({ id: 9, meta_id: 1, fecha: '2026-11-01', tipo: 'pregunta', texto: '¿Saliste a caminar?', estado: 'nuevo', respuesta: null, objetivo: 'Moverme más', emoji: '🚶', medida: { nombre: 'Cómo me siento', como: 'promedio', unidad: '/10', ahora: 3, antes: 7 }, otros: 0, ...x });

  it('en el Día: el objetivo solo, sin el consejo ni la medida', async () => {
    respuestas['/api/metas/dia'] = consejo();
    render(<MetaDelDia persona={persona} hoy="2026-11-01" puedeEscribir />);
    await screen.findByText('¿Saliste a caminar?');
    const hecho = await dibujada();
    expect(hecho).toContain('Moverme más');
    expect(hecho).not.toMatch(/Saliste|siento|\/10/);
  });

  it('en el Día: nada si suena médico', async () => {
    respuestas['/api/metas/dia'] = consejo({ objetivo: 'Bajar el colesterol', emoji: '🩺' });
    render(<MetaDelDia persona={persona} hoy="2026-11-01" puedeEscribir />);
    await screen.findByText('¿Saliste a caminar?');
    expect(boton()).toBeNull();
  });
});

describe('lo que sonó', () => {
  const sesion: SesionEscucha = { tipo: 'musica', inicio: Date.parse('2026-10-30T15:00:00Z'), fin: Date.parse('2026-10-30T16:00:00Z'), minutos: 60, apps: ['Spotify'], pistas: [{ titulo: 'Persiana americana', artista: 'Soda Stereo', album: 'Signos', app: 'Spotify', inicio: 1, minutos: 60 }] };

  it('los artistas, sin los temas ni la app', async () => {
    respuestas['/escuchas'] = [sesion];
    render(<EscuchasDelDia persona={persona} fecha="2026-10-30" vuelta={0} />);
    await screen.findByText('Lo que sonó en el teléfono');
    const hecho = await dibujada();
    expect(hecho).toContain('Soda Stereo');
    expect(hecho).not.toMatch(/Persiana|Signos|Spotify/);
  });

  it('un lector no lo ve', async () => {
    rol = 'lector';
    respuestas['/escuchas'] = [sesion];
    render(<EscuchasDelDia persona={persona} fecha="2026-10-30" vuelta={0} />);
    await screen.findByText('Lo que sonó en el teléfono');
    expect(boton()).toBeNull();
  });
});

describe('el clima', () => {
  const dato = (concepto: string, suma: number) => ({ tipo_fuente: 'clima', concepto, suma, cantidad: 1, maximo: suma, minimo: suma }) as never;

  it('los números de afuera; ni lo que Patty deduce ni los patrones de la persona', async () => {
    respuestas['/clima/contexto'] = { maxima_semana: null, maxima_ayer: null, patrones: [{ id: 1, causa: 'Presión baja', causa_tipo: 'concepto', efecto: 'Dolor de cabeza', efecto_tipo: 'concepto', desfase_dias: 0 }] };
    render(<ClimaDelDia persona={persona} fecha="2026-10-30" todos={[dato('Temperatura máxima', 24), dato('Temperatura mínima', 15), dato('Presión media', 1000), dato('Cambio de presión', -6)]} />);
    await screen.findByText('Lo que el clima te hace a vos');
    const hecho = await dibujada();
    expect(hecho).toContain('24°');
    expect(hecho).not.toMatch(/Dolor|Presión|presión/);
  });
});
