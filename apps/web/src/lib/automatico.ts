// Cómo se muestra en el Día lo que llegó solo (teléfono, ubicación, reloj, clima): un grupo por fuente, una línea por
// concepto. El clima viene una vez por hora, así que se muestra el rango del día (la lluvia, el total).
import type { DatoAutomatico } from 'shared';

export interface GrupoAutomatico { fuente: string; tipo: string; lineas: Array<{ concepto: string; categoria_id: number; valor: string }> }

const ORDEN = ['telefono', 'ubicacion', 'reloj', 'clima', 'otro'];

const numero = (n: number) => Number(n.toFixed(1)).toLocaleString('es-AR');

export function duracion(minutos: number): string {
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

export function valorAutomatico(d: DatoAutomatico): string {
  const conUnidad = (n: number) => (d.unidad === 'min' ? duracion(n) : `${numero(n)}${d.unidad ? ' ' + d.unidad : ''}`);
  if (d.tipo_fuente === 'clima' && d.unidad !== 'mm' && d.cantidad > 1) {
    return d.minimo === d.maximo ? conUnidad(d.minimo) : `${numero(d.minimo)}–${conUnidad(d.maximo)}`;
  }
  return conUnidad(d.suma);
}

export function agruparAutomaticos(datos: DatoAutomatico[]): GrupoAutomatico[] {
  const grupos = new Map<string, GrupoAutomatico>();
  for (const d of datos) {
    const g = grupos.get(d.fuente) ?? { fuente: d.fuente, tipo: d.tipo_fuente, lineas: [] };
    g.lineas.push({ concepto: d.concepto, categoria_id: d.categoria_id, valor: valorAutomatico(d) });
    grupos.set(d.fuente, g);
  }
  const pos = (t: string) => (ORDEN.indexOf(t) + 1 || ORDEN.length + 1);
  // Dentro de cada fuente, juntas las de la misma categoría (pantalla, llamadas…); la API ya las manda de mayor a menor.
  // El clima, siempre en el mismo orden.
  const clima = (c: string) => ['Temperatura', 'Humedad', 'Lluvia', 'Presión'].indexOf(c);
  for (const g of grupos.values()) g.lineas.sort((a, b) => a.categoria_id - b.categoria_id || clima(a.concepto) - clima(b.concepto));
  return [...grupos.values()].sort((a, b) => pos(a.tipo) - pos(b.tipo));
}
