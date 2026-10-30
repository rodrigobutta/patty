// Dónde estuvo la persona un día, en renglones cortos ("13:05 a 16:40: cerca de Vuelta de Obligado 2225, Belgrano"),
// para que la IA proponga el lugar de una comida de afuera según la hora.
import { sql } from 'drizzle-orm';
import { filas, type Tx } from '../db/client.js';
import { localAInstante } from '../lib/fechas.js';
import { direccionDe } from './direccion.js';
import { paradasSinNombre, puntoDeFila, resumirDia, type LugarZona } from './resumen.js';

export async function lineaDelDia(
  tx: Tx,
  p: { id: number; zona_horaria: string },
  dia: string,
  hoy: string,
  idioma: string,
): Promise<string[]> {
  const ps = await filas<{ instante: string; lat: number; lon: number; precision_m: number | null }>(tx, sql`SELECT instante, lat, lon, precision_m FROM puntos WHERE persona_id = ${p.id} AND fecha = ${dia}`);
  if (!ps.length) return [];
  const ls = await filas<LugarZona & { nombre: string }>(
    tx,
    sql`SELECT l.id, l.lat, l.lon, l.radio_m, c.nombre FROM lugares l JOIN conceptos c ON c.id = l.concepto_id WHERE l.persona_id = ${p.id}`,
  );
  const puntos = ps.map(puntoDeFila);
  const ultimo = Math.max(...puntos.map((x) => x.instante));
  const fin = dia === hoy ? Date.now() : localAInstante(dia, '23:59', p.zona_horaria).getTime();
  const hora = (ms: number) => new Intl.DateTimeFormat('es-AR', { timeZone: p.zona_horaria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  const nombre = new Map(ls.map((l) => [l.id, l.nombre]));
  const tramos: Array<{ desde: number; hasta: number; que: string }> = resumirDia(puntos, ls).estadias.map((e) => ({
    desde: e.llegada,
    hasta: e.salida >= ultimo ? fin : e.salida, // la última, si no se fue: sigue ahí
    que: nombre.get(e.lugar_id)!,
  }));
  for (const x of paradasSinNombre(puntos, ls, fin).slice(0, 4)) {
    const dir = await direccionDe(x.lat, x.lon, idioma);
    tramos.push({ desde: x.llegada, hasta: x.salida, que: dir ? `cerca de ${dir} (lugar sin nombre)` : 'un lugar sin nombre' });
  }
  return tramos.sort((a, b) => a.desde - b.desde).map((t) => `${hora(t.desde)} a ${hora(t.hasta)}: ${t.que}`);
}
