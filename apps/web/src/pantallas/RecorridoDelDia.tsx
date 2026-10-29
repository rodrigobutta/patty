// El mapita del día (en la hoja del widget de viajes o de pasos): por dónde anduviste, con el comienzo en verde, el final
// en ámbar y los lugares con nombre donde estuviste. Si un viaje empezó el día anterior o sigue al siguiente, ese
// tramo va punteado.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { compartibleActividad } from '../lib/tarjetasDelDia';
import { BotonCompartir } from '../ui/HojaCompartir';
import { IconoCategoria } from '../ui/IconosPatty';
import { Mapa, type Ruta } from '../ui/Mapa';

interface Recorrido extends Ruta {
  lugares: Array<{ nombre: string; lat: number; lon: number; radio_m: number }>;
  viajes: number;
  km: number;
}

export function RecorridoDelDia({ persona, fecha }: { persona: Persona; fecha: string }) {
  const [r, setR] = useState<Recorrido | null>(null);
  useEffect(() => {
    api<Recorrido>('GET', `/api/ubicacion/recorrido?persona=${persona.id}&fecha=${fecha}`).then(setR).catch(() => {});
  }, [persona.id, fecha]);
  if (!r || r.puntos.length < 1) return null;
  return (
    <div className="recorrido-dia">
      <Mapa
        ruta={r}
        puntos={r.lugares.map((l) => ({ lat: l.lat, lon: l.lon, radio: l.radio_m, etiqueta: l.nombre }))}
        alto={220}
        interactivo
        etiquetasFijas={r.lugares.length <= 4}
      />
      <p className="suave chico leyenda-recorrido">
        <span className="punto-ini" aria-hidden /> {t('salida')} · <span className="punto-fin" aria-hidden /> {t('llegada')}
        {r.antes || r.despues ? ` · ${t('punteado: del día anterior o siguiente')}` : ''}
      </p>
    </div>
  );
}

/** Las caminatas del día (detectadas en los pasos del reloj), con su hora y cuánto duraron (y para compartir cada una). */
export function CaminatasDelDia({ persona, fecha }: { persona: Persona; fecha: string }) {
  const { usuario } = useEstado();
  const [l, setL] = useState<Array<{ inicio: string; fin: string; minutos: number }>>([]);
  useEffect(() => {
    api<Array<{ inicio: string; fin: string; minutos: number }>>('GET', `/api/actividad/caminatas?persona=${persona.id}&fecha=${fecha}`).then(setL).catch(() => {});
  }, [persona.id, fecha]);
  if (!l.length) return null;
  return (
    <div className="caminatas-dia">
      <p className="suave chico">{t('Caminatas (10 minutos o más caminando seguido):')}</p>
      <ul className="lista-simple">
        {l.map((c) => (
          <li key={c.inicio} className="con-icono">
            <IconoCategoria clave="actividad" tamano={22} /> {horaEn(c.inicio, persona.zona_horaria)} – {horaEn(c.fin, persona.zona_horaria)} · {t('{n} min', { n: c.minutos })}
            {usuario?.rol !== 'lector' ? (
              <BotonCompartir className="btn chico compartir-caminata" armar={() => compartibleActividad({ persona, concepto: 'Caminata', inicio: c.inicio, fin: c.fin, esViaje: false })} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
