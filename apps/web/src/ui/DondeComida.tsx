// "¿Dónde?" para comidas y bebidas: casera, afuera o delivery y, si fue afuera o pedida, en qué lugar (con los de
// antes sugeridos). Lo usan anotar y cambiar un registro.
import { useEffect, useState } from 'react';
import { DONDE_COMIDA, PORCIONES, TIPOS_COMIDA, type Donde, type Porcion, type TipoComida } from 'shared';
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

/** Cómo es el plato: el tamaño y los tipos (frito, harinas, verdura…), para corregir lo que estimó Patty. */
export function PlatoComida({ porcion, tipos, alCambiar }: {
  porcion: Porcion | null;
  tipos: TipoComida[];
  alCambiar(porcion: Porcion | null, tipos: TipoComida[]): void;
}) {
  return (
    <div className="donde-comida">
      <span className="rotulo suave chico">{t('¿Cómo era?')}</span>
      <div className="chips">
        {PORCIONES.map((p) => (
          <button key={p.clave} type="button" className={`chip chico${porcion === p.clave ? ' activa' : ''}`} onClick={() => alCambiar(porcion === p.clave ? null : p.clave, tipos)}>
            {t('Porción {x}', { x: t(p.nombre).toLowerCase() })}
          </button>
        ))}
      </div>
      <div className="chips envolver">
        {TIPOS_COMIDA.map((x) => {
          const esta = tipos.includes(x.clave);
          return (
            <button key={x.clave} type="button" className={`chip chico${esta ? ' activa' : ''}`} onClick={() => alCambiar(porcion, esta ? tipos.filter((y) => y !== x.clave) : [...tipos, x.clave])}>
              <span aria-hidden>{x.icono}</span> {t(x.nombre)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Para lo propuesto: "🍟🥦 · porción grande". */
export function etiquetaPlato(porcion: Porcion | null | undefined, tipos: TipoComida[] | null | undefined): string {
  const iconos = (tipos ?? []).map((x) => TIPOS_COMIDA.find((y) => y.clave === x)?.icono ?? '').join('');
  const p = porcion && porcion !== 'mediana' ? t('porción {x}', { x: t(PORCIONES.find((y) => y.clave === porcion)!.nombre).toLowerCase() }) : '';
  return [iconos, p].filter(Boolean).join(' · ');
}
