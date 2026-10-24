// El clima y la calidad del aire de un lugar, hora por hora, desde Open-Meteo (gratis y sin clave: https://open-meteo.com).
// Se pide por hora en UTC y se devuelve una lectura por hora pedida, con lo que haya (puede faltar algún valor).

/** Lo que se guarda de cada hora, con el nombre del concepto y su unidad (`factor` pasa de la unidad de Open-Meteo). */
interface Variable { clave: string; concepto: string; unidad: string; factor?: number }

export const VARIABLES: Variable[] = [
  { clave: 'temperature_2m', concepto: 'Temperatura', unidad: '°C' },
  { clave: 'apparent_temperature', concepto: 'Sensación térmica', unidad: '°C' },
  { clave: 'relative_humidity_2m', concepto: 'Humedad', unidad: '%' },
  { clave: 'dew_point_2m', concepto: 'Punto de rocío', unidad: '°C' },
  { clave: 'precipitation', concepto: 'Lluvia', unidad: 'mm' },
  { clave: 'surface_pressure', concepto: 'Presión', unidad: 'hPa' },
  { clave: 'cloud_cover', concepto: 'Nubosidad', unidad: '%' },
  { clave: 'wind_speed_10m', concepto: 'Viento', unidad: 'km/h' },
  { clave: 'wind_gusts_10m', concepto: 'Ráfagas', unidad: 'km/h' },
  { clave: 'uv_index', concepto: 'Índice UV', unidad: 'UV' },
  { clave: 'visibility', concepto: 'Visibilidad', unidad: 'km', factor: 1 / 1000 },
  { clave: 'shortwave_radiation', concepto: 'Radiación solar', unidad: 'W/m²' },
  { clave: 'sunshine_duration', concepto: 'Minutos de sol', unidad: 'min', factor: 1 / 60 },
];

/** La calidad del aire, de la API de aire de Open-Meteo (otra consulta; si falla, el clima se guarda igual). */
export const VARIABLES_AIRE: Variable[] = [
  { clave: 'us_aqi', concepto: 'Calidad del aire', unidad: 'AQI' },
  { clave: 'pm2_5', concepto: 'PM2.5', unidad: 'µg/m³' },
  { clave: 'pm10', concepto: 'PM10', unidad: 'µg/m³' },
  { clave: 'ozone', concepto: 'Ozono', unidad: 'µg/m³' },
  { clave: 'nitrogen_dioxide', concepto: 'Dióxido de nitrógeno', unidad: 'µg/m³' },
];

/** Con menos que esto, una hora se vuelve a pedir (por ejemplo, las guardadas antes de sumar variables). */
export const MINIMO_POR_HORA = 6;

export interface LecturaClima {
  /** El comienzo de la hora (UTC). */
  hora: Date;
  valores: Array<{ concepto: string; unidad: string; valor: number }>;
}

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';
const URL_AIRE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** "2026-10-24T14:00" (como lo pide y lo devuelve Open-Meteo con timezone=GMT). */
const horaUtc = (d: Date) => d.toISOString().slice(0, 13) + ':00';

/** El comienzo de la hora de un instante. */
export const comienzoDeHora = (d: Date) => new Date(Math.floor(d.getTime() / 3600000) * 3600000);

async function consultar(base: string, variables: Variable[], lat: number, lon: number, orden: Date[]) {
  const q = new URLSearchParams({
    // Con 2 decimales (~1 km) alcanza para el clima y no se manda la ubicación exacta.
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: variables.map((v) => v.clave).join(','),
    timezone: 'GMT',
    start_hour: horaUtc(orden[0]),
    end_hour: horaUtc(orden[orden.length - 1]),
  });
  const r = await fetch(`${base}?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()) as { hourly?: Record<string, Array<number | null> | string[]> };
  const tiempos = (d.hourly?.time ?? []) as string[];
  const porHora = new Map<string, LecturaClima['valores']>();
  tiempos.forEach((t, i) => {
    porHora.set(
      t,
      variables.flatMap((v) => {
        const n = (d.hourly?.[v.clave] as Array<number | null> | undefined)?.[i];
        if (typeof n !== 'number' || !Number.isFinite(n)) return [];
        return [{ concepto: v.concepto, unidad: v.unidad, valor: Math.round(n * (v.factor ?? 1) * 100) / 100 }];
      }),
    );
  });
  return porHora;
}

export async function climaPorHora(lat: number, lon: number, horas: Date[]): Promise<LecturaClima[]> {
  if (!horas.length) return [];
  const orden = [...horas].sort((a, b) => a.getTime() - b.getTime());
  const [clima, aire] = await Promise.all([
    consultar(URL_BASE, VARIABLES, lat, lon, orden),
    consultar(URL_AIRE, VARIABLES_AIRE, lat, lon, orden).catch((e) => {
      console.error('Calidad del aire:', e);
      return new Map<string, LecturaClima['valores']>();
    }),
  ]);
  const lecturas: LecturaClima[] = [];
  for (const h of new Set(orden.map(horaUtc))) {
    const valores = [...(clima.get(h) ?? []), ...(aire.get(h) ?? [])];
    if (valores.length) lecturas.push({ hora: new Date(h + ':00Z'), valores });
  }
  return lecturas;
}
