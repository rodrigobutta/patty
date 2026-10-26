// Los puntos de hoy: un circulito arriba (en la barra) que se llena; al tocarlo se abre una hoja con la racha, lo que
// falta para sumar más (tocar uno abre "Contale a Patty") y el tablero con la familia y el general.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ITEMS_PUNTOS, PUNTOS_RACHA, type ItemPuntos, type Persona, type PuntosDia } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { EVENTO_ANOTADO } from '../mascota/cara';
import { irAlDia } from '../lib/avisos';
import { locale, t } from '../lib/idioma';
import { Tablero } from './Tablero';
import { Mascota } from '../mascota/Mascota';
import type { Cara } from '../mascota/dibujo';

interface Respuesta {
  hoy: PuntosDia;
  semana: PuntosDia[];
  racha: number;
}

const CLAVE_FESTEJADO = 'puntos-festejados';

/** Pedirle al Día que abra "Contale a Patty" con lo que se eligió sumar (desde la hoja de puntos, en la barra). */
export const EVENTO_CONTAR = 'patty-contar';

type EstadoPuntos = 'arranca' | 'bien' | 'casi' | 'completo';
/** Cómo viene el día: cambia el color, el emoji y la frase de la hoja de puntos. */
const ESTADOS_PUNTOS: Record<EstadoPuntos, { emoji: string; titulo: string; frase: string }> = {
  arranca: { emoji: '🌱', titulo: '¡Arrancá el día!', frase: 'Cada cosa que anotás suma. Te faltan {n} para la meta.' },
  bien: { emoji: '💪', titulo: '¡Vas bien!', frase: 'Ya sumás para la racha. Te faltan {n} para completar el día.' },
  casi: { emoji: '🔥', titulo: '¡Casi!', frase: 'Te faltan {n} puntos para completar el día.' },
  completo: { emoji: '🏆', titulo: '¡Día completo!', frase: '' },
};

/** Lo que se le dice a la IA y lo que se muestra arriba al anotar cada cosa que suma (para no preguntar qué es). */
export const PISTAS: Partial<Record<ItemPuntos, { texto: string; titulo: string }>> = {
  desayuno: { texto: 'el desayuno de hoy (a la mañana)', titulo: '☕ Contame qué desayunaste' },
  almuerzo: { texto: 'el almuerzo de hoy (al mediodía)', titulo: '🍝 Contame qué almorzaste' },
  merienda: { texto: 'la merienda de hoy (a la tarde, tipo 17 h)', titulo: '🧉 Contame qué merendaste' },
  cena: { texto: 'la cena de hoy (a la noche)', titulo: '🍽️ Contame qué cenaste' },
  sueno: { texto: 'cómo durmió anoche: a qué hora se acostó y se levantó', titulo: '😴 ¿A qué hora te acostaste y te levantaste?' },
  movimiento: { texto: 'la actividad física o el movimiento de hoy', titulo: '🏃 ¿Te moviste hoy? Contame qué hiciste' },
  bebida: { texto: 'lo que tomó hoy (bebidas)', titulo: '🥤 ¿Qué tomaste hoy?' },
  remedios: { texto: 'los remedios que tomó hoy', titulo: '💊 ¿Qué remedios tomaste?' },
};

