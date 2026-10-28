// En el Día: los malestares que siguen abiertos ("🤕 Dolor de cabeza, desde las 15:30"), para contar cómo va con un
// toque: ya se me pasó (se cierra, con su duración), sigo igual, mejor o peor. Patty también lo pregunta con un aviso.
import { useEffect, useState } from 'react';
import type { Persona, Registro } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { duracion } from '../lib/automatico';

export function MalestaresAbiertos({ persona, vuelta, alCambiar }: { persona: Persona; vuelta: number; alCambiar(): void }) {
  const { festejar, avisar } = useEstado();
  const [lista, setLista] = useState<Registro[]>([]);
  useEffect(() => {
    api<Registro[]>('GET', `/api/registros/abiertos?persona=${persona.id}`).then(setLista).catch(() => {});
  }, [persona.id, vuelta]);
  if (!lista.length) return null;
  const responder = async (r: Registro, estado: 'paso' | 'igual' | 'mejor' | 'peor') => {
    try {
      await api('POST', `/api/registros/${r.id}/seguir`, { estado });
      medir('malestar_sigue', { estado });
      const que = t(r.concepto).toLowerCase();
      festejar(
        estado === 'paso'
          ? t('¡Qué bueno! Se te pasó {que} (duró {cuanto}) 💜', { que, cuanto: duracion((Date.now() - Date.parse(r.inicio)) / 60000) })
          : estado === 'mejor'
            ? t('¡Bien que vaya mejorando! 💜')
            : t('Anotado. Te pregunto más tarde 💜'),
        estado === 'paso' || estado === 'mejor' ? 'feliz' : 'espera',
      );
      setLista((l) => (estado === 'paso' ? l.filter((x) => x.id !== r.id) : l));
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  return (
    <div className="tarjeta malestares-abiertos">
      {lista.map((r) => (
        <div key={r.id} className="malestar-abierto">
          <p>
            <strong>{t('¿Seguís con {que}?', { que: t(r.concepto).toLowerCase() })}</strong>{' '}
            <span className="suave chico">{t('desde las {hora}', { hora: horaEn(r.inicio, persona.zona_horaria) })}</span>
          </p>
          <div className="chips envolver">
            <button className="chip activa" onClick={() => void responder(r, 'paso')}>{t('✓ Ya se me pasó')}</button>
            <button className="chip" onClick={() => void responder(r, 'mejor')}>{t('Mejor')}</button>
            <button className="chip" onClick={() => void responder(r, 'igual')}>{t('Igual')}</button>
            <button className="chip" onClick={() => void responder(r, 'peor')}>{t('Peor')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
