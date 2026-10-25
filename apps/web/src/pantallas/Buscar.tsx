// "Buscar" (en Patrones): elegir una cosa (dolor de cabeza, huevos, lluvia) y ver en qué días pasó, en un calendario
// por mes, con cuántas veces por mes y qué días de la semana se repite más.
import { useEffect, useMemo, useRef, useState } from 'react';
import { conUnidad, normalizar, type Estadisticas, type Persona, type SerieConcepto, type Sugerencia } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
const mesNombre = (anioMes: string, corto = false) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: corto ? 'short' : 'long', year: corto ? undefined : 'numeric' }).format(new Date(anioMes + '-15T12:00:00Z'));
/** 0 = lunes. */
const diaSemana = (fecha: string) => (new Date(fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;
const sumarMes = (anioMes: string, n: number) => {
  const d = new Date(anioMes + '-15T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export function Buscar({ persona, conceptoInicial }: { persona: Persona; conceptoInicial: number | null }) {
  const { categorias } = useEstado();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Sugerencia[]>([]);
  const [conceptoId, setConceptoId] = useState<number | null>(conceptoInicial);
  const [serie, setSerie] = useState<SerieConcepto | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [diaElegido, setDiaElegido] = useState<string | null>(null);
  const pedido = useRef(0);
  // Para elegir con un toque: lo que más se anotó (dolores primero).
  const [sugeridos, setSugeridos] = useState<Array<{ id: number; nombre: string }>>([]);
  useEffect(() => {
    api<Estadisticas>('GET', `/api/estadisticas?persona=${persona.id}&dias=90`)
      .then((e) => setSugeridos([...e.dolores, ...e.top.filter((t) => t.categoria !== 'sintoma')].map((t) => ({ id: t.concepto_id, nombre: t.concepto }))))
      .catch(() => {});
  }, [persona.id]);

  useEffect(() => setConceptoId(conceptoInicial), [conceptoInicial]);

  useEffect(() => {
    const n = ++pedido.current;
    if (!texto.trim()) return setResultados([]);
    const t = setTimeout(() => {
      api<Sugerencia[]>('GET', `/api/conceptos/buscar?q=${encodeURIComponent(texto)}&limite=8`)
        .then((r) => n === pedido.current && setResultados(r))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (!conceptoId) return;
    setSerie(null);
    setDiaElegido(null);
    api<SerieConcepto>('GET', `/api/estadisticas/concepto?persona=${persona.id}&concepto=${conceptoId}&dias=180`)
      .then((s) => {
        setSerie(s);
        // Arranca en el mes de la última vez (o el actual).
        setMes((s.dias.at(-1)?.fecha ?? s.hasta).slice(0, 7));
      })
      .catch(() => {});
  }, [conceptoId, persona.id]);

  const porFecha = useMemo(() => new Map(serie?.dias.map((d) => [d.fecha, d]) ?? []), [serie]);
  const elegir = (id: number) => {
    setConceptoId(id);
    setTexto('');
    setResultados([]);
  };

  /** Qué tan fuerte se pinta un día: por intensidad (dolores), por cantidad, o por veces. */
  const fuerza = (d: SerieConcepto['dias'][number]) => {
    if (!serie) return 1;
    if (d.intensidad !== null) return Math.max(0.3, d.intensidad / 10);
    const max = Math.max(...serie.dias.map((x) => x.suma ?? x.veces));
    return max ? Math.max(0.35, (d.suma ?? d.veces) / max) : 1;
  };
  const valorDia = (d: SerieConcepto['dias'][number]) => {
    if (!serie) return '';
    if (d.intensidad !== null) return `intensidad ${d.intensidad}/10`;
    if (d.suma !== null && serie.concepto.unidad) return conUnidad(d.suma, serie.concepto.unidad, 1);
    return d.veces === 1 ? 'una vez' : `${d.veces} veces`;
  };

  const meses = serie ? Array.from({ length: 6 }, (_, i) => sumarMes(serie.hasta.slice(0, 7), i - 5)) : [];
  const porMes = meses.map((m) => serie!.dias.filter((d) => d.fecha.startsWith(m)).length);
  const maxMes = Math.max(1, ...porMes);
  const porSemana = DIAS_SEMANA.map((_, i) => serie?.dias.filter((d) => diaSemana(d.fecha) === i).length ?? 0);
  const maxSemana = Math.max(1, ...porSemana);
  const masSeguido = serie && serie.dias.length >= 4 ? porSemana.indexOf(Math.max(...porSemana)) : -1;

  const celdas = useMemo(() => {
    if (!mes) return [];
    const primero = mes + '-01';
    const offset = diaSemana(primero);
    const largo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
    return [...Array<null>(offset).fill(null), ...Array.from({ length: largo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)];
  }, [mes]);
  const icono = serie ? categorias.find((c) => c.id === serie.concepto.categoria_id)?.icono : null;

  return (
    <div className="buscar">
      <div className="tarjeta">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔎 Buscá algo: dolor de cabeza, huevos, lluvia…" />
        {resultados.length ? (
          <ul className="lista resultados">
            {resultados.map((r) => (
              <li key={r.id} onClick={() => elegir(r.id)}>
                <span className="icono">{categorias.find((c) => c.id === r.categoria_id)?.icono}</span>
                <span className="que">{r.nombre}</span>
              </li>
            ))}
          </ul>
        ) : !conceptoId || !texto ? (
          <div className="chips envolver">
            {sugeridos.slice(0, 10).map((s) => (
              <button key={s.id} className={`chip chico${s.id === conceptoId ? ' activa' : ''}`} onClick={() => elegir(s.id)}>{s.nombre}</button>
            ))}
          </div>
        ) : null}
        {texto && !resultados.length && normalizar(texto).length > 1 ? <p className="suave chico">No encuentro nada con ese nombre.</p> : null}
      </div>

      {conceptoId && !serie ? <div className="tarjeta"><p className="suave centro">Buscando…</p></div> : null}
      {serie && mes ? (
        <>
          <div className="tarjeta resumen-busqueda">
            <span className="icono-grande">{icono}</span>
            <div>
              <h3>{serie.concepto.nombre}</h3>
              <p className="suave">
                {serie.dias.length
                  ? `${serie.dias.length} ${serie.dias.length === 1 ? 'día' : 'días'} en los últimos 6 meses${masSeguido >= 0 ? `, más seguido los ${NOMBRES_DIA[masSeguido]}` : ''}.`
                  : 'No pasó en los últimos 6 meses.'}
              </p>
            </div>
          </div>

          <div className="tarjeta calendario">
            <div className="cabeza-mes">
              <button className="btn-icono" onClick={() => setMes(sumarMes(mes, -1))} disabled={mes <= meses[0]} aria-label="Mes anterior">‹</button>
              <strong>{mesNombre(mes).replace(/^./, (x) => x.toUpperCase())}</strong>
              <button className="btn-icono" onClick={() => setMes(sumarMes(mes, 1))} disabled={mes >= serie.hasta.slice(0, 7)} aria-label="Mes siguiente">›</button>
            </div>
            <div className="grilla-mes" key={mes}>
              {DIAS_SEMANA.map((d, i) => <span key={`c${i}`} className="dia-semana">{d}</span>)}
              {celdas.map((f, i) => {
                if (!f) return <span key={`v${i}`} />;
                const d = porFecha.get(f);
                return (
                  <button
                    key={f}
                    className={`dia-cal${d ? ' paso' : ''}${f > serie.hasta ? ' futuro' : ''}${diaElegido === f ? ' elegido' : ''}`}
                    style={d ? { ['--fuerza' as string]: fuerza(d), ['--i' as string]: i } : undefined}
                    onClick={() => setDiaElegido(d ? f : null)}
                    disabled={!d}
                  >
                    {Number(f.slice(8))}
                  </button>
                );
              })}
            </div>
            {diaElegido && porFecha.get(diaElegido) ? (
              <p className="detalle-dia">
                {new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(diaElegido + 'T12:00:00Z'))}:{' '}
                <strong>{valorDia(porFecha.get(diaElegido)!)}</strong>
              </p>
            ) : (
              <p className="suave chico centro">Los días pintados son los que pasó{serie.dias.some((d) => d.intensidad !== null) ? ' (más fuerte, más intenso)' : ''}. Tocá uno para ver el detalle.</p>
            )}
          </div>

          {serie.dias.length ? (
            <div className="tarjeta">
              <h3>Por mes</h3>
              <div className="columnas">
                {meses.map((m, i) => (
                  <button key={m} className={m === mes ? 'actual' : ''} onClick={() => setMes(m)}>
                    <span className="columna-barra"><span style={{ height: `${(porMes[i] / maxMes) * 100}%` }} /></span>
                    <strong>{porMes[i]}</strong>
                    <span className="suave chico">{mesNombre(m, true)}</span>
                  </button>
                ))}
              </div>
              <h3>Por día de la semana</h3>
              <div className="columnas semana">
                {DIAS_SEMANA.map((d, i) => (
                  <div key={i} className={i === masSeguido ? 'actual' : ''}>
                    <span className="columna-barra"><span style={{ height: `${(porSemana[i] / maxSemana) * 100}%` }} /></span>
                    <strong>{porSemana[i]}</strong>
                    <span className="suave chico">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
