// En el Día: las vueltas a pie que vio la ubicación y todavía no se anotaron ("Saliste a caminar 15 min, ¿qué fue?"),
// con lo que se suele contestar para anotarlas con un toque, otra cosa escrita, o no anotarlas. Patty también lo
// pregunta con un aviso; con el tiempo aprende y pregunta directo ("¿Paseo con los perros?").
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { horaEn } from '../lib/fechas';
import { locale, t } from '../lib/idioma';
import { Mapa } from '../ui/Mapa';

interface Paseo { id: number; inicio: string; fin: string; metros: number; camino?: Array<{ lat: number; lon: number }> }

/** "Hoy", "Ayer" o el día de la semana: las que esperan pueden ser de días anteriores. */
function diaCorto(cuando: string, zona: string): string {
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: zona });
  const de = dia(new Date(cuando));
  if (de === dia(new Date())) return t('Hoy');
  if (de === dia(new Date(Date.now() - 86400000))) return t('Ayer');
  const w = new Intl.DateTimeFormat(locale(), { timeZone: zona, weekday: 'short' }).format(new Date(cuando));
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function PaseosPendientes({ persona, vuelta, alAnotar }: { persona: Persona; vuelta: number; alAnotar(): void }) {
  const { festejar, avisar } = useEstado();
  const [datos, setDatos] = useState<{ pendientes: Paseo[]; lista: string[]; directa: string | null } | null>(null);
  const [otro, setOtro] = useState<Record<number, string>>({});
  const [mapa, setMapa] = useState<Paseo | null>(null);
  useEffect(() => {
    api<typeof datos>('GET', `/api/paseos?persona=${persona.id}`).then(setDatos).catch(() => {});
  }, [persona.id, vuelta]);
  if (!datos?.pendientes.length) return null;
  const responder = async (p: Paseo, cuerpo: { concepto?: string; descartar?: boolean }) => {
    try {
      await api('POST', `/api/paseos/${p.id}`, cuerpo);
      medir('paseo', { respuesta: cuerpo.descartar ? 'descartar' : cuerpo.concepto === datos.directa ? 'directa' : 'otra' });
      setDatos((d) => d && { ...d, pendientes: d.pendientes.filter((x) => x.id !== p.id) });
      if (cuerpo.concepto) {
        festejar(t('¡Anotado! {que}, {n} min 💪', { que: t(cuerpo.concepto), n: Math.round((Date.parse(p.fin) - Date.parse(p.inicio)) / 60000) }));
        alAnotar();
      }
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const opciones = datos.directa ? [datos.directa, ...datos.lista.filter((x) => x !== datos.directa)] : datos.lista;
  const n = datos.pendientes.length;
  return (
    <>
      {/* Una sola tarjeta para todas, cada una igual a las demás: el mapita (o el muñequito si no hay recorrido), el día y la hora, y las respuestas. */}
      <div className="tarjeta paseo-pendiente">
        <p className="paseos-cabeza">
          <strong>
            {datos.directa
              ? n === 1 ? t('🦉 ¿{que}?', { que: t(datos.directa) }) : t('🦉 ¿{que}? Tenés {n} sin anotar', { que: t(datos.directa), n })
              : n === 1 ? t('🚶 Saliste a caminar: ¿qué fue?') : t('🚶 {n} caminatas sin anotar: ¿qué fueron?', { n })}
          </strong>
        </p>
        <ul className="paseos-lista">
          {datos.pendientes.map((p) => {
            const min = Math.round((Date.parse(p.fin) - Date.parse(p.inicio)) / 60000);
            const conMapa = (p.camino?.length ?? 0) > 1;
            return (
              <li key={p.id} className="paseo-item">
                <button className="paseo-mapita" onClick={() => conMapa && setMapa(p)} disabled={!conMapa} aria-label={conMapa ? t('Ver por dónde fue') : t('Sin recorrido para mostrar')}>
                  {conMapa ? <Mapa ruta={{ puntos: p.camino! }} puntos={[]} alto={64} /> : <span aria-hidden>🚶</span>}
                </button>
                <div className="paseo-cuerpo">
                  <span className="chico">
                    <strong>{diaCorto(p.inicio, persona.zona_horaria)}</strong> {horaEn(p.inicio, persona.zona_horaria)}–{horaEn(p.fin, persona.zona_horaria)}
                    <span className="suave"> · {t('{n} min', { n: min })} · {(Math.round(p.metros / 100) / 10).toLocaleString()} km</span>
                  </span>
                  <div className="chips envolver">
                    {opciones.slice(0, 3).map((o, k) => (
                      <button key={o} className={`chip${k === 0 && datos.directa ? ' activa' : ''}`} onClick={() => void responder(p, { concepto: o })}>{t(o)}</button>
                    ))}
                    <button className="chip" onClick={() => setOtro({ ...otro, [p.id]: otro[p.id] ?? '' })}>{t('Otra cosa')}</button>
                    <button className="chip" onClick={() => void responder(p, { descartar: true })}>{t('No anotar')}</button>
                  </div>
                  {otro[p.id] !== undefined ? (
                    <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); if (otro[p.id]?.trim()) void responder(p, { concepto: otro[p.id].trim() }); }}>
                      <input autoFocus value={otro[p.id]} onChange={(e) => setOtro({ ...otro, [p.id]: e.target.value })} placeholder={t('Otra cosa: ej. ir a la panadería')} />
                      <button className="btn" disabled={!otro[p.id]?.trim()}>{t('Anotar')}</button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {mapa
        ? createPortal(
            <>
              <div className="velo" onClick={() => setMapa(null)} />
              <div className="hoja" role="dialog" aria-label={t('Por dónde fue')}>
                <div className="hoja-cabeza">
                  <h3>{t('Por dónde fue')}</h3>
                  <button className="btn-icono" onClick={() => setMapa(null)} aria-label={t('Cerrar')}>✕</button>
                </div>
                <Mapa ruta={{ puntos: mapa.camino! }} puntos={[]} alto={340} interactivo />
                <p className="suave chico">
                  {horaEn(mapa.inicio, persona.zona_horaria)}–{horaEn(mapa.fin, persona.zona_horaria)} · {(Math.round(mapa.metros / 100) / 10).toLocaleString()} km
                </p>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
