// Supervisión (en Más): pedir supervisar a alguien, contestar las invitaciones, ver a quién supervisás y quién te
// supervisa, mandarle un aviso y terminarla. Aceptada, quien supervisa ve el día del otro (aparece en la lista de
// personas), recibe avisos si se olvida una toma o pasa el día sin anotar, y le puede mandar avisos al teléfono.
import { useCallback, useEffect, useState } from 'react';
import { AVISOS_RAPIDOS, type MisSupervisiones, type Supervision as Sup } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';

export function Supervision() {
  const { avisar, recargar } = useEstado();
  const [datos, setDatos] = useState<MisSupervisiones | null>(null);
  const [quien, setQuien] = useState('');
  const [avisando, setAvisando] = useState<Sup | null>(null);
  const [error, setError] = useState('');

  const traer = useCallback(async () => {
    try {
      setDatos(await api<MisSupervisiones>('GET', '/api/supervision'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void traer(), [traer]);

  const hacer = async (f: () => Promise<unknown>, aviso: string, recargarPersonas = false) => {
    setError('');
    try {
      await f();
      avisar(aviso);
      await traer();
      if (recargarPersonas) await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const invitar = () =>
    hacer(async () => {
      await api('POST', '/api/supervision/invitar', { quien: quien.trim() });
      setQuien('');
    }, 'Invitación enviada: cuando acepte, vas a ver su día');

  const terminar = (s: Sup, supervisor: boolean) => {
    const pregunta = s.estado === 'pendiente'
      ? supervisor ? `¿Cancelar la invitación a ${s.otro.nombre}?` : `¿Rechazar a ${s.otro.nombre}?`
      : supervisor ? `¿Dejar de supervisar a ${s.otro.nombre}?` : `¿Que ${s.otro.nombre} deje de supervisarte?`;
    if (!confirm(pregunta)) return;
    void hacer(() => api('DELETE', `/api/supervision/${s.id}`), 'Listo', true);
  };

  const invitaciones = datos?.te_supervisan.filter((s) => s.estado === 'pendiente') ?? [];
  const meSupervisan = datos?.te_supervisan.filter((s) => s.estado === 'aceptada') ?? [];

  return (
    <div className="tarjeta supervision">
      <h3>👀 Supervisión</h3>
      {invitaciones.map((s) => (
        <div key={s.id} className="nota-ia invitacion">
          <p><strong>{s.otro.nombre}</strong> quiere supervisarte: ver tu día, tus remedios y avisarte si te olvidás algo.</p>
          <div className="fila">
            <button className="btn" onClick={() => void hacer(() => api('POST', `/api/supervision/${s.id}/responder`, { aceptar: false }), 'Rechazada')}>No</button>
            <button className="btn primario" onClick={() => void hacer(() => api('POST', `/api/supervision/${s.id}/responder`, { aceptar: true }), `${s.otro.nombre} ya te puede acompañar`)}>Aceptar</button>
          </div>
        </div>
      ))}
      <p className="suave chico">
        Para acompañar a alguien (por ejemplo, una persona mayor): ves su día y sus remedios, te aviso si se olvida una toma o
        no anota nada en el día, y le podés mandar un aviso. Tiene que aceptarlo.
      </p>
      {datos?.supervisas.length ? (
        <ul className="lista">
          {datos.supervisas.map((s) => (
            <li key={s.id} className="tratamiento">
              <span className="que">
                <strong>{s.otro.nombre}</strong>
                <span className="suave chico renglon-sub">{s.estado === 'pendiente' ? 'esperando que acepte' : 'en supervisión'}</span>
              </span>
              <span className="columna-chica">
                {s.estado === 'aceptada' ? <button className="btn chico" onClick={() => setAvisando(s)}>📣 Avisarle</button> : null}
                <button className="enlace chico" onClick={() => terminar(s, true)}>{s.estado === 'pendiente' ? 'Cancelar' : 'Dejar'}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {meSupervisan.length ? (
        <>
          <p className="suave chico">Te supervisa{meSupervisan.length > 1 ? 'n' : ''}:</p>
          <ul className="lista">
            {meSupervisan.map((s) => (
              <li key={s.id} className="tratamiento">
                <span className="que"><strong>{s.otro.nombre}</strong></span>
                <button className="enlace chico" onClick={() => terminar(s, false)}>Quitar</button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <label>
        Supervisar a alguien
        <span className="fila">
          <input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="su usuario o su mail" autoCapitalize="none" onKeyDown={(e) => e.key === 'Enter' && quien.trim() && void invitar()} />
          <button className="btn" disabled={!quien.trim()} onClick={() => void invitar()}>Invitar</button>
        </span>
      </label>
      {error ? <p className="neg">{error}</p> : null}
      {avisando ? (
        <>
          <div className="velo" onClick={() => setAvisando(null)} />
          <Avisarle nombre={avisando.otro.nombre} ruta={`/api/supervision/${avisando.id}/avisar`} alCerrar={() => setAvisando(null)} />
        </>
      ) : null}
    </div>
  );
}

/** La hoja para mandarle un aviso al teléfono de quien se supervisa: uno rápido o escrito. */
export function Avisarle({ nombre, ruta, cuerpoExtra, alCerrar }: { nombre: string; ruta: string; cuerpoExtra?: Record<string, unknown>; alCerrar(): void }) {
  const { avisar } = useEstado();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const mandar = async (t: string) => {
    setEnviando(true);
    setError('');
    try {
      const r = await api<{ enviados: number }>('POST', ruta, { ...cuerpoExtra, texto: t });
      avisar(r.enviados ? `Le llegó a ${nombre} 📣` : `${nombre} no tiene la app con avisos: lo va a ver cuando entre`);
      alCerrar();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };
  return (
    <div className="hoja" role="dialog" aria-label={`Avisarle a ${nombre}`}>
      <div className="hoja-cabeza">
        <h3>📣 Avisarle a {nombre}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label="Cerrar">✕</button>
      </div>
      <div className="columna">
        {AVISOS_RAPIDOS.map((a) => <button key={a} className="btn" disabled={enviando} onClick={() => void mandar(a)}>{a}</button>)}
      </div>
      <label>
        O escribile
        <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Tomate la pastilla de la presión, ma 😘" />
      </label>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" disabled={enviando || !texto.trim()} onClick={() => void mandar(texto.trim())}>{enviando ? 'Mandando…' : 'Mandar'}</button>
    </div>
  );
}
