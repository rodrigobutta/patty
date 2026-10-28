// "¿Cómo te sentís?": muy bien, bien, mal o muy mal, en el momento o del día entero (la encuesta de la noche). Si es
// mal o muy mal, se pregunta qué pasa y cuánto (dolor de cabeza mucho, descompuesto poco…) y eso queda anotado como
// síntomas con su intensidad, para que Patty pueda buscar qué vino antes.
import { medir } from '../lib/analytics';
import { useState } from 'react';
import { IconoAnimo } from '../ui/IconosPatty';
import { CUANTO, ESTADOS, COSAS_DEL_ANIMO, type EstadoAnimo, type Persona } from 'shared';
import { t } from '../lib/idioma';
import { useEstado } from '../estado';
import { guardarSentir, type Momento } from '../lib/sentir';
import { Puntuales } from './Puntuales';

/** Los cuatro botones del ánimo. Muy bien y bien se guardan al toque; mal y muy mal preguntan qué pasa (lo del ánimo). */
export function Caritas({ elegir }: { elegir(e: EstadoAnimo): void }) {
  return (
    <div className="caritas">
      {ESTADOS.map((e) => (
        <button key={e.clave} className={`carita ${e.clave}`} onClick={() => elegir(e)}>
          <span className="emoji" aria-hidden><IconoAnimo clave={e.clave} tamano={40} /></span>
          {t(e.nombre)}
        </button>
      ))}
    </div>
  );
}

export const esMalo = (e: EstadoAnimo) => e.clave === 'mal' || e.clave === 'muy_mal';

export function Sentir({ persona, momento, estado: inicial, fecha, alGuardar, alCerrar }: {
  persona: Persona;
  momento: Momento;
  /** Si ya se eligió en el Día; si no (al abrir desde el aviso), se pregunta primero. */
  estado: EstadoAnimo | null;
  fecha: string;
  alGuardar(): void;
  alCerrar(): void;
}) {
  const { categorias, festejar } = useEstado();
  const [estado, setEstado] = useState<EstadoAnimo | null>(inicial);
  const sintomas = COSAS_DEL_ANIMO;
  /** Cuánto le pasó cada síntoma elegido (índice en CUANTO). */
  const [elegidos, setElegidos] = useState<Map<string, number>>(new Map());
  const [otro, setOtro] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');


  /** Tocar un síntoma: poco → bastante → mucho → se saca. */
  const tocar = (s: string) =>
    setElegidos((m) => {
      const n = new Map(m);
      const i = n.get(s);
      if (i === undefined) n.set(s, 0);
      else if (i < CUANTO.length - 1) n.set(s, i + 1);
      else n.delete(s);
      return n;
    });

  const guardar = async (e: EstadoAnimo) => {
    setGuardando(true);
    setError('');
    const lista = [...elegidos.entries()].map(([nombre, i]) => ({ nombre, intensidad: CUANTO[i].intensidad }));
    if (otro.trim()) lista.push({ nombre: otro.trim(), intensidad: CUANTO[1].intensidad });
    try {
      await guardarSentir({ persona, categorias, momento, estado: e, fecha, sintomas: lista, nota });
      medir('anotar', { metodo: 'caritas', estado: e.clave, momento, molestias: lista.length });
      festejar(esMalo(e) ? t('Gracias por contarme. Que se mejore pronto 💜') : t('¡Qué bueno! Anotado: {que}', { que: t(e.nombre).toLowerCase() }), esMalo(e) ? 'espera' : 'feliz');
      alGuardar();
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  };

  return (
    <div className="hoja sentir" role="dialog" aria-label={t('Cómo te sentís')}>
      <div className="hoja-cabeza">
        <h3>{estado ? `${estado.emoji} ${t(estado.nombre)}` : momento === 'dia' ? t('¿Cómo te sentiste hoy?') : t('¿Cómo te sentís?')}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>
      {!estado ? (
        <>
          <Caritas elegir={(e) => (esMalo(e) ? setEstado(e) : void guardar(e))} />
          {momento === 'ahora' ? <Puntuales persona={persona} alGuardar={alGuardar} /> : null}
        </>
      ) : (
        <>
          <p>
            {momento === 'dia' ? t('¿Qué te pasó hoy?') : t('¿Qué te pasa?')}{' '}
            <span className="suave chico">{t('Tocá una vez para poco, dos para bastante, tres para mucho.')}</span>
            <span className="suave chico"> {t('Lo del cuerpo (dolores, fiebre…) va en «Con dolor o malestar».')}</span>
          </p>
          <div className="sintomas">
            {sintomas.map((s) => {
              const i = elegidos.get(s);
              return (
                <button key={s} className={`chip${i !== undefined ? ' activa' : ''}`} onClick={() => tocar(s)}>
                  {t(s)}
                  {i !== undefined ? <span className="cuanto"> · {t(CUANTO[i].nombre).toLowerCase()}</span> : null}
                </button>
              );
            })}
          </div>
          <label>{t('Otra cosa')}<input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder={t('Ej: me picaban los ojos')} /></label>
          <label>{t('Nota (opcional)')}<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={t('lo que quieras agregar')} /></label>
          <button className="btn primario ancho" disabled={guardando} onClick={() => void guardar(estado)}>
            {guardando ? t('Guardando…') : t('Guardar')}
          </button>
        </>
      )}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
