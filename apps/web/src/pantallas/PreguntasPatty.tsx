// En Más: las preguntas que Patty hace al anotar ciertas cosas ("Café" → "¿Con qué?"). Las sugeridas se suman con un
// toque; se pueden armar otras, apagarlas o borrarlas. Lo contestado entra a los patrones ("Café · Azúcar").
import { useEffect, useState } from 'react';
import { normalizar, PREGUNTAS_SUGERIDAS, type Persona, type PreguntaConcepto } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';
import { traerPreguntas } from '../lib/preguntas';

export function PreguntasPatty({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const { avisar } = useEstado();
  const [lista, setLista] = useState<PreguntaConcepto[] | null>(null);
  const [nueva, setNueva] = useState({ concepto: '', pregunta: '', opciones: '', varias: false });
  const traer = () => void traerPreguntas(persona.id).then(setLista).catch(() => setLista([]));
  useEffect(traer, [persona.id]);

  const hacer = async (f: () => Promise<unknown>) => {
    try {
      await f();
      traer();
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const sumar = (q: Omit<PreguntaConcepto, 'id' | 'persona_id' | 'activa'>) => hacer(() => api('POST', '/api/preguntas-concepto', { persona_id: persona.id, ...q }));
  const crear = () =>
    hacer(async () => {
      await api('POST', '/api/preguntas-concepto', { persona_id: persona.id, ...nueva, opciones: nueva.opciones.split(',').map((o) => o.trim()).filter(Boolean) });
      setNueva({ concepto: '', pregunta: '', opciones: '', varias: false });
    });
  const sugeridas = PREGUNTAS_SUGERIDAS.filter((s) => !lista?.some((q) => normalizar(q.concepto) === normalizar(s.concepto)));

  return (
    <>
      <div className="tarjeta">
        <p className="suave chico">{t('Cuando anotes estas cosas, Patty te pregunta el detalle (contándolo o con un toque), y así puede ver, por ejemplo, si el café con azúcar te cae distinto.')}</p>
        {lista?.length ? (
          <ul className="lista-simple preguntas-lista">
            {lista.map((q) => (
              <li key={q.id} className={q.activa ? '' : 'apagada'}>
                <span>
                  <strong>{q.concepto}</strong> · {q.pregunta}
                  <span className="suave chico"> {q.opciones.join(', ')}{q.varias ? ` · ${t('varias')}` : ''}</span>
                </span>
                {puedeEscribir ? (
                  <span className="fila">
                    <button className="btn chico" onClick={() => void hacer(() => api('PUT', `/api/preguntas-concepto/${q.id}`, { ...q, activa: !q.activa }))}>{q.activa ? t('Apagar') : t('Prender')}</button>
                    <button className="btn-icono" aria-label={t('Borrar')} onClick={() => void hacer(() => api('DELETE', `/api/preguntas-concepto/${q.id}`))}>✕</button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : lista ? (
          <p className="suave chico">{t('Todavía no hay preguntas.')}</p>
        ) : null}
      </div>
      {puedeEscribir && sugeridas.length ? (
        <div className="tarjeta">
          <h3>{t('Sugeridas')}</h3>
          <div className="chips envolver">
            {sugeridas.map((s) => (
              <button key={s.concepto} className="chip" onClick={() => void sumar(s)}>
                ＋ {t(s.concepto)}: {s.pregunta} <span className="suave chico">({s.opciones.join(', ')})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {puedeEscribir ? (
        <div className="tarjeta">
          <h3>{t('Armar una pregunta')}</h3>
          <label>{t('Cuando anote…')}<input value={nueva.concepto} onChange={(e) => setNueva({ ...nueva, concepto: e.target.value })} placeholder={t('Ej: Mate')} /></label>
          <label>{t('Preguntarme')}<input value={nueva.pregunta} onChange={(e) => setNueva({ ...nueva, pregunta: e.target.value })} placeholder={t('Ej: ¿Con qué?')} /></label>
          <label>{t('Respuestas (separadas por coma)')}<input value={nueva.opciones} onChange={(e) => setNueva({ ...nueva, opciones: e.target.value })} placeholder={t('Ej: Amargo, Dulce, Con edulcorante')} /></label>
          <label className="opcion">
            <input type="checkbox" checked={nueva.varias} onChange={(e) => setNueva({ ...nueva, varias: e.target.checked })} />
            <span>{t('Se puede elegir más de una')}</span>
          </label>
          <button className="btn primario" disabled={!nueva.concepto.trim() || !nueva.pregunta.trim() || nueva.opciones.split(',').filter((o) => o.trim()).length < 2} onClick={() => void crear()}>
            {t('Agregar')}
          </button>
        </div>
      ) : null}
    </>
  );
}
