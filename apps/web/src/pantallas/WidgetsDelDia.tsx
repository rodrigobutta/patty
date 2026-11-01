// Lo que llegó solo en el Día, en widgets chicos: un ícono dibujado (el del clima cambia según el día) y un resumen
// cortito, sin títulos. Los que no tienen datos porque falta el permiso van grises (ver FuenteApagada); tocando uno con
// datos se ve el detalle a lo ancho. Más uno de lo que se comió (ver ComidaDelDia), que aparece cuando hay algo anotado.
// Cuáles se ven y en qué orden lo elige cada persona: en Más (ver ElegirWidgets) o manteniendo apretado uno (ver OrganizarWidgets).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconoCampana, IconoCategoria } from '../ui/IconosPatty';
import { createPortal } from 'react-dom';
import { CONCEPTOS_ESCUCHA, moverWidget, patronesFinos, ponerWidgetVisible, vecinoDeWidget, widgetOculto, widgetsVisibles, type AjustesWidgets, type Categoria, type DatoAutomatico, type Persona, type Registro, type WidgetId } from 'shared';
import { AvisosDelTelefono } from './AvisosDelDia';
import { ClimaDelDia } from './ClimaDelDia';
import { EscuchasDelDia, NOMBRE_ESCUCHA } from './EscuchasDelDia';
import { celdasVisibles, OpcionesWidget, useOrganizarWidgets } from './OrganizarWidgets';
import { ComidaDelDiaHoja, comidasAnotadas, destacadoDe, lineaComidas, useComidaDelDia } from './ComidaDelDia';
import { GraficoSueno, ResumenNoche } from './GraficoSueno';
import { CaminatasDelDia, RecorridoDelDia } from './RecorridoDelDia';
import { agruparAutomaticos, duracion, reloj, type GrupoAutomatico, type LineaAutomatica } from '../lib/automatico';
import { appDelUso, useIconosApps } from '../lib/iconosApps';
import { marcarNocheVista, useAlPedirNoche } from '../lib/buenDia';
import { horaEn } from '../lib/fechas';
import { locale, t } from '../lib/idioma';
import { irAMas } from '../lib/navegar';
import { cambiarWidgets, NOMBRE_WIDGET, useAjustesWidgets } from '../lib/widgets';
import { IconoCelular, IconoCuerpo, IconoEscuchas, IconoReuniones, IconoCielo, IconoLugar, IconoPasos, IconoSueno, type Cielo } from '../ui/IconosWidget';
import { WidgetApagado, type Fuente } from './FuenteApagada';

/** Los que arma esta pantalla; los demás (remedios, ánimo) se dibujan solos: ver `propios`. */
type Lugar = Exclude<WidgetId, 'remedios' | 'animo'>;

interface Widget {
  lugar: Lugar;
  icono: ReactNode;
  /** La línea grande y la chica de abajo. */
  linea: string;
  sub?: string;
  /** Lo que se abre al tocarlo. */
  grupos: GrupoAutomatico[];
  nombre: string;
}

const entero = (n: number) => Math.round(n).toLocaleString(locale());

/** El valor de un concepto de lo que llegó solo (de cualquier fuente de ese tipo). */
function dato(todos: DatoAutomatico[], tipo: string, concepto: string): DatoAutomatico | undefined {
  return todos.find((d) => d.tipo_fuente === tipo && d.concepto === concepto);
}

