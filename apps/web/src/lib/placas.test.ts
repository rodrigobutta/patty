import { describe, expect, it } from 'vitest';
import type { ConsumoDeElementos, Meta, SesionEscucha, TendenciaDia } from 'shared';
import type { Compartible } from '../ui/HojaCompartir';
import { noVaEnPlaca, placaDeClima, placaDeComida, placaDeEscuchas, placaDeObjetivoCumplido, placaDeObjetivoEnCurso, placaDeTendencias } from './placas';

/** Todo lo que puede terminar en la imagen, en las dos versiones si la placa tiene algo para sacar. */
const todo = (c: Compartible | null) => JSON.stringify([c?.tarjeta, c?.opcion?.sin, c?.texto]);

const dias14 = Array.from({ length: 14 }, (_, i) => `2026-10-${String(17 + i).padStart(2, '0')}`);
const elemento = (nombre: string, veces: number[]) => ({ nombre, veces: [0, 0, 0, 0, 0, 0, 0, ...veces], total: 99, dias: 3, dias_desde: 0, seguidos: 1 });
const consumo = (x: Partial<ConsumoDeElementos> = {}): ConsumoDeElementos => ({
  dias: dias14,
  comidas_por_dia: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 2, 1, 2],
  elementos: [elemento('Queso', [0, 0, 1, 0, 0, 0, 0]), elemento('Pan', [0, 0, 1, 2, 0, 1, 1])],
  sin_aparecer: [{ nombre: 'Lentejas', dias_desde: 20, veces: 4 }],
  distintos: 2,
  sin_desglosar: 0,
  ...x,
});

describe('la placa de lo más comido', () => {
  it('cuenta solo los últimos 7 días y va de más a menos', () => {
    const c = consumo({ elementos: [{ ...elemento('Queso', [0, 0, 1, 0, 0, 0, 0]), veces: [9, 9, 9, 9, 9, 9, 9, 0, 0, 1, 0, 0, 0, 0] }, elemento('Pan', [0, 0, 1, 2, 0, 1, 1])] });
    const p = placaDeComida(c)!;
    expect(p.que).toBe('comida');
    if (p.tarjeta.tipo !== 'semana') throw new Error('tipo');
    expect(p.tarjeta.filas).toEqual([{ nombre: 'Pan', valor: '5 veces' }, { nombre: 'Queso', valor: '1 vez' }]);
  });

  it('avisa que la imagen sí lleva lo anotado, y sin datos no hay placa', () => {
    expect(placaDeComida(consumo())?.nota).toMatch(/lo que más comiste/);
    expect(placaDeComida(consumo({ comidas_por_dia: Array(14).fill(0).map((_, i) => (i === 13 ? 1 : 0)) }))).toBeNull();
    expect(placaDeComida(consumo({ elementos: [elemento('Pan', [1, 0, 0, 0, 0, 0, 0])] }))).toBeNull();
  });

  it('no lleva suplementos, remedios ni lo que dejó de aparecer', () => {
    const p = placaDeComida(consumo({ elementos: [elemento('Pan', [1, 1, 0, 0, 0, 0, 0]), elemento('Queso', [1, 0, 0, 0, 0, 0, 0]), elemento('Suplemento de hierro', [1, 1, 1, 1, 1, 1, 1]), elemento('Vitamina C', [1, 1, 1, 1, 1, 1, 1]), elemento('Pastilla', [1, 1, 1, 1, 1, 1, 1])] }));
    expect(todo(p)).toContain('Pan');
    expect(todo(p)).not.toMatch(/Suplemento|Vitamina|Pastilla|Lentejas/);
  });
});

const dia = (fecha: string, d: Partial<TendenciaDia> = {}): TendenciaDia => ({ fecha, animo: null, sueno: null, pasos: null, ejercicio: null, pantalla: null, temperatura: null, pulso: null, malestares: null, nombres_malestares: [], ...d });
const FECHAS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const semana = (d: Partial<TendenciaDia>) => FECHAS.map((f) => dia(f, d));

describe('la placa de cómo venís', () => {
  it('muestra solo hábitos, aunque haya ánimo, malestares, pulso y temperatura', () => {
    const p = placaDeTendencias(semana({ animo: 2, sueno: 7, pasos: 8000, ejercicio: 30, pantalla: 120, temperatura: 38.5, pulso: 91, malestares: 3, nombres_malestares: ['Dolor de cabeza'] }), 7)!;
    if (p.tarjeta.tipo !== 'semana') throw new Error('tipo');
    expect(p.tarjeta.filas.map((f) => f.nombre)).toEqual(['Sueño', 'Pasos', 'Ejercicio', 'Pantalla']);
    expect(p.tarjeta.arriba).toBe('Cómo vino mi semana');
    expect(todo(p)).not.toMatch(/Ánimo|Malestar|Dolor|Pulso|Temperatura|lpm|°C|38,5|\/10/);
  });

  it('el mes tiene su frase, y con solo datos sensibles no hay placa', () => {
    const mes = Array.from({ length: 30 }, (_, i) => dia(`2026-10-${String(i + 1).padStart(2, '0')}`, { pasos: 5000 }));
    expect(placaDeTendencias(mes, 30)?.tarjeta.arriba).toBe('Cómo vino mi mes');
    expect(placaDeTendencias(semana({ animo: 3, pulso: 80, temperatura: 37, malestares: 1 }), 7)).toBeNull();
  });
});

