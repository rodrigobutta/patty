// En el Día: las vueltas a pie que vio la ubicación y todavía no se anotaron ("Saliste a caminar 15 min, ¿qué fue?"),
// con lo que se suele contestar para anotarlas con un toque, otra cosa escrita, o no anotarlas. Patty también lo
// pregunta con un aviso; con el tiempo aprende y pregunta directo ("¿Paseo con los perros?").
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';

interface Paseo { id: number; inicio: string; fin: string; metros: number }

export function PaseosPendientes({ persona, vuelta, alAnotar }: { persona: Persona; vuelta: number; alAnotar(): void }) {
  const { festejar, avisar } = useEstado();
  const [datos, setDatos] = useState<{ pendientes: Paseo[]; lista: string[]; directa: string | null } | null>(null);
  const [otro, setOtro] = useState<Record<number, string>>({});
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
  return (
    <>
      {datos.pendientes.map((p) => {
        const min = Math.round((Date.parse(p.fin) - Date.parse(p.inicio)) / 60000);
        const opciones = datos.directa ? [datos.directa, ...datos.lista.filter((x) => x !== datos.directa)] : datos.lista;
        return (
          <div key={p.id} className="tarjeta paseo-pendiente">
            <p>
              <strong>{datos.directa ? t('🦉 ¿{que}?', { que: t(datos.directa) }) : t('🚶 Saliste a caminar {n} min', { n: min })}</strong>{' '}
              <span className="suave chico">
                {horaEn(p.inicio, persona.zona_horaria)}–{horaEn(p.fin, persona.zona_horaria)} · {(Math.round(p.metros / 100) / 10).toLocaleString()} km
              </span>
            </p>
            <div className="chips envolver">
              {opciones.slice(0, 4).map((o, k) => (
                <button key={o} className={`chip${k === 0 && datos.directa ? ' activa' : ''}`} onClick={() => void responder(p, { concepto: o })}>{t(o)}</button>
              ))}
              <button className="chip" onClick={() => void responder(p, { descartar: true })}>{t('No anotar')}</button>
            </div>
            <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); if (otro[p.id]?.trim()) void responder(p, { concepto: otro[p.id].trim() }); }}>
              <input value={otro[p.id] ?? ''} onChange={(e) => setOtro({ ...otro, [p.id]: e.target.value })} placeholder={t('Otra cosa: ej. ir a la panadería')} />
              <button className="btn" disabled={!otro[p.id]?.trim()}>{t('Anotar')}</button>
            </form>
          </div>
        );
      })}
    </>
  );
}
