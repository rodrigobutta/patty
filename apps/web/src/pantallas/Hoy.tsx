// El día de la persona: lo anotado, en orden, y el botón para anotar más.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { esHoraDeEncuesta, useAlTocarAviso } from '../lib/encuesta';
import { alTocarAvisoPush } from '../lib/push';
import { useAlCambiarTomas } from '../lib/remedios';
import { hayVoz } from '../lib/voz';
import { guardarSentir, useAlPedirSentir, type Momento } from '../lib/sentir';
import { COMO_ME_SENTI, COMO_ME_SIENTO, ESTACIONES, estacionDe, conUnidad, CUANTO, ESTADOS_PUNTUALES, TELE, teleDeTipo, teleEnCanal, estadoDe, type DatoAutomatico, type EstadoAnimo, type Persona, type Registro } from 'shared';
import { api } from '../api';
import { idioma, locale, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { agruparAutomaticos, duracion, resumenDelGrupo } from '../lib/automatico';
import { hoyEn, horaEn, nombreDia, sumarDias } from '../lib/fechas';
import { avisarAnotado } from '../mascota/cara';
import type { Cara } from '../mascota/dibujo';
import { Mascota } from '../mascota/Mascota';
import { IconoCamara, IconoLapiz, IconoMicrofono } from '../ui/Iconos';
import { Cargar } from './Cargar';
import { Editar } from './Editar';
import { Puntuales } from './Puntuales';
import { CicloDelDia } from './CicloDelDia';
import { ParadasDelDia } from './ParadasDelDia';
import { RemediosDelDia } from './RemediosDelDia';
import { Avisarle } from './Supervision';
import { FilaDeslizable } from '../ui/FilaDeslizable';
import { etiquetaDonde } from '../ui/DondeComida';
import { Caritas, esMalo, Sentir } from './Sentir';

/** Después de contestar "¿cómo te sentís ahora?", cuánto tiempo no se vuelve a preguntar en el Día. */
const HORAS_SIN_PREGUNTAR = 3;

const ICONOS_FUENTE: Record<string, string> = { telefono: '📱', ubicacion: '📍', clima: '🌤️', reloj: '⌚' };

const PEDIDOS: Record<Cara, string> = {
  feliz: '',
  espera: t('¿Cómo va el día? Contame algo y me pongo contenta.'),
  triste: t('Hace días que no me contás nada… Anotá algo, aunque sea a qué hora te levantaste.'),
};

/** «Tele: Noticias» y «Tele en TN» van con su «Tele»: en el Día se ve uno solo (y se borran juntos). */
const esParteDeTele = (r: Registro) => r.concepto.startsWith(teleDeTipo('')) || r.concepto.startsWith(teleEnCanal(''));
const partesDe = (r: Registro, todos: Registro[]) => (r.concepto === TELE ? todos.filter((o) => esParteDeTele(o) && o.inicio === r.inicio) : []);

/** En qué parte del día pasó algo (el día de Patty empieza a las 5). */
const FRANJAS = [
  { desde: 5, nombre: t('Mañana'), emoji: '🌅' },
  { desde: 12, nombre: t('Tarde'), emoji: '☀️' },
  { desde: 19, nombre: t('Noche'), emoji: '🌙' },
];
function franja(inicio: string, zona: string) {
  const h = Number(horaEn(inicio, zona).slice(0, 2));
  return h < 5 ? FRANJAS[2] : [...FRANJAS].reverse().find((f) => h >= f.desde)!;
}

/** "sábado 24 de octubre" */
/** Lo último traído de cada día (persona|fecha), para no arrancar en blanco al volver al Día. */
const YA_TRAIDO = new Map<string, { registros: Registro[]; automaticos: DatoAutomatico[] }>();

const fechaLarga = (fecha: string) =>
  new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(fecha + 'T12:00:00Z'));

function detalle(r: Registro, tipo: string | undefined): string {
  if (r.intensidad !== null && (r.concepto === COMO_ME_SIENTO || r.concepto === COMO_ME_SENTI)) {
    const e = estadoDe(r.intensidad);
    return `${e.emoji} ${t(e.nombre)}`;
  }
  // "Con sueño" y compañía se anotan como poco, bastante o mucho: se muestran igual.
  if (r.intensidad !== null && ESTADOS_PUNTUALES.some((e) => e.nombre === r.concepto)) {
    return t(CUANTO.reduce((a, b) => (Math.abs(b.intensidad - r.intensidad!) < Math.abs(a.intensidad - r.intensidad!) ? b : a)).nombre).toLowerCase();
  }
  if (r.intensidad !== null) return `${r.intensidad}/10`;
  if (r.valor === null || tipo === 'hora') return '';
  if (tipo === 'duracion' || r.unidad === 'min') return duracion(r.valor);
  return conUnidad(r.valor, r.unidad, 2, idioma());
}

