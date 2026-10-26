// "Tus lugares" (en Patrones → Números): un mapa con los lugares con nombre (más grandes los de más tiempo) y los
// lugares sin nombre donde te quedaste varios días, con la lista abajo. A los sin nombre se les pone nombre desde la
// tarjeta "¿Dónde estuviste?" del Día.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { duracion } from '../lib/automatico';
import { t } from '../lib/idioma';
import { Mapa, type PuntoMapa } from '../ui/Mapa';

interface Frecuentes {
  lugares: Array<{ id: number; nombre: string; lat: number; lon: number; radio_m: number; minutos: number; dias: number }>;
  sin_nombre: Array<{ lat: number; lon: number; minutos: number; dias: number }>;
}

export function MapaLugares({ persona, dias }: { persona: Persona; dias: number }) {
  const [f, setF] = useState<Frecuentes | null>(null);
  useEffect(() => {
    setF(null);
    api<Frecuentes>('GET', `/api/ubicacion/frecuentes?persona=${persona.id}&dias=${dias}`).then(setF).catch(() => {});
  }, [persona.id, dias]);
  if (!f || (!f.lugares.length && !f.sin_nombre.length)) return null;

  const max = Math.max(1, ...f.lugares.map((l) => l.minutos), ...f.sin_nombre.map((l) => l.minutos));
  const puntos: PuntoMapa[] = [
    ...f.lugares.map((l) => ({ lat: l.lat, lon: l.lon, etiqueta: l.nombre, peso: l.minutos / max })),
    ...f.sin_nombre.map((l) => ({ lat: l.lat, lon: l.lon, sinNombre: true, peso: l.minutos / max, etiqueta: t('Sin nombre · {n} días', { n: l.dias }) })),
  ];
  return (
    <div className="tarjeta mapa-lugares">
      <h3>{t('📍 Tus lugares')}</h3>
      <Mapa puntos={puntos} alto={300} interactivo etiquetasFijas={puntos.length <= 6} />
      <ul className="ranking">
        {f.lugares.filter((l) => l.minutos > 0).map((l, i) => (
          <li key={l.id} style={{ ['--i' as string]: i }}>
            <span className="icono">📍</span>
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
      {f.sin_nombre.length ? <p className="suave chico">{t('Los rosas son lugares frecuentes sin nombre: ponéselo desde «¿Dónde estuviste?» en el Día.')}</p> : null}
    </div>
  );
}
