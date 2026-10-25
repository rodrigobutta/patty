// "¿Dónde?" para comidas y bebidas: casera, afuera o delivery y, si fue afuera o pedida, en qué lugar (con los de
// antes sugeridos). Lo usan anotar y cambiar un registro.
import { useEffect, useState } from 'react';
import { DONDE_COMIDA, type Donde } from 'shared';
import { api } from '../api';
import { t } from '../lib/idioma';

const cache = new Map<number, string[]>();

export function DondeComida({ personaId, donde, lugar, alCambiar }: {
  personaId: number;
  donde: Donde | null;
  lugar: string;
  alCambiar(donde: Donde | null, lugar: string): void;
}) {
  const [lugares, setLugares] = useState<string[]>(cache.get(personaId) ?? []);
  useEffect(() => {
    if (cache.has(personaId)) return;
    api<Array<{ lugar: string }>>('GET', `/api/registros/lugares-comida?persona=${personaId}`)
      .then((l) => {
        const nombres = l.map((x) => x.lugar);
        cache.set(personaId, nombres);
        setLugares(nombres);
      })
      .catch(() => {});
  }, [personaId]);

  return (
    <div className="donde-comida">
      <span className="rotulo suave chico">{t('¿Dónde?')}</span>
      <div className="chips">
        {DONDE_COMIDA.map((d) => (
          <button key={d.clave} type="button" className={`chip${donde === d.clave ? ' activa' : ''}`} onClick={() => alCambiar(donde === d.clave ? null : d.clave, lugar)}>
            <span aria-hidden>{d.icono}</span> {t(d.nombre)}
          </button>
        ))}
      </div>
      {donde === 'afuera' || donde === 'delivery' ? (
        <>
          <input
            value={lugar}
            onChange={(e) => alCambiar(donde, e.target.value)}
            list={`lugares-comida-${personaId}`}
            placeholder={donde === 'delivery' ? t('¿De dónde? (opcional)') : t('¿En qué lugar? (opcional)')}
          />
          <datalist id={`lugares-comida-${personaId}`}>{lugares.map((l) => <option key={l} value={l} />)}</datalist>
          {lugares.length && !lugar ? (
            <div className="chips">
              {lugares.slice(0, 6).map((l) => <button key={l} type="button" className="chip chico" onClick={() => alCambiar(donde, l)}>{l}</button>)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Para el Día: "🍽️ Mostaza", "🛵", "🏠". */
export function etiquetaDonde(donde: Donde | null | undefined, lugar: string | null | undefined): string {
  const d = DONDE_COMIDA.find((x) => x.clave === donde);
  if (!d) return '';
  return lugar ? `${d.icono} ${lugar}` : `${d.icono} ${t(d.nombre)}`;
}
