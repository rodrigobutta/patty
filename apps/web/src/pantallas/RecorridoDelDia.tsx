// El mapita del día, de una sola cosa: en la hoja de Viajes, solo lo que fue en vehículo; en la de Movimiento, solo lo que
// fue a pie (ver ubicacion/movimiento.ts en la API). Una línea por cada vez, con el comienzo en verde y el final en ámbar, y
// los lugares con nombre donde estuviste.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { locale, t } from '../lib/idioma';
import { compartibleActividad } from '../lib/tarjetasDelDia';
import { BotonCompartir } from '../ui/HojaCompartir';
import { IconoCategoria } from '../ui/IconosPatty';
import { Mapa, type Ruta } from '../ui/Mapa';

interface Recorrido {
  rutas: Array<Ruta & { inicio: string; fin: string; km: number }>;
  lugares: Array<{ nombre: string; lat: number; lon: number; radio_m: number }>;
  viajes: number;
  km: number;
}

export function RecorridoDelDia({ persona, fecha, tipo, titulo }: { persona: Persona; fecha: string; tipo: 'a_pie' | 'vehiculo'; titulo?: string }) {
  const [r, setR] = useState<Recorrido | null>(null);
  useEffect(() => {
    api<Recorrido>('GET', `/api/ubicacion/recorrido?persona=${persona.id}&fecha=${fecha}&tipo=${tipo}`).then(setR).catch(() => {});
  }, [persona.id, fecha, tipo]);
  if (!r?.rutas.length) return null;
  const km = r.rutas.reduce((s, x) => s + x.km, 0);
  return (
    <div className="recorrido-dia">
      {titulo ? <p className="suave chico">{titulo}</p> : null}
      <Mapa
        rutas={r.rutas}
        puntos={r.lugares.map((l) => ({ lat: l.lat, lon: l.lon, radio: l.radio_m, etiqueta: l.nombre }))}
        alto={220}
        interactivo
        etiquetasFijas={r.lugares.length <= 4}
      />
      <p className="suave chico leyenda-recorrido">
        <span className="punto-ini" aria-hidden /> {t('salida')} · <span className="punto-fin" aria-hidden /> {t('llegada')}
        {tipo === 'a_pie' && km >= 0.1 ? ` · ${t('{n} km a pie', { n: Number(km.toFixed(1)).toLocaleString(locale()) })}` : ''}
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