function widgetClima(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  if (!todos.some((d) => d.tipo_fuente === 'clima' && d.fuente !== 'Sol y luna')) return null; // sin clima (apagado), no hay qué mostrar
  // Con el resumen del día, sus valores; si no, los de cada hora.
  const max = dato(todos, 'clima', 'Temperatura máxima')?.suma ?? dato(todos, 'clima', 'Temperatura')?.maximo;
  const min = dato(todos, 'clima', 'Temperatura mínima')?.suma ?? dato(todos, 'clima', 'Temperatura')?.minimo;
  const lluvia = dato(todos, 'clima', 'Lluvia del día')?.suma ?? dato(todos, 'clima', 'Lluvia')?.suma ?? 0;
  const solH = dato(todos, 'clima', 'Horas de sol')?.suma ?? (dato(todos, 'clima', 'Minutos de sol')?.suma ?? NaN) / 60;
  const nubesD = dato(todos, 'clima', 'Nubosidad de día');
  const nubesH = dato(todos, 'clima', 'Nubosidad');
  const nubes = nubesD?.suma ?? (nubesH ? nubesH.suma / Math.max(1, nubesH.cantidad) : NaN);
  const cielo: Cielo =
    lluvia >= 0.5 ? 'lluvia' : nubes >= 70 ? 'nublado' : nubes >= 30 ? 'parcial' : Number.isNaN(nubes) && solH < 2 ? 'nublado' : 'sol';
  const temp = max === undefined ? '' : min !== undefined && Math.round(min) !== Math.round(max) ? `${entero(max)}° / ${entero(min)}°` : `${entero(max)}°`;
  const sub =
    lluvia >= 0.5
      ? t('{n} mm de lluvia', { n: Number(lluvia.toFixed(1)).toLocaleString(locale()) })
      : !Number.isNaN(solH) && solH > 0
        ? t('{v} de sol', { v: duracion(solH * 60) })
        : undefined;
  return { lugar: 'clima', icono: <IconoCielo cielo={cielo} />, linea: temp || '—', sub, grupos: grupos.filter((g) => g.tipo === 'clima'), nombre: t('Clima') };
}

/** Los viajes (de la ubicación). Sin viajes pero con pasos, el widget es de los pasos (ver widgetPasos). */
function widgetUbicacion(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const viajes = dato(todos, 'ubicacion', 'Viajes');
  const km = dato(todos, 'ubicacion', 'Km en vehículo');
  const kmAPie = dato(todos, 'ubicacion', 'Km a pie');
  const pasos = dato(todos, 'reloj', 'Pasos');
  if (!viajes && !km) return null;
  const n = Math.round(viajes?.suma ?? 0);
  if (n === 0 && pasos) return null;
  return {
    lugar: 'ubicacion',
    icono: <IconoLugar />,
    linea: n === 0 ? t('Sin viajes') : n === 1 ? t('1 viaje') : t('{n} viajes', { n }),
    sub:
      km && km.suma >= 0.1
        ? `${Number(km.suma.toFixed(1)).toLocaleString(locale())} km`
        : kmAPie && kmAPie.suma >= 0.1
          ? t('{n} km a pie', { n: Number(kmAPie.suma.toFixed(1)).toLocaleString(locale()) })
          : undefined,
    // Lo caminado va con los pasos, si hay (ver widgetPasos).
    grupos: grupos.filter((g) => g.tipo === 'ubicacion').map((g) => ({ ...g, lineas: g.lineas.filter((l) => !pasos || l.concepto !== 'Km a pie') })),
    nombre: t('Viajes'),
  };
}

/** Los pasos (del reloj o el teléfono), con lo que se caminó. Si no hubo viajes, abajo lo dice. */
function widgetPasos(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const pasos = dato(todos, 'reloj', 'Pasos');
  if (!pasos) return null;
  const km = dato(todos, 'reloj', 'Km caminados');
  const viajes = dato(todos, 'ubicacion', 'Viajes');
  const sinViajes = viajes && Math.round(viajes.suma) === 0;
  // Las caminatas (detectadas en los pasos): cuántas hubo.
  const caminatas = todos.filter((d) => d.tipo_fuente === 'reloj' && d.concepto === 'Caminata').reduce((n, d) => n + d.cantidad, 0);
  return {
    lugar: 'pasos',
    icono: <IconoPasos />,
    linea: t('{n} pasos', { n: entero(pasos.suma) }),
    sub: caminatas
      ? caminatas === 1 ? t('1 caminata') : t('{n} caminatas', { n: caminatas })
      : km && km.suma >= 0.1 ? `${Number(km.suma.toFixed(1)).toLocaleString(locale())} km` : sinViajes ? t('Sin viajes') : undefined,
    grupos: grupos
      .filter((g) => g.tipo === 'reloj' || g.tipo === 'ubicacion')
      .map((g) => ({ ...g, lineas: g.lineas.filter((l) => (g.tipo === 'reloj' ? !SUENO.has(l.concepto) && !l.concepto.startsWith('Pulso') : l.concepto === 'Km a pie')) })),
    nombre: t('Movimiento'),
  };
}

