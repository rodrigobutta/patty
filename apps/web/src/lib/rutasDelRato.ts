// Los recorridos que vio la ubicación en un rato (a pie y en vehículo): para el resumen de algo anotado y su placa.
import { api } from '../api';
import type { Ruta } from '../ui/Mapa';

export interface Punta {
  lat: number;
  lon: number;
  lugar: string | null;
}

export type RutaDelDia = Ruta & { inicio: string; fin: string; minutos: number; km: number; kmh: number; pasos: number | null; origen: Punta | null; destino: Punta | null };

/** Unos minutos de margen: lo anotado suele ir redondeado. */
const MARGEN = 10 * 60000;

export async function rutasDelRato(personaId: number, fecha: string, inicio: string, fin: string): Promise<RutaDelDia[]> {
  const a = Date.parse(inicio) - MARGEN;
  const b = Date.parse(fin) + MARGEN;
  const l = await Promise.all(
    (['a_pie', 'vehiculo'] as const).map((tipo) =>
      api<{ rutas: RutaDelDia[] }>('GET', `/api/ubicacion/recorrido?persona=${personaId}&fecha=${fecha}&tipo=${tipo}`).then((r) => r.rutas).catch(() => [] as RutaDelDia[]),
    ),
  );
  return l.flat().filter((x) => Date.parse(x.inicio) < b && Date.parse(x.fin) > a).sort((x, y) => Date.parse(x.inicio) - Date.parse(y.inicio));
}
