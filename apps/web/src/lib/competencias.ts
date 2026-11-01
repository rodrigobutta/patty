// Las competencias entre personas, del lado de la app: el link de invitación (se recuerda hasta que se entra), cómo se
// escribe cada número, qué dice el búho según cómo vas y la placa para compartir. La placa lleva solo lo tuyo: nunca el
// nombre ni el número de los demás.
import { METRICAS, type Cara, type DuracionCompetencia, type MetricaCompetencia } from 'shared';
import { SITIO } from './compartir';
import { locale, t } from './idioma';
import type { Compartible } from '../ui/HojaCompartir';

const CLAVE = 'competencia-invitacion';
const PARAMETRO = 'competir';
const CODIGO = /^[A-Z2-9]{8}$/;

export interface FilaPosicion {
  posicion: number | null;
  apodo: string;
  valor: number | null;
  yo: boolean;
}
export interface Competencia {
  id: number;
  codigo: string;
  nombre: string | null;
  metrica: MetricaCompetencia;
  duracion: DuracionCompetencia;
  desde: string;
  hasta: string;
  estado: 'en_curso' | 'terminada';
  dias_restantes: number;
}
export interface DetalleCompetencia extends Competencia {
  posiciones: FilaPosicion[];
}
export interface ResumenCompetencia extends Competencia {
  participantes: number;
  mi_posicion: number | null;
  mi_valor: number | null;
}

export const linkCompetencia = (codigo: string) => `${SITIO}/app/?${PARAMETRO}=${codigo}`;

/** El código de lo que se pegó: el link entero o el código solo. null si no parece ninguno de los dos. */
export function codigoDeTexto(texto: string): string | null {
  const limpio = texto.trim();
  const delLink = limpio.match(new RegExp(`[?&]${PARAMETRO}=([A-Za-z0-9]+)`))?.[1];
  const c = (delLink ?? limpio).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODIGO.test(c) ? c : null;
}

/** La invitación pendiente: la del link con el que se llegó (la guarda y limpia la dirección) o la que quedó guardada. */
export function leerInvitacion(): string | null {
  const parametros = new URLSearchParams(location.search);
  const c = codigoDeTexto(parametros.get(PARAMETRO) ?? '');
  if (parametros.has(PARAMETRO)) {
    parametros.delete(PARAMETRO);
    const resto = parametros.toString();
    history.replaceState(null, '', `${location.pathname}${resto ? `?${resto}` : ''}${location.hash}`);
  }
  try {
    if (c) localStorage.setItem(CLAVE, c);
    return c ?? localStorage.getItem(CLAVE);
  } catch {
    return c;
  }
}
export function olvidarInvitacion(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}

/** Pedirle a la pantalla de competencias que abra una (al aceptar la invitación). */
export const EVENTO_COMPETENCIAS = 'patty-competencias';
let pedida: number | null = null;
export function pedirVerCompetencia(id: number): void {
  pedida = id;
  window.dispatchEvent(new Event(EVENTO_COMPETENCIAS));
}
export function tomarCompetenciaPedida(): number | null {
  const id = pedida;
  pedida = null;
  return id;
}

export function nombreDe(c: Pick<Competencia, 'nombre' | 'metrica' | 'duracion'>): string {
  if (c.nombre) return c.nombre;
  const metrica = t(METRICAS[c.metrica].nombre);
  return c.duracion === 'semana' ? t('{metrica} de la semana', { metrica }) : t('{metrica} del mes', { metrica });
}

/** "12.340 pasos", "7,5 h" o "sin dato". */
export function valorTexto(metrica: MetricaCompetencia, valor: number | null): string {
  if (valor === null) return t('sin dato');
  const m = METRICAS[metrica];
  const n = valor.toLocaleString(locale(), { maximumFractionDigits: m.decimales });
  if (m.unidad === 'días') return valor === 1 ? t('{n} día', { n }) : t('{n} días', { n });
  return `${n} ${t(m.unidad)}`;
}

/** Lo que falta o, si es hoy, que es hoy. */
const quedan = (dias: number) => (dias <= 1 ? t('Hoy es el último día') : t('Quedan {n} días', { n: dias }));

