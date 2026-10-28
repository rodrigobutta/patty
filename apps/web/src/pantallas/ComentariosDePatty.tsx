// Lo que Patty comenta de lo que se viene anotando ("¡qué bien que comas huevo seguido!"): en el Día, de a uno (los
// de hoy que todavía no se cerraron); en Descubrir, mientras no hay patrones, la lista de lo que viene notando.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { horaEn, nombreDia } from '../lib/fechas';
import { t } from '../lib/idioma';

export interface Comentario {
  id: number;
  fecha: string;
  emoji: string;
  texto: string;
  estado: 'nuevo' | 'visto' | 'gusta';
  /** Cuándo lo dijo Patty. */
  creado?: string;
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
  const [todos, setTodos] = useState(false);
  if (!lista?.length) return null;
  // Como una charla: los globitos de Patty agrupados por día, cada uno con la hora en que lo dijo.
  const visibles = todos ? lista : lista.slice(0, 8);
  const dias = [...new Set(visibles.map((c) => c.fecha))];
  return (
    <div className="tarjeta voy-notando">
      <h3>{t('🦉 Lo que voy notando')}</h3>
      <p className="suave chico">{t('Mientras junto días para encontrar patrones, esto es lo que ya veo en lo que me contás.')}</p>
      <div className="charla-patty">
        {dias.map((dia) => (
          <section key={dia}>
            <p className="dia-charla"><span>{nombreDia(dia, persona.zona_horaria)}</span></p>
            {visibles.filter((c) => c.fecha === dia).map((c) => (
              <div key={c.id} className="globo-fila">
                <span className="avatar-globo" aria-hidden="true">{c.emoji}</span>
                <div className="globo-patty">
                  <p>{c.texto}</p>
                  <span className="hora-globo">
                    {c.estado === 'gusta' ? <span aria-label={t('Te gustó')}>👍 </span> : null}
                    {c.creado ? horaEn(c.creado, persona.zona_horaria) : ''}
                  </span>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      {!todos && lista.length > 8 ? <button className="enlace chico" onClick={() => setTodos(true)}>{t('Ver todo ({n})', { n: lista.length })}</button> : null}
    </div>
  );
}

/** En el Día: lo que se salió de lo normal esta semana (menos sueño, una molestia que se repite…), con ✕ para cerrarlo. */
export function FueraDeLoNormal({ persona }: { persona: Persona }) {
  const [lista, setLista] = useState<Array<{ id: number; emoji: string; texto: string; estado: string }>>([]);
  useEffect(() => {
    api<typeof lista>('GET', `/api/fuera-de-lo-normal?persona=${persona.id}&dias=7`)
      .then((l) => setLista(l.filter((x) => x.estado === 'nuevo')))
      .catch(() => {});
  }, [persona.id]);
  if (!lista.length) return null;
  const cerrar = (id: number) => {
    setLista((l) => l.filter((x) => x.id !== id));
    void api('PUT', `/api/fuera-de-lo-normal/${id}`, { estado: 'visto' }).catch(() => {});
  };
  return (
    <>
      {lista.map((x) => (
        <div className="tarjeta comentario-patty fuera-de-lo-normal" key={x.id}>
          <span className="emoji-comentario" aria-hidden="true">{x.emoji}</span>
          <div className="cuerpo-comentario">
            <p className="suave chico">{t('🦉 Algo distinto estos días')}</p>
            <p>{x.texto}</p>
            <div className="pie-comentario">
              <span />
              <button className="btn chico" onClick={() => cerrar(x.id)} aria-label={t('Cerrar')}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
