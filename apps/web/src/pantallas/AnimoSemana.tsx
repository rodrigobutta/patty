// El ánimo de la semana en un widget: un mini gráfico de los últimos 7 días (el promedio de lo que contestó en
// "¿Cómo te sentís?") y si viene mejor o peor que la semana anterior. Tocándolo, el gráfico grande con lo que lo
// acompañó (las horas de sueño de fondo y los días con malestares marcados), día por día, y cómo te fue según dormiste.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { estadoDe, type Persona } from 'shared';
import { api } from '../api';
import { locale, t } from '../lib/idioma';
import { IconoAnimo, IconoCategoria } from '../ui/IconosPatty';
import { IconoPasos, IconoSueno } from '../ui/IconosWidget';
import { Mascota } from '../mascota/Mascota';

type Dia = { fecha: string; animo: number | null; sueno?: number | null; pasos?: number | null; malestares?: string[] };

const promedio = (d: Dia[]) => {
  const v = d.map((x) => x.animo).filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export function AnimoSemana({ persona, fecha, vuelta }: { persona: Persona; fecha: string; vuelta: number }) {
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    api<Dia[]>('GET', `/api/registros/animo-semana?persona=${persona.id}&hasta=${fecha}`).then(setDias).catch(() => setDias(null));
  }, [persona.id, fecha, vuelta]);
  if (!dias) return null;
  const semana = dias.slice(7);
  const conDato = semana.filter((d) => d.animo !== null).length;
  if (conDato < 2) return null;
  const esta = promedio(semana)!;
  const antes = promedio(dias.slice(0, 7));
  const dif = antes === null ? 0 : esta - antes;
  const sub = antes === null ? t('últimos 7 días') : dif >= 0.8 ? t('mejor que la anterior') : dif <= -0.8 ? t('peor que la anterior') : t('parecida a la anterior');
  const estado = estadoDe(esta);
  return (
    <>
      <button className="widget-auto" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={`${t('Ánimo de la semana')}: ${t(estado.nombre)}, ${sub}`}>
        <Linea dias={semana} />
        <span className="widget-linea">{t(estado.nombre)}</span>
        <span className="widget-sub">{sub}</span>
      </button>
      {abierto
        ? createPortal(
            <>
              <div className="velo" onClick={() => setAbierto(false)} />
              <div className="hoja hoja-widget" role="dialog" aria-label={t('Ánimo de la semana')}>
                <div className="hoja-cabeza">
                  <h3>{t('Ánimo de la semana')}</h3>
                  <button className="btn-icono" onClick={() => setAbierto(false)} aria-label={t('Cerrar')}>✕</button>
                </div>
                <div className="widget-grande">
                  <IconoAnimo clave={estado.clave} tamano={44} />
                  <span className="widget-linea">{t(estado.nombre)}</span>
                  <span className="widget-sub">{sub}</span>
                </div>
                <Linea dias={semana} grande />
                <p className="suave chico animo-leyenda">
                  <span className="muestra sueno" /> {t('horas de sueño')} · <span className="muestra malestar" /> {t('día con malestar')}
                </p>
                <Comparacion dias={dias} />
                <DiaPorDia dias={semana} />
                <p className="suave chico">{t('El promedio de cada día de lo que contestaste en "¿Cómo te sentís?".')}</p>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** La línea del ánimo: de 1 (abajo) a 10 (arriba); los días sin dato quedan como un punto gris sobre la base. */
function Linea({ dias, grande = false }: { dias: Dia[]; grande?: boolean }) {
  const an = grande ? 300 : 72;
  const al = grande ? 110 : 34;
  const pie = grande ? 18 : 0;
  const margen = grande ? 10 : 4;
  const x = (i: number) => margen + (i * (an - 2 * margen)) / (dias.length - 1);
  const y = (v: number) => margen + ((10 - v) * (al - 2 * margen)) / 9;
  const puntos = dias.map((d, i) => (d.animo === null ? null : { x: x(i), y: y(d.animo), v: d.animo }));
  // Se une lo que hay, salteando los días sin dato.
  const camino = puntos.filter((p): p is NonNullable<typeof p> => !!p).map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const dia = (f: string) => new Intl.DateTimeFormat(locale(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'));
  return (
    <svg className={`animo-linea${grande ? ' grande' : ''}`} viewBox={`0 0 ${an} ${al + pie}`} width={grande ? '100%' : an} height={grande ? undefined : al} aria-hidden>
      {grande ? <line x1={margen} x2={an - margen} y1={y(5.5)} y2={y(5.5)} className="medio" /> : null}
      {/* De fondo, las horas de sueño (de 0 a 10 h, en la misma altura que el ánimo) y arriba una marca los días con malestar. */}
      {grande
        ? dias.map((d, i) => {
            const h = d.sueno == null ? null : Math.min(d.sueno, 10);
            const ancho = (an - 2 * margen) / dias.length * 0.55;
            return (
              <g key={`f${d.fecha}`}>
                {h !== null ? <rect x={x(i) - ancho / 2} y={al - margen - (h / 10) * (al - 2 * margen)} width={ancho} height={(h / 10) * (al - 2 * margen)} rx={3} className="sueno" /> : null}
                {d.malestares?.length ? <circle cx={x(i)} cy={margen - 2} r={3.2} className="malestar" /> : null}
              </g>
            );
          })
        : null}
      <path d={camino} className="trazo" />
      {puntos.map((p, i) =>
        p ? <circle key={i} cx={p.x} cy={p.y} r={grande ? 4.5 : 2.6} className={p.v <= 4 ? 'baja' : 'alta'} /> : <circle key={i} cx={x(i)} cy={al - margen} r={grande ? 2.5 : 1.5} className="vacio" />,
      )}
      {grande ? dias.map((d, i) => <text key={d.fecha} x={x(i)} y={al + pie - 4} textAnchor="middle" className="dia">{dia(d.fecha)}</text>) : null}
    </svg>
  );
}

const horas = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;
};

/** Cómo te fue según dormiste, con las dos semanas: los días de 7 h o más contra los de menos (si hay de los dos). */
function Comparacion({ dias }: { dias: Dia[] }) {
  const bien = dias.filter((d) => d.animo !== null && d.sueno != null && d.sueno >= 7);
  const poco = dias.filter((d) => d.animo !== null && d.sueno != null && d.sueno < 7);
  const conMal = dias.filter((d) => d.animo !== null && d.malestares?.length);
  const sinMal = dias.filter((d) => d.animo !== null && !d.malestares?.length);
  const lineas: string[] = [];
  const dif = (a: Dia[], b: Dia[]) => (promedio(a) ?? 0) - (promedio(b) ?? 0);
  if (bien.length >= 2 && poco.length >= 2 && Math.abs(dif(bien, poco)) >= 0.5)
    lineas.push(
      dif(bien, poco) > 0
        ? t('Los días que dormiste 7 h o más te sentiste mejor ({a} contra {b}).', { a: t(estadoDe(promedio(bien)!).nombre).toLowerCase(), b: t(estadoDe(promedio(poco)!).nombre).toLowerCase() })
        : t('Dormir más no cambió mucho cómo te sentiste estas semanas.'),
    );
  if (conMal.length >= 2 && sinMal.length >= 2 && dif(sinMal, conMal) >= 0.5)
    lineas.push(t('Los días con algún malestar tu ánimo bajó bastante.'));
  if (!lineas.length) return null;
  return (
    <div className="animo-comparacion">
      {lineas.map((l) => (
        <p key={l}><Mascota cara="feliz" tamano={22} /> {l}</p>
      ))}
    </div>
  );
}

/** Los 7 días en una lista: cómo te sentiste, cuánto dormiste, los pasos y los malestares. */
function DiaPorDia({ dias }: { dias: Dia[] }) {
  const nombre = (f: string) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'));
  return (
    <ul className="animo-dias">
      {[...dias].reverse().map((d) => (
        <li key={d.fecha}>
          <span className="cuando">{nombre(d.fecha)}</span>
          <span className="animo">{d.animo !== null ? <><IconoAnimo clave={estadoDe(d.animo).clave} tamano={18} /> {t(estadoDe(d.animo).nombre)}</> : <span className="suave">—</span>}</span>
          <span className="suave chico animo-extras">
            {d.sueno != null ? <span><span className="mini-icono"><IconoSueno /></span>{horas(d.sueno)}</span> : null}
            {d.pasos != null ? <span><span className="mini-icono"><IconoPasos /></span>{d.pasos.toLocaleString(locale())}</span> : null}
            {(d.malestares ?? []).map((m) => (
              <span key={m}><IconoCategoria clave="sintoma" tamano={14} />{t(m)}</span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
