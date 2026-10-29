// Lo que se comparte desde el Día: una actividad o un viaje (qué fue, cuánto duró, los km y el mapita de por dónde
// fue) y una noche de sueño (las horas, el gráfico de las etapas, la nota y un pedacito de lo que dijo Patty). Arma la
// tarjeta (ver tarjetaCompartir) con los textos ya traducidos y, como siempre, sin el nombre de la persona.
import { MODOS_VIAJE, type ModoViaje, type Persona } from 'shared';
import { api } from '../api';
import { IconoCategoria, IconoModo } from '../ui/IconosPatty';
import { IconoSueno } from '../ui/IconosWidget';
import type { Compartible } from '../ui/HojaCompartir';
import { duracion } from './automatico';
import { horaEn } from './fechas';
import { iconoParaTarjeta } from './iconoTarjeta';
import { locale, t } from './idioma';
import { caminoPorCalles, faltaCamino } from './rutaPorCalles';
import type { Tarjeta } from './tarjetaCompartir';

type Coord = { lat: number; lon: number };

const mayuscula = (s: string) => s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
const km = (n: number) => `${n.toLocaleString(locale(), { maximumFractionDigits: n < 10 ? 1 : 0 })} km`;

/** "Martes 27 de octubre", en la zona de la persona. */
export function diaLargo(iso: string, zona: string): string {
  return mayuscula(new Intl.DateTimeFormat(locale(), { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)));
}

/** En qué fue un viaje anotado ("Viaje en bici" → bici), o null si no es un viaje. */
function modoDe(concepto: string): ModoViaje | null {
  return (Object.keys(MODOS_VIAJE) as ModoViaje[]).find((m) => MODOS_VIAJE[m].concepto === concepto) ?? null;
}

/**
 * Una actividad o un viaje para compartir: busca por dónde anduvo en ese rato (si hay ubicación) y arma la tarjeta con
 * el mapita, y la misma sin el mapa por si no se quiere mostrar dónde fue.
 */
export async function compartibleActividad(o: { persona: Persona; concepto: string; inicio: string; fin: string; esViaje: boolean }): Promise<Compartible> {
  const { persona, concepto, inicio, fin, esViaje } = o;
  const minutos = Math.max(1, Math.round((Date.parse(fin) - Date.parse(inicio)) / 60000));
  let camino: Coord[] = [];
  let kms = 0;
  try {
    const r = await api<{ camino: Coord[]; km: number }>('GET', `/api/ubicacion/camino?persona=${persona.id}&desde=${encodeURIComponent(inicio)}&hasta=${encodeURIComponent(fin)}`);
    camino = r.camino;
    kms = r.km;
    // Con pocos puntos (un viaje sin señal), el recorrido más probable por las calles, como en el mapita del Día.
    if (faltaCamino(camino)) camino = (await caminoPorCalles(camino)) ?? camino;
  } catch {
    /* sin ubicación: la tarjeta va sin mapa */
  }
  const modo = esViaje ? modoDe(concepto) : null;
  const icono = iconoParaTarjeta(modo ? <IconoModo modo={modo} tamano={96} /> : <IconoCategoria clave={esViaje ? 'viaje' : 'actividad'} tamano={96} />);
  const datos = [{ valor: duracion(minutos), texto: t('duración') }];
  if (kms >= 0.1) {
    datos.push({ valor: km(kms), texto: esViaje ? t('de viaje') : t('recorridos') });
    if (minutos >= 5) datos.push({ valor: `${Math.round(kms / (minutos / 60))} km/h`, texto: t('promedio') });
  }
  const tarjeta: Tarjeta = {
    tipo: 'actividad',
    arriba: diaLargo(inicio, persona.zona_horaria),
    icono,
    titulo: t(concepto),
    cuando: `${horaEn(inicio, persona.zona_horaria)} – ${horaEn(fin, persona.zona_horaria)}`,
    datos,
    camino: camino.length > 1 ? camino : undefined,
    cara: 'feliz',
  };
  return {
    que: esViaje ? 'viaje' : 'actividad',
    tarjeta,
    opcion: tarjeta.camino ? { rotulo: t('Mostrar el mapa de por dónde fui'), sin: { ...tarjeta, camino: undefined } } : undefined,
  };
}

