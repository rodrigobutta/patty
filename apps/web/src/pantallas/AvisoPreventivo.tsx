// En el Día de hoy: el aviso preventivo (hoy se juntaron las cosas de uno de tus patrones, y otras veces después vino
// tal cosa). Lo arma el servidor, que también lo manda por push a la tarde; con ✕ se cierra hasta mañana.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { t } from '../lib/idioma';

interface Preventivo {
  hallazgo_id: number;
  titulo: string;
  cuerpo: string;
}

const clave = (personaId: number, hoy: string) => `preventivo-cerrados|${personaId}|${hoy}`;

function cerrados(personaId: number, hoy: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(clave(personaId, hoy)) ?? '[]') as number[];
  } catch {
    return [];
  }
}

export function AvisoPreventivo({ persona, hoy }: { persona: Persona; hoy: string }) {
  const [lista, setLista] = useState<Preventivo[]>([]);
  useEffect(() => {
    api<Preventivo[]>('GET', `/api/preventivo?persona=${persona.id}`)
      .then((l) => {
        const fuera = cerrados(persona.id, hoy);
        setLista(l.filter((x) => !fuera.includes(x.hallazgo_id)));
      })
      .catch(() => {});
  }, [persona.id, hoy]);
  if (!lista.length) return null;
  const cerrar = (id: number) => {
    setLista((l) => l.filter((x) => x.hallazgo_id !== id));
    try {
      localStorage.setItem(clave(persona.id, hoy), JSON.stringify([...cerrados(persona.id, hoy), id]));
    } catch {
      /* sin almacenamiento: vuelve a aparecer al abrir el Día */
    }
  };
  return (
    <>
      {lista.map((x) => (
        <div className="tarjeta comentario-patty aviso-preventivo" key={x.hallazgo_id}>
          <span className="emoji-comentario" aria-hidden="true">🛡️</span>
          <div className="cuerpo-comentario">
            <p className="suave chico">{x.titulo}</p>
            <p>{x.cuerpo}</p>
            <div className="pie-comentario">
              <span className="suave chico">{t('Es un patrón tuyo, no una certeza.')}</span>
              <button className="btn chico" onClick={() => cerrar(x.hallazgo_id)} aria-label={t('Cerrar')}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
