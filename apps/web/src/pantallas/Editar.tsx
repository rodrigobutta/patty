// Cambiar algo ya anotado: la hora, la cantidad o los minutos, la intensidad (o cómo te sentías) y la nota. Lo que
// fue (el concepto) no se cambia acá: para eso se borra y se anota de nuevo.
import { useState } from 'react';
import { COMO_ME_SENTI, COMO_ME_SIENTO, CUANTO, ESTADOS, ESTADOS_PUNTUALES, estadoDe, type Persona, type Registro } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { horaEn, instanteDelDia } from '../lib/fechas';

export function Editar({ persona, registro: r, partes, alGuardar, alCerrar, alBorrar }: {
  persona: Persona;
  registro: Registro;
  /** Los que van con este y se mueven juntos (la tele: tipo y canal). */
  partes: Registro[];
  alGuardar(): void;
  alCerrar(): void;
  /** Borrarlo (pregunta antes). */
  alBorrar(): Promise<void>;
}) {
  const { categorias, avisar } = useEstado();
  const cat = categorias.find((c) => c.id === r.categoria_id);
  const esSentir = r.concepto === COMO_ME_SIENTO || r.concepto === COMO_ME_SENTI;
  /** "Con sueño" y compañía: poco, bastante o mucho en vez de 0 a 10. */
  const esPuntual = ESTADOS_PUNTUALES.some((e) => e.nombre === r.concepto);
  const [hora, setHora] = useState(horaEn(r.inicio, persona.zona_horaria));
  const [valor, setValor] = useState(r.valor === null ? '' : String(r.valor));
  const [intensidad, setIntensidad] = useState<number | null>(r.intensidad);
  const [nota, setNota] = useState(r.nota ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // La hora de "Me levanté" es el valor mismo: no lleva cantidad aparte.
  const llevaValor = cat?.tipo_valor !== 'hora' && (r.valor !== null || r.unidad !== null || cat?.tipo_valor === 'duracion' || cat?.tipo_valor === 'cantidad');
  const llevaIntensidad = r.intensidad !== null || cat?.tipo_valor === 'intensidad';

  const guardar = async () => {
    setError('');
    const n = valor.trim() === '' ? null : Number(valor.replace(',', '.'));
    if (n !== null && !Number.isFinite(n)) return setError('La cantidad tiene que ser un número.');
    setGuardando(true);
    const inicio = instanteDelDia(r.fecha, hora, persona.zona_horaria);
    const cambio = (x: Registro, propio: boolean) =>
      api('PUT', `/api/registros/${x.id}`, {
        persona_id: x.persona_id,
        concepto_id: x.concepto_id,
        inicio,
        // Si tenía fin (algo con duración), se corre igual que el inicio.
        fin: x.fin ? new Date(new Date(x.fin).getTime() + (Date.parse(inicio) - Date.parse(x.inicio))).toISOString() : null,
        valor: llevaValor ? n : x.valor,
        unidad: x.unidad,
        intensidad: propio ? intensidad : x.intensidad,
        nota: propio ? nota.trim() || null : x.nota,
      });
    try {
      await cambio(r, true);
      for (const p of partes) await cambio(p, false);
      avisar('Cambiado');
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <div className="hoja" role="dialog" aria-label={`Cambiar ${r.concepto}`}>
      <div className="hoja-cabeza">
        <h3>{cat?.icono} {r.concepto}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label="Cerrar">✕</button>
      </div>
      <div className="valor">
        {esSentir ? (
          <div className="caritas">
            {ESTADOS.map((e) => (
              <button key={e.clave} className={`carita${intensidad !== null && estadoDe(intensidad).clave === e.clave ? ' activa' : ''}`} onClick={() => setIntensidad(e.intensidad)}>
                <span className="emoji" aria-hidden>{e.emoji}</span>
                {e.nombre}
              </button>
            ))}
          </div>
        ) : esPuntual ? (
          <div className="segmentos ancho">
            {CUANTO.map((c) => (
              <button key={c.nombre} className={intensidad !== null && Math.abs(intensidad - c.intensidad) <= 1 ? 'activa' : ''} onClick={() => setIntensidad(c.intensidad)}>{c.nombre}</button>
            ))}
          </div>
        ) : llevaIntensidad ? (
          <fieldset className="escala">
            <legend>Intensidad</legend>
            {Array.from({ length: 11 }, (_, i) => (
              <button key={i} className={intensidad === i ? 'activa' : ''} style={{ ['--i' as string]: i }} onClick={() => setIntensidad(i)}>{i}</button>
            ))}
            <div className="escala-pie suave chico"><span>nada</span><span>insoportable</span></div>
          </fieldset>
        ) : null}
        {llevaValor ? (
          <label>
            {r.unidad === 'min' || cat?.tipo_valor === 'duracion' ? 'Minutos' : `Cantidad${r.unidad ? ` (${r.unidad})` : ''}`}
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>
        ) : null}
        <label>{cat?.tipo_valor === 'hora' ? 'Hora' : 'Cuándo'}<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
        <label>Nota<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="detalle, lugar, con quién…" /></label>
        {error ? <p className="neg">{error}</p> : null}
        <button className="btn primario ancho" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        <button className="borrar-chico" disabled={guardando} onClick={() => void alBorrar()}>🗑 Borrar</button>
      </div>
    </div>
  );
}