/** Lo del calendario (llega con lo del teléfono): va en su propio widget. */
const REUNIONES = new Set(['Reuniones', 'Horas de reuniones', 'Reuniones seguidas', 'Reuniones fuera de horario', 'Primera reunión', 'Última reunión', 'Eventos del calendario', 'Horas ocupadas en el calendario']);

function widgetReuniones(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const n = dato(todos, 'telefono', 'Reuniones');
  const ev = dato(todos, 'telefono', 'Eventos del calendario');
  if (!n && !ev) return null;
  const horas = dato(todos, 'telefono', 'Horas de reuniones');
  const cuantas = Math.round(n?.suma ?? 0);
  const eventos = Math.round(ev?.suma ?? 0);
  return {
    lugar: 'reuniones',
    icono: <IconoReuniones />,
    // Sin reuniones con gente, lo que haya en la agenda (el dentista, el gimnasio…).
    linea: cuantas === 0 ? (eventos ? (eventos === 1 ? t('1 evento') : t('{n} eventos', { n: eventos })) : t('Sin reuniones')) : cuantas === 1 ? t('1 reunión') : t('{n} reuniones', { n: cuantas }),
    sub: horas && cuantas ? duracion((horas.suma ?? 0) * 60) : cuantas && eventos > cuantas ? t('{n} eventos en total', { n: eventos }) : undefined,
    grupos: grupos.filter((g) => g.tipo === 'telefono').map((g) => ({ ...g, lineas: g.lineas.filter((l) => REUNIONES.has(l.concepto)) })),
    nombre: t('Reuniones'),
  };
}

/**
 * Lo de las notificaciones de noche y los mensajes va en su propia parte del detalle (ver AvisosDelTelefono), no en la
 * lista. El total de notificaciones sí queda en la lista, junto a las llamadas.
 */
const AVISOS = new Set(['Notificaciones de noche', 'Mensajes recibidos']);
const LLAMADAS = new Set(['Llamadas', 'Llamadas perdidas', 'Minutos en llamadas']);

/** Las notificaciones, justo después de las llamadas (son las dos cosas que interrumpen). */
function notificacionesConLasLlamadas(lineas: LineaAutomatica[]): LineaAutomatica[] {
  const notif = lineas.find((l) => l.concepto === 'Notificaciones');
  if (!notif) return lineas;
  const resto = lineas.filter((l) => l !== notif);
  let despues = -1;
  resto.forEach((l, i) => {
    if (LLAMADAS.has(l.concepto)) despues = i;
  });
  resto.splice(despues + 1, 0, notif);
  return resto;
}

function widgetTelefono(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const pantalla = dato(todos, 'telefono', 'Tiempo de pantalla');
  const llamadas = dato(todos, 'telefono', 'Llamadas');
  const avisos = dato(todos, 'telefono', 'Notificaciones');
  if (!pantalla && !llamadas && !avisos) return null;
  const n = Math.round(llamadas?.suma ?? 0);
  const notif = Math.round(avisos?.suma ?? 0);
  return {
    lugar: 'telefono',
    icono: <IconoCelular />,
    linea: pantalla ? duracion(pantalla.suma) : notif === 1 ? t('1 notificación') : t('{n} notificaciones', { n: notif }),
    sub: llamadas ? (n === 1 ? t('1 llamada') : t('{n} llamadas', { n })) : pantalla && avisos ? (notif === 1 ? t('1 notificación') : t('{n} notificaciones', { n: notif })) : undefined,
    grupos: grupos
      .filter((g) => g.tipo === 'telefono')
      .map((g) => ({ ...g, lineas: notificacionesConLasLlamadas(g.lineas.filter((l) => !REUNIONES.has(l.concepto) && !AVISOS.has(l.concepto))) })),
    nombre: t('Uso del teléfono'),
  };
}

