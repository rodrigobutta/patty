// "Tu gente" (en Más → Personas y datos): las personas con las que solés estar (familia, amigos, compañeros), para
// anotar con un toque con quién estuviste. Se da de alta, se le cambia el nombre o se saca de la lista.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { genteGuardada, traerGente, type Alguien } from '../lib/gente';
import { t } from '../lib/idioma';

export function Gente({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const { avisar } = useEstado();
  const [lista, setLista] = useState<Alguien[]>(genteGuardada(persona.id));
  const [nuevo, setNuevo] = useState('');
  const traer = () => void traerGente(persona.id).then(setLista).catch(() => {});
  useEffect(traer, [persona.id]);

  const hacer = async (f: () => Promise<unknown>) => {
    try {
      await f();
      traer();
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const agregar = () => {
    const n = nuevo.trim();
    if (!n) return;
    setNuevo('');
    void hacer(() => api('POST', '/api/gente', { persona_id: persona.id, nombre: n }));
  };
  const renombrar = (a: Alguien) => {
    const n = prompt(t('Nuevo nombre'), a.nombre)?.trim();
    if (n && n !== a.nombre) void hacer(() => api('PUT', `/api/gente/${a.id}`, { persona_id: persona.id, nombre: n }));
  };
  const sacar = (a: Alguien) => {
    if (confirm(t('¿Sacar a {nombre} de tu gente? Lo ya anotado queda.', { nombre: a.nombre }))) void hacer(() => api('DELETE', `/api/gente/${a.id}?persona=${persona.id}`));
  };

  return (
    <div className="tarjeta">
      <h3>{t('👥 Tu gente')}</h3>
      <p className="suave chico">{t('Con quién solés estar: así anotás con un toque con quién estuviste, y Patty ve si te hace bien.')}</p>
      {lista.length ? (
        <ul className="lista">
          {lista.map((a) => (
            <li key={a.id}>
              <span className="icono">👤</span>
              <span className="que">
                {a.nombre}
                {a.veces ? <span className="suave chico"> · {a.veces === 1 ? t('1 vez') : t('{n} veces', { n: a.veces })}</span> : null}
              </span>
              {puedeEscribir ? (
                <>
                  <button className="btn-icono chico" onClick={() => renombrar(a)} aria-label={t('Renombrar {nombre}', { nombre: a.nombre })}>✏️</button>
                  <button className="btn-icono chico" onClick={() => sacar(a)} aria-label={t('Sacar a {nombre}', { nombre: a.nombre })}>🗑</button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {puedeEscribir ? (
        <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); agregar(); }}>
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder={t('ej: Mamá, Juan, amigos del club')} maxLength={80} />
          <button className="btn primario" disabled={!nuevo.trim()}>{t('Agregar')}</button>
        </form>
      ) : null}
    </div>
  );
}
