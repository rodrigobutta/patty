// "Números" (en Patrones): lo que se ve en los datos de los últimos 30 o 90 días, sin buscar relaciones: cuánto se
// anotó, lo que más se repite, ánimo, dolores, sueño, clima, movimiento y remedios. Tocar algo lo abre en el buscador.
import { useEffect, useState } from 'react';
import { ESTADOS, estadoDe, type Estadisticas, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { duracion } from '../lib/automatico';
import { sumarDias } from '../lib/fechas';

const hora = (m: number | null) => (m === null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
const num = (n: number, dec = 0) => n.toLocaleString('es-AR', { maximumFractionDigits: dec });

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
  if (!e) return <div className="tarjeta"><p className="suave centro">Contando…</p></div>;

  // Un día por barra, con los que no tienen nada en cero.
  const porDia = new Map(e.actividad.map((a) => [a.fecha, a.n]));
  const barras = Array.from({ length: e.dias }, (_, i) => porDia.get(sumarDias(e.desde, i)) ?? 0);
  const maxBarra = Math.max(1, ...barras);
  const top = e.top.filter((t) => t.categoria !== 'sintoma').slice(0, 8);
  const maxTop = Math.max(1, ...top.map((t) => t.dias));
  const caritas = ESTADOS.map((s) => ({ ...s, n: e.animo.filter((i) => estadoDe(i).clave === s.clave).length }));
  const maxCarita = Math.max(1, ...caritas.map((c) => c.n));
  const durmio = e.sueno.acoste !== null && e.sueno.levante !== null ? (e.sueno.levante - e.sueno.acoste + 1440) % 1440 : null;
  const m = e.movimiento;
  const adherencia = e.remedios.programadas ? e.remedios.tomadas / e.remedios.programadas : null;

  return (
    <div className="numeros">
      <div className="segmentos ancho">
        {[30, 90].map((d) => <button key={d} className={dias === d ? 'activa' : ''} onClick={() => setDias(d)}>Últimos {d} días</button>)}
      </div>

      <div className="tarjeta">
        <p className="grande-numero"><strong>{e.dias_anotados}</strong> de {e.dias} días con algo anotado</p>
        <div className="barras-dias" aria-label="Cosas anotadas por día">
          {barras.map((n, i) => <span key={i} style={{ height: `${(n / maxBarra) * 100}%`, ['--i' as string]: i }} className={n ? '' : 'cero'} title={`${n}`} />)}
        </div>
        <p className="suave chico eje"><span>hace {e.dias} días</span><span>hoy</span></p>
      </div>

      {top.length ? (
        <div className="tarjeta">
          <h3>Lo que más anotaste</h3>
          <ul className="ranking">
            {top.map((t, i) => (
              <li key={t.concepto_id} onClick={() => alElegir(t.concepto_id)} style={{ ['--i' as string]: i }}>
                <span className="icono">{icono(t.categoria_id)}</span>
                <span className="que">
                  {t.concepto}
                  <span className="barra-ranking"><span style={{ width: `${(t.dias / maxTop) * 100}%` }} /></span>
                </span>
                <span className="cifra">
                  <span><strong>{t.dias}</strong> {t.dias === 1 ? 'día' : 'días'}</span>
                  {t.suma && t.unidad ? <span className="suave chico">{num(t.suma, 1)} {t.unidad}</span> : t.veces > t.dias ? <span className="suave chico">{t.veces} veces</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {e.animo.length ? (
        <div className="tarjeta">
          <h3>Cómo te sentiste</h3>
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
          <h3>Dolores y molestias</h3>
          <ul className="ranking">
            {e.dolores.slice(0, 6).map((t, i) => (
              <li key={t.concepto_id} onClick={() => alElegir(t.concepto_id)} style={{ ['--i' as string]: i }}>
                <span className="icono">🤕</span>
                <span className="que">{t.concepto}</span>
                <span className="cifra"><span><strong>{t.dias}</strong> {t.dias === 1 ? 'día' : 'días'}</span></span>
              </li>
            ))}
          </ul>
          <p className="suave chico">Tocá uno para ver en qué días fue.</p>
        </div>
      ) : null}

      <div className="mosaico">
        {e.sueno.acoste !== null || e.sueno.levante !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">😴</span>
            <strong>{hora(e.sueno.acoste)} → {hora(e.sueno.levante)}</strong>
            <span className="suave chico">te acostaste y levantaste, en promedio{durmio !== null ? ` (${duracion(durmio)})` : ''}</span>
          </div>
        ) : null}
        {e.clima.dias_con_datos ? (
          <div className="tarjeta dato">
            <span className="icono-dato">🌧️</span>
            <strong>{e.clima.dias_lluvia} {e.clima.dias_lluvia === 1 ? 'día' : 'días'} de lluvia</strong>
            <span className="suave chico">{num(e.clima.mm, 1)} mm en total</span>
          </div>
        ) : null}
        {e.clima.sol_promedio !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">☀️</span>
            <strong>{num(e.clima.sol_promedio, 1)} h de sol</strong>
            <span className="suave chico">por día, en promedio</span>
          </div>
        ) : null}
        {e.clima.temp_media !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">🌡️</span>
            <strong>{num(e.clima.temp_media, 1)} °C</strong>
            <span className="suave chico">de promedio{e.clima.temp_max !== null ? `, máxima ${num(e.clima.temp_max, 1)} °C` : ''}</span>
          </div>
        ) : null}
        {m.pasos_promedio !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">👟</span>
            <strong>{num(m.pasos_promedio)} pasos</strong>
            <span className="suave chico">por día, en promedio</span>
          </div>
        ) : null}
        {m.km ? (
          <div className="tarjeta dato">
            <span className="icono-dato">📍</span>
            <strong>{num(m.km)} km</strong>
            <span className="suave chico">recorridos</span>
          </div>
        ) : null}
        {m.pantalla_promedio !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">📱</span>
            <strong>{duracion(m.pantalla_promedio)}</strong>
            <span className="suave chico">de pantalla por día</span>
          </div>
        ) : null}
        {m.llamadas ? (
          <div className="tarjeta dato">
            <span className="icono-dato">📞</span>
            <strong>{num(m.llamadas)} llamadas</strong>
            <span className="suave chico">en el período</span>
          </div>
        ) : null}
        {adherencia !== null ? (
          <div className="tarjeta dato">
            <span className="icono-dato">💊</span>
            <strong>{Math.round(adherencia * 100)}% de las tomas</strong>
            <span className="suave chico">{e.remedios.tomadas} de {e.remedios.programadas} marcadas como tomadas</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
