// El clima de un lugar, hora por hora, desde Open-Meteo (gratis y sin clave: https://open-meteo.com).
// Se pide por hora en UTC y se devuelve una lectura por hora pedida, con lo que haya (puede faltar algún valor).

/** Lo que se guarda de cada hora, con el nombre del concepto y su unidad. */
export const VARIABLES = [
  { clave: 'temperature_2m', concepto: 'Temperatura', unidad: '°C' },
  { clave: 'relative_humidity_2m', concepto: 'Humedad', unidad: '%' },
  { clave: 'precipitation', concepto: 'Lluvia', unidad: 'mm' },
  { clave: 'surface_pressure', concepto: 'Presión', unidad: 'hPa' },
] as const;

export interface LecturaClima {
  /** El comienzo de la hora (UTC). */
  hora: Date;
  valores: Array<{ concepto: string; unidad: string; valor: number }>;
}

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';

/** "2026-10-24T14:00" (como lo pide y lo devuelve Open-Meteo con timezone=GMT). */
const horaUtc = (d: Date) => d.toISOString().slice(0, 13) + ':00';

/** El comienzo de la hora de un instante. */
export const comienzoDeHora = (d: Date) => new Date(Math.floor(d.getTime() / 3600000) * 3600000);

export async function climaPorHora(lat: number, lon: number, horas: Date[]): Promise<LecturaClima[]> {
  if (!horas.length) return [];
  const orden = [...horas].sort((a, b) => a.getTime() - b.getTime());
  const q = new URLSearchParams({
    // Con 2 decimales (~1 km) alcanza para el clima y no se manda la ubicación exacta.
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: VARIABLES.map((v) => v.clave).join(','),
    timezone: 'GMT',
    start_hour: horaUtc(orden[0]),
    end_hour: horaUtc(orden[orden.length - 1]),
  });
  const r = await fetch(`${URL_BASE}?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()) as { hourly?: Record<string, Array<number | null> | string[]> };
  const tiempos = (d.hourly?.time ?? []) as string[];
  const pedidas = new Set(horas.map(horaUtc));
  const lecturas: LecturaClima[] = [];
  tiempos.forEach((t, i) => {
    if (!pedidas.has(t)) return;
    const valores = VARIABLES.flatMap((v) => {
      const n = (d.hourly?.[v.clave] as Array<number | null> | undefined)?.[i];
      return typeof n === 'number' && Number.isFinite(n) ? [{ concepto: v.concepto, unidad: v.unidad, valor: n }] : [];
    });
    if (valores.length) lecturas.push({ hora: new Date(t + ':00Z'), valores });
  });
  return lecturas;
}
