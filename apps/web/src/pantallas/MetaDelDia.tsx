// En el Día de hoy, chiquito: uno de los objetivos de la persona, cómo viene su dato y un consejo o una pregunta. Uno solo por
// día aunque tenga varios (van rotando); al cerrarlo o contestarlo, hasta mañana. Sin objetivos, no ocupa lugar.
import { useEffect, useState } from 'react';
import type { ConsejoDelDia, Persona, RespuestaConsejo } from 'shared';
import { api } from '../api';
import { medir } from '../lib/analytics';
import { t } from '../lib/idioma';
import { irAMas } from '../lib/navegar';
import { textoMedida } from './Metas';

const RESPUESTAS: Array<{ clave: RespuestaConsejo; texto: string }> = [
  { clave: 'si', texto: 'Sí' },
  { clave: 'mas_o_menos', texto: 'Más o menos' },
  { clave: 'no', texto: 'No' },
];

/**
 * Un solo pedido a la vez. El servidor arma el consejo una vez por día y, mientras tanto, a otro pedido le contesta que no hay;
 * si la pantalla se vuelve a montar en el medio, esa respuesta vacía dejaría sin tarjeta hasta la próxima vez.
 */
const enCurso = new Map<number, Promise<ConsejoDelDia | null>>();
function pedirConsejo(personaId: number): Promise<ConsejoDelDia | null> {
  const ya = enCurso.get(personaId);
  if (ya) return ya;
  const p = api<ConsejoDelDia | null>('GET', `/api/metas/dia?persona=${personaId}`).finally(() => enCurso.delete(personaId));
  enCurso.set(personaId, p);
  return p;
}

export function MetaDelDia({ persona, hoy, puedeEscribir }: { persona: Persona; hoy: string; puedeEscribir: boolean }) {
  const [c, setC] = useState<ConsejoDelDia | null>(null);
  useEffect(() => {
    let vivo = true;
    setC(null);
    // Si el de hoy todavía no está, el servidor lo arma (puede tardar unos segundos): mientras, no se muestra nada.
    pedirConsejo(persona.id)
      .then((x) => vivo && setC(x?.estado === 'nuevo' ? x : null))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [persona.id, hoy]);
  if (!c) return null;
  const contestar = (cuerpo: { estado: 'visto' | 'gusta' } | { respuesta: RespuestaConsejo }) => {
    setC(null);
    medir('meta_dia', { tipo: c.tipo, ...cuerpo });
    void api('PUT', `/api/metas/dia/${c.id}`, cuerpo).catch(() => {});
  };
  return (
    <div className="tarjeta meta-del-dia">
      <button className="cabeza-meta-dia suave chico" onClick={() => irAMas('objetivos')} aria-label={t('Mirar tus objetivos')}>
        <span aria-hidden>{c.emoji}</span> {c.objetivo}
        {c.otros > 0 ? ` · ${c.otros === 1 ? t('{n} más', { n: 1 }) : t('{n} objetivos más', { n: c.otros })}` : ''}
      </button>
      <p>{c.texto}</p>
      {c.medida ? <p className="suave chico">{textoMedida(c.medida)}</p> : null}
      {puedeEscribir ? (
        <div className="pie-comentario">
          {c.tipo === 'pregunta' ? (
            RESPUESTAS.map((r) => (
              <button key={r.clave} className="btn chico" onClick={() => contestar({ respuesta: r.clave })}>{t(r.texto)}</button>
            ))
          ) : (
            <button className="btn chico" onClick={() => contestar({ estado: 'gusta' })} aria-label={t('Me gusta')}>👍</button>
          )}
          <span />
          <button className="btn chico" onClick={() => contestar({ estado: 'visto' })} aria-label={t('Cerrar')}>✕</button>
        </div>
      ) : null}
    </div>
  );
}
