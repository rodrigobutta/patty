// El día de la persona: lo anotado, en orden, y el botón para anotar más.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { IconoAnimo, IconoCategoria } from '../ui/IconosPatty';
import { alPedirIrAlDia, fechaPedidaParaVer, olvidarFechaPedida } from '../lib/avisos';
import { esHoraDeEncuesta, useAlTocarAviso } from '../lib/encuesta';
import { alTocarAvisoPush, configurarWidget, tomarWidgetPendiente } from '../lib/push';
import { useAlCambiarTomas } from '../lib/remedios';
import { hayVoz } from '../lib/voz';
import { useAlPedirSentir, type Momento } from '../lib/sentir';
import { COMO_ME_SENTI, COMO_ME_SIENTO, VIAJE_PESADO, ESTACIONES, estadoDe, estacionDe, TELE, teleDeTipo, teleEnCanal, type DatoAutomatico, type EstadoAnimo, type ItemPuntos, type Persona, type Registro } from 'shared';
import { api } from '../api';
import { idioma, locale, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { hoyEn, horaEn, nombreDia, sumarDias } from '../lib/fechas';
import { avisarAnotado } from '../mascota/cara';
import type { Cara } from '../mascota/dibujo';
import { Mascota } from '../mascota/Mascota';
import { IconoCamara, IconoLapiz, IconoMicrofono } from '../ui/Iconos';
import { Cargar, ElegirFoto } from './Cargar';
import { sacarFoto, type Foto } from '../lib/foto';
import { Editar } from './Editar';
import { GloboDelBuho } from './GloboDelBuho';
import { ComentarioDelDia, FueraDeLoNormal } from './ComentariosDePatty';
import { RutinasDelDia } from './RutinasDelDia';
import { TarjetaSemana } from './Semanas';
import { PreguntaDespertar } from './PreguntaDespertar';
import { fuenteApagada, HojaActivar, TIPOS_DE, useEstadoPermisos, type Fuente } from './FuenteApagada';
import { AnimoSemana } from './AnimoSemana';
import { ObjetivosSemana } from './ObjetivosSemana';
import { EVENTO_SUBIDO, SinSenal } from './SinSenal';
import type { ContadoPendiente } from '../lib/cola';
import { WidgetsDelDia } from './WidgetsDelDia';
import { IconoFranja } from '../ui/IconosWidget';
import { esNativa } from '../lib/nativo';
import { hayDatosDelTelefono } from '../lib/telefono';
import { haceCuantoSalud, ponerSalud, saludActivada, sincronizarSalud } from '../lib/salud';
import { permisoListo } from './Permisos';
import { CicloDelDia } from './CicloDelDia';
import { ParadasDelDia } from './ParadasDelDia';
import { CompaniaSugerida } from './CompaniaSugerida';
import { ViajesDelDia } from './ViajesDelDia';
import { EVENTO_CONTAR, PISTAS } from './PuntosDelDia';
import { RemediosDelDia } from './RemediosDelDia';
import { Avisarle } from './Supervision';
import { FilaDeslizable } from '../ui/FilaDeslizable';
import { etiquetaDonde } from '../ui/DondeComida';
import { Frase } from '../ui/Frase';
import { Sentir } from './Sentir';

/** Después de contestar "¿cómo te sentís ahora?", cuánto tiempo no se vuelve a preguntar en el Día. */
const HORAS_SIN_PREGUNTAR = 3;
const CLAVE_SENTIDO = 'sentido-recien';
/** Desde esta hora, si no se anotó nada a mano, el Día propone contar el día entero. */
const HORA_CONTAR_DIA = 18;

const PEDIDOS: Record<Cara, string> = {
  feliz: '',
  espera: t('¿Cómo va el día? Contame algo y me pongo contenta.'),
  triste: t('Hace días que no me contás nada… Anotá algo, aunque sea a qué hora te levantaste.'),
  enojada: '',
  dormida: '',
  manana: t('¡Buen día! ¿Qué desayunaste?'),
};

/** «Tele: Noticias» y «Tele en TN» van con su «Tele»: en el Día se ve uno solo (y se borran juntos). */
const esParteDeTele = (r: Registro) => r.concepto.startsWith(teleDeTipo('')) || r.concepto.startsWith(teleEnCanal(''));
const esSentir = (r: Registro) => r.concepto === COMO_ME_SIENTO || r.concepto === COMO_ME_SENTI;
/**
 * Lo que va junto con otro registro y se muestra (y se borra) con él: los canales y tipos de la tele, y lo que se contó
 * al decir cómo se sentía ("Mal" y después "cansancio, dolor de cabeza", a la misma hora) — se guardan aparte para los
 * patrones, pero es una sola cosa.
 */
/** Comidas y bebidas anotadas a la misma hora (el mismo minuto) van juntas: "ñoquis con tuco". */
const mismoMinuto = (a: Registro, b: Registro) => a.inicio.slice(0, 16) === b.inicio.slice(0, 16);
const partesDe = (r: Registro, todos: Registro[], sintomaId?: number, genteId?: number, comidaIds: number[] = []) => [
  ...(comidaIds.includes(r.categoria_id) ? todos.filter((o) => o.id !== r.id && comidaIds.includes(o.categoria_id) && mismoMinuto(o, r)) : []),
  ...(r.concepto === TELE
    ? todos.filter((o) => esParteDeTele(o) && o.inicio === r.inicio)
    : esSentir(r) && sintomaId !== undefined
      ? todos.filter((o) => o.categoria_id === sintomaId && o.inicio === r.inicio)
      : []),
  // Con quién estuvo (anotado junto con esto, a la misma hora): va con el registro y se muestra abajo.
  ...(genteId !== undefined && r.categoria_id !== genteId ? todos.filter((o) => o.categoria_id === genteId && o.inicio === r.inicio) : []),
];

/** En qué parte del día pasó algo (el día de Patty empieza a las 5). */
const FRANJAS = [
  { desde: 5, nombre: t('Mañana'), cual: 'manana' as const },
  { desde: 12, nombre: t('Tarde'), cual: 'tarde' as const },
  { desde: 19, nombre: t('Noche'), cual: 'noche' as const },
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


export function Hoy({ persona, cara }: { persona: Persona; cara: Cara | null }) {
  const { categorias, avisar, sesion } = useEstado();
  const sintomaId = categorias.find((c) => c.clave === 'sintoma')?.id;
  const genteId = categorias.find((c) => c.clave === 'gente')?.id;
  const comidaIds = categorias.filter((c) => c.clave === 'comida' || c.clave === 'bebida').map((c) => c.id);
  const [fecha, setFecha] = useState(() => fechaPedidaParaVer() ?? hoyEn(persona.zona_horaria));
  // Un día pedido desde otra pantalla ("el martes 14", en una respuesta de Patty), también con el Día ya abierto.
  useEffect(() => {
    olvidarFechaPedida();
    return alPedirIrAlDia(() => {
      const f = fechaPedidaParaVer();
      olvidarFechaPedida();
      if (f) setFecha(f);
    });
  }, []);
  const [registros, setRegistros] = useState<Registro[] | null>(() => YA_TRAIDO.get(`${persona.id}|${fecha}`)?.registros ?? null);
  const [automaticos, setAutomaticos] = useState<DatoAutomatico[]>(() => YA_TRAIDO.get(`${persona.id}|${fecha}`)?.automaticos ?? []);
  /** La fuente de datos automáticos que está abierta (se ve todo lo que llegó de ella). */
  // En la app del teléfono, en el día propio: las fuentes cuyo permiso falta van como widgets grises para activarlas.
  const conPermisos = esNativa() && Boolean(persona.propia);
  const [estadoPermisos, mirarPermisos] = useEstadoPermisos(conPermisos);
  const [activando, setActivando] = useState<Fuente | null>(null);
  /** La hoja de anotar abierta: normal, o directo en "Contarlo" (el botón grande de hablarle). */
  const [cargando, setCargando] = useState<false | 'normal' | 'contar' | 'foto'>(false);
  /** Algo contado sin señal que se está revisando (se abre Cargar con eso). */
  const [revisando, setRevisando] = useState<ContadoPendiente | undefined>(undefined);
  // La cámara del Día: primero cámara o galería; con la foto ya sacada se abre la carga (si se cancela, nada).
  const [eligiendoFoto, setEligiendoFoto] = useState(false);
  const [fotoInicial, setFotoInicial] = useState<Foto | null>(null);
  const fotoDe = async (origen: 'camara' | 'galeria') => {
    setEligiendoFoto(false);
    try {
      const f = await sacarFoto(origen);
      if (!f) return;
      setFotoInicial(f);
      setCargando('foto');
    } catch (e) {
      avisar((e as Error).message);
    }
  };
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
  // Lo anotado sin señal se acaba de subir: se trae el día de nuevo.
  useEffect(() => {
    const f = () => void traer();
    window.addEventListener(EVENTO_SUBIDO, f);
    return () => window.removeEventListener(EVENTO_SUBIDO, f);
  }, [traer]);
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
  // El widget de la pantalla de inicio: anota el ánimo de esta persona; sus botones abren el Día en contar, la cámara
  // o "¿cómo te sentís?" con la carita elegida (si el widget no pudo anotarla solo).
  const catAnimo = categorias.find((c) => c.clave === 'animo')?.id;
  useEffect(() => {
    if (!persona.supervisada) configurarWidget(persona.id, catAnimo);
  }, [persona.id, persona.supervisada, catAnimo]);
  const atenderWidget = useCallback(
    (d: Record<string, string>) => {
      tomarWidgetPendiente();
      setFecha(hoyEn(persona.zona_horaria));
      if (d.accion_widget === 'contar') setCargando('contar');
      else if (d.accion_widget === 'foto') void fotoDe('camara');
      else if (d.accion_widget === 'sentir') setSintiendo({ momento: 'ahora', estado: d.intensidad ? estadoDe(Number(d.intensidad)) : null });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persona.zona_horaria],
  );
  useEffect(() => {
    const d = tomarWidgetPendiente();
    if (d) atenderWidget(d);
    return alTocarAvisoPush((x) => x.tipo === 'widget' && atenderWidget(x));
  }, [atenderWidget]);
  const [vuelta, setVuelta] = useState(0);
  // Desde la hoja de puntos (en la barra de arriba): "Contale a Patty".
  const [pista, setPista] = useState<(typeof PISTAS)[keyof typeof PISTAS]>(undefined);
  useEffect(() => {
    const f = (e: Event) => {
      const item = (e as CustomEvent<ItemPuntos | undefined>).detail;
      // "Cómo te sentís" se contesta con las caritas; lo demás, contándolo, con lo que se eligió ya dicho.
      if (item === 'animo') return setSintiendo({ momento: 'ahora', estado: null });
      setPista(item ? PISTAS[item] : undefined);
      setCargando('contar');
    };
    window.addEventListener(EVENTO_CONTAR, f);
    return () => window.removeEventListener(EVENTO_CONTAR, f);
  }, []);
  // El encabezado del día queda fijo arriba y se achica con el scroll, de a poco (como los títulos grandes del
  // iPhone): `--k` va de 0 (arriba de todo) a 1 (después de 70 px de scroll).
  const navdia = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const barra = document.querySelector<HTMLElement>('.barra');
      if (barra) document.documentElement.style.setProperty('--alto-barra', `${barra.offsetHeight}px`);
      navdia.current?.style.setProperty('--k', String(Math.min(1, Math.max(0, window.scrollY / 70))));
    };
    const alMover = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener('scroll', alMover, { passive: true });
    window.addEventListener('resize', alMover);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener('scroll', alMover);
      window.removeEventListener('resize', alMover);
    };
  }, []);

  /** Borra (y sus partes, si es la tele). Devuelve false si al final no se quiso borrar. */
  const borrar = async (r: Registro): Promise<boolean> => {
    if (!confirm(t('¿Borrar «{que}» de las {hora}?', { que: t(r.concepto), hora: horaEn(r.inicio, persona.zona_horaria) }))) return false;
    for (const x of [r, ...partesDe(r, registros ?? [], sintomaId, genteId, comidaIds)]) await api('DELETE', `/api/registros/${x.id}`);
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
    const todos = [r, ...partesDe(r, registros ?? [], sintomaId, genteId, comidaIds)];
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
    useCallback((como: 'sentir' | 'dia') => {
      setFecha(hoyEn(persona.zona_horaria));
      if (como === 'dia') {
        setPista(PISTAS.dia);
        setCargando('contar');
      } else setSintiendo({ momento: 'dia', estado: null });
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

  // Tocar la mascota de arriba abre "¿Cómo te sentís?" cuando sea.
  useAlPedirSentir(
    useCallback(() => {
      setFecha(hoyEn(persona.zona_horaria));
      setSintiendo({ momento: 'ahora', estado: null });
    }, [persona.zona_horaria]),
  );

  // Si contó cómo se siente hace menos de 3 horas (con las caritas o con algo de la lista: sueño, frío, con gente…), el
  // bloque se pliega en un botón chico (vuelve cada tanto, tocando el botón o la mascota).
  const clavesSentir = new Set(['animo', 'sintoma', 'gente']);
  // El más reciente (por hora, no por el orden de la lista), contado a mano o contándolo; también a la hora de la
  // encuesta: si recién dijo cómo se siente, no se le vuelve a preguntar por el día en seguida.
  const ultimoSentir = Math.max(
    0,
    ...(registros ?? [])
      .filter((r) => ['manual', 'ia', 'noche'].includes(r.origen) && clavesSentir.has(categorias.find((c) => c.id === r.categoria_id)?.clave ?? ''))
      .map((r) => Date.parse(r.inicio)),
  );
  // Lo recién contestado cuenta ya, sin esperar a que vuelva la lista del servidor, y se recuerda aunque se cambie de
  // pantalla o se vuelva a abrir la app (si no, el globito volvía a preguntar a los pocos minutos).
  const [sentidoRecien, setSentidoRecienEstado] = useState(() => {
    try {
      return Number(localStorage.getItem(CLAVE_SENTIDO)) || 0;
    } catch {
      return 0;
    }
  });
  const setSentidoRecien = (n: number) => {
    setSentidoRecienEstado(n);
    try {
      localStorage.setItem(CLAVE_SENTIDO, String(n));
    } catch {
      /* sin almacenamiento */
    }
  };
  const ahora = Date.now();
  const contestadoHacePoco = ahora - Math.max(sentidoRecien, ultimoSentir < ahora + 3600000 ? ultimoSentir : 0) < HORAS_SIN_PREGUNTAR * 3600000;

  const tiposConDatos = new Set(automaticos.map((a) => a.tipo_fuente));
  // Con permiso de salud y sin nada del reloj hoy: se le pide a Health Connect / Salud al abrir el Día (si pasaron 5
  // minutos de la última vez), así lo que el reloj sincronizó aparece sin esperar a la media hora.
  const saludDada = conPermisos && permisoListo('salud', estadoPermisos);
  const [buscandoSalud, setBuscandoSalud] = useState(false);
  const buscarSalud = useCallback(async () => {
    setBuscandoSalud(true);
    try {
      if (!saludActivada()) ponerSalud(true);
      const n = await sincronizarSalud(persona.id);
      if (n) await traer();
      return n;
    } catch {
      return 0;
    } finally {
      setBuscandoSalud(false);
    }
  }, [persona.id, traer]);
  const sinReloj = !tiposConDatos.has('reloj');
  useEffect(() => {
    if (fecha === hoy && saludDada && sinReloj && registros !== null && haceCuantoSalud() > 5 * 60000) void buscarSalud();
  }, [fecha, hoy, saludDada, sinReloj, registros !== null, buscarSalud]);
  const apagadas: Fuente[] =
    conPermisos && fecha === hoy
      ? (['ubicacion', 'telefono', 'salud'] as const).filter(
          (f) => fuenteApagada(f, estadoPermisos) && (f !== 'telefono' || hayDatosDelTelefono()) && !TIPOS_DE[f].some((x) => tiposConDatos.has(x)),
        )
      : [];

  const tipoDe = (r: Registro) => categorias.find((c) => c.id === r.categoria_id);

  return (
    <section className="dia" onTouchStart={empezarToque} onTouchEnd={terminarToque}>
      <div className="navdia" ref={navdia}>
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
      {/* "¿Cómo te sentís?" ya no ocupa lugar en el Día: si falta contarlo, el búho de arriba lo pregunta con un globito,
          y tocándolo (o tocando el búho) se abre la hoja para contestar. */}
      {fecha === hoy && !persona.supervisada && registros !== null ? (
        <GloboDelBuho
          visible={!contestadoHacePoco && !sintiendo}
          texto={momento === 'dia' ? t('¿Cómo te sentiste hoy?') : t('¿Cómo te sentís ahora?')}
          alTocar={() => setSintiendo({ momento, estado: null })}
        />
      ) : null}
      {fecha === hoy ? <SinSenal persona={persona} alRevisar={(c) => { setRevisando(c); setCargando('contar'); }} /> : null}
      {fecha === hoy ? <TarjetaSemana persona={persona} /> : null}
      {fecha === hoy && !persona.supervisada ? <ObjetivosSemana persona={persona} hoy={hoy} vuelta={vuelta} /> : null}
      {fecha === hoy ? <FueraDeLoNormal persona={persona} /> : null}
      {fecha === hoy && sesion?.ia ? <ComentarioDelDia persona={persona} hoy={hoy} /> : null}
      {fecha === hoy && !persona.supervisada && sesion?.usuario?.rol !== 'lector' ? (
        <RutinasDelDia persona={persona} hoy={hoy} categorias={categorias} alAnotar={() => void traer()} />
      ) : null}
      {fecha === hoy && !persona.supervisada && sesion?.usuario?.rol !== 'lector' ? (
        <PreguntaDespertar persona={persona} hoy={hoy} categorias={categorias} alAnotar={() => void traer()} />
      ) : null}
      {/* Las preguntas de Patty sobre lo que pasó (con quién, dónde, cómo fueron los viajes) van primero. */}
      {/* A la noche, si todavía no se anotó nada a mano: contar el día entero de una vez (Patty lo desglosa por horas). */}
      {fecha === hoy && sesion?.ia && registros && sesion.usuario?.rol !== 'lector' && new Date().getHours() >= HORA_CONTAR_DIA &&
      !registros.some((r) => r.origen === 'manual' || r.origen === 'ia') ? (
        <div className="tarjeta contar-dia">
          <h3>{t('🌙 ¿Me contás tu día?')}</h3>
          <p className="suave">{t('Todo junto, como te salga: yo lo ordeno y le pongo una hora aproximada a cada cosa.')}</p>
          <button className="btn primario ancho" onClick={() => { setPista(PISTAS.dia); setCargando('contar'); }}>
            {hayVoz(sesion.voz) ? <IconoMicrofono /> : <IconoLapiz />} {t('Contar mi día')}
          </button>
        </div>
      ) : null}
      {registros && sesion?.usuario?.rol !== 'lector' ? <CompaniaSugerida persona={persona} fecha={fecha} registros={registros} categorias={categorias} alCambiar={() => void traer()} /> : null}
      <ParadasDelDia persona={persona} fecha={fecha} vuelta={vuelta} alCambiar={() => void traer()} />
      <ViajesDelDia persona={persona} fecha={fecha} vuelta={vuelta} alCambiar={() => void traer()} />
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
            .filter((r) => r.categoria_id !== sintomaId || !registros.some((o) => esSentir(o) && o.inicio === r.inicio))
            // Las comidas de la misma hora se muestran en un solo renglón (el de la primera que se anotó).
            .filter((r) => !comidaIds.includes(r.categoria_id) || !registros.some((o) => o.id < r.id && comidaIds.includes(o.categoria_id) && mismoMinuto(o, r)))
            .filter((r) => r.categoria_id !== genteId || !registros.some((o) => o.categoria_id !== genteId && o.inicio === r.inicio))
            // "Viaje pesado" va con su viaje (está para los patrones): no hace falta un renglón aparte.
            .filter((r) => r.concepto !== VIAJE_PESADO || !registros.some((o) => o.id !== r.id && o.categoria_id === r.categoria_id && o.inicio === r.inicio))
            // Lo más reciente arriba: lo que se acaba de anotar se ve primero.
            .slice()
            .reverse()
            .map((r, i, todos) => {
            const cat = tipoDe(r);
            const f = franja(r.inicio, persona.zona_horaria);
            const nuevaFranja = i === 0 || franja(todos[i - 1].inicio, persona.zona_horaria) !== f;
            return (
              <Fragment key={r.id}>
                {nuevaFranja ? <li className="franja" aria-hidden><IconoFranja cual={f.cual} /> {f.nombre}</li> : null}
              <FilaDeslizable
                className={`tocable ${vistos.current && !vistos.current.has(r.id) ? 'recien' : vistos.current ? '' : 'entra'}`}
                style={{ ['--n' as string]: Math.min(i, 12) }}
                alTocar={() => setEditando(r)}
                alBorrar={() => void quitar(r)}
              >
                <span className="hora">{horaEn(r.inicio, persona.zona_horaria)}</span>
                <span className="icono">{esSentir(r) && r.intensidad !== null ? <IconoAnimo clave={estadoDe(r.intensidad).clave} /> : <IconoCategoria clave={cat?.clave} emoji={cat?.icono} />}</span>
                <span className="que">
                  <span className="frase"><Frase r={r} tipo={cat?.tipo_valor} categoria={cat?.clave} juntos={comidaIds.includes(r.categoria_id) ? registros.filter((o) => o.id !== r.id && comidaIds.includes(o.categoria_id) && mismoMinuto(o, r)) : []} sintomas={esSentir(r) ? partesDe(r, registros, sintomaId) : []} /></span>
                  {(() => {
                    // Lo demás en una sola línea suave: qué le pasaba, dónde, con quién y la nota.
                    const y = idioma() === 'en' ? ' and ' : ' y ';
                    const unir = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')}${y}${l.at(-1)}` : l[0]);
                    const gente = genteId !== undefined && r.categoria_id !== genteId ? registros.filter((o) => o.categoria_id === genteId && o.inicio === r.inicio).map((o) => o.concepto) : [];
                    const extra = [
                      etiquetaDonde(r.donde, r.lugar) ?? '',
                      gente.length ? t('con {lista}', { lista: unir(gente) }) : '',
                      r.nota ?? '',
                    ].filter(Boolean);
                    return extra.length ? <span className="frase-extra">{extra.join(' · ')}</span> : null;
                  })()}
                </span>
              </FilaDeslizable>
              </Fragment>
            );
          })}
        </ul>
      )}
      {/* Lo que llegó solo (clima, ubicación, teléfono, sueño y salud): widgets chicos, distintos de lo anotado. */}
      <WidgetsDelDia
        automaticos={automaticos}
        registros={registros ?? []}
        categorias={categorias}
        apagadas={apagadas}
        alActivar={setActivando}
        persona={persona}
        fecha={fecha}
        antes={
          <>
            <RemediosDelDia widget persona={persona} fecha={fecha} hoy={hoy} vuelta={vuelta} alCambiar={() => { void traer(); avisarAnotado(); }} />
            <AnimoSemana persona={persona} fecha={fecha} vuelta={vuelta} />
          </>
        }
        buscandoSalud={buscandoSalud}
        alContarSueno={fecha === hoy && sesion?.ia && sesion.usuario?.rol !== 'lector' && !persona.supervisada ? () => {
          // Con permiso de salud, primero se busca en el reloj; si no hay nada, se cuenta.
          void (async () => {
            if (saludDada && (await buscarSalud())) return;
            setPista(PISTAS.sueno);
            setCargando('contar');
          })();
        } : undefined}
      />
      </div>
      {/* Las hojas van fuera del contenido animado: si no, quedan atrás de la lista mientras se anima. */}
      {activando ? (
        <>
          <div className="velo" onClick={() => setActivando(null)} />
          <HojaActivar fuente={activando} persona={persona} alCerrar={() => setActivando(null)} alActivar={mirarPermisos} />
        </>
      ) : null}
      {editando ? (
        <>
          <div className="velo" onClick={() => setEditando(null)} />
          <Editar
            persona={persona}
            registro={editando}
            partes={partesDe(editando, registros ?? [], sintomaId, genteId, comidaIds)}
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
            alGuardar={() => { setSintiendo(null); setSentidoRecien(Date.now()); void traer(); avisarAnotado(); }}
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
          <button className="camara-flotante" onClick={() => setEligiendoFoto(true)} aria-label={t('Sacale una foto a lo que comiste')}><IconoCamara /></button>
          {eligiendoFoto ? <ElegirFoto alElegir={(o) => void fotoDe(o)} alCancelar={() => setEligiendoFoto(false)} /> : null}
        </>
      ) : null}
      {/* Un velo suave detrás de los botones de abajo, para que se lean sobre cualquier cosa. */}
      <div className="velo-botones" aria-hidden="true" />
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
          <Cargar persona={persona} fecha={fecha} contar={cargando === 'contar'} pista={cargando === 'contar' ? pista : undefined} contado={cargando === 'contar' ? revisando : undefined} foto={cargando === 'foto' ? fotoInicial ?? undefined : undefined} alCerrar={() => { setCargando(false); setPista(undefined); setRevisando(undefined); }} alGuardar={(otroDia) => { setCargando(false); setPista(undefined); setRevisando(undefined); if (otroDia) setFecha(otroDia); else void traer(); avisarAnotado(); }} />
        </>
      ) : null}
    </section>
  );
}
