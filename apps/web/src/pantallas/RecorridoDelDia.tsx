// El mapita del día, de una sola cosa: en la hoja de Viajes, solo lo que fue en vehículo; en la de Movimiento, solo lo que
// fue a pie (ver ubicacion/movimiento.ts en la API). Una línea por cada vez, con el comienzo en verde y el final en ámbar, y
// los lugares con nombre donde estuviste. Primero todo el día junto; se puede elegir una vez y ver solo esa, con sus datos.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { duracion } from '../lib/automatico';
import { horaEn } from '../lib/fechas';
import { locale, t } from '../lib/idioma';
import { compartibleActividad } from '../lib/tarjetasDelDia';
import { BotonCompartir } from '../ui/HojaCompartir';
import { IconoCategoria } from '../ui/IconosPatty';
import { Mapa, type Ruta } from '../ui/Mapa';

interface Punta {
  lat: number;
  lon: number;
  lugar: string | null;
}

type RutaDelDia = Ruta & { inicio: string; fin: string; minutos: number; km: number; kmh: number; pasos: number | null; origen: Punta | null; destino: Punta | null };

interface Recorrido {
  rutas: RutaDelDia[];
  lugares: Array<{ nombre: string; lat: number; lon: number; radio_m: number }>;
  viajes: number;
  km: number;
}

const numero = (n: number) => n.toLocaleString(locale());

export function RecorridoDelDia({ persona, fecha, tipo, titulo }: { persona: Persona; fecha: string; tipo: 'a_pie' | 'vehiculo'; titulo?: string }) {
  const { usuario } = useEstado();
  const [r, setR] = useState<Recorrido | null>(null);
  /** La que se está mirando (por su hora de inicio). Sin elegir, todo el día. */
  const [elegida, setElegida] = useState<string | null>(null);
  useEffect(() => {
    setElegida(null);
    api<Recorrido>('GET', `/api/ubicacion/recorrido?persona=${persona.id}&fecha=${fecha}&tipo=${tipo}`).then(setR).catch(() => {});
  }, [persona.id, fecha, tipo]);
  if (!r?.rutas.length) return null;
  const km = r.rutas.reduce((s, x) => s + x.km, 0);
  // Con una sola no hay nada que elegir: "todo" ya es esa.
  const varias = r.rutas.length > 1;
  const vista = varias ? r.rutas.find((x) => x.inicio === elegida) : r.rutas[0];
  // De una sola, el mapa muestra su recorrido y, de los lugares, solo donde empezó o terminó.
  const lugares = vista ? r.lugares.filter((l) => l.nombre === vista.origen?.lugar || l.nombre === vista.destino?.lugar) : r.lugares;
  return (
    <div className="recorrido-dia">
      {titulo ? <p className="suave chico">{titulo}</p> : null}
      <Mapa
        rutas={vista ? [vista] : r.rutas}
        puntos={lugares.map((l) => ({ lat: l.lat, lon: l.lon, radio: l.radio_m, etiqueta: l.nombre }))}
        alto={220}
        interactivo
        etiquetasFijas={lugares.length <= 4}
      />
      <p className="suave chico leyenda-recorrido">
        <span className="punto-ini" aria-hidden /> {t('salida')} · <span className="punto-fin" aria-hidden /> {t('llegada')}
        {tipo === 'a_pie' && !vista && km >= 0.1 ? ` · ${t('{n} km a pie', { n: numero(Number(km.toFixed(1))) })}` : ''}
      </p>
      {varias ? (
        <div className="chips envolver recorrido-selector" role="group" aria-label={t('Cuál ver')}>
          <button className={`chip${vista ? '' : ' activa'}`} aria-pressed={!vista} onClick={() => setElegida(null)}>{t('Todo')}</button>
          {r.rutas.map((x) => (
            <button key={x.inicio} className={`chip${vista === x ? ' activa' : ''}`} aria-pressed={vista === x} onClick={() => setElegida(x.inicio)}>
              {horaEn(x.inicio, persona.zona_horaria)} · {numero(x.km)} km
            </button>
          ))}
        </div>
      ) : null}
      {vista ? <DatosDelRecorrido key={vista.inicio} ruta={vista} persona={persona} /> : null}
      {vista && usuario?.rol !== 'lector' ? (
        <div className="fila-compartir">
          <BotonCompartir armar={() => compartibleActividad({ persona, concepto: tipo === 'a_pie' ? 'Caminata' : 'Viaje', inicio: vista.inicio, fin: vista.fin, esViaje: tipo === 'vehiculo' })} />
        </div>
      ) : null}
    </div>
  );
}

/** Lo de una sola caminata o un solo viaje. Lo que no se sabe (los pasos, dónde empezó) no aparece. */
function DatosDelRecorrido({ ruta, persona }: { ruta: RutaDelDia; persona: Persona }) {
  const desde = useLugarDe(ruta.origen, persona.id);
  const hasta = useLugarDe(ruta.destino, persona.id);
  const filas: Array<[string, string | null]> = [
    [t('Horario'), `${horaEn(ruta.inicio, persona.zona_horaria)} → ${horaEn(ruta.fin, persona.zona_horaria)}`],
    [t('Duración'), duracion(ruta.minutos)],
    [t('Distancia'), `${numero(ruta.km)} km`],
    [t('Velocidad'), `${numero(ruta.kmh)} km/h`],
    [t('Pasos'), ruta.pasos ? numero(ruta.pasos) : null],
    [t('Desde'), desde],
    [t('Hasta'), hasta],
  ];
  return (
    <ul className="detalle-auto recorrido-datos">
      {filas.map(([que, valor]) =>
        valor ? (
          <li key={que}>
            <span className="que">{que}</span>
            <span className="valor-chip">{valor}</span>
          </li>
        ) : null,
      )}
    </ul>
  );
}

/** El nombre del lugar o, si no tiene, la dirección aproximada (se pide recién acá: ver /ubicacion/direccion). */
function useLugarDe(punta: Punta | null, personaId: number): string | null {
  const [direccion, setDireccion] = useState<string | null>(null);
  const falta = punta && !punta.lugar;
  const lat = punta?.lat;
  const lon = punta?.lon;
  useEffect(() => {
    if (!falta) return;
    let vivo = true;
    api<{ direccion: string | null }>('GET', `/api/ubicacion/direccion?persona=${personaId}&lat=${lat}&lon=${lon}`)
      .then((x) => {
        if (vivo) setDireccion(x.direccion);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [falta, lat, lon, personaId]);
  return punta?.lugar ?? direccion;
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