export function Hoy({ persona, cara }: { persona: Persona; cara: Cara | null }) {
  const { categorias, avisar, festejar, sesion } = useEstado();
  // En el día propio, Patty le habla por su apodo.
  const apodo = persona.propia ? sesion?.usuario?.apodo ?? '' : '';
  const [fecha, setFecha] = useState(() => hoyEn(persona.zona_horaria));
  const [registros, setRegistros] = useState<Registro[] | null>(() => YA_TRAIDO.get(`${persona.id}|${fecha}`)?.registros ?? null);
  const [automaticos, setAutomaticos] = useState<DatoAutomatico[]>(() => YA_TRAIDO.get(`${persona.id}|${fecha}`)?.automaticos ?? []);
  /** La fuente de datos automáticos que está abierta (se ve todo lo que llegó de ella). */
  const [abierto, setAbierto] = useState<string | null>(null);
  /** La hoja de anotar abierta: normal, o directo en "Contarlo" (el botón grande de hablarle). */
  const [cargando, setCargando] = useState<false | 'normal' | 'contar' | 'foto'>(false);
  /** La hoja de "¿cómo te sentís?" abierta: en el momento o del día, con el estado ya elegido o no. */
  const [sintiendo, setSintiendo] = useState<{ momento: Momento; estado: EstadoAnimo | null } | null>(null);
  const [error, setError] = useState('');
  /** La hoja para mandarle un aviso a quien se supervisa. */
  const [avisandole, setAvisandole] = useState(false);
  /**
   * Los registros que ya se mostraron en este día: los nuevos (recién anotados) entran con su propia animación. Es
   * null mientras se carga un día, así la primera vez entran todos de a uno.
   */
  const vistos = useRef<Set<number> | null>(null);
  useEffect(() => {
    vistos.current = null;
  }, [fecha]);
  useEffect(() => {
    if (registros) vistos.current = new Set(registros.map((r) => r.id));
  }, [registros]);
  /** Lo anotado que se está cambiando (al tocarlo). */
  const [editando, setEditando] = useState<Registro | null>(null);
  const hoy = hoyEn(persona.zona_horaria);
  /** Para la animación al cambiar de día: de qué lado entra el nuevo. */
  const [direccion, setDireccion] = useState<'atras' | 'adelante' | null>(null);
  const irA = (dias: number) => {
    const nueva = sumarDias(fecha, dias);
    if (nueva > hoy) return;
    setDireccion(dias < 0 ? 'atras' : 'adelante');
    setFecha(nueva);
  };
  // Deslizar el dedo de costado cambia de día (como pasar páginas).
  const toque = useRef<{ x: number; y: number } | null>(null);
  const empezarToque = (e: React.TouchEvent) => {
    toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const terminarToque = (e: React.TouchEvent) => {
    const ini = toque.current;
    toque.current = null;
    if (!ini || cargando || sintiendo || editando) return;
    const dx = e.changedTouches[0].clientX - ini.x;
    const dy = e.changedTouches[0].clientY - ini.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) irA(dx > 0 ? -1 : 1);
  };

  const traer = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        api<Registro[]>('GET', `/api/registros?persona=${persona.id}&desde=${fecha}`),
        api<DatoAutomatico[]>('GET', `/api/registros/automaticos?persona=${persona.id}&fecha=${fecha}`).catch(() => []),
      ]);
      YA_TRAIDO.set(`${persona.id}|${fecha}`, { registros: r, automaticos: a });
      setRegistros(r);
      setAutomaticos(a);
      setVuelta((v) => v + 1);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [persona.id, fecha]);
  useEffect(() => {
    // Lo último que se trajo de ese día se muestra enseguida (al volver de otra pestaña) mientras se actualiza.
    const ya = YA_TRAIDO.get(`${persona.id}|${fecha}`);
    setRegistros(ya?.registros ?? null);
    setAutomaticos(ya?.automaticos ?? []);
    void traer();
  }, [traer]);
  // Una toma marcada desde el aviso del teléfono también se ve en el Día.
  useAlCambiarTomas(traer);
  // Tocar el aviso push de una toma lleva al día de esa toma.
  useEffect(
    () => alTocarAvisoPush((d) => {
      if (d.programada) setFecha(hoyEn(persona.zona_horaria, new Date(d.programada)));
    }),
    [persona.zona_horaria],
  );
  const [vuelta, setVuelta] = useState(0);

  /** Borra (y sus partes, si es la tele). Devuelve false si al final no se quiso borrar. */
  const borrar = async (r: Registro): Promise<boolean> => {
    if (!confirm(t('¿Borrar «{que}» de las {hora}?', { que: t(r.concepto), hora: horaEn(r.inicio, persona.zona_horaria) }))) return false;
    for (const x of [r, ...partesDe(r, registros ?? [])]) await api('DELETE', `/api/registros/${x.id}`);
    avisar(t('Borrado'));
    avisarAnotado();
    void traer();
    return true;
  };

  /**
   * Deslizar para borrar: se borra sin preguntar y aparece "Deshacer" unos segundos (es más rápido que confirmar, y
   * si fue sin querer se recupera).
   */
  const [deshacer, setDeshacer] = useState<{ ids: number[]; texto: string } | null>(null);
  const quitar = async (r: Registro) => {
    const todos = [r, ...partesDe(r, registros ?? [])];
    setRegistros((l) => l?.filter((x) => !todos.some((o) => o.id === x.id)) ?? null);
    try {
      for (const x of todos) await api('DELETE', `/api/registros/${x.id}`);
      setDeshacer({ ids: todos.map((x) => x.id), texto: t('Borrado: {que}', { que: t(r.concepto) }) });
      avisarAnotado();
    } catch (e) {
      setError((e as Error).message);
    }
    void traer();
  };
  useEffect(() => {
    if (!deshacer) return;
    const id = setTimeout(() => setDeshacer(null), 6000);
    return () => clearTimeout(id);
  }, [deshacer]);
  const restaurar = async () => {
    if (!deshacer) return;
    const ids = deshacer.ids;
    setDeshacer(null);
    for (const id of ids) await api('POST', `/api/registros/${id}/restaurar`).catch(() => {});
    avisarAnotado();
    void traer();
  };

  // Tocar el aviso de la noche abre la encuesta del día de hoy.
  useAlTocarAviso(
    useCallback(() => {
      setFecha(hoyEn(persona.zona_horaria));
      setSintiendo({ momento: 'dia', estado: null });
    }, [persona.zona_horaria]),
  );

  // A la noche (desde la hora de la encuesta), si todavía no se contestó, se pregunta por el día entero.
  const [, setVisto] = useState(0);
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && setVisto((n) => n + 1);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  const yaContestoElDia = registros?.some((r) => r.concepto === COMO_ME_SENTI) ?? false;
  const momento: Momento = fecha === hoy && esHoraDeEncuesta() && !yaContestoElDia ? 'dia' : 'ahora';
  // La primera vez que se abre Patty a esa hora sin haber contestado, la encuesta se abre sola (una vez por día):
  // así funciona aunque el aviso se toque agrupado con otros, o se abra la app sin tocarlo.
  useEffect(() => {
    if (momento !== 'dia' || registros === null || sintiendo || persona.supervisada) return;
    const clave = `encuesta-abierta-${hoy}`;
    try {
      if (localStorage.getItem(clave)) return;
      localStorage.setItem(clave, '1');
    } catch {
      return;
    }
    setSintiendo({ momento: 'dia', estado: null });
  });
  const sentir = async (e: EstadoAnimo) => {
    if (esMalo(e)) return setSintiendo({ momento, estado: e });
    try {
      await guardarSentir({ persona, categorias, momento, estado: e, fecha });
      festejar(t('¡Qué bueno! Anotado: {que}', { que: t(e.nombre).toLowerCase() }));
      void traer();
      avisarAnotado();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Tocar la mascota de arriba abre "¿Cómo te sentís?" cuando sea.
  useAlPedirSentir(
    useCallback(() => {
      setFecha(hoyEn(persona.zona_horaria));
      setSintiendo({ momento: 'ahora', estado: null });
    }, [persona.zona_horaria]),
  );

  // Si contestó "cómo me siento" hace menos de 3 horas, la pregunta no aparece (vuelve cada tanto, o tocando la mascota).
  const ultimoSentir = momento === 'ahora' ? registros?.filter((r) => r.concepto === COMO_ME_SIENTO).at(-1) : undefined;
  const contestadoHacePoco = ultimoSentir && Date.now() - new Date(ultimoSentir.inicio).getTime() < HORAS_SIN_PREGUNTAR * 3600000;

  const tipoDe = (r: Registro) => categorias.find((c) => c.id === r.categoria_id);

  return (
    <section className="dia" onTouchStart={empezarToque} onTouchEnd={terminarToque}>
      <div className="navdia">
        <button className="btn-icono" onClick={() => irA(-1)} aria-label={t('Día anterior')}>‹</button>
        <div className="titulo-dia" key={fecha}>
          <h2>{nombreDia(fecha, persona.zona_horaria)}</h2>
          <p className="suave chico">{fechaLarga(fecha)} · {ESTACIONES[estacionDe(fecha, persona.zona_horaria)].icono} {t(ESTACIONES[estacionDe(fecha, persona.zona_horaria)].nombre)}</p>
        </div>
        <button className="btn-icono" onClick={() => irA(1)} disabled={fecha >= hoy} aria-label={t('Día siguiente')}>›</button>
      </div>
      <div className={`contenido-dia${direccion ? ` entra-${direccion}` : ''}`} key={fecha}>
      {error ? <p className="neg">{error}</p> : null}
      {persona.supervisada ? (
        <div className="supervisando">
          <span>{t('👀 Estás viendo el día de')} <strong>{persona.nombre}</strong></span>
          <button className="btn chico" onClick={() => setAvisandole(true)}>{t('📣 Avisarle')}</button>
        </div>
      ) : null}
      {/* "¿Cómo te sentís?" lo contesta cada uno: no se muestra en el día de alguien que se supervisa. */}
      {/* Hasta saber si ya contestó hace poco no se muestra nada: si no, las caritas aparecen y se van. */}
      {fecha === hoy && !persona.supervisada && registros !== null ? (
        contestadoHacePoco ? (
          <button className="algo-puntual" onClick={() => setSintiendo({ momento: 'ahora', estado: null })}>
            {t('😴 ¿Algo puntual? Con sueño, con hambre, con energía…')}
          </button>
        ) : (
          <div className={`tarjeta como-te-sentis${momento === 'dia' ? ' encuesta' : ''}`}>
            <h3>{apodo ? (momento === 'dia' ? t('{apodo}, ¿cómo te sentiste hoy?', { apodo }) : t('{apodo}, ¿cómo te sentís ahora?', { apodo })) : momento === 'dia' ? t('¿Cómo te sentiste hoy?') : t('¿Cómo te sentís ahora?')}</h3>
            <Caritas elegir={(e) => void sentir(e)} />
            {momento === 'ahora' ? <Puntuales persona={persona} alGuardar={() => { void traer(); avisarAnotado(); }} /> : null}
          </div>
        )
      ) : null}
      <RemediosDelDia persona={persona} fecha={fecha} hoy={hoy} vuelta={vuelta} alCambiar={() => { void traer(); avisarAnotado(); }} />
      {fecha === hoy ? <CicloDelDia persona={persona} registros={registros ?? []} vuelta={vuelta} alCambiar={() => { void traer(); avisarAnotado(); }} /> : null}
      {registros === null ? (
        <ul className="lista esqueleto" aria-label={t('Cargando')}>
          {[0, 1, 2].map((i) => <li key={i}><span className="brillo hora" /><span className="brillo icono" /><span className="brillo que" /></li>)}
        </ul>
      ) : registros.length === 0 ? (
        <div className="vacio">
          {fecha === hoy && cara ? <Mascota cara={cara} tamano={120} className="grande" /> : null}
          <p>{fecha === hoy ? t('Nada anotado todavía hoy.') : t('Nada anotado este día.')}</p>
          {fecha === hoy && cara && PEDIDOS[cara] ? <p>{PEDIDOS[cara]}</p> : null}
          <p className="suave">
            {fecha === hoy
              ? t('Tocá ＋ para anotar a qué hora te levantaste, qué comiste, cómo te sentiste…')
              : t('¿Te acordás de algo? Contáselo a Patty o tocá ＋: queda anotado en este día.')}
          </p>
        </div>
      ) : (
        <ul className="lista linea">
          {registros
            .filter((r) => !esParteDeTele(r) || !registros.some((o) => o.concepto === TELE && o.inicio === r.inicio))
            // Lo más reciente arriba: lo que se acaba de anotar se ve primero.
            .slice()
            .reverse()
            .map((r, i, todos) => {
            const cat = tipoDe(r);
            const f = franja(r.inicio, persona.zona_horaria);
            const nuevaFranja = i === 0 || franja(todos[i - 1].inicio, persona.zona_horaria) !== f;
            return (
              <Fragment key={r.id}>
                {nuevaFranja ? <li className="franja" aria-hidden><span>{f.emoji}</span> {f.nombre}</li> : null}
              <FilaDeslizable
                className={`tocable ${vistos.current && !vistos.current.has(r.id) ? 'recien' : vistos.current ? '' : 'entra'}`}
                style={{ ['--n' as string]: Math.min(i, 12) }}
                alTocar={() => setEditando(r)}
                alBorrar={() => void quitar(r)}
              >
                <span className="hora">{horaEn(r.inicio, persona.zona_horaria)}</span>
                <span className="icono">{cat?.icono}</span>
                <span className="que">
                  {t(r.concepto)}
                  {detalle(r, cat?.tipo_valor) ? <span className="valor-chip">{detalle(r, cat?.tipo_valor)}</span> : null}
                  {etiquetaDonde(r.donde, r.lugar) ? <span className="etiqueta-donde">{etiquetaDonde(r.donde, r.lugar)}</span> : null}
                  {r.nota ? <span className="suave chico"> — {r.nota}</span> : null}
                </span>
              </FilaDeslizable>
              </Fragment>
            );
          })}
        </ul>
      )}
      <ParadasDelDia persona={persona} fecha={fecha} vuelta={vuelta} alCambiar={() => void traer()} />
      {automaticos.length ? (
        <div className="tarjeta automatico">
          <h3 className="chico suave">{t('Llegó solo')}</h3>
          <ul className="lista">
            {agruparAutomaticos(automaticos).map((g) => (
              <li key={g.fuente} className="grupo-auto">
                <button className="renglon-auto" onClick={() => setAbierto(abierto === g.fuente ? null : g.fuente)} aria-expanded={abierto === g.fuente}>
                  <span className="icono">{ICONOS_FUENTE[g.tipo] ?? '📊'}</span>
                  <span className="que">
                    {t(g.fuente)}
                    <span className="suave chico resumen-auto">{resumenDelGrupo(g)}</span>
                  </span>
                  <span className="suave" aria-hidden>{abierto === g.fuente ? '▴' : '▾'}</span>
                </button>
                {abierto === g.fuente ? (
                  <ul className="detalle-auto">
                    {g.lineas.map((l) => (
                      <li key={l.concepto}>
                        <span className="icono">{categorias.find((c) => c.id === l.categoria_id)?.icono}</span>
                        <span className="que">{t(l.concepto)}</span>
                        <span className="valor-chip">{l.valor}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>
      {/* Las hojas van fuera del contenido animado: si no, quedan atrás de la lista mientras se anima. */}
      {editando ? (
        <>
          <div className="velo" onClick={() => setEditando(null)} />
          <Editar
            persona={persona}
            registro={editando}
            partes={partesDe(editando, registros ?? [])}
            alCerrar={() => setEditando(null)}
            alGuardar={() => { setEditando(null); void traer(); }}
            alBorrar={async () => {
              if (await borrar(editando)) setEditando(null);
            }}
          />
        </>
      ) : null}
      {sintiendo ? (
        <>
          <div className="velo" onClick={() => setSintiendo(null)} />
          <Sentir
            persona={persona}
            momento={sintiendo.momento}
            estado={sintiendo.estado}
            fecha={fecha}
            alCerrar={() => setSintiendo(null)}
            alGuardar={() => { setSintiendo(null); void traer(); avisarAnotado(); }}
          />
        </>
      ) : null}
      {avisandole ? (
        <>
          <div className="velo" onClick={() => setAvisandole(false)} />
          <Avisarle nombre={persona.nombre} ruta="/api/supervision/avisar-persona" cuerpoExtra={{ persona_id: persona.id }} alCerrar={() => setAvisandole(false)} />
        </>
      ) : null}
      {sesion?.ia ? (
        <>
          <button className="contale" onClick={() => setCargando('contar')}>
            {hayVoz(sesion.voz) ? <IconoMicrofono /> : <IconoLapiz />}
            {t('Contale a Patty')}
          </button>
          <button className="camara-flotante" onClick={() => setCargando('foto')} aria-label={t('Sacale una foto a lo que comiste')}><IconoCamara /></button>
        </>
      ) : null}
      <button className="fab" onClick={() => setCargando('normal')} aria-label={t('Anotar')}>＋</button>
      {deshacer ? (
        <div className="barra-deshacer" role="status">
          <span>{deshacer.texto}</span>
          <button onClick={() => void restaurar()}>{t('Deshacer')}</button>
        </div>
      ) : null}
      {cargando ? (
        <>
          <div className="velo" onClick={() => setCargando(false)} />
          <Cargar persona={persona} fecha={fecha} contar={cargando === 'contar'} foto={cargando === 'foto'} alCerrar={() => setCargando(false)} alGuardar={(otroDia) => { setCargando(false); if (otroDia) setFecha(otroDia); else void traer(); avisarAnotado(); }} />
        </>
      ) : null}
    </section>
  );
}
