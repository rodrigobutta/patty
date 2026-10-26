// En el Día (hoy): los puntos que lleva, en un círculo que se llena, la racha de días buenos y lo que falta para sumar
// más (tocar uno abre "Contale a Patty"). Desde acá se abre el tablero con la familia y el general.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ITEMS_PUNTOS, PUNTOS_RACHA, type Persona, type PuntosDia } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';
import { Tablero } from './Tablero';

interface Respuesta {
  hoy: PuntosDia;
  semana: PuntosDia[];
  racha: number;
}

const CLAVE_FESTEJADO = 'puntos-festejados';

export function PuntosDelDia({ persona, vuelta, alAnotar }: { persona: Persona; vuelta: number; alAnotar(): void }) {
  const { festejar } = useEstado();
  const [r, setR] = useState<Respuesta | null>(null);
  const [tablero, setTablero] = useState(false);
  const anterior = useRef<number | null>(null);

  const traer = useCallback(() => {
    api<Respuesta>('GET', `/api/puntos?persona=${persona.id}`).then(setR).catch(() => {});
  }, [persona.id]);
  useEffect(() => traer(), [traer, vuelta]);

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
    <div className="tarjeta puntos-dia">
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
            <button key={i.clave} className="chip" onClick={alAnotar}>
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
  );
}