describe('las placas de los objetivos', () => {
  const meta = (texto: string, x: Partial<Meta> = {}) => ({ texto, estado: 'cumplida' as const, medico: false, ...x });

  it('cumplido: lleva el objetivo, y se puede mandar sin decir cuál era', () => {
    const p = placaDeObjetivoCumplido(meta('Moverme más'))!;
    expect(todo({ ...p, opcion: undefined })).toContain('Moverme más');
    expect(JSON.stringify(p.opcion?.sin)).not.toContain('Moverme más');
  });

  it('uno que no se cumplió todavía no tiene placa de cumplido', () => {
    expect(placaDeObjetivoCumplido(meta('Moverme más', { estado: 'activa' }))).toBeNull();
    expect(placaDeObjetivoCumplido(meta('Moverme más', { estado: 'pausada' }))).toBeNull();
  });

  it.each([
    'Bajar la presión',
    'Dejar la pastilla',
    'Controlar la diabetes',
    'Bajar de peso',
    'Bajar 10 kilos',
    'Tomar vitamina D',
    'Mis alergias',
    'Controlar el pulso',
    'Mejorar el oxígeno',
    'Dejar de fumar',
    'Blood pressure',
    'Lose weight',
  ])('«%s» no se comparte, ni cumplido ni en curso', (texto) => {
    expect(noVaEnPlaca(texto)).toBe(true);
    expect(placaDeObjetivoCumplido(meta(texto))).toBeNull();
    expect(placaDeObjetivoEnCurso({ objetivo: texto, emoji: '🎯' })).toBeNull();
  });

  it('lo que el servidor marcó como médico tampoco, aunque el texto no lo diga', () => {
    expect(placaDeObjetivoCumplido(meta('Lo de siempre', { medico: true }))).toBeNull();
    expect(placaDeObjetivoEnCurso({ objetivo: 'Lo de siempre', emoji: '🩺' })).toBeNull();
  });

  it('las sugerencias de siempre sí se comparten', () => {
    for (const texto of ['Dormir mejor', 'Comer menos grasas', 'Moverme más', 'Menos pantalla', 'Tomar más agua', 'Comer más verdura y fruta', 'Comer menos azúcar']) {
      expect(noVaEnPlaca(texto)).toBe(false);
    }
    expect(todo(placaDeObjetivoEnCurso({ objetivo: 'Dormir mejor', emoji: '😴' }))).toContain('Dormir mejor');
  });
});

const pista = (titulo: string, artista: string, minutos: number) => ({ titulo, artista, album: 'Un disco', app: 'Spotify', inicio: 1, minutos });
const sesion = (x: Partial<SesionEscucha>): SesionEscucha => ({ tipo: 'musica', inicio: 1, fin: 2, minutos: 60, apps: ['Spotify'], pistas: [], ...x });

describe('la placa de lo que sonó', () => {
  it('música: los artistas que más sonaron, que se pueden sacar; nunca los títulos ni las apps', () => {
    const p = placaDeEscuchas([sesion({ pistas: [pista('Tema uno', 'Soda Stereo', 40), pista('Tema dos', 'Charly', 20)] })], '2026-10-30')!;
    if (p.tarjeta.tipo !== 'medio') throw new Error('tipo');
    expect(p.tarjeta.titulo).toBe('Soda Stereo, Charly');
    expect(todo(p)).not.toMatch(/Tema|Un disco|Spotify/);
    expect(JSON.stringify(p.opcion?.sin)).not.toMatch(/Soda|Charly/);
  });

  it('de podcasts y videos, solo cuánto: un título dice demasiado', () => {
    const p = placaDeEscuchas([sesion({ tipo: 'podcast', minutos: 30, apps: ['Radio'], pistas: [pista('Cómo convivir con la depresión', 'Doctora X', 30)] }), sesion({ tipo: 'video', minutos: 45, apps: ['Netflix'], pistas: [pista('Mi diagnóstico', '', 45)] })], '2026-10-30')!;
    expect(p.tarjeta.tipo === 'medio' && p.tarjeta.titulo).toBe('Series y videos');
    expect(todo(p)).toContain('Podcasts');
    expect(todo(p)).not.toMatch(/depresi|Doctora|diagn|Netflix|Radio/);
    expect(p.opcion).toBeUndefined();
  });

  it('sin artista no usa el título de la pista, y un artista con nombre de salud no entra', () => {
    const p = placaDeEscuchas([sesion({ pistas: [pista('Meditación para la ansiedad', '', 30), pista('Algo', 'Remedios para el dolor', 30)] })], '2026-10-30')!;
    expect(todo(p)).not.toMatch(/Medita|ansiedad|Remedios/);
    expect(p.tarjeta.tipo === 'medio' && p.tarjeta.titulo).toBe('Música');
  });

  it('sin nada que mostrar, no hay placa', () => {
    expect(placaDeEscuchas([], '2026-10-30')).toBeNull();
  });
});

describe('la placa del clima', () => {
  it('solo los números de afuera, y sin temperatura no hay placa', () => {
    const datos = [{ titulo: 'Temperatura', valor: '24° / 15°' }, { titulo: 'Humedad', valor: '60%' }, { titulo: 'Presión', valor: '1013 hPa' }, { titulo: 'Lluvia', valor: 'Nada' }];
    const p = placaDeClima(datos, '2026-10-30')!;
    if (p.tarjeta.tipo !== 'semana') throw new Error('tipo');
    expect(p.tarjeta.filas.map((f) => f.nombre)).toEqual(['Temperatura', 'Lluvia']);
    expect(placaDeClima([{ titulo: 'Lluvia', valor: 'Nada' }], '2026-10-30')).toBeNull();
  });
});
