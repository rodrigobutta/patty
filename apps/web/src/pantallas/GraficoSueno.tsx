// El gráfico de la noche (en la hoja del widget de sueño): las etapas con su hora, en escalones — despierto arriba,
// después REM, ligero y profundo abajo — como en las apps de salud.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';

interface Tramo {
  inicio: string;
  fin: string;
  etapa: 'despierto' | 'ligero' | 'profundo' | 'rem' | 'dormido';
}

const NIVELES: Array<{ etapa: Tramo['etapa']; nombre: string; color: string }> = [
  { etapa: 'despierto', nombre: t('Despierto'), color: '#f2a33a' },
  { etapa: 'rem', nombre: 'REM', color: '#e58bb4' },
  { etapa: 'ligero', nombre: t('Ligero'), color: '#b4a0f0' },
  { etapa: 'profundo', nombre: t('Profundo'), color: '#6b4fbb' },
];
const ANCHO = 320;
const IZQ = 64;
const FILA = 30;
const ALTO_BARRA = 18;

const minutosTexto = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

export function GraficoSueno({ persona, fecha }: { persona: Persona; fecha: string }) {
  const [tramos, setTramos] = useState<Tramo[] | null>(null);
  useEffect(() => {
    api<Tramo[]>('GET', `/api/sueno/noche?persona=${persona.id}&fecha=${fecha}`).then(setTramos).catch(() => setTramos([]));
  }, [persona.id, fecha]);
  if (!tramos?.length) return null;

  const t0 = Date.parse(tramos[0].inicio);
  const t1 = Math.max(...tramos.map((x) => Date.parse(x.fin)));
  const x = (ms: number) => IZQ + ((ms - t0) / (t1 - t0)) * (ANCHO - IZQ - 6);
  const sinEtapas = tramos.every((x) => x.etapa === 'dormido');
  const nivel = (e: Tramo['etapa']) => NIVELES.findIndex((n) => n.etapa === (e === 'dormido' ? 'ligero' : e));
  const y = (e: Tramo['etapa']) => 8 + nivel(e) * FILA;
  // Las horas en punto para el eje de abajo (cada 2 horas si la noche es larga).
  const horas: number[] = [];
  const paso = (t1 - t0) / 3600000 > 6 ? 2 : 1;
  for (let h = Math.ceil(t0 / 3600000) * 3600000; h <= t1; h += 3600000) horas.push(h);
  const marcas = horas.filter((_, i) => i % paso === 0);
  const total = (e: Tramo['etapa']) => tramos.filter((x) => x.etapa === e).reduce((s, x) => s + (Date.parse(x.fin) - Date.parse(x.inicio)) / 60000, 0);
  const alto = 8 + NIVELES.length * FILA + 18;

  return (
    <div className="grafico-sueno">
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} width="100%" role="img" aria-label={t('Las etapas de la noche')}>
        {NIVELES.map((n, i) => (
          <g key={n.etapa}>
            <line x1={IZQ} x2={ANCHO - 4} y1={8 + i * FILA + ALTO_BARRA / 2} y2={8 + i * FILA + ALTO_BARRA / 2} className="linea-nivel" />
            <text x={IZQ - 8} y={8 + i * FILA + ALTO_BARRA / 2 + 4} textAnchor="end" className="rotulo-nivel">{n.nombre}</text>
          </g>
        ))}
        {/* Las uniones entre un tramo y el siguiente, finitas. */}
        {tramos.slice(1).map((tr, i) => {
          const ant = tramos[i];
          const xx = x(Date.parse(tr.inicio));
          return <line key={`u${i}`} x1={xx} x2={xx} y1={y(ant.etapa) + ALTO_BARRA / 2} y2={y(tr.etapa) + ALTO_BARRA / 2} className="union-etapa" />;
        })}
        {tramos.map((tr, i) => {
          const a = x(Date.parse(tr.inicio));
          const b = x(Date.parse(tr.fin));
          const color = NIVELES[nivel(tr.etapa)].color;
          return <rect key={i} x={a} y={y(tr.etapa)} width={Math.max(2, b - a)} height={ALTO_BARRA} rx="5" fill={color} />;
        })}
        {marcas.map((h) => (
          <text key={h} x={x(h)} y={alto - 4} textAnchor="middle" className="rotulo-hora">{horaEn(new Date(h).toISOString(), persona.zona_horaria)}</text>
        ))}
      </svg>
      {sinEtapas ? (
        <p className="suave chico">{t('Tu reloj no manda las etapas del sueño: se ve cuándo dormiste, sin profundo ni REM.')}</p>
      ) : (
        <div className="totales-sueno">
          {NIVELES.map((n) => (
            <span key={n.etapa} className="chip-etapa">
              <i style={{ background: n.color }} aria-hidden /> {n.nombre} · {minutosTexto(total(n.etapa))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Cómo fue tu noche", según la IA (se arma solo a la mañana; si falta, al abrir esto). */
export function ResumenNoche({ persona, fecha }: { persona: Persona; fecha: string }) {
  const [r, setR] = useState<{ texto: string; calidad: number } | null | undefined>(undefined);
  useEffect(() => {
    setR(undefined);
    api<{ texto: string; calidad: number } | null>('GET', `/api/sueno/resumen?persona=${persona.id}&fecha=${fecha}`).then(setR).catch(() => setR(null));
  }, [persona.id, fecha]);
  if (r === null) return null;
  return (
    <div className="nota-ia resumen-noche">
      {r === undefined ? (
        <p className="suave chico">{t('Patty está mirando tu noche…')}</p>
      ) : (
        <>
          <p className="cabeza-resumen-noche">
            <strong>{t('🦉 Cómo fue tu noche')}</strong>
            <span className={`calidad-sueno c${Math.ceil(r.calidad / 3.4)}`}>{r.calidad}/10</span>
          </p>
          <p>{r.texto}</p>
        </>
      )}
    </div>
  );
}
