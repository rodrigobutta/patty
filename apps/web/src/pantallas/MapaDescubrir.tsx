// "Mapa" (en Descubrir): dónde estuviste en los últimos días. Un mapa de calor de los puntos guardados (más fuerte donde
// más estuviste o más pasaste) y los lugares con nombre, más grandes los de más tiempo; abajo, dónde pasaste más tiempo.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { duracion } from '../lib/automatico';
import { t } from '../lib/idioma';
import { Mapa, type Calor, type PuntoMapa } from '../ui/Mapa';
import { IconoCategoria } from '../ui/IconosPatty';

interface Frecuentes {
  lugares: Array<{ id: number; nombre: string; lat: number; lon: number; radio_m: number; minutos: number; dias: number }>;
  sin_nombre: Array<{ lat: number; lon: number; minutos: number; dias: number }>;
}

export function MapaDescubrir({ persona }: { persona: Persona }) {
  const [dias, setDias] = useState(30);
  const [verCalor, setVerCalor] = useState(true);
  const [verLugares, setVerLugares] = useState(true);
  const [calor, setCalor] = useState<Calor[] | null>(null);
  const [f, setF] = useState<Frecuentes | null>(null);
  useEffect(() => {
    setCalor(null);
    setF(null);
    api<Calor[]>('GET', `/api/ubicacion/calor?persona=${persona.id}&dias=${dias}`).then(setCalor).catch(() => setCalor([]));
    api<Frecuentes>('GET', `/api/ubicacion/frecuentes?persona=${persona.id}&dias=${dias}`).then(setF).catch(() => setF({ lugares: [], sin_nombre: [] }));
  }, [persona.id, dias]);

  const max = Math.max(1, ...(f?.lugares ?? []).map((l) => l.minutos), ...(f?.sin_nombre ?? []).map((l) => l.minutos));
  const puntos: PuntoMapa[] = verLugares && f
    ? [
        ...f.lugares.filter((l) => l.minutos > 0).map((l) => ({ lat: l.lat, lon: l.lon, etiqueta: l.nombre, peso: l.minutos / max })),
        ...f.sin_nombre.map((l) => ({ lat: l.lat, lon: l.lon, sinNombre: true, peso: l.minutos / max, etiqueta: t('Sin nombre · {n} días', { n: l.dias }) })),
      ]
    : [];
  const cargando = calor === null || f === null;
  const vacio = !cargando && !calor.length && !f.lugares.some((l) => l.minutos > 0) && !f.sin_nombre.length;

  return (
    <div className="mapa-descubrir">
      <div className="segmentos">
        {[7, 30, 90].map((n) => (
          <button key={n} className={dias === n ? 'activa' : ''} onClick={() => setDias(n)}>{t('{n} días', { n })}</button>
        ))}
      </div>
      <div className="chips">
        <button className={`chip${verCalor ? ' activa' : ''}`} onClick={() => setVerCalor(!verCalor)}>{t('🔥 Calor')}</button>
        <button className={`chip${verLugares ? ' activa' : ''}`} onClick={() => setVerLugares(!verLugares)}>{t('📍 Lugares')}</button>
      </div>
      {cargando ? (
        <div className="tarjeta mapa-esperando"><p className="suave centro">{t('Cargando…')}</p></div>
      ) : vacio ? (
        <div className="tarjeta"><p className="suave centro">{t('Todavía no hay ubicaciones guardadas. Activá la ubicación en Más → Lugares y en unos días vas a ver acá por dónde anduviste.')}</p></div>
      ) : (
        <div className="tarjeta mapa-grande">
          <Mapa puntos={puntos} calor={verCalor ? calor : []} alto={Math.round(Math.min(520, window.innerHeight * 0.55))} interactivo etiquetasFijas={puntos.length <= 6} />
          <p className="suave chico leyenda-calor">
            <span className="escala-calor" aria-hidden /> {t('Más fuerte: donde más estuviste o más pasaste')}
          </p>
        </div>
      )}
      {f && (f.lugares.some((l) => l.minutos > 0) || f.sin_nombre.length) ? (
        <div className="tarjeta">
          <h3>{t('Dónde pasaste más tiempo')}</h3>
          <ul className="ranking">
            {f.lugares.filter((l) => l.minutos > 0).map((l, i) => (
              <li key={l.id} style={{ ['--i' as string]: i }}>
                <span className="icono"><IconoCategoria clave="lugar" tamano={22} /></span>
                <span className="que">{l.nombre}</span>
                <span className="cifra"><span><strong>{duracion(l.minutos)}</strong></span><span className="suave chico">{l.dias === 1 ? t('{n} día', { n: 1 }) : t('{n} días', { n: l.dias })}</span></span>
              </li>
            ))}
            {f.sin_nombre.map((l, i) => (
              <li key={`${l.lat},${l.lon}`} style={{ ['--i' as string]: i }}>
                <span className="icono sin-nombre">●</span>
                <span className="que suave">{t('Un lugar sin nombre')}</span>
                <span className="cifra"><span><strong>{duracion(l.minutos)}</strong></span><span className="suave chico">{t('{n} días', { n: l.dias })}</span></span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