export interface TramoSueno {
  inicio: string;
  fin: string;
  etapa: 'despierto' | 'ligero' | 'profundo' | 'rem' | 'dormido';
}

/** Lo primero que dijo Patty de la noche: una oración (dos si la primera es corta), sin pasarse de largo. */
export function extractoNoche(texto: string, max = 140): string {
  const oraciones = (texto.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
  if (!oraciones.length) return '';
  let r = oraciones[0];
  if (r.length < 70 && oraciones[1] && r.length + oraciones[1].length < max) r += ` ${oraciones[1]}`;
  if (r.length <= max) return r;
  const corte = r.slice(0, max);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(' '), max / 2)).replace(/[,;:]$/, '')}…`;
}

/** Una noche para compartir: el gráfico como en la app, las horas dormidas, la nota y lo que dijo Patty (se puede sacar). */
export function compartibleNoche(o: {
  persona: Persona;
  tramos: TramoSueno[];
  niveles: Array<{ etapa: TramoSueno['etapa']; nombre: string; color: string }>;
  resumen: { texto: string; calidad: number } | null;
}): Compartible {
  const { persona, tramos, niveles, resumen } = o;
  const zona = persona.zona_horaria;
  const t0 = Date.parse(tramos[0].inicio);
  const t1 = Math.max(...tramos.map((x) => Date.parse(x.fin)));
  const nivel = (e: TramoSueno['etapa']) => niveles.findIndex((n) => n.etapa === (e === 'dormido' ? 'ligero' : e));
  const minutos = (e: TramoSueno['etapa']) => tramos.filter((x) => x.etapa === e).reduce((s, x) => s + (Date.parse(x.fin) - Date.parse(x.inicio)) / 60000, 0);
  const dormido = tramos.filter((x) => x.etapa !== 'despierto').reduce((s, x) => s + (Date.parse(x.fin) - Date.parse(x.inicio)) / 60000, 0);
  const sinEtapas = tramos.every((x) => x.etapa === 'dormido');
  const fraccion = (ms: number) => (ms - t0) / (t1 - t0);
  const paso = (t1 - t0) / 3600000 > 6 ? 2 : 1;
  const marcas: Array<{ en: number; texto: string }> = [];
  for (let h = Math.ceil(t0 / 3600000) * 3600000, i = 0; h <= t1; h += 3600000, i++) {
    if (i % paso === 0) marcas.push({ en: fraccion(h), texto: horaEn(new Date(h).toISOString(), zona) });
  }
  const dia = new Intl.DateTimeFormat(locale(), { timeZone: zona, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(t1));
  const comentario = resumen ? extractoNoche(resumen.texto) : '';
  const tarjeta: Tarjeta = {
    tipo: 'sueno',
    arriba: t('Mi noche con Patty'),
    icono: iconoParaTarjeta(<IconoSueno />),
    horas: duracion(dormido),
    horario: `${mayuscula(dia)} · ${horaEn(tramos[0].inicio, zona)} → ${horaEn(new Date(t1).toISOString(), zona)}`,
    calidad: resumen ? { nota: resumen.calidad, texto: t('calidad') } : undefined,
    niveles: niveles.map((n) => ({ nombre: n.nombre, color: n.color, total: sinEtapas ? undefined : duracion(minutos(n.etapa)) })),
    tramos: tramos.map((x) => ({ desde: fraccion(Date.parse(x.inicio)), hasta: fraccion(Date.parse(x.fin)), nivel: nivel(x.etapa) })),
    marcas,
    comentario: comentario || undefined,
    cara: 'dormida',
  };
  return {
    que: 'sueno',
    tarjeta,
    opcion: comentario ? { rotulo: t('Sumar lo que dijo Patty de la noche'), sin: { ...tarjeta, comentario: undefined } } : undefined,
  };
}