/** Lo que dice el búho según cómo vas: divertido, sin retar a nadie ni empujar a hacer de más. */
export function comoVas(d: DetalleCompetencia): { cara: Cara; frase: string } {
  const yo = d.posiciones.find((f) => f.yo);
  const dif = (otro: FilaPosicion) => valorTexto(d.metrica, Math.abs((yo?.valor ?? 0) - (otro.valor ?? 0)));
  const conNumero = d.posiciones.filter((f) => f.valor !== null);
  if (d.estado === 'terminada') {
    if (!yo || yo.posicion === null) return { cara: 'espera', frase: t('Terminó y no me llegó ningún número tuyo. ¿Revancha?') };
    if (yo.posicion === 1 && (yo.valor ?? 0) > 0) {
      const empate = conNumero.some((f) => !f.yo && f.posicion === 1);
      return { cara: 'feliz', frase: empate ? t('¡Empate en la cima! Compartieron el primer puesto. Qué final.') : t('¡Ganaste! Estoy más orgullosa que búho con cría.') };
    }
    return { cara: 'feliz', frase: t('Terminaste en el puesto {n}. Buen partido: ¿revancha?', { n: yo.posicion }) };
  }
  if (d.posiciones.length < 2) return { cara: 'espera', frase: t('Por ahora jugás en soledad, y así no tiene gracia. ¡Invitá a alguien!') };
  if (!yo || yo.posicion === null || yo.valor === null) {
    return {
      cara: 'espera',
      frase: ['racha', 'dias'].includes(d.metrica)
        ? t('Todavía no tengo tu número: con que anotes algo hoy, ya entrás a la tabla.')
        : t('Todavía no me llegó tu número: fijate que el reloj o la salud del teléfono estén conectados.'),
    };
  }
  if (yo.posicion === 1) {
    const atras = conNumero.find((f) => !f.yo);
    if (!atras) return { cara: 'feliz', frase: t('Vas a la cabeza, aunque nadie más tiene número todavía. Sospechoso.') };
    if (atras.posicion === 1) return { cara: 'feliz', frase: t('Empate arriba con {apodo}. ¡Qué tensión! {quedan}.', { apodo: atras.apodo, quedan: quedan(d.dias_restantes) }) };
    return { cara: 'feliz', frase: t('¡Vas a la cabeza! Le sacás {dif} a {apodo}. {quedan}.', { dif: dif(atras), apodo: atras.apodo, quedan: quedan(d.dias_restantes) }) };
  }
  const delante = [...conNumero].reverse().find((f) => (f.posicion ?? 0) < yo.posicion!)!;
  const ultimo = conNumero.at(-1)!.valor === yo.valor;
  return {
    cara: 'espera',
    frase: ultimo
      ? t('Por ahora cerrás la tabla, a {dif} de {apodo}. {quedan}: ¡hay partido!', { dif: dif(delante), apodo: delante.apodo, quedan: quedan(d.dias_restantes) })
      : t('Vas en el puesto {n}, a {dif} de {apodo}. {quedan}: ¡se puede!', { n: yo.posicion, dif: dif(delante), apodo: delante.apodo, quedan: quedan(d.dias_restantes) }),
  };
}

/** Si ganaste (o empataste arriba) una que ya terminó, con un número de verdad. */
export function gane(d: DetalleCompetencia): boolean {
  const yo = d.posiciones.find((f) => f.yo);
  return d.estado === 'terminada' && yo?.posicion === 1 && (yo.valor ?? 0) > 0;
}

/**
 * La placa: en curso, tu puesto (con el link de invitación al lado); al terminar, la del ganador o el puesto en que
 * terminaste. Solo lo tuyo; el número se puede sacar antes de mandarla. Sin número o sin rivales, no hay placa.
 */
export function placaDe(d: DetalleCompetencia): Compartible | null {
  const yo = d.posiciones.find((f) => f.yo);
  if (!yo || yo.posicion === null || yo.valor === null || d.posiciones.length < 2) return null;
  const m = METRICAS[d.metrica];
  const nombre = nombreDe(d);
  const total = d.posiciones.length;
  const puesto = t('{n}°', { n: yo.posicion });
  const texto = t('de {total} en «{nombre}»', { total, nombre });
  const numero = `${m.icono} ${valorTexto(d.metrica, yo.valor)}`;
  const base = { tipo: 'grande' as const, numero: puesto };
  if (d.estado === 'terminada') {
    const gano = gane(d);
    const tarjeta = { ...base, cara: 'feliz' as const, arriba: gano ? t('¡Gané la competencia en Patty!') : t('Terminé la competencia en Patty'), emoji: gano ? '🏆' : '🎖️', texto, lema: t('¿Quién se anima a la revancha?') };
    return {
      que: 'competencia',
      tarjeta: { ...tarjeta, detalle: numero },
      opcion: { rotulo: t('Mostrar mi número'), sin: tarjeta },
      texto: gano ? t('¡Gané «{nombre}» en Patty! 🏆 ¿Quién se anima a la revancha?', { nombre }) : t('Terminé en el puesto {n} de «{nombre}» en Patty. ¿Quién se anima a la revancha?', { n: yo.posicion, nombre }),
    };
  }
  const tarjeta = { ...base, cara: yo.posicion === 1 ? ('feliz' as const) : ('espera' as const), arriba: t('Cómo voy en mi competencia'), emoji: m.icono, texto, lema: t('¿Te animás? Te paso el link para sumarte.') };
  return {
    que: 'competencia',
    tarjeta: { ...tarjeta, detalle: numero },
    opcion: { rotulo: t('Mostrar mi número'), sin: tarjeta },
    texto: t('Voy en el puesto {n} en «{nombre}», en Patty. ¿Te animás? Sumate acá:', { n: yo.posicion, nombre }),
    link: linkCompetencia(d.codigo),
  };
}
