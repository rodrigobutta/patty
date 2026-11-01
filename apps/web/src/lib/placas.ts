// Las placas para compartir de lo que no es ni una actividad ni una noche (ver tarjetasDelDia): lo más comido de la semana,
// cómo vino la semana o el mes, un objetivo, lo que sonó y el clima. Una placa es pública, así que cada una se arma con una
// lista cerrada de lo que puede llevar: nunca remedios, efectos, suplementos, alergias, malestares, pulso, oxígeno, peso ni
// ánimo. Lo que devuelve null es que de eso no hay placa, y entonces tampoco botón.
import { pareceMedico, type ConsejoDelDia, type ConsumoDeElementos, type Meta, type SesionEscucha, type TendenciaDia } from 'shared';
import type { Compartible } from '../ui/HojaCompartir';
import { duracion } from './automatico';
import { locale, t } from './idioma';
import { metricasConDatos, resumenDe, type ClaveMetrica } from './tendencias';

/** Lo de salud que pareceMedico no busca porque ahí sirve para otra cosa (elegir el plan), y que en una imagen pública tampoco va. */
const SENSIBLE =
  /\b(peso|kilos?|kg|adelgaz\w*|engord\w*|dietas?|obesidad|imc|alergi\w*|alergic\w*|intoleran\w*|celiac\w*|suplementos?|vitaminas?|creatina|melatonina|magnesio|omega|ibuprofeno|paracetamol|aspirinas?|antibiotic\w*|pulso|oxigeno|saturacion|malestar\w*|nauseas?|vomit\w*|acidez|reflujo|gastritis|terapia|psicolog\w*|psiquiatr\w*|menstru\w*|fumar|cigarrillos?|tabaco|alcohol\w*|drogas?|weight|obesity|allerg\w*|intoleran\w*|celiac|supplements?|vitamins?|pulse|oxygen|nausea|therapy|smok\w*|cigarettes?)\b/;

const normalizado = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Si un texto libre (un objetivo, un artista, un alimento) no puede ir en una imagen pública. */
export const noVaEnPlaca = (texto: string): boolean => pareceMedico(texto) || SENSIBLE.test(normalizado(texto));

const fechaLarga = (fecha: string) => {
  const s = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${fecha}T12:00:00Z`));
  return s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
};
const fechaCorta = (fecha: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${fecha}T12:00:00Z`));
const rango = (fechas: string[]) => `${fechaCorta(fechas[0])} – ${fechaCorta(fechas[fechas.length - 1])}`;
/** En una fila de la placa no entra cualquier largo. */
const corto = (s: string, max = 24) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Lo más comido de los últimos 7 días: el nombre y cuántas veces. Con menos de dos días o de dos cosas, no hay nada que mostrar. */
export function placaDeComida(consumo: ConsumoDeElementos): Compartible | null {
  const dias = consumo.dias.slice(-7);
  if (consumo.comidas_por_dia.slice(-7).filter(Boolean).length < 2) return null;
  const filas = consumo.elementos
    .map((e) => ({ nombre: t(e.nombre), crudo: e.nombre, veces: e.veces.slice(-7).reduce((s, v) => s + v, 0) }))
    .filter((e) => e.veces > 0 && !noVaEnPlaca(e.crudo) && !noVaEnPlaca(e.nombre))
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 5);
  if (filas.length < 2) return null;
  return {
    que: 'comida',
    nota: t('La imagen lleva lo que más comiste, sin tu nombre: solo esto.'),
    tarjeta: {
      tipo: 'semana',
      arriba: t('Lo que más comí esta semana'),
      subtitulo: rango(dias),
      filas: filas.map((e) => ({ nombre: corto(e.nombre), valor: e.veces === 1 ? t('1 vez') : t('{n} veces', { n: e.veces }) })),
      lema: t('Anotá lo que comés y descubrí qué te hace bien.'),
    },
  };
}

/** Solo los hábitos: lo demás de "Cómo venís" (ánimo, malestares, pulso, temperatura del cuerpo) nunca sale en una imagen. */
export const HABITOS_EN_PLACA: ClaveMetrica[] = ['sueno', 'pasos', 'ejercicio', 'pantalla'];

/** Cómo vino la semana o el mes, en hábitos. Si solo hay datos de lo otro, no hay placa. */
export function placaDeTendencias(dias: TendenciaDia[], periodo: 7 | 30): Compartible | null {
  const metricas = metricasConDatos(dias).filter((m) => HABITOS_EN_PLACA.includes(m.clave));
  if (!metricas.length) return null;
  return {
    que: 'tendencias',
    tarjeta: {
      tipo: 'semana',
      arriba: periodo === 7 ? t('Cómo vino mi semana') : t('Cómo vino mi mes'),
      subtitulo: t('Promedio por día · {rango}', { rango: rango(dias.map((d) => d.fecha)) }),
      filas: metricas.map((m) => ({ nombre: m.nombre, valor: resumenDe(m, dias) })),
    },
  };
}