export function PuntosDelDia({ persona, cara, alTocarBuho }: { persona: Persona; cara: Cara | null; alTocarBuho(): void }) {
  const { festejar } = useEstado();
  const [r, setR] = useState<Respuesta | null>(null);
  const [tablero, setTablero] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const anterior = useRef<number | null>(null);
  /** El número que se ve (cuenta hasta el nuevo cuando se suman puntos) y la última ganancia, para animarla. */
  const [mostrado, setMostrado] = useState(0);
  const [ganancia, setGanancia] = useState<{ n: number; id: number } | null>(null);
  const contado = useRef(0);
  useEffect(() => {
    if (!r) return;
    const desde = contado.current;
    const hasta = r.hoy.puntos;
    contado.current = hasta;
    if (hasta > desde && desde > 0) {
      setGanancia({ n: hasta - desde, id: Date.now() });
      setTimeout(() => setGanancia(null), 2600);
    }
    if (hasta === desde) return setMostrado(hasta);
    // El número sube de a uno, rápido (como en un juego).
    const inicio = performance.now();
    const dura = Math.min(1200, 120 + Math.abs(hasta - desde) * 40);
    let cuadro = 0;
    const paso = (ahora: number) => {
      const k = Math.min(1, (ahora - inicio) / dura);
      setMostrado(Math.round(desde + (hasta - desde) * k));
      if (k < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [r]);

  const traer = useCallback(() => {
    api<Respuesta>('GET', `/api/puntos?persona=${persona.id}`).then(setR).catch(() => {});
  }, [persona.id]);
  // Se actualiza al anotar algo y al volver a la app.
  useEffect(() => {
    traer();
    const volver = () => document.visibilityState === 'visible' && traer();
    window.addEventListener(EVENTO_ANOTADO, traer);
    document.addEventListener('visibilitychange', volver);
    return () => {
      window.removeEventListener(EVENTO_ANOTADO, traer);
      document.removeEventListener('visibilitychange', volver);
    };
  }, [traer]);
  const alAnotar = (item: ItemPuntos) => {
    setAbierta(false);
    irAlDia();
    setTimeout(() => window.dispatchEvent(new CustomEvent(EVENTO_CONTAR, { detail: item })), 150);
  };

  // Al cruzar 50 y 100 puntos en el día, la mascota festeja (una vez por día y por meta).
  useEffect(() => {
    if (!r) return;
    const antes = anterior.current;
    anterior.current = r.hoy.puntos;
    if (antes === null) return;
    for (const meta of [100, PUNTOS_RACHA]) {
      if (antes < meta && r.hoy.puntos >= meta) {
        const clave = `${r.hoy.fecha}|${meta}`;
        try {
          const hechos = JSON.parse(localStorage.getItem(CLAVE_FESTEJADO) ?? '[]') as string[];
          if (hechos.includes(clave)) return;
          localStorage.setItem(CLAVE_FESTEJADO, JSON.stringify([...hechos.slice(-20), clave]));
        } catch {
          /* sin almacenamiento */
        }
        setTimeout(() => festejar(meta === 100 ? t('¡100 puntos hoy! Día completo 🏆') : t('¡Llegaste a {n} puntos! El día ya suma a tu racha 🔥', { n: meta })), 2500);
        return;
      }
    }
  }, [r, festejar]);

  if (!r) return null;
  const { hoy } = r;
  const estado: EstadoPuntos = hoy.puntos >= 100 ? 'completo' : hoy.puntos >= 70 ? 'casi' : hoy.puntos >= 35 ? 'bien' : 'arranca';
  const faltan = hoy.items.filter((i) => i.puntos < i.maximo).sort((a, b) => b.maximo - b.puntos - (a.maximo - a.puntos));

  return (
    <>
      {/* El búho "dice" los puntos: su cara (contento, esperando, con sueño…) y el globito con la estrella. */}
      <span className={`mini-puntos${ganancia ? ' gana' : ''}`} key={ganancia?.id ?? 0}>
        <button className="boton-buho" onClick={alTocarBuho} aria-label={t('Patty: contale cómo te sentís')}>
          {cara ? <Mascota cara={cara} tamano={64} className={`buho-puntos${ganancia ? ' saltando' : ' vivo'}`} /> : null}
        </button>
        <button className="globo-puntos" onClick={() => setAbierta(true)} aria-label={t('{n} puntos de 100', { n: hoy.puntos })}>
        <span className="estrella" aria-hidden>⭐</span>
        <span className="numero">{mostrado}</span>
        </button>
        {ganancia ? (
          <>
            <span className="mas-puntos" aria-hidden>+{ganancia.n}</span>
            <span className="chispas-puntos" aria-hidden>{['✨', '⭐', '✨', '💫'].map((c, k) => <i key={k} style={{ ['--k' as string]: k }}>{c}</i>)}</span>
          </>
        ) : null}
      </span>
      {abierta
        ? createPortal(
            <>
              <div className="velo" onClick={() => setAbierta(false)} />
    <div className={`hoja puntos-dia estado-${estado}`} role="dialog" aria-label={t('Puntos de hoy')}>
      <div className="cabeza-juego">
        <button className="btn-icono cerrar-juego" onClick={() => setAbierta(false)} aria-label={t('Cerrar')}>✕</button>
        {estado === 'completo' ? <span className="confeti" aria-hidden>{['🎉', '⭐', '✨', '🏆', '🎊', '⭐', '✨'].map((c, k) => <i key={k} style={{ ['--k' as string]: k }}>{c}</i>)}</span> : null}
        <Mascota cara={estado === 'completo' || estado === 'casi' ? 'feliz' : cara === 'dormida' ? 'dormida' : 'espera'} tamano={78} className="emoji-estado" />
        <strong className="titulo-estado">{t(ESTADOS_PUNTOS[estado].titulo)}</strong>
        <span className="frase-estado">
          {estado === 'completo'
            ? t('Anotaste todo lo importante. ¡Así Patty te conoce cada vez mejor!')
            : t(ESTADOS_PUNTOS[estado].frase, { n: Math.max(0, 100 - hoy.puntos) })}
        </span>
        <span className="puntaje-grande">
          <span aria-hidden>⭐</span> {hoy.puntos}
          {estado !== 'completo' ? <small>/100</small> : null}
        </span>
        {estado !== 'completo' ? (
          <span className="barra-juego" aria-hidden>
            <span style={{ width: `${Math.min(100, hoy.puntos)}%` }} />
            <i style={{ left: `${PUNTOS_RACHA}%` }} title={t('Racha')}>🔥</i>
          </span>
        ) : null}
      </div>
      <div className="fichas-juego">
        <div className="ficha">
          <strong>🔥 {r.racha}</strong>
          <span className="suave chico">{r.racha === 1 ? t('día de racha') : t('días de racha')}</span>
        </div>
        <div className="ficha">
          <strong>⭐ {r.semana.reduce((a, b) => a + b.puntos, 0)}</strong>
          <span className="suave chico">{t('en la semana')}</span>
        </div>
        <button className="ficha ficha-boton" onClick={() => setTablero(true)}>
          <strong>🏆</strong>
          <span className="suave chico">{t('Tablero')}</span>
        </button>
      </div>
      <div className="semana-juego" aria-label={t('Los últimos 7 días')}>
        {r.semana.map((d, k) => (
          <span key={d.fecha} className={`${d.puntos >= 100 ? 'lleno' : d.puntos >= PUNTOS_RACHA ? 'bien' : ''}${k === r.semana.length - 1 ? ' hoy' : ''}`}>
            <i style={{ height: `${Math.min(100, Math.max(6, d.puntos))}%` }} />
            <small>{new Intl.DateTimeFormat(locale(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(d.fecha + 'T12:00:00Z'))}</small>
          </span>
        ))}
      </div>
      {faltan.length ? (
        <>
          <p className="rotulo-campo">{estado === 'completo' ? t('Para sumar más:') : t('Lo que más suma:')}</p>
          <div className="chips envolver faltan-puntos">
            {faltan.slice(0, 6).map((i) => (
              <button key={i.clave} className="chip" onClick={() => alAnotar(i.clave)}>
                <span aria-hidden>{ITEMS_PUNTOS[i.clave].icono}</span> {t(ITEMS_PUNTOS[i.clave].nombre)} <strong>+{i.maximo - i.puntos}</strong>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <p className="suave chico centro">{t('Cada cosa de más que anotes suma +2.')}</p>
      {tablero
        ? createPortal(
            <>
              <div className="velo" onClick={() => setTablero(false)} />
              <Tablero alCerrar={() => setTablero(false)} />
            </>,
            document.body,
          )
        : null}
    </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
