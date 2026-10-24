// El clima de un día entero a partir de las lecturas de cada hora: para los patrones sirve más "fue un día nublado y
// húmedo, con 2 horas de sol" que el promedio de cada hora (que mezcla la noche con el día). Lógica pura.

export interface ValorHora { hora: number; concepto: string; valor: number }
export interface ValorDia { concepto: string; unidad: string; valor: number }

const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const promedio = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;

/** Desde cuánta lluvia en una hora se cuenta como "hora con lluvia" (mm). */
export const LLUVIA_MINIMA = 0.1;
/** Una hora es "de día" si llega algo de radiación solar (W/m²). */
const RADIACION_DE_DIA = 1;

export function resumirClimaDelDia(lecturas: ValorHora[]): ValorDia[] {
  const de = (concepto: string) => lecturas.filter((l) => l.concepto === concepto).sort((a, b) => a.hora - b.hora);
  const valores = (concepto: string) => de(concepto).map((l) => l.valor);
  const r: ValorDia[] = [];
  const poner = (concepto: string, unidad: string, valor: number | null, decimales = 1) => {
    if (valor !== null && Number.isFinite(valor)) r.push({ concepto, unidad, valor: redondear(valor, decimales) });
  };
  const siHay = (l: number[], f: (l: number[]) => number) => (l.length ? f(l) : null);

  const temp = valores('Temperatura');
  poner('Temperatura máxima', '°C', siHay(temp, (l) => Math.max(...l)));
  poner('Temperatura mínima', '°C', siHay(temp, (l) => Math.min(...l)));
  poner('Temperatura media', '°C', siHay(temp, promedio));
  poner('Amplitud térmica', '°C', siHay(temp, (l) => Math.max(...l) - Math.min(...l)));
  poner('Sensación térmica media', '°C', siHay(valores('Sensación térmica'), promedio));
  poner('Humedad media', '%', siHay(valores('Humedad'), promedio), 0);
  poner('Punto de rocío medio', '°C', siHay(valores('Punto de rocío'), promedio));

  // Las horas de luz: las que tienen radiación solar. La nubosidad que importa es la de esas horas.
  const deDia = new Set(de('Radiación solar').filter((l) => l.valor >= RADIACION_DE_DIA).map((l) => l.hora));
  poner('Nubosidad de día', '%', siHay(de('Nubosidad').filter((l) => deDia.has(l.hora)).map((l) => l.valor), promedio), 0);
  poner('Horas de sol', 'h', siHay(valores('Minutos de sol'), (l) => l.reduce((a, b) => a + b, 0) / 60));
  poner('Radiación solar media de día', 'W/m²', siHay(de('Radiación solar').filter((l) => deDia.has(l.hora)).map((l) => l.valor), promedio), 0);
  poner('Índice UV máximo', 'UV', siHay(valores('Índice UV'), (l) => Math.max(...l)));

  const lluvia = valores('Lluvia');
  poner('Lluvia del día', 'mm', siHay(lluvia, (l) => l.reduce((a, b) => a + b, 0)));
  poner('Horas con lluvia', 'h', siHay(lluvia, (l) => l.filter((v) => v >= LLUVIA_MINIMA).length), 0);

  poner('Viento medio', 'km/h', siHay(valores('Viento'), promedio));
  poner('Ráfaga máxima', 'km/h', siHay(valores('Ráfagas'), (l) => Math.max(...l)));
  const presion = valores('Presión');
  poner('Presión media', 'hPa', siHay(presion, promedio));
  // Si la presión subió o bajó en el día (los frentes y las tormentas la hacen caer).
  poner('Cambio de presión', 'hPa', presion.length >= 2 ? presion[presion.length - 1] - presion[0] : null);
  poner('Visibilidad mínima', 'km', siHay(valores('Visibilidad'), (l) => Math.min(...l)));

  poner('Calidad del aire media', 'AQI', siHay(valores('Calidad del aire'), promedio), 0);
  poner('PM2.5 medio', 'µg/m³', siHay(valores('PM2.5'), promedio));
  poner('Ozono medio', 'µg/m³', siHay(valores('Ozono'), promedio), 0);
  return r;
}