/** Un objetivo que ya se cumplió. Lo que suena a salud no se comparte; el resto se puede mandar sin decir cuál era. */
export function placaDeObjetivoCumplido(m: Pick<Meta, 'texto' | 'estado' | 'medico'>): Compartible | null {
  if (m.estado !== 'cumplida' || m.medico || noVaEnPlaca(m.texto)) return null;
  const base = { tipo: 'grande' as const, arriba: t('¡Cumplí un objetivo con Patty!'), emoji: '🏆', numero: t('¡Lo cumplí!'), lema: t('Elegí un objetivo y Patty te arma el plan.') };
  return {
    que: 'objetivo',
    nota: t('La imagen lleva tu objetivo, sin tu nombre: solo esto.'),
    tarjeta: { ...base, texto: m.texto },
    opcion: { rotulo: t('Mostrar cuál fue el objetivo'), sin: { ...base, texto: t('Un objetivo que me había propuesto') } },
  };
}

/** El objetivo en el que se viene trabajando: solo el texto, nunca el consejo del día ni su número. */
export function placaDeObjetivoEnCurso(c: Pick<ConsejoDelDia, 'objetivo' | 'emoji'>): Compartible | null {
  if (c.emoji === '🩺' || noVaEnPlaca(c.objetivo)) return null;
  const base = { tipo: 'grande' as const, arriba: t('Mi objetivo con Patty'), emoji: c.emoji, numero: t('Voy por esto'), lema: t('Elegí un objetivo y Patty te arma el plan.') };
  return {
    que: 'objetivo',
    nota: t('La imagen lleva tu objetivo, sin tu nombre: solo esto.'),
    tarjeta: { ...base, texto: c.objetivo },
    opcion: { rotulo: t('Mostrar cuál es el objetivo'), sin: { ...base, texto: t('Un objetivo que me propuse') } },
  };
}

const NOMBRE_ESCUCHA: Record<SesionEscucha['tipo'], string> = { musica: 'Música', podcast: 'Podcasts', video: 'Series y videos' };

/**
 * Lo que sonó en el día: cuánto de cada cosa y, de la música, los artistas (se pueden sacar). Los títulos no van nunca, ni los de
 * los temas ni los de podcasts y videos: los lee el teléfono de cualquier app, y un título dice mucho más de lo que parece.
 */
export function placaDeEscuchas(sesiones: SesionEscucha[], fecha: string): Compartible | null {
  const minutos = (tipo: SesionEscucha['tipo']) => sesiones.filter((s) => s.tipo === tipo).reduce((n, s) => n + s.minutos, 0);
  const tipos = (['musica', 'podcast', 'video'] as const).filter((x) => minutos(x) >= 1).sort((a, b) => minutos(b) - minutos(a));
  if (!tipos.length) return null;
  const principal = tipos.includes('musica') ? 'musica' : tipos[0];
  const porArtista = new Map<string, number>();
  for (const s of sesiones) {
    if (s.tipo !== 'musica') continue;
    for (const p of s.pistas) if (p.artista && !noVaEnPlaca(p.artista)) porArtista.set(p.artista, (porArtista.get(p.artista) ?? 0) + p.minutos);
  }
  const artistas = [...porArtista.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a);
  const base = {
    tipo: 'medio' as const,
    arriba: t('Lo que sonó en mi día'),
    lema: t('Anotá lo que mirás y escuchás, y descubrí cómo te hace sentir.'),
    tapa: null,
    forma: 'cuadrada' as const,
    icono: principal === 'musica' ? ('musica' as const) : principal === 'podcast' ? ('podcast' as const) : ('tele' as const),
    titulo: t(NOMBRE_ESCUCHA[principal]),
    subtitulo: tipos.filter((x) => x !== principal).map((x) => `${t(NOMBRE_ESCUCHA[x])} ${duracion(minutos(x))}`).join(' · '),
    cuando: `${fechaCorta(fecha)} · ${duracion(minutos(principal))}`,
  };
  if (!artistas.length) return { que: 'escuchas', tarjeta: base };
  return {
    que: 'escuchas',
    nota: t('La imagen lleva qué artistas sonaron, sin tu nombre: solo esto.'),
    tarjeta: { ...base, titulo: artistas.join(', ') },
    opcion: { rotulo: t('Mostrar los artistas'), sin: base },
  };
}

/** El clima del día: los números de afuera, sin lo que Patty deduce de la persona ni sus patrones. */
export function placaDeClima(datos: Array<{ titulo: string; valor: string }>, fecha: string): Compartible | null {
  const filas = [t('Temperatura'), t('Sensación'), t('Lluvia'), t('Sol'), t('Viento')].flatMap((nombre) => {
    const d = datos.find((x) => x.titulo === nombre);
    return d ? [{ nombre, valor: d.valor }] : [];
  });
  if (!filas.some((f) => f.nombre === t('Temperatura'))) return null;
  return { que: 'clima', tarjeta: { tipo: 'semana', arriba: t('El clima de mi día'), subtitulo: fechaLarga(fecha), filas, lema: t('¿Cómo te cae el clima? Patty lo cruza con tu día.') } };
}