/** Lo del sueño (del reloj, o anotado a mano). */
const SUENO = new Set(['Horas de sueño', 'Hora de dormir', 'Hora de despertar']);

function widgetSueno(todos: DatoAutomatico[], grupos: GrupoAutomatico[], registros: Registro[]): Widget | null {
  const horas = dato(todos, 'reloj', 'Horas de sueño');
  const durmio = dato(todos, 'reloj', 'Hora de dormir');
  const pulso = dato(todos, 'reloj', 'Pulso en reposo');
  // Sin reloj, lo que se anotó a mano: a qué hora se levantó.
  const levanto = registros.find((r) => r.concepto === 'Me levanté' && r.valor !== null);
  if (!horas && !levanto) return null;
  const linea = horas ? duracion(horas.suma * 60) : t('Arriba {hora}', { hora: reloj(levanto!.valor!) });
  const sub = durmio ? t('a dormir {hora}', { hora: reloj(durmio.suma) }) : pulso ? t('{n} lpm en reposo', { n: entero(pulso.suma) }) : undefined;
  return {
    lugar: 'sueno',
    icono: <IconoSueno />,
    linea,
    sub,
    grupos: grupos.filter((g) => g.tipo === 'reloj').map((g) => ({ ...g, lineas: g.lineas.filter((l) => SUENO.has(l.concepto) || l.concepto.startsWith('Pulso')) })),
    nombre: t('Sueño'),
  };
}

/** Pulso, oxígeno y peso del reloj. Sin noche anotada no había dónde verlos: su hoja era la del sueño. */
const CUERPO = new Set(['Pulso en reposo', 'Pulso promedio', 'Pulso máximo', 'Pulso mínimo', 'Variabilidad del pulso', 'Oxígeno en sangre', 'Respiraciones por minuto', 'Peso']);

function widgetCuerpo(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const valor = (concepto: string) => {
    const d = dato(todos, 'reloj', concepto);
    return d ? d.suma / Math.max(1, d.cantidad) : undefined;
  };
  const decimal = (n: number) => Number(n.toFixed(1)).toLocaleString(locale());
  const reposo = valor('Pulso en reposo');
  const pulso = reposo ?? valor('Pulso promedio');
  const oxigeno = valor('Oxígeno en sangre');
  const peso = valor('Peso');
  const textos = [
    pulso !== undefined ? t('{n} lpm', { n: entero(pulso) }) : null,
    oxigeno !== undefined ? t('{n} % de oxígeno', { n: decimal(oxigeno) }) : null,
    peso !== undefined ? `${decimal(peso)} kg` : null,
  ].filter((x): x is string => x !== null);
  if (!textos.length) return null;
  return {
    lugar: 'cuerpo',
    icono: <IconoCuerpo />,
    linea: textos[0],
    sub: textos[1] ?? (reposo !== undefined ? t('en reposo') : undefined),
    grupos: grupos.filter((g) => g.tipo === 'reloj').map((g) => ({ ...g, lineas: g.lineas.filter((l) => CUERPO.has(l.concepto)) })),
    nombre: t('Pulso y cuerpo'),
  };
}

