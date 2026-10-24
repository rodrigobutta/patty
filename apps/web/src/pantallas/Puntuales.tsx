// "¿Algo puntual?": tengo sueño, tengo hambre, estoy con energía… Ni bien ni mal: se anota al toque con cuánto.
import { useState } from 'react';
import { CUANTO, ESTADOS_PUNTUALES, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { anotarClima } from '../lib/clima';

export function Puntuales({ persona, alGuardar }: { persona: Persona; alGuardar(): void }) {
  const { categorias, festejar } = useEstado();
  const [elegido, setElegido] = useState<string | null>(null);
  const [otro, setOtro] = useState('');
  const [error, setError] = useState('');
  const animo = categorias.find((c) => c.clave === 'animo');

  const guardar = async (nombre: string, intensidad: number, cuanto: string) => {
    if (!animo) return;
    setError('');
    const inicio = new Date().toISOString();
    try {
      await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: nombre, categoria_id: animo.id, inicio, intensidad });
      void anotarClima(persona.id, [inicio]);
      festejar(`Anotado: ${nombre.toLowerCase()}, ${cuanto.toLowerCase()}`);
      setElegido(null);
      setOtro('');
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const nombreElegido = elegido === 'otro' ? otro.trim() : elegido;
  return (
    <div className="puntuales">
      <p className="rotulo suave chico">¿Algo puntual?</p>
      <div className="chips envolver">
        {ESTADOS_PUNTUALES.map((e) => (
          <button key={e.nombre} className={`chip${elegido === e.nombre ? ' activa' : ''}`} onClick={() => setElegido(elegido === e.nombre ? null : e.nombre)}>
            <span aria-hidden>{e.emoji}</span> {e.nombre}
          </button>
        ))}
        <button className={`chip${elegido === 'otro' ? ' activa' : ''}`} onClick={() => setElegido(elegido === 'otro' ? null : 'otro')}>✏️ Otro</button>
      </div>
      {elegido === 'otro' ? <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="ej: con dolor de garganta, con frío en los pies" autoFocus /> : null}
      {elegido ? (
        <div className="cuanto-puntual">
          <span className="suave chico">¿Cuánto?</span>
          {CUANTO.map((c) => (
            <button key={c.nombre} className="btn" disabled={!nombreElegido} onClick={() => nombreElegido && void guardar(nombreElegido, c.intensidad, c.nombre)}>{c.nombre}</button>
          ))}
        </div>
      ) : null}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
