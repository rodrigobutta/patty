// El ánimo de la semana en un widget: un mini gráfico de los últimos 7 días (el promedio de lo que contestó en
// "¿Cómo te sentís?") y si viene mejor o peor que la semana anterior. Tocándolo, el mismo gráfico más grande, con los días.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { estadoDe, type Persona } from 'shared';
import { api } from '../api';
import { locale, t } from '../lib/idioma';
import { IconoAnimo } from '../ui/IconosPatty';

type Dia = { fecha: string; animo: number | null };

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
      <path d={camino} className="trazo" />
      {puntos.map((p, i) =>
        p ? <circle key={i} cx={p.x} cy={p.y} r={grande ? 4.5 : 2.6} className={p.v <= 4 ? 'baja' : 'alta'} /> : <circle key={i} cx={x(i)} cy={al - margen} r={grande ? 2.5 : 1.5} className="vacio" />,
      )}
      {grande ? dias.map((d, i) => <text key={d.fecha} x={x(i)} y={al + pie - 4} textAnchor="middle" className="dia">{dia(d.fecha)}</text>) : null}
    </svg>
  );
}
