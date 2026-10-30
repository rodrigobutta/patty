// Lo que Patty encontró: relaciones entre lo que se hace y cómo se siente, con cuántos días de diferencia.
import { medir, paginaVista } from '../lib/analytics';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { avanceProgreso, nombreRasgo, type Hallazgo, type Persona, type Progreso, type ResultadoAnalisis } from 'shared';
import { api } from '../api';
import { idioma, locale, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { Buscar } from './Buscar';
import { Calendario } from './Calendario';
import { Numeros } from './Numeros';
import { Preguntar } from './Preguntar';
import { LoQueVoyNotando } from './ComentariosDePatty';
import { ListaSemanas } from './Semanas';
import { RuedaProgreso } from './RuedaProgreso';
import { IconoBuscar, IconoCalendario, IconoMapa, IconoNumeros, IconoRelacion } from '../ui/Iconos';
import { MapaDescubrir } from './MapaDescubrir';
import { BotonCompartir, type Compartible } from '../ui/HojaCompartir';
import { irAMas } from '../lib/navegar';

const Q_FIRME = 0.1;
const cuando = (d: number) =>
  d === 0 ? t('el mismo día') : d === 1 ? t('al día siguiente') : d === 2 ? t('a los dos días') : d === 3 ? t('a los tres días') : t('{n} días después', { n: d });
/** "Dolor de cabeza" → "menos dolor de cabeza": lo que protege se dice por lo que baja. */
const menos = (efecto: string) => t('menos {efecto}', { efecto: efecto.charAt(0).toLocaleLowerCase(locale()) + efecto.slice(1) });
const decimal = (n: number) => n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Lo que salió de una hipótesis puede ser un antes y después de una fecha (`fecha_desde` sola): cambian los números que se muestran. */
const esCambio = (h: Hallazgo) => Boolean(h.fecha_desde && !h.fecha_hasta);
/** Cuándo: "al día siguiente"; lo de un período lo aclara; un cambio solo tiene su fecha. */
const cuandoDe = (h: Hallazgo) =>
  esCambio(h)
    ? t('desde el {fecha}', { fecha: fechaCorta(h.fecha_desde!) })
    : `${cuando(h.desfase_dias)}${h.fecha_desde ? ` · ${t('del {desde} al {hasta}', { desde: fechaCorta(h.fecha_desde), hasta: fechaCorta(h.fecha_hasta!) })}` : ''}`;
const veces = (h: Hallazgo) => (esCambio(h) ? t('{n} de {total} días', { n: h.soporte, total: h.dias_causa }) : t('{n} de {total} veces', { n: h.soporte, total: h.dias_causa }));
const nombresCausa = (h: Hallazgo) =>
  // Un umbral lleva su valor ("Café: 3 o más"); solo la primera causa puede serlo.
  [{ nombre: h.causa, tipo: h.causa_tipo, modo: h.causa_modo }, ...(h.causas_extra ?? [])].map((c, i) =>
    nombreRasgo(c.nombre, c.tipo, c.modo, idioma(), i ? undefined : { valor: h.umbral ?? null, unidad: h.causa_unidad }),
  );
/** La imagen para compartir un patrón: solo los nombres de las cosas y los números, sin la persona. */
const compartible = (h: Hallazgo): Compartible => ({
  que: 'patron',
  tarjeta: {
    tipo: 'patron',
    arriba: t('Patty encontró un patrón en mis días'),
    causa: nombresCausa(h).join(' + '),
    efecto: nombreRasgo(h.efecto, h.efecto_tipo, h.efecto_modo, idioma()),
    cuando: `${cuandoDe(h)} · ${veces(h)}`,
    numero: `×${h.lift.toLocaleString(locale(), { maximumFractionDigits: h.lift >= 10 ? 0 : 1 })}`,
    numeroTexto: t('más probable'),
    aclaracion: t('Es lo que aparece en mis datos, no un diagnóstico.'),
  },
});

export function Patrones({ persona, progreso }: { persona: Persona; progreso: Progreso | null }) {
  const { sesion, usuario } = useEstado();
  const [hallazgos, setHallazgos] = useState<Hallazgo[] | null>(null);
  const [ultimo, setUltimo] = useState<Pick<ResultadoAnalisis, 'resumen' | 'sugerencias'> | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState('');
  /** La sub-vista: los patrones, los números, o el buscador (con lo que se eligió desde los números). */
  const [vista, setVista] = useState<'patrones' | 'numeros' | 'calendario' | 'mapa' | 'buscar'>('patrones');
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [vista]);
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
    medir('opinion_patron', { opinion: estado });
    setHallazgos((l) => l?.map((x) => (x.id === h.id ? { ...x, estado } : x)) ?? null);
  };

  // Los que difícilmente sean casualidad (q bajo: ya se tuvo en cuenta cuántas combinaciones se probaron) van primero;
  // el resto queda plegado, y los que la persona confirmó se muestran siempre.
  // Los que marcó como obvios o sin sentido se apartan al final (se pueden volver a marcar).
  const apartados = hallazgos?.filter((h) => h.estado === 'obvio' || h.estado === 'descartado') ?? [];
  const firmes = hallazgos?.filter((h) => !apartados.includes(h) && (h.q_valor <= Q_FIRME || h.estado === 'confirmado')) ?? [];
  const posibles = hallazgos?.filter((h) => !apartados.includes(h) && !firmes.includes(h)) ?? [];
  const tarjeta = (h: Hallazgo) => {
    const baja = h.protege || (esCambio(h) && h.lift < 1);
    const efecto = nombreRasgo(h.efecto, h.efecto_tipo, h.efecto_modo, idioma());
    return (
    <article key={h.id} className={`tarjeta hallazgo ${h.estado}${h.protege ? ' protege' : ''}`}>
      {h.origen === 'hipotesis' ? <p className="chico marca-origen">{t('🦉 Lo sospechó Patty y los datos lo confirman')}</p> : null}
      {h.protege ? <p className="chico marca-protege">{t('🛡️ Parece que te protege')}</p> : null}
      {h.ya_no ? <p className="chico marca-ya-no">{t('🕰️ Pasaba antes: en los últimos meses ya no se ve')}</p> : null}
      <h3>
        {nombresCausa(h).map((c, i) => (
          <Fragment key={i}>
            {i ? <span className="mas-causa"> + </span> : null}
            {c}
          </Fragment>
        ))}{' '}
        <span className="flecha">→</span> {baja ? menos(efecto) : efecto}
      </h3>
      <p className="suave chico">
        {cuandoDe(h)} · {veces(h)} ·{' '}
        {baja && h.prob_sin > 0
          ? t('{n}% menos seguido', { n: Math.round((1 - h.prob_con / h.prob_sin) * 100) })
          : t('×{n} más probable', { n: decimal(h.lift) })}
        {h.q_valor > 0.2 ? ` · ${t('puede ser casualidad')}` : ''}
      </p>
      <div className="barras" aria-label={t('{con}% con, {sin}% sin', { con: Math.round(h.prob_con * 100), sin: Math.round(h.prob_sin * 100) })}>
        <div><span style={{ width: `${h.prob_con * 100}%` }} className="con" />{t(esCambio(h) ? 'después {n}%' : 'con {n}%', { n: Math.round(h.prob_con * 100) })}</div>
        <div><span style={{ width: `${h.prob_sin * 100}%` }} className="sin" />{t(esCambio(h) ? 'antes {n}%' : 'sin {n}%', { n: Math.round(h.prob_sin * 100) })}</div>
      </div>
      {h.explicacion ? <p>{h.explicacion}</p> : null}
      {h.componente ? (
        <p className="suave chico">
          {h.componente.alimentos.length ? `${t('Sobre todo: {alimentos}.', { alimentos: h.componente.alimentos.join(', ') })} ` : ''}
          {t('Es una estimación, según lo que anotaste y relativa a tus días de siempre.')}
        </p>
      ) : null}
      {usuario?.rol !== 'lector' ? (
        <div className="opinion-hallazgo">
          <span className="suave chico">{t('¿Te sirve?')}</span>
          <div className="fila">
            {([['confirmado', '👍', 'Me sirvió'], ['obvio', '🙄', 'Ya lo sabía'], ['descartado', '👎', 'No tiene sentido']] as const).map(([estado, emoji, texto]) => (
              <button key={estado} className={`btn chico ${h.estado === estado ? 'primario' : ''}`} onClick={() => marcar(h, h.estado === estado ? 'nuevo' : estado)}>{emoji} {t(texto)}</button>
            ))}
          </div>
        </div>
      ) : null}
      {usuario?.rol !== 'lector' && h.estado !== 'descartado' ? (
        <div className="fila-compartir"><BotonCompartir className="btn chico compartir-hallazgo" armar={() => compartible(h)} /></div>
      ) : null}
    </article>
    );
  };

  useEffect(() => {
    paginaVista(`/descubrir/${vista}`, `descubrir ${vista}`);
  }, [vista]);
  const caja = sesion?.ia ? <Preguntar persona={persona} alBuscar={(id) => { setBuscado(id); setVista('buscar'); }} /> : null;
  const listo = progreso ? avanceProgreso(progreso).nivel > 0 : true;
  const pestanas = (
    <div className="segmentos ancho subvistas">
      <button className={vista === 'patrones' ? 'activa' : ''} onClick={() => setVista('patrones')}><IconoRelacion /> {t('Patrones')}</button>
      <button className={vista === 'numeros' ? 'activa' : ''} onClick={() => setVista('numeros')}><IconoNumeros /> {t('Números')}</button>
      <button className={vista === 'calendario' ? 'activa' : ''} onClick={() => setVista('calendario')}><IconoCalendario /> {t('Calendario')}</button>
      <button className={vista === 'mapa' ? 'activa' : ''} onClick={() => setVista('mapa')}><IconoMapa /> {t('Mapa')}</button>
      <button className={vista === 'buscar' ? 'activa' : ''} onClick={() => setVista('buscar')}><IconoBuscar /> {t('Buscar')}</button>
    </div>
  );
  if (vista === 'numeros') {
    return (
      <section className="patrones">
        {caja}
        {pestanas}
        <Numeros persona={persona} alElegir={(id) => { setBuscado(id); setVista('buscar'); }} />
        {/* Los mismos números, en un PDF para llevar a la consulta (se arma en Más). */}
        <button className="btn ancho" onClick={() => irAMas('informe')}>{t('📄 Informe para el médico (PDF)')}</button>
      </section>
    );
  }
  if (vista === 'mapa') {
    return (
      <section className="patrones">
        {caja}
        {pestanas}
        <MapaDescubrir persona={persona} />
      </section>
    );
  }
  if (vista === 'calendario') {
    return (
      <section className="patrones">
        {caja}
        {pestanas}
        <Calendario persona={persona} />
      </section>
    );
  }
  if (vista === 'buscar') {
    return (
      <section className="patrones">
        {caja}
        {pestanas}
        <Buscar key={buscado ?? 0} persona={persona} conceptoInicial={buscado} />
      </section>
    );
  }
  return (
    <section className="patrones">
      {caja}
      {pestanas}
      {progreso ? <div className="tarjeta">{<RuedaProgreso progreso={progreso} />}</div> : null}
      <div className="tarjeta">
        <h2>{t('Patrones de {nombre}', { nombre: persona.nombre })}</h2>
        <p className="suave">
          {t('Patty compara los días en que pasó algo con los que no, y mira qué aparece más seguido después.')}
          {sesion?.ia ? ` ${t('La IA explica lo que encuentra.')}` : ''}
        </p>
        {usuario?.rol !== 'lector' ? (
          <button className={`btn ancho ${listo ? 'primario' : ''}`} onClick={analizar} disabled={analizando || !listo}>
            {analizando ? t('Buscando patrones…') : listo ? t('Buscar patrones') : t('Todavía me faltan datos')}
          </button>
        ) : null}
        {error ? <p className="neg">{error}</p> : null}
      </div>

      {ultimo?.resumen ? <div className="tarjeta nota-ia"><p>{ultimo.resumen}</p></div> : null}

      <ListaSemanas persona={persona} />
      {hallazgos && !firmes.length ? <LoQueVoyNotando persona={persona} /> : null}

      {firmes.map(tarjeta)}
      {posibles.length ? (
        <details className="posibles">
          <summary>{t('{n} posibles, todavía con pocos datos', { n: posibles.length })}</summary>
          {posibles.map(tarjeta)}
        </details>
      ) : null}
      {apartados.length ? (
        <details className="posibles">
          <summary>{t('{n} que marcaste como obvios o sin sentido', { n: apartados.length })}</summary>
          <p className="suave chico">{t('Ya no te los aviso, y aprendo de esto para los próximos.')}</p>
          {apartados.map(tarjeta)}
        </details>
      ) : null}

      {hallazgos && !firmes.length && !analizando && listo ? <p className="suave centro">{t('Todavía no hay patrones claros. Seguí anotando: cuantos más días, más fácil es verlos.')}</p> : null}

      {ultimo?.sugerencias?.length ? (
        <div className="tarjeta">
          <h3>{t('Para afinar')}</h3>
          <ul>{ultimo.sugerencias.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      ) : null}
      <p className="suave chico centro">{t('Son relaciones en tus datos, no diagnósticos. Si algo te preocupa, consultalo con un profesional.')}</p>
    </section>
  );
}
