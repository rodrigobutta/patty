// Más → Qué patrones buscar: prender o apagar las búsquedas más finas de Patty (umbrales, lo que protege, efectos que
// llegan a los dos o tres días, las hipótesis de Patty, los componentes de lo que comés). Se guarda en la persona: lo respeta el análisis, también el de la madrugada.
import { useState } from 'react';
import { patronesFinos, type PatronFino, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';

const OPCIONES: Array<{ clave: PatronFino; titulo: string; texto: string; ejemplo: string }> = [
  {
    clave: 'umbrales',
    titulo: '📏 Desde qué cantidad',
    texto: 'Buscar a partir de cuánto empieza a pasar algo, no solo si pasó.',
    ejemplo: 'Por ejemplo: «a partir de 3 cafés, esa noche dormís peor».',
  },
  {
    clave: 'proteccion',
    titulo: '🛡️ Lo que te protege',
    texto: 'Buscar lo que hace que un dolor o una molestia aparezca menos.',
    ejemplo: 'Por ejemplo: «los días que caminás, al día siguiente te duele menos la cabeza».',
  },
  {
    clave: 'desfases_largos',
    titulo: '⏳ Efectos a los dos o tres días',
    texto: 'Buscar lo que se nota recién a los dos o tres días, además del mismo día y el siguiente.',
    ejemplo: 'Por ejemplo: «si comés tomate, a los dos días te duele la cabeza».',
  },
  {
    clave: 'hipotesis',
    titulo: '🦉 Hipótesis de Patty',
    texto: 'Una vez por semana Patty mira el resumen de todos tus datos y sospecha cosas. Solo te muestra las que los números confirman.',
    ejemplo: 'Por ejemplo: «desde que empezaste con el mate, te duele menos la cabeza».',
  },
  {
    clave: 'componentes',
    titulo: '🧂 Componentes de lo que comés',
    texto: 'Patty estima de qué están hechas tus comidas (sal, harinas, azúcar, alcohol…) para encontrar patrones entre comidas distintas y mostrártelo en el widget Comida del Día. No tenés que anotar nada más. Si lo apagás, se va también ese widget.',
    ejemplo: 'Por ejemplo: «los días con mucha sal, al día siguiente te duele la cabeza».',
  },
];

export function QuePatronesBuscar({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const { recargar } = useEstado();
  const [ajustes, setAjustes] = useState(patronesFinos(persona.patrones));
  const [error, setError] = useState('');
  const cambiar = async (clave: PatronFino, si: boolean) => {
    const antes = ajustes;
    const nuevos = { ...ajustes, [clave]: si };
    setAjustes(nuevos);
    setError('');
    try {
      await api('PUT', `/api/personas/${persona.id}`, { patrones: nuevos });
      await recargar();
    } catch (e) {
      setAjustes(antes);
      setError((e as Error).message);
    }
  };
  return (
    <>
      <p className="suave chico">{t('Patty siempre busca qué cosas van seguidas de otras. Acá elegís si además busca estos patrones más finos. Se aplican en la próxima búsqueda.')}</p>
      {OPCIONES.map((o) => (
        <div className="tarjeta" key={o.clave}>
          <h3>{t(o.titulo)}</h3>
          <label className="opcion">
            <input type="checkbox" checked={ajustes[o.clave]} disabled={!puedeEscribir} onChange={(e) => void cambiar(o.clave, e.target.checked)} />
            <span>{t(o.texto)}</span>
          </label>
          <p className="chico ejemplo-permiso">{t(o.ejemplo)}</p>
        </div>
      ))}
      {error ? <p className="neg">{error}</p> : null}
    </>
  );
}