/** Lo que sonó o se miró en el teléfono: el total y qué fue. Su detalle, por sesión y con los temas, es EscuchasDelDia. */
function widgetEscuchas(todos: DatoAutomatico[]): Widget | null {
  const datos = todos.filter((d) => d.tipo_fuente === 'telefono' && CONCEPTOS_ESCUCHA.includes(d.concepto));
  if (!datos.length) return null;
  const nombres = (['musica', 'podcast', 'video'] as const).map((tipo, i) => (datos.some((d) => d.concepto === CONCEPTOS_ESCUCHA[i]) ? t(NOMBRE_ESCUCHA[tipo]) : null)).filter(Boolean);
  return { lugar: 'escuchas', icono: <IconoEscuchas />, linea: duracion(datos.reduce((s, d) => s + d.suma, 0)), sub: nombres.join(' · '), grupos: [], nombre: t('Lo que sonó') };
}

/** Los dolores y molestias anotados ese día, con su intensidad. Lo que se mide (la fiebre) no es un malestar en sí. */
function widgetMalestares(registros: Registro[], categorias: Categoria[], fecha: string, zona: string): Widget | null {
  const sintoma = categorias.find((c) => c.clave === 'sintoma')?.id;
  const delDia = registros.filter((r) => r.categoria_id === sintoma && r.fecha === fecha && (r.intensidad !== null || r.valor === null));
  if (!delDia.length) return null;
  const distintos = new Set(delDia.map((r) => r.concepto));
  const maximo = Math.max(0, ...delDia.map((r) => r.intensidad ?? 0));
  return {
    lugar: 'malestares',
    icono: <IconoCategoria clave="sintoma" />,
    linea: distintos.size === 1 ? t(delDia[0].concepto) : t('{n} malestares', { n: distintos.size }),
    sub: maximo ? t('hasta {n} de 10', { n: maximo }) : undefined,
    grupos: [{
      fuente: '',
      tipo: 'malestares',
      lineas: delDia.map((r) => ({ concepto: r.concepto, categoria_id: r.categoria_id, valor: `${horaEn(r.inicio, zona)}${r.intensidad !== null ? ` · ${r.intensidad}/10` : ''}` })),
    }],
    nombre: t('Malestares'),
  };
}

/** El lugar de cada permiso que falta (el de la ubicación también trae el clima). */
const LUGAR_DE: Record<Fuente, Lugar> = { ubicacion: 'ubicacion', telefono: 'telefono', salud: 'sueno' };

