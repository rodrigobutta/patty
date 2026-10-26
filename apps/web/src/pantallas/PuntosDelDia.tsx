// Los puntos de hoy: un circulito arriba (en la barra) que se llena; al tocarlo se abre una hoja con la racha, lo que
// falta para sumar más (tocar uno abre "Contale a Patty") y el tablero con la familia y el general.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ITEMS_PUNTOS, PUNTOS_RACHA, type ItemPuntos, type Persona, type PuntosDia } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { EVENTO_ANOTADO } from '../mascota/cara';
import { irAlDia } from '../lib/avisos';
import { t } from '../lib/idioma';
import { Tablero } from './Tablero';

interface Respuesta {
  hoy: PuntosDia;
  semana: PuntosDia[];
  racha: number;
}

const CLAVE_FESTEJADO = 'puntos-festejados';

/** Pedirle al Día que abra "Contale a Patty" con lo que se eligió sumar (desde la hoja de puntos, en la barra). */
export const EVENTO_CONTAR = 'patty-contar';

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

export function PuntosDelDia({ persona }: { persona: Persona }) {
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
  const largo = 2 * Math.PI * 34;
  const faltan = hoy.items.filter((i) => i.puntos < i.maximo).sort((a, b) => b.maximo - b.puntos - (a.maximo - a.puntos));

  return (
    <>
      <button className={`mini-puntos${ganancia ? ' gana' : ''}`} key={ganancia?.id ?? 0} onClick={() => setAbierta(true)} aria-label={t('{n} puntos de 100', { n: hoy.puntos })}>
        <span className="relleno" style={{ width: `${Math.max(8, hoy.puntos)}%` }} />
        <span className="estrella" aria-hidden>⭐</span>
        <span className="numero">{mostrado}</span>
        {ganancia ? (
          <>
            <span className="mas-puntos" aria-hidden>+{ganancia.n}</span>
            <span className="chispas-puntos" aria-hidden>{['✨', '⭐', '✨', '💫'].map((c, k) => <i key={k} style={{ ['--k' as string]: k }}>{c}</i>)}</span>
          </>
        ) : null}
      </button>
      {abierta
        ? createPortal(
            <>
              <div className="velo" onClick={() => setAbierta(false)} />
    <div className="hoja puntos-dia" role="dialog" aria-label={t('Puntos de hoy')}>
      <div className="hoja-cabeza">
        <span />
        <button className="btn-icono" onClick={() => setAbierta(false)} aria-label={t('Cerrar')}>✕</button>
      </div>
      <div className="puntos-cabeza">
        <svg viewBox="0 0 80 80" className="rueda-puntos" aria-label={t('{n} puntos de 100', { n: hoy.puntos })}>
          <defs>
            <linearGradient id="puntos-color" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--acento)" />
              <stop offset="1" stopColor="#e58bb4" />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r="34" className="fondo-rueda" />
          <circle
            cx="40"
            cy="40"
            r="34"
            className="arco-puntos"
            strokeDasharray={largo}
            strokeDashoffset={largo * (1 - hoy.puntos / 100)}
            style={{ ['--largo' as string]: largo }}
            transform="rotate(-90 40 40)"
          />
          <text x="40" y="44" textAnchor="middle" className="numero-puntos">{hoy.puntos}</text>
          <text x="40" y="58" textAnchor="middle" className="de-puntos">/100</text>
        </svg>
        <div className="que">
          <strong>{t('Puntos de hoy')}</strong>
          <span className="suave chico">
            {r.racha
              ? r.racha === 1
                ? t('🔥 1 día de racha')
                : t('🔥 {n} días de racha', { n: r.racha })
              : t('Llegá a {n} puntos para empezar una racha', { n: PUNTOS_RACHA })}
          </span>
          <button className="btn chico boton-tablero" onClick={() => setTablero(true)}>{t('🏆 Tablero')}</button>
        </div>
      </div>
      {faltan.length ? (
        <div className="chips envolver faltan-puntos">
          {faltan.slice(0, 6).map((i) => (
            <button key={i.clave} className="chip" onClick={() => alAnotar(i.clave)}>
              <span aria-hidden>{ITEMS_PUNTOS[i.clave].icono}</span> {t(ITEMS_PUNTOS[i.clave].nombre)} <strong>+{i.maximo - i.puntos}</strong>
            </button>
          ))}
        </div>
      ) : (
        <p className="suave chico">{t('¡Día completo! Anotaste todo lo importante.')}</p>
      )}
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
