// Lo que Patty comenta de lo que se viene anotando ("¡qué bien que comas huevo seguido!"): en el Día, de a uno (los
// de hoy que todavía no se cerraron); en Descubrir, mientras no hay patrones, la lista de lo que viene notando.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { t } from '../lib/idioma';

export interface Comentario {
  id: number;
  fecha: string;
  emoji: string;
  texto: string;
  estado: 'nuevo' | 'visto' | 'gusta';
}

/** En el Día de hoy: el primero de los comentarios nuevos, con 👍 y ✕; al contestar uno aparece el siguiente. */
export function ComentarioDelDia({ persona, hoy }: { persona: Persona; hoy: string }) {
  const [lista, setLista] = useState<Comentario[]>([]);
  useEffect(() => {
    let vivo = true;
    // Si los de hoy todavía no están, el servidor los arma (tarda unos segundos): mientras, no se muestra nada.
    api<Comentario[]>('GET', `/api/comentarios?persona=${persona.id}&dias=1&hoy=1`)
      .then((l) => vivo && setLista(l.filter((c) => c.fecha === hoy && c.estado === 'nuevo')))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [persona.id, hoy]);
  const c = lista[0];
  if (!c) return null;
  const contestar = (estado: 'visto' | 'gusta') => {
    setLista((l) => l.slice(1));
    void api('PUT', `/api/comentarios/${c.id}`, { estado }).catch(() => {});
  };
  return (
    <div className="tarjeta comentario-patty" key={c.id}>
      <span className="emoji-comentario" aria-hidden="true">{c.emoji}</span>
      <div className="cuerpo-comentario">
        <p>{c.texto}</p>
        <div className="pie-comentario">
          <span className="suave chico">{t('Patty')}{lista.length > 1 ? ` · ${t('{n} más', { n: lista.length - 1 })}` : ''}</span>
          <button className="btn chico" onClick={() => contestar('gusta')} aria-label={t('Me gusta')}>👍</button>
          <button className="btn chico" onClick={() => contestar('visto')} aria-label={t('Cerrar')}>✕</button>
        </div>
      </div>
    </div>
  );
}

/** En Descubrir, mientras no hay patrones: lo que Patty viene notando en los últimos días. */
export function LoQueVoyNotando({ persona }: { persona: Persona }) {
  const [lista, setLista] = useState<Comentario[] | null>(null);
  useEffect(() => {
    api<Comentario[]>('GET', `/api/comentarios?persona=${persona.id}&dias=14`).then(setLista).catch(() => setLista([]));
  }, [persona.id]);
  if (!lista?.length) return null;
  return (
    <div className="tarjeta voy-notando">
      <h3>{t('🦉 Lo que voy notando')}</h3>
      <p className="suave chico">{t('Mientras junto días para encontrar patrones, esto es lo que ya veo en lo que me contás.')}</p>
      <ul className="lista-simple">
        {lista.slice(0, 8).map((c) => (
          <li key={c.id}><span aria-hidden="true">{c.emoji}</span> {c.texto}</li>
        ))}
      </ul>
    </div>
  );
}