export function WidgetsDelDia({ automaticos, registros, categorias, apagadas, alActivar, alContarSueno, buscandoSalud = false, propios, puedeOrganizar = false, alAvisar, persona, fecha }: {
  automaticos: DatoAutomatico[];
  registros: Registro[];
  categorias: Categoria[];
  apagadas: Fuente[];
  alActivar(f: Fuente): void;
  /** Si se puede anotar: sin datos de sueño, el widget invita a contar cómo durmió. */
  alContarSueno?: () => void;
  /** Mientras se le pide al reloj (Health Connect / Salud) lo de hoy. */
  buscandoSalud?: boolean;
  /** Los widgets que se dibujan solos (los remedios, el ánimo), en su lugar del orden. Si no tienen qué mostrar, no ocupan lugar. */
  propios?: Partial<Record<WidgetId, ReactNode>>;
  /** Si puede cambiar cuáles se ven y en qué orden (no quien solo mira o supervisa). */
  puedeOrganizar?: boolean;
  alAvisar?: (texto: string) => void;
  /** Para el gráfico de la noche (en la hoja del sueño). */
  persona: Persona;
  fecha: string;
}) {
  const [abierto, setAbierto] = useState<Lugar | null>(null);
  const ajustes = useAjustesWidgets(persona);
  const [opciones, setOpciones] = useState<WidgetId | null>(null);
  const [grilla, setGrilla] = useState<HTMLDivElement | null>(null);
  const guardarAjustes = (a: AjustesWidgets) => void cambiarWidgets(persona.id, a).catch((e: Error) => alAvisar?.(e.message));
  /** Los que se ven de verdad, en su orden (los que se dibujan solos pueden no tener qué mostrar: eso lo sabe la pantalla). */
  const mostrados = () => {
    const hay = new Set(celdasVisibles(grilla).map((c) => c.dataset.widget));
    return widgetsVisibles(ajustes).filter((w) => hay.has(w));
  };
  /** Con el teclado el widget se mueve de lugar en la página: el foco tiene que seguirlo. */
  const enfocar = useRef<WidgetId | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const mover = (id: WidgetId, delta: -1 | 1) => {
    const otro = vecinoDeWidget(mostrados(), id, delta);
    if (otro) guardarAjustes(moverWidget(ajustes, id, otro));
  };
  const organizar = useOrganizarWidgets({
    grilla,
    ajustes,
    habilitado: puedeOrganizar,
    alSoltar: guardarAjustes,
    alOpciones: setOpciones,
    alMover: (id, delta) => {
      const lista = mostrados();
      const otro = vecinoDeWidget(lista, id, delta);
      if (!otro) return;
      enfocar.current = id;
      setAnuncio(t('{nombre}: lugar {n} de {total}', { nombre: t(NOMBRE_WIDGET[id]), n: lista.indexOf(otro) + 1, total: lista.length }));
      guardarAjustes(moverWidget(ajustes, id, otro));
    },
  });
  useEffect(() => {
    if (!enfocar.current) return;
    grilla?.querySelector<HTMLElement>(`[data-widget="${enfocar.current}"] button`)?.focus();
    enfocar.current = null;
  });
  // El buen día (la tarjeta o el aviso de la mañana) abre la hoja del sueño.
  useAlPedirNoche(useCallback(() => setAbierto('sueno'), []));
  const grupos = agruparAutomaticos(automaticos);
  // Lo que se comió: el interruptor de los componentes también lo apaga (si no quiere que Patty estime eso, tampoco se muestra).
  const anotadas = comidasAnotadas(registros, categorias, fecha);
  const hayComida = patronesFinos(persona.patrones).componentes && anotadas.comidas + anotadas.bebidas > 0 && !widgetOculto(ajustes, 'comida');
  // Al abrir la hoja se vuelve a pedir: lo que se estaba calculando puede haber terminado.
  const comida = useComidaDelDia(persona, fecha, hayComida, `${anotadas.firma}#${abierto === 'comida'}`);
  const widgets = [
    widgetClima(automaticos, grupos),
    widgetUbicacion(automaticos, grupos),
    widgetPasos(automaticos, grupos),
    widgetTelefono(automaticos, grupos),
    widgetReuniones(automaticos, grupos),
    widgetSueno(automaticos, grupos, registros),
    hayComida ? { lugar: 'comida' as const, icono: <IconoCategoria clave="comida" />, linea: lineaComidas(anotadas), sub: destacadoDe(comida), grupos: [], nombre: t('Comida') } : null,
    widgetCuerpo(automaticos, grupos),
    widgetEscuchas(automaticos),
    widgetMalestares(registros, categorias, fecha, persona.zona_horaria),
  ].map((w) => {
    // Lo del reloj se reparte por categoría: actividad (pasos, km, calorías, ejercicio) al de los pasos; el sueño y la
    // salud (pulso, oxígeno, peso) al del sueño.
    if (!w || (w.lugar !== 'pasos' && w.lugar !== 'sueno')) return w;
    const actividad = categorias.find((c) => c.clave === 'actividad')?.id;
    const deActividad = (catId: number) => catId === actividad;
    return {
      ...w,
      grupos: grupos
        .filter((g) => g.tipo === 'reloj')
        .map((g) => ({ ...g, lineas: g.lineas.filter((l) => (w.lugar === 'pasos' ? deActividad(l.categoria_id) : !deActividad(l.categoria_id))) })),
    };
  }).map((w) => {
    // Lo que tiene su propio widget no se repite en otra hoja; si lo ocultó, sigue donde estaba.
    const sacar = w?.lugar === 'sueno' && !widgetOculto(ajustes, 'cuerpo') ? CUERPO : w?.lugar === 'telefono' && !widgetOculto(ajustes, 'escuchas') ? new Set(CONCEPTOS_ESCUCHA) : null;
    return w && sacar ? { ...w, grupos: w.grupos.map((g) => ({ ...g, lineas: g.lineas.filter((l) => !sacar.has(l.concepto)) })) } : w;
  });
  // Abrir la noche cuenta como haber visto el reporte de sueño: la tarjeta del buen día se va.
  const hayNoche = widgets.some((w) => w?.lugar === 'sueno');
  useEffect(() => {
    if (abierto === 'sueno' && hayNoche) marcarNocheVista(persona.id, fecha);
  }, [abierto, hayNoche, persona.id, fecha]);
  const widgetDe = (l: WidgetId) => widgets.find((w) => w?.lugar === l) ?? null;
  const contenido = (l: WidgetId): ReactNode => {
    if (propios?.[l]) return propios[l];
    const w = widgetDe(l);
    if (w) {
      return (
        <button className="widget-auto" onClick={() => setAbierto(w.lugar)} aria-haspopup="dialog" aria-label={`${w.nombre}: ${w.linea}${w.sub ? `, ${w.sub}` : ''}`}>
          {w.icono}
          <span className="widget-linea">{w.linea}</span>
          {w.sub ? <span className="widget-sub">{w.sub}</span> : null}
        </button>
      );
    }
    const apagada = apagadas.find((f) => LUGAR_DE[f] === l);
    if (apagada) return <WidgetApagado fuente={apagada} alTocar={() => alActivar(apagada)} />;
    // Sin reloj ni nada anotado: el lugar del sueño queda, para contar cómo dormiste.
    if (l === 'sueno' && alContarSueno) {
      return (
        <button className={`widget-auto sin-datos${buscandoSalud ? ' buscando' : ''}`} onClick={alContarSueno} disabled={buscandoSalud}>
          <IconoSueno />
          <span className="widget-linea">{buscandoSalud ? t('Mirando el reloj…') : t('¿Cómo dormiste?')}</span>
          <span className="widget-sub">{buscandoSalud ? t('Health Connect') : t('Tocá para contarlo')}</span>
        </button>
      );
    }
    return null;
  };
  const celdas = widgetsVisibles(ajustes).map((l) => ({ l, c: contenido(l) })).filter((x) => x.c);
  if (!celdas.length) return null;
  // Mientras se arrastra, cada una se ve en su lugar nuevo sin mover el DOM (ver OrganizarWidgets).
  const ordenVista = organizar.vista ? widgetsVisibles(organizar.vista) : null;
  const lista = opciones ? mostrados() : [];
  return (
    <div ref={setGrilla} className={`widgets-auto${ordenVista ? ' arrastrando' : ''}`}>
      {celdas.map(({ l, c }) => (
        <div key={l} className={`widget-celda${organizar.agarrado === l ? ' agarrado' : ''}`} style={ordenVista ? { order: ordenVista.indexOf(l) } : undefined} {...organizar.celda(l)}>
          {c}
        </div>
      ))}
      <span className="solo-lectores" role="status">{anuncio}</span>
      {opciones ? (
        <OpcionesWidget
          nombre={t(NOMBRE_WIDGET[opciones])}
          lugar={lista.indexOf(opciones) + 1}
          total={lista.length}
          alMover={(delta) => mover(opciones, delta)}
          alOcultar={() => {
            const nombre = t(NOMBRE_WIDGET[opciones]);
            setOpciones(null);
            guardarAjustes(ponerWidgetVisible(ajustes, opciones, false));
            alAvisar?.(t('{nombre} oculto. Lo volvés a activar en Más → Widgets del Día.', { nombre }));
          }}
          alElegir={() => {
            setOpciones(null);
            irAMas('widgets');
          }}
          alCerrar={() => setOpciones(null)}
        />
      ) : null}
      {/* El detalle, en una hoja: el ícono grande, el resumen y cada dato. */}
      {abierto
        ? (() => {
            const w = widgets.find((x) => x?.lugar === abierto);
            if (!w) return null;
            return createPortal(
              <>
                <div className="velo" onClick={() => setAbierto(null)} />
                <div className="hoja hoja-widget" role="dialog" aria-label={w.nombre}>
                  <div className="hoja-cabeza">
                    <h3>{w.nombre}</h3>
                    <button className="btn-icono" onClick={() => setAbierto(null)} aria-label={t('Cerrar')}>✕</button>
                  </div>
                  <div className="widget-grande">
                    {w.icono}
                    <span className="widget-linea">{w.linea}</span>
                    {w.sub ? <span className="widget-sub">{w.sub}</span> : null}
                  </div>
                  {/* Cada hoja, su mapa: los viajes no se mezclan con lo caminado. Sin pasos no hay hoja de Movimiento: lo caminado va acá, aparte. */}
                  {w.lugar === 'ubicacion' ? <RecorridoDelDia persona={persona} fecha={fecha} tipo="vehiculo" titulo={t('En vehículo')} /> : null}
                  {w.lugar === 'ubicacion' && !widgets.some((x) => x?.lugar === 'pasos') ? <RecorridoDelDia persona={persona} fecha={fecha} tipo="a_pie" titulo={t('A pie')} /> : null}
                  {w.lugar === 'pasos' ? <RecorridoDelDia persona={persona} fecha={fecha} tipo="a_pie" /> : null}
                  {w.lugar === 'pasos' ? <CaminatasDelDia persona={persona} fecha={fecha} /> : null}
                  {w.lugar === 'sueno' ? (
                    <>
                      <ResumenNoche persona={persona} fecha={fecha} />
                      <GraficoSueno persona={persona} fecha={fecha} />
                    </>
                  ) : null}
                  {w.lugar === 'clima' ? <ClimaDelDia persona={persona} fecha={fecha} todos={automaticos} /> : null}
                  {w.lugar === 'telefono' ? <AvisosDelTelefono persona={persona} fecha={fecha} /> : null}
                  {w.lugar === 'comida' ? <ComidaDelDiaHoja datos={comida} /> : null}
                  {w.lugar === 'escuchas' ? <EscuchasDelDia persona={persona} fecha={fecha} vuelta={0} /> : null}
                  {w.grupos.length && w.lugar !== 'clima' ? <DetalleAuto lineas={w.grupos.flatMap((g) => g.lineas)} categorias={categorias} /> : null}
                </div>
              </>,
              document.body,
            );
          })()
        : null}
    </div>
  );
}

/**
 * Cada dato del widget, con su ícono: el uso de cada app con el ícono de verdad de la app (en la app de Android; si no,
 * el de Patty), las notificaciones con la campana y lo demás con el de su categoría.
 */
function DetalleAuto({ lineas, categorias }: { lineas: LineaAutomatica[]; categorias: Categoria[] }) {
  const iconos = useIconosApps(lineas.map((l) => appDelUso(l.concepto)).filter((n): n is string => !!n).map((nombre) => ({ nombre })));
  return (
    <ul className="detalle-auto">
      {lineas.map((x) => {
        const cat = categorias.find((c) => c.id === x.categoria_id);
        const app = appDelUso(x.concepto);
        const icono = app ? iconos[app] : undefined;
        return (
          <li key={`${x.concepto}-${x.valor}`}>
            <span className="icono">
              {icono ? <img className="icono-app" src={icono} alt="" /> : x.concepto === 'Notificaciones' ? <IconoCampana /> : <IconoCategoria clave={cat?.clave} emoji={cat?.icono} />}
            </span>
            <span className="que">{app ? t('Uso de {app}', { app }) : t(x.concepto)}</span>
            <span className="valor-chip">{x.valor}</span>
          </li>
        );
      })}
    </ul>
  );
}
