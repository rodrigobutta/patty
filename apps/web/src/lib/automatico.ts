// Cómo se muestra en el Día lo que llegó solo (teléfono, ubicación, reloj, clima): un grupo por fuente, una línea por
// concepto. El clima viene una vez por hora, así que se muestra el rango del día (la lluvia y el sol, el total).
import { unidadPara, type DatoAutomatico } from 'shared';
import { idioma, locale, t } from './idioma';

export interface LineaAutomatica { concepto: string; categoria_id: number; valor: string }
export interface GrupoAutomatico { fuente: string; tipo: string; lineas: LineaAutomatica[] }

const ORDEN = ['telefono', 'ubicacion', 'reloj', 'clima', 'otro'];
const ORDEN_CLIMA = ['Temperatura', 'Sensación térmica', 'Humedad', 'Punto de rocío', 'Lluvia', 'Nubosidad', 'Minutos de sol',
  'Índice UV', 'Radiación solar', 'Viento', 'Ráfagas', 'Presión', 'Visibilidad', 'Calidad del aire', 'PM2.5', 'PM10', 'Ozono',
  'Dióxido de nitrógeno', 'Temperatura máxima', 'Temperatura mínima', 'Temperatura media', 'Amplitud térmica',
  'Sensación térmica media', 'Humedad media', 'Punto de rocío medio', 'Nubosidad de día', 'Horas de sol',
  'Radiación solar media de día', 'Índice UV máximo', 'Lluvia del día', 'Horas con lluvia', 'Viento medio', 'Ráfaga máxima',
  'Presión media', 'Cambio de presión', 'Visibilidad mínima', 'Calidad del aire media', 'PM2.5 medio', 'Ozono medio'];

const numero = (n: number) => Number(n.toFixed(1)).toLocaleString(locale());

export function duracion(minutos: number): string {
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/** 23,5 → "23:30"; 25 → "01:00" (las horas de la madrugada se guardan como 24 + hora). */
export function reloj(horas: number): string {
  const m = Math.round(horas * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function valorAutomatico(d: DatoAutomatico): string {
  const conUnidad = (n: number) =>
    d.unidad === 'min' ? duracion(n) : d.unidad === 'h' ? duracion(n * 60) : d.unidad === 'hora' ? reloj(n) : `${numero(n)}${d.unidad ? ' ' + unidadPara(n, d.unidad, idioma()) : ''}`;
  // Del clima, el rango del día; lo que se acumula (lluvia, minutos de sol), el total.
  if (d.tipo_fuente === 'clima' && d.unidad !== 'mm' && d.unidad !== 'min' && d.cantidad > 1) {
    return d.minimo === d.maximo ? conUnidad(d.minimo) : `${numero(d.minimo)}–${conUnidad(d.maximo)}`;
  }
  return conUnidad(d.suma);
}

/** Los resúmenes del clima del día (si están, se muestran en lugar de las horas: dicen lo mismo, más claro). */
const CLIMA_DEL_DIA = 'Clima del día';
const CLIMA_POR_HORA = 'Clima automático';

export function agruparAutomaticos(todos: DatoAutomatico[]): GrupoAutomatico[] {
  const hayResumen = todos.some((d) => d.fuente === CLIMA_DEL_DIA);
  const datos = hayResumen ? todos.filter((d) => d.fuente !== CLIMA_POR_HORA) : todos;
  const grupos = new Map<string, GrupoAutomatico>();
  for (const d of datos) {
    const g = grupos.get(d.fuente) ?? { fuente: d.fuente, tipo: d.tipo_fuente, lineas: [] };
    g.lineas.push({ concepto: d.concepto, categoria_id: d.categoria_id, valor: valorAutomatico(d) });
    grupos.set(d.fuente, g);
  }
  const pos = (t: string) => (ORDEN.indexOf(t) + 1 || ORDEN.length + 1);
  // Dentro de cada fuente, juntas las de la misma categoría (pantalla, llamadas…); la API ya las manda de mayor a menor.
  // El clima, siempre en el mismo orden.
  const clima = (c: string) => ORDEN_CLIMA.indexOf(c);
  for (const g of grupos.values()) g.lineas.sort((a, b) => a.categoria_id - b.categoria_id || clima(a.concepto) - clima(b.concepto));
  return [...grupos.values()].sort((a, b) => pos(a.tipo) - pos(b.tipo));
}

/** Lo que se lee en el renglón de cada fuente, sin abrirla: lo más importante, en una línea. */
const DESTACADOS: Record<string, Array<[string, (v: string) => string]>> = {
  telefono: [
    ['Tiempo de pantalla', (v) => t('{v} de pantalla', { v })],
    ['Llamadas', (v) => (v === '1' ? t('{v} llamada', { v }) : t('{v} llamadas', { v }))],
  ],
  reloj: [
    ['Pasos', (v) => `${v}`],
    ['Horas de sueño', (v) => t('{v} de sueño', { v })],
    ['Pulso en reposo', (v) => t('{v} en reposo', { v })],
  ],
  ubicacion: [
    ['Viajes', (v) => v],
    ['Km recorridos', (v) => v],
  ],
  clima: [
    ['Temperatura máxima', (v) => t('máx {v}', { v })],
    ['Nubosidad de día', (v) => t('{v} de nubes', { v })],
    ['Horas de sol', (v) => t('{v} de sol', { v })],
    ['Lluvia del día', (v) => (v.startsWith('0 ') ? t('sin lluvia') : t('{v} de lluvia', { v }))],
  ],
};

export function resumenDelGrupo(g: GrupoAutomatico): string {
  const valor = new Map(g.lineas.map((l) => [l.concepto, l.valor]));
  const partes = (DESTACADOS[g.tipo] ?? [])
    .filter(([c]) => valor.has(c))
    .map(([c, f]) => f(valor.get(c)!));
  // Clima por hora (sin resumen del día todavía) y fuentes sin destacados: las primeras dos líneas.
  const r = partes.length ? partes : g.lineas.slice(0, 2).map((l) => `${t(l.concepto)} ${l.valor}`);
  const resto = g.lineas.length - (partes.length || r.length);
  return r.join(' · ') + (resto > 0 && !partes.length ? ` · ${t('y {n} más', { n: resto })}` : '');
}
