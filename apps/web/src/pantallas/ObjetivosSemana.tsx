// Los objetivos de la semana en el Día: los que propuso el resumen del domingo ("Lo intento" / "No, gracias") y los
// aceptados, con un puntito por día (lleno si se cumplió) y cuántos van.
import { medir } from '../lib/analytics';
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { locale, t } from '../lib/idioma';

interface Objetivo {
  id: number;
  semana: string;
  texto: string;
  emoji: string;
  meta_dias: number;
  estado: 'propuesto' | 'aceptado';
  dias: Array<{ fecha: string; cumple: boolean | null }>;
  cumplidos: number;
}

export function ObjetivosSemana({ persona, hoy, vuelta }: { persona: Persona; hoy: string; vuelta: number }) {
  const { usuario, festejar } = useEstado();
  const [lista, setLista] = useState<Objetivo[]>([]);
  useEffect(() => {
    api<Objetivo[]>('GET', `/api/objetivos?persona=${persona.id}`).then(setLista).catch(() => {});
  }, [persona.id, vuelta]);
  if (!lista.length) return null;
  const puede = usuario?.rol !== 'lector';
  const propuestos = lista.filter((o) => o.estado === 'propuesto');
  const aceptados = lista.filter((o) => o.estado === 'aceptado');
  const responder = (o: Objetivo, estado: 'aceptado' | 'descartado') => {
    setLista((l) => (estado === 'aceptado' ? l.map((x) => (x.id === o.id ? { ...x, estado } : x)) : l.filter((x) => x.id !== o.id)));
    if (estado === 'aceptado') festejar(t('¡Vamos! 🎯'));
    medir('objetivo', { respuesta: estado });
    void api('PUT', `/api/objetivos/${o.id}`, { estado }).catch(() => {});
  };
  const letra = (f: string) => new Intl.DateTimeFormat(locale(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'));
  return (
    <div className="tarjeta objetivos-semana">
      {propuestos.length && puede ? (
        <>
          <p className="suave chico">{t('🦉 Para esta semana te propongo:')}</p>
          {propuestos.map((o) => (
            <div key={o.id} className="objetivo propuesto">
              <span className="emoji-objetivo" aria-hidden>{o.emoji}</span>
              <span className="texto-objetivo">{o.texto}</span>
              <div className="fila">
                <button className="btn chico primario" onClick={() => responder(o, 'aceptado')}>{t('Lo intento')}</button>
                <button className="btn chico" onClick={() => responder(o, 'descartado')}>{t('No, gracias')}</button>
              </div>
            </div>
          ))}
        </>
      ) : null}
      {aceptados.length ? (
        <>
          <p className="suave chico">{t('🎯 Tus objetivos de la semana')}</p>
          {aceptados.map((o) => {
            const logrado = o.cumplidos >= o.meta_dias;
            return (
              <div key={o.id} className={`objetivo${logrado ? ' logrado' : ''}`}>
                <span className="emoji-objetivo" aria-hidden>{logrado ? '🏆' : o.emoji}</span>
                <span className="texto-objetivo">
                  {o.texto}
                  <span className="suave chico">
                    {' · '}
                    {o.semana > hoy ? t('empieza el lunes') : logrado ? t('¡logrado!') : t('{n} de {meta} días', { n: o.cumplidos, meta: o.meta_dias })}
                  </span>
                </span>
                {o.semana <= hoy ? (
                  <span className="puntos-objetivo" aria-hidden>
                    {o.dias.map((d) => (
                      <span key={d.fecha} className={`punto ${d.cumple ? 'si' : d.cumple === false ? 'no' : 'falta'}${d.fecha === hoy ? ' hoy' : ''}`}>
                        {letra(d.fecha)}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
