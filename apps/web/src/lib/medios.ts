// Tele, películas, series, música y podcasts del lado de la app: buscar títulos (con su tapa), cómo se dice lo que se
// miró en el Día ("Duna · Ciencia ficción · Netflix") y la imagen para compartirlo. La tapa para compartir pasa por la
// API (/api/medios/tapa), que la devuelve con CORS: si no, el canvas quedaría "manchado" y no se podría exportar.
import { sePantalla, type Medio, type Registro, type ResultadoMedio, type TipoMedio } from 'shared';
import { api, API_BASE } from '../api';
import { duracion } from './automatico';
import { idioma, t } from './idioma';
import type { Tarjeta } from './tarjetaCompartir';

export const buscarTitulos = (tipo: TipoMedio, q: string) =>
  api<ResultadoMedio[]>('GET', `/api/medios/buscar?tipo=${tipo}&q=${encodeURIComponent(q.trim())}`);

/** La tapa traída por la API (con CORS), para dibujarla en el canvas de compartir. */
export const tapaParaCanvas = (tapa: string) => `${API_BASE}/api/medios/tapa?u=${encodeURIComponent(tapa)}`;

/** Lo principal de un medio: el título (o el artista), con el año. */
export function tituloDelMedio(m: Medio): string | null {
  const titulo = m.titulo ?? (m.tipo === 'musica' ? m.artista ?? m.album ?? null : null) ?? (m.deporte ? [t(m.deporte), m.equipo].filter(Boolean).join(' · ') : null);
  return titulo ?? null;
}

/** El resto, en una línea: el género (o el artista si el título es un disco), el deporte, el canal o la plataforma. */
export function detalleDelMedio(m: Medio, conTitulo = true): string[] {
  return [
    conTitulo ? tituloDelMedio(m) : null,
    m.tipo === 'musica' && m.titulo && m.artista ? m.artista : null,
    m.genero ? t(m.genero) : m.contenido ? t(m.contenido) : null,
    m.deporte && m.titulo ? t(m.deporte) : null,
    m.equipo && m.titulo ? m.equipo : null,
    m.servicio ? t(m.servicio) : null,
  ].filter((x): x is string => Boolean(x));
}

/** "Lo vi hoy", "Lo escuché ayer", "Lo vi el sábado". */
export function cuandoLoVi(m: Medio, fecha: string, hoy: string): string {
  const visto = sePantalla(m.tipo);
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  if (fecha === hoy) return visto ? t('Lo vi hoy') : t('Lo escuché hoy');
  if (fecha === ayer) return visto ? t('Lo vi ayer') : t('Lo escuché ayer');
  const dia = new Intl.DateTimeFormat(idioma() === 'en' ? 'en-US' : 'es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));
  return visto ? t('Lo vi el {dia}', { dia }) : t('Lo escuché el {dia}', { dia });
}

/** La imagen para compartir lo que se miró o escuchó: tapa, título, género, cuándo y cuánto (nunca el nombre). */
export function tarjetaDeMedio(r: Registro, hoy: string): Tarjeta {
  const m = r.medio!;
  const visto = sePantalla(m.tipo);
  const minutos = r.valor !== null && (r.unidad === 'min' || r.unidad === null) ? r.valor : null;
  const titulo =
    tituloDelMedio(m) ??
    (m.tipo === 'musica' ? t('Música') : m.tipo === 'podcast' ? t('Un podcast') : m.contenido ? t(m.contenido) : t('Tele'));
  return {
    tipo: 'medio',
    arriba: visto ? t('Lo que miré') : t('Lo que escuché'),
    lema: t('Anotá lo que mirás y escuchás, y descubrí cómo te hace sentir.'),
    tapa: m.tapa ? tapaParaCanvas(m.tapa) : null,
    forma: m.tipo === 'musica' || m.tipo === 'podcast' ? 'cuadrada' : 'poster',
    icono: m.tipo === 'musica' ? 'musica' : m.tipo === 'podcast' ? 'podcast' : 'tele',
    titulo,
    subtitulo: [...detalleDelMedio(m, false), m.anio ? String(m.anio) : null].filter(Boolean).join(' · '),
    cuando: [cuandoLoVi(m, r.fecha, hoy), minutos ? duracion(minutos) : null].filter(Boolean).join(' · '),
  };
}
