// "¿Qué pasó antes?" (al abrir una molestia o un mal momento): unas líneas de Patty y lo de las 48 horas previas. Lo
// arma el servidor al rato de anotarlo; si todavía no está, se avisa que viene en camino.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { horaEn, nombreDia, hoyEn } from '../lib/fechas';
import { t } from '../lib/idioma';

interface Contexto {
  texto: string | null;
  items: Array<{ cuando: string; emoji: string; texto: string }>;
}

export function QuePasoAntes({ persona, registroId }: { persona: Persona; registroId: number }) {
  const [c, setC] = useState<Contexto | null | undefined>(undefined);
  const [verTodo, setVerTodo] = useState(false);
  useEffect(() => {
    api<Contexto | null>('GET', `/api/registros/${registroId}/contexto`).then(setC).catch(() => setC(null));
  }, [registroId]);
  if (c === undefined) return null;
  const items = verTodo ? c?.items ?? [] : (c?.items ?? []).slice(0, 6);
  return (
    <div className="nota-ia que-paso-antes">
      <p><strong>{t('🦉 Lo que pasó antes')}</strong></p>
      {c === null ? (
        <p className="suave chico">{t('Estoy mirando lo de las horas anteriores: en un ratito lo ves acá.')}</p>
      ) : (
        <>
          {c.texto ? <p>{c.texto}</p> : null}
          {c.items.length ? (
            <ul className="linea-antes">
              {items.map((x) => (
                <li key={x.cuando + x.texto}>
                  <span className="suave chico">{nombreDia(hoyEn(persona.zona_horaria, new Date(x.cuando)), persona.zona_horaria)} {horaEn(x.cuando, persona.zona_horaria)}</span>
                  <span>{x.emoji} {t(x.texto)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="suave chico">{t('No hay nada anotado en las 48 horas anteriores.')}</p>
          )}
          {c.items.length > 6 && !verTodo ? <button className="enlace chico" onClick={() => setVerTodo(true)}>{t('Ver todo ({n})', { n: c.items.length })}</button> : null}
        </>
      )}
    </div>
  );
}
