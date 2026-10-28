// Las preguntas configuradas de una cosa ("¿Con qué?" azúcar, leche…), como chips para tocar.
import type { PreguntaConcepto } from 'shared';
import { t } from '../lib/idioma';
import { tocarRespuesta } from '../lib/preguntas';

export function PreguntasDetalle({ preguntas, elegidas, alCambiar }: {
  preguntas: PreguntaConcepto[];
  elegidas: Record<number, string[]>;
  alCambiar(e: Record<number, string[]>): void;
}) {
  if (!preguntas.length) return null;
  return (
    <div className="preguntas-detalle">
      {preguntas.map((q) => (
        <div key={q.id}>
          <span className="rotulo suave chico">{q.pregunta}{q.varias ? ` · ${t('podés elegir varias')}` : ''}</span>
          <div className="chips envolver">
            {q.opciones.map((o) => (
              <button key={o} type="button" className={`chip${elegidas[q.id]?.includes(o) ? ' activa' : ''}`} onClick={() => alCambiar(tocarRespuesta(elegidas, q, o))}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
