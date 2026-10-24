// "¿Algo puntual?": tengo sueño, tengo hambre, estoy con energía… Ni bien ni mal: se anota al toque con cuánto.
// "Con dolor" pregunta qué (cabeza, garganta, panza… o un malestar común: fiebre, resfrío) y va a «Dolores y molestias»,
// así Patty puede buscar qué lo causa.
import { useEffect, useRef, useState } from 'react';
import { CUANTO, DOLORES, ESTADOS_PUNTUALES, MALESTARES, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { anotarClima } from '../lib/clima';

export function Puntuales({ persona, alGuardar }: { persona: Persona; alGuardar(): void }) {
  const { categorias, festejar } = useEstado();
  /** Un estado puntual, 'otro', o 'dolor' (y entonces `dolor` dice cuál). */
  const [elegido, setElegido] = useState<string | null>(null);
  const [dolor, setDolor] = useState<string | null>(null);
  const [otro, setOtro] = useState('');
  const [error, setError] = useState('');
  const animo = categorias.find((c) => c.clave === 'animo');
  // Al abrir "Con dolor", que se vea qué elegir (queda abajo de todos los chips).
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (elegido === 'dolor') panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [elegido]);
  // Y lo mismo con "¿cuánto?": es lo que guarda, no puede quedar fuera de la vista.
  const cuanto = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (elegido && elegido !== 'dolor' && elegido !== 'otro') cuanto.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else if (dolor && dolor !== 'otro') cuanto.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [elegido, dolor]);
  const sintoma = categorias.find((c) => c.clave === 'sintoma');

  const guardar = async (nombre: string, intensidad: number, cuanto: string) => {
    const cat = elegido === 'dolor' ? sintoma : animo;
    if (!cat) return;
    setError('');
    const inicio = new Date().toISOString();
    try {
      await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: nombre, categoria_id: cat.id, inicio, intensidad });
      void anotarClima(persona.id, [inicio]);
      festejar(elegido === 'dolor' ? `Anotado: ${nombre.toLowerCase()}, ${cuanto.toLowerCase()}. ¡Que se te pase pronto!` : `Anotado: ${nombre.toLowerCase()}, ${cuanto.toLowerCase()}`);
      setElegido(null);
      setDolor(null);
      setOtro('');
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const elegir = (e: string) => {
    setElegido(elegido === e ? null : e);
    setDolor(null);
    setOtro('');
  };
  const nombreElegido = elegido === 'otro' ? otro.trim() : elegido === 'dolor' ? (dolor === 'otro' ? otro.trim() : dolor) : elegido;
  const chipDolor = (d: { nombre: string; emoji: string }) => (
    <button key={d.nombre} className={`chip${dolor === d.nombre ? ' activa' : ''}`} onClick={() => setDolor(dolor === d.nombre ? null : d.nombre)}>
      <span aria-hidden>{d.emoji}</span> {d.nombre.replace(/^Dolor (de )?/, '').replace(/^./, (x) => x.toUpperCase())}
    </button>
  );

  return (
    <div className="puntuales">
      <p className="rotulo suave chico">¿Algo puntual?</p>
      <div className="chips envolver">
        <button className={`chip${elegido === 'dolor' ? ' activa' : ''}`} onClick={() => elegir('dolor')}>
          <span aria-hidden>🤕</span> Con dolor o malestar
        </button>
        {ESTADOS_PUNTUALES.map((e) => (
          <button key={e.nombre} className={`chip${elegido === e.nombre ? ' activa' : ''}`} onClick={() => elegir(e.nombre)}>
            <span aria-hidden>{e.emoji}</span> {e.nombre}
          </button>
        ))}
        <button className={`chip${elegido === 'otro' ? ' activa' : ''}`} onClick={() => elegir('otro')}>✏️ Otro</button>
      </div>
      {elegido === 'dolor' ? (
        <div className="que-duele" ref={panel}>
          <p className="rotulo suave chico">¿Qué te duele?</p>
          <div className="chips envolver">{DOLORES.map(chipDolor)}</div>
          <p className="rotulo suave chico">¿O es otra cosa?</p>
          <div className="chips envolver">
            {MALESTARES.map(chipDolor)}
            <button className={`chip${dolor === 'otro' ? ' activa' : ''}`} onClick={() => setDolor(dolor === 'otro' ? null : 'otro')}>✏️ Otro</button>
          </div>
        </div>
      ) : null}
      {elegido === 'otro' || dolor === 'otro' ? (
        <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder={dolor === 'otro' ? 'ej: dolor de rodilla, sinusitis, herpes' : 'ej: con frío en los pies, con ganas de salir'} autoFocus />
      ) : null}
      {elegido && (elegido !== 'dolor' || dolor) ? (
        <div className="cuanto-puntual" ref={cuanto}>
          <p className="pregunta-cuanto">
            {nombreElegido ? <>¿Cuánto? <strong>{nombreElegido}</strong></> : 'Escribí qué, y después ¿cuánto?'}
          </p>
          <div className="botones-cuanto">
            {CUANTO.map((c) => (
              <button key={c.nombre} className="btn primario" disabled={!nombreElegido} onClick={() => nombreElegido && void guardar(nombreElegido, c.intensidad, c.nombre)}>{c.nombre}</button>
            ))}
          </div>
          <p className="suave chico">Tocá uno para anotarlo.</p>
        </div>
      ) : null}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
