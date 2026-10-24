// Lo que Patty encontró: relaciones entre lo que se hace y cómo se siente, con cuántos días de diferencia.
import { useCallback, useEffect, useState } from 'react';
import { avanceProgreso, nombreRasgo, type Hallazgo, type Persona, type Progreso, type ResultadoAnalisis } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { Buscar } from './Buscar';
import { Numeros } from './Numeros';
import { RuedaProgreso } from './RuedaProgreso';

const Q_FIRME = 0.1;
const cuando = (d: number) => (d === 0 ? 'el mismo día' : d === 1 ? 'al día siguiente' : `${d} días después`);

export function Patrones({ persona, progreso }: { persona: Persona; progreso: Progreso | null }) {
  const { sesion, usuario } = useEstado();
  const [hallazgos, setHallazgos] = useState<Hallazgo[] | null>(null);
  const [ultimo, setUltimo] = useState<Pick<ResultadoAnalisis, 'resumen' | 'sugerencias'> | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState('');
  /** La sub-vista: los patrones, los números, o el buscador (con lo que se eligió desde los números). */
  const [vista, setVista] = useState<'patrones' | 'numeros' | 'buscar'>('patrones');
  const [buscado, setBuscado] = useState<number | null>(null);

  const traer = useCallback(async () => {
    const [h, a] = await Promise.all([
      api<Hallazgo[]>('GET', `/api/hallazgos?persona=${persona.id}`),
      api<{ resumen: string | null; sugerencias: string[] | null } | null>('GET', `/api/analisis/ultimo?persona=${persona.id}`),
    ]);
    setHallazgos(h);
    setUltimo(a ? { resumen: a.resumen, sugerencias: a.sugerencias ?? [] } : null);
  }, [persona.id]);
  useEffect(() => {
    traer().catch((e) => setError((e as Error).message));
  }, [traer]);

  const analizar = async () => {
    setAnalizando(true);
    setError('');
    try {
      const r = await api<ResultadoAnalisis>('POST', '/api/analisis', { persona_id: persona.id });
      setUltimo({ resumen: r.resumen, sugerencias: r.sugerencias });
      await traer();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalizando(false);
    }
  };

  const marcar = async (h: Hallazgo, estado: Hallazgo['estado']) => {
    await api('PUT', `/api/hallazgos/${h.id}`, { estado });
    setHallazgos((l) => l?.map((x) => (x.id === h.id ? { ...x, estado } : x)) ?? null);
  };

  // Los que difícilmente sean casualidad (q bajo: ya se tuvo en cuenta cuántas combinaciones se probaron) van primero;
  // el resto queda plegado, y los que la persona confirmó se muestran siempre.
  const firmes = hallazgos?.filter((h) => h.q_valor <= Q_FIRME || h.estado === 'confirmado') ?? [];
  const posibles = hallazgos?.filter((h) => !firmes.includes(h)) ?? [];
  const tarjeta = (h: Hallazgo) => (
    <article key={h.id} className={`tarjeta hallazgo ${h.estado}`}>
      <h3>{nombreRasgo(h.causa, h.causa_tipo, h.causa_modo)} <span className="flecha">→</span> {nombreRasgo(h.efecto, h.efecto_tipo, h.efecto_modo)}</h3>
      <p className="suave chico">{cuando(h.desfase_dias)} · {h.soporte} de {h.dias_causa} veces · ×{h.lift.toFixed(1)} más probable{h.q_valor > 0.2 ? ' · puede ser casualidad' : ''}</p>
      <div className="barras" aria-label={`${Math.round(h.prob_con * 100)}% con, ${Math.round(h.prob_sin * 100)}% sin`}>
        <div><span style={{ width: `${h.prob_con * 100}%` }} className="con" />con {Math.round(h.prob_con * 100)}%</div>
        <div><span style={{ width: `${h.prob_sin * 100}%` }} className="sin" />sin {Math.round(h.prob_sin * 100)}%</div>
      </div>
      {h.explicacion ? <p>{h.explicacion}</p> : null}
      {usuario?.rol !== 'lector' ? (
        <div className="fila">
          <button className={`btn chico ${h.estado === 'confirmado' ? 'primario' : ''}`} onClick={() => marcar(h, h.estado === 'confirmado' ? 'nuevo' : 'confirmado')}>👍 Me pasa</button>
          <button className={`btn chico ${h.estado === 'descartado' ? 'primario' : ''}`} onClick={() => marcar(h, h.estado === 'descartado' ? 'nuevo' : 'descartado')}>👎 No creo</button>
        </div>
      ) : null}
    </article>
  );

  const listo = progreso ? avanceProgreso(progreso).nivel > 0 : true;
  const pestanas = (
    <div className="segmentos ancho subvistas">
      <button className={vista === 'patrones' ? 'activa' : ''} onClick={() => setVista('patrones')}>✨ Patrones</button>
      <button className={vista === 'numeros' ? 'activa' : ''} onClick={() => setVista('numeros')}>📊 Números</button>
      <button className={vista === 'buscar' ? 'activa' : ''} onClick={() => setVista('buscar')}>🔎 Buscar</button>
    </div>
  );
  if (vista === 'numeros') {
    return (
      <section className="patrones">
        {pestanas}
        <Numeros persona={persona} alElegir={(id) => { setBuscado(id); setVista('buscar'); }} />
      </section>
    );
  }
  if (vista === 'buscar') {
    return (
      <section className="patrones">
        {pestanas}
        <Buscar persona={persona} conceptoInicial={buscado} />
      </section>
    );
  }
  return (
    <section className="patrones">
      {pestanas}
      {progreso ? <div className="tarjeta">{<RuedaProgreso progreso={progreso} />}</div> : null}
      <div className="tarjeta">
        <h2>Patrones de {persona.nombre}</h2>
        <p className="suave">
          Patty compara los días en que pasó algo con los que no, y mira si al rato o unos días después aparece otra cosa más seguido.
          {sesion?.ia ? ' La IA explica lo que encuentra.' : ''}
        </p>
        {usuario?.rol !== 'lector' ? (
          <button className={`btn ancho ${listo ? 'primario' : ''}`} onClick={analizar} disabled={analizando || !listo}>
            {analizando ? 'Buscando patrones…' : listo ? 'Buscar patrones' : 'Todavía me faltan datos'}
          </button>
        ) : null}
        {error ? <p className="neg">{error}</p> : null}
      </div>

      {ultimo?.resumen ? <div className="tarjeta nota-ia"><p>{ultimo.resumen}</p></div> : null}

      {firmes.map(tarjeta)}
      {posibles.length ? (
        <details className="posibles">
          <summary>{posibles.length} posibles, todavía con pocos datos</summary>
          {posibles.map(tarjeta)}
        </details>
      ) : null}

      {hallazgos && !firmes.length && !analizando && listo ? <p className="suave centro">Todavía no hay patrones claros. Seguí anotando: cuantos más días, más fácil es verlos.</p> : null}

      {ultimo?.sugerencias?.length ? (
        <div className="tarjeta">
          <h3>Para afinar</h3>
          <ul>{ultimo.sugerencias.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      ) : null}
      <p className="suave chico centro">Son relaciones en tus datos, no diagnósticos. Si algo te preocupa, consultalo con un profesional.</p>
    </section>
  );
}
