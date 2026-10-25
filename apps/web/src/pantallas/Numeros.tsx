// "Números" (en Patrones): lo que se ve en los datos de los últimos 30 o 90 días, sin buscar relaciones: cuánto se
// anotó, lo que más se repite, ánimo, dolores, sueño, clima, movimiento y remedios. Tocar algo lo abre en el buscador.
import { useEffect, useState } from 'react';
import { conUnidad, ESTADOS, estadoDe, type Estadisticas, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { duracion } from '../lib/automatico';
import { sumarDias } from '../lib/fechas';
import { idioma, locale, t } from '../lib/idioma';

const hora = (m: number | null) => (m === null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
const num = (n: number, dec = 0) => n.toLocaleString(locale(), { maximumFractionDigits: dec });

export function Numeros({ persona, alElegir }: { persona: Persona; alElegir(conceptoId: number): void }) {
  const { categorias } = useEstado();
  const [dias, setDias] = useState(30);
  const [e, setE] = useState<Estadisticas | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setE(null);
    api<Estadisticas>('GET', `/api/estadisticas?persona=${persona.id}&dias=${dias}`).then(setE).catch((x: Error) => setError(x.message));
  }, [persona.id, dias]);

  const icono = (categoriaId: number) => categorias.find((c) => c.id === categoriaId)?.icono ?? '📝';
  if (error) return <p className="neg">{error}</p>;
  if (!e) return <div className="tarjeta"><p className="suave centro">{t('Contando…')}</p></div>;

  // Un día por barra, con los que no tienen nada en cero.
  const porDia = new Map(e.actividad.map((a) => [a.fecha, a.n]));
  const barras = Array.from({ length: e.dias }, (_, i) => porDia.get(sumarDias(e.desde, i)) ?? 0);
  const maxBarra = Math.max(1, ...barras);
  const top = e.top.filter((x) => x.categoria !== 'sintoma').slice(0, 8);
  const maxTop = Math.max(1, ...top.map((x) => x.dias));
  const dias1 = (n: number) => (n === 1 ? t('día') : t('días'));
  const caritas = ESTADOS.map((s) => ({ ...s, n: e.animo.filter((i) => estadoDe(i).clave === s.clave).length }));
  const maxCarita = Math.max(1, ...caritas.map((c) => c.n));
  const durmio = e.sueno.acoste !== null && e.sueno.levante !== null ? (e.sueno.levante - e.sueno.acoste + 1440) % 1440 : null;
  const m = e.movimiento;
  const adherencia = e.remedios.programadas ? e.remedios.tomadas / e.remedios.programadas : null;

  return (
    <div className="numeros">
      <div className="segmentos ancho">
        {[30, 90].map((d) => <button key={d} className={dias === d ? 'activa' : ''} onClick={() => setDias(d)}>{t('Últimos {n} días', { n: d })}</button>)}
      </div>

      <div className="tarjeta">
        <p className="grande-numero"><strong>{e.dias_anotados}</strong> {t('de {n} días con algo anotado', { n: e.dias })}</p>
        <div className="barras-dias" aria-label={t('Cosas anotadas por día')}>
          {barras.map((n, i) => <span key={i} style={{ height: `${(n / maxBarra) * 100}%`, ['--i' as string]: i }} className={n ? '' : 'cero'} title={`${n}`} />)}
        </div>
        <p className="suave chico eje"><span>{t('hace {n} días', { n: e.dias })}</span><span>{t('hoy')}</span></p>
      </div>

      {top.length ? (
        <div className="tarjeta">
          <h3>{t('Lo que más anotaste')}</h3>
          <ul className="ranking">
            {top.map((x, i) => (
              <li key={x.concepto_id} onClick={() => alElegir(x.concepto_id)} style={{ ['--i' as string]: i }}>
                <span className="icono">{icono(x.categoria_id)}</span>
                <span className="que">
                  {t(x.concepto)}
                  <span className="barra-ranking"><span style={{ width: `${(x.dias / maxTop) * 100}%` }} /></span>
                </span>
                <span className="cifra">
                  <span><strong>{x.dias}</strong> {dias1(x.dias)}</span>
                  {x.suma && x.unidad ? <span className="suave chico">{conUnidad(x.suma, x.unidad, 1, idioma())}</span> : x.veces > x.dias ? <span className="suave chico">{t('{n} veces', { n: x.veces })}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {e.animo.length ? (
        <div className="tarjeta">
          <h3>{t('Cómo te sentiste')}</h3>
          <div className="caritas-barras">
            {caritas.map((c) => (
              <div key={c.clave}>
                <span className="columna-barra"><span style={{ height: `${(c.n / maxCarita) * 100}%` }} /></span>
                <span className="emoji">{c.emoji}</span>
                <strong>{c.n}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {e.dolores.length ? (
        <div className="tarjeta">
          <h3>{t('Dolores y molestias')}</h3>
          <ul className="ranking">
            {e.dolores.slice(0, 6).map((x, i) => (
              <li key={x.concepto_id} onClick={() => alElegir(x.concepto_id)} style={{ ['--i' as string]: i }}>
                <span className="icono">🤕</span>
                <span className="que">{t(x.concepto)}</span>
                <span className="cifra"><span><strong>{x.dias}</strong> {dias1(x.dias)}</span></span>
              </li>
            ))}
          </ul>
          <p className="suave chico">{t('Tocá uno para ver en qué días fue.')}</p>
        </div>
      ) : null}

      <div className="mosaico">
        {e.sueno.acoste !== null || e.sueno.levante !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">😴</span>
            <strong>{hora(e.sueno.acoste)} → {hora(e.sueno.levante)}</strong>
            <span className="suave chico">{t('te acostaste y levantaste, en promedio')}{durmio !== null ? ` (${duracion(durmio)})` : ''}</span>
          </div>
        ) : null}
        {e.clima.dias_con_datos ? (
          <div className="tarjeta dato">
            <span className="icono-dato">🌧️</span>
            <strong>{e.clima.dias_lluvia === 1 ? t('{n} día de lluvia', { n: 1 }) : t('{n} días de lluvia', { n: e.clima.dias_lluvia })}</strong>
            <span className="suave chico">{t('{n} mm en total', { n: num(e.clima.mm, 1) })}</span>
          </div>
        ) : null}
        {e.clima.sol_promedio !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">☀️</span>
            <strong>{t('{n} h de sol', { n: num(e.clima.sol_promedio, 1) })}</strong>
            <span className="suave chico">{t('por día, en promedio')}</span>
          </div>
        ) : null}
        {e.clima.temp_media !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">🌡️</span>
            <strong>{num(e.clima.temp_media, 1)} °C</strong>
            <span className="suave chico">{t('de promedio')}{e.clima.temp_max !== null ? t(', máxima {n} °C', { n: num(e.clima.temp_max, 1) }) : ''}</span>
          </div>
        ) : null}
        {m.pasos_promedio !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">👟</span>
            <strong>{t('{n} pasos', { n: num(m.pasos_promedio) })}</strong>
            <span className="suave chico">{t('por día, en promedio')}</span>
          </div>
        ) : null}
        {m.km ? (
          <div className="tarjeta dato">
            <span className="icono-dato">📍</span>
            <strong>{num(m.km)} km</strong>
            <span className="suave chico">{t('recorridos')}</span>
          </div>
        ) : null}
        {m.pantalla_promedio !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">📱</span>
            <strong>{duracion(m.pantalla_promedio)}</strong>
            <span className="suave chico">{t('de pantalla por día')}</span>
          </div>
        ) : null}
        {m.llamadas ? (
          <div className="tarjeta dato">
            <span className="icono-dato">📞</span>
            <strong>{t('{n} llamadas', { n: num(m.llamadas) })}</strong>
            <span className="suave chico">{t('en el período')}</span>
          </div>
        ) : null}
        {adherencia !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">💊</span>
            <strong>{t('{n}% de las tomas', { n: Math.round(adherencia * 100) })}</strong>
            <span className="suave chico">{t('{n} de {total} marcadas como tomadas', { n: e.remedios.tomadas, total: e.remedios.programadas })}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
