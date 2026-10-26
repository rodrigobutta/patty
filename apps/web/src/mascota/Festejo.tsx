// El festejo: cuando se anota algo, la mascota aparece un momento en el medio de la pantalla, salta y suelta unas
// chispitas. Si lo anotado es que la persona está mal, acompaña con otra cara y sin chispitas. Tocar lo cierra.
import { useEstado } from '../estado';
import { Mascota } from './Mascota';

const CHISPAS = ['✨', '💜', '⭐', '✨', '💫', '💜'];

export function Festejo() {
  const { festejo, terminarFestejo } = useEstado();
  if (!festejo) return null;
  const contento = festejo.cara === 'feliz';
  const enojada = festejo.cara === 'enojada';
  return (
    <div className="festejo" key={festejo.id} role="status" onClick={terminarFestejo}>
      <div className={`festejo-tarjeta${contento ? ' contento' : ''}${enojada ? ' enojada' : ''}`}>
        {contento ? (
          <div className="chispas" aria-hidden>
            {CHISPAS.map((c, i) => <span key={i} style={{ ['--i' as string]: i }}>{c}</span>)}
          </div>
        ) : null}
        {/* Enojada no salta: niega con la cabeza. */}
        <Mascota cara={festejo.cara} tamano={104} className={enojada ? 'negando' : 'saltando'} />
        <p>{festejo.texto}</p>
      </div>
    </div>
  );
}
