// Lo que llegó solo en el Día, en widgets chicos: un ícono dibujado (el del clima cambia según el día) y un resumen
// cortito, sin títulos. Cuatro lugares fijos: clima, ubicación, teléfono, sueño y salud. Los que no tienen datos porque
// falta el permiso van grises (ver FuenteApagada); tocando uno con datos se ve el detalle a lo ancho.
import { Fragment, useState, type ReactNode } from 'react';
import { IconoCategoria } from '../ui/IconosPatty';
import { createPortal } from 'react-dom';
import type { Categoria, DatoAutomatico, Persona, Registro } from 'shared';
import { AvisosDelTelefono } from './AvisosDelDia';
import { ClimaDelDia } from './ClimaDelDia';
import { GraficoSueno, ResumenNoche } from './GraficoSueno';
import { CaminatasDelDia, RecorridoDelDia } from './RecorridoDelDia';
import { agruparAutomaticos, duracion, reloj, type GrupoAutomatico } from '../lib/automatico';
import { locale, t } from '../lib/idioma';
import { IconoCelular, IconoReuniones, IconoCielo, IconoLugar, IconoPasos, IconoSueno, type Cielo } from '../ui/IconosWidget';
import { WidgetApagado, type Fuente } from './FuenteApagada';

type Lugar = 'clima' | 'ubicacion' | 'pasos' | 'telefono' | 'reuniones' | 'sueno';

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
  if (!todos.some((d) => d.tipo_fuente === 'clima')) return null;
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
  const km = dato(todos, 'ubicacion', 'Km recorridos');
  const pasos = dato(todos, 'reloj', 'Pasos');
  if (!viajes && !km) return null;
  const n = Math.round(viajes?.suma ?? 0);
  if (n === 0 && pasos) return null;
  return {
    lugar: 'ubicacion',
    icono: <IconoLugar />,
    linea: n === 0 ? t('Sin viajes') : n === 1 ? t('1 viaje') : t('{n} viajes', { n }),
    sub: km && km.suma >= 0.1 ? `${Number(km.suma.toFixed(1)).toLocaleString(locale())} km` : undefined,
    grupos: grupos.filter((g) => g.tipo === 'ubicacion'),
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
    grupos: grupos.filter((g) => g.tipo === 'reloj').map((g) => ({ ...g, lineas: g.lineas.filter((l) => !SUENO.has(l.concepto) && !l.concepto.startsWith('Pulso')) })),
    nombre: t('Movimiento'),
  };
}

/** Lo del calendario (llega con lo del teléfono): va en su propio widget. */
const REUNIONES = new Set(['Reuniones', 'Horas de reuniones', 'Reuniones seguidas', 'Reuniones fuera de horario', 'Primera reunión', 'Última reunión']);

function widgetReuniones(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const n = dato(todos, 'telefono', 'Reuniones');
  if (!n) return null;
  const horas = dato(todos, 'telefono', 'Horas de reuniones');
  const cuantas = Math.round(n.suma ?? 0);
  return {
    lugar: 'reuniones',
    icono: <IconoReuniones />,
    linea: cuantas === 0 ? t('Sin reuniones') : cuantas === 1 ? t('1 reunión') : t('{n} reuniones', { n: cuantas }),
    sub: horas && cuantas ? duracion((horas.suma ?? 0) * 60) : undefined,
    grupos: grupos.filter((g) => g.tipo === 'telefono').map((g) => ({ ...g, lineas: g.lineas.filter((l) => REUNIONES.has(l.concepto)) })),
    nombre: t('Reuniones'),
  };
}

/** Lo de las notificaciones (ver AvisosDelTelefono): va en su propia parte del detalle, no en la lista. */
const AVISOS = new Set(['Notificaciones', 'Notificaciones de noche', 'Mensajes recibidos']);

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
    grupos: grupos.filter((g) => g.tipo === 'telefono').map((g) => ({ ...g, lineas: g.lineas.filter((l) => !REUNIONES.has(l.concepto) && !AVISOS.has(l.concepto)) })),
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

/** El lugar de cada permiso que falta (el de la ubicación también trae el clima). */
const LUGAR_DE: Record<Fuente, Lugar> = { ubicacion: 'ubicacion', telefono: 'telefono', salud: 'sueno' };

export function WidgetsDelDia({ automaticos, registros, categorias, apagadas, alActivar, alContarSueno, buscandoSalud = false, antes, persona, fecha }: {
  automaticos: DatoAutomatico[];
  registros: Registro[];
  categorias: Categoria[];
  apagadas: Fuente[];
  alActivar(f: Fuente): void;
  /** Si se puede anotar: sin datos de sueño, el widget invita a contar cómo durmió. */
  alContarSueno?: () => void;
  /** Mientras se le pide al reloj (Health Connect / Salud) lo de hoy. */
  buscandoSalud?: boolean;
  /** Widgets que van primero (los remedios del día). */
  antes?: ReactNode;
  /** Para el gráfico de la noche (en la hoja del sueño). */
  persona: Persona;
  fecha: string;
}) {
  const [abierto, setAbierto] = useState<Lugar | null>(null);
  const grupos = agruparAutomaticos(automaticos);
  const widgets = [
    widgetClima(automaticos, grupos),
    widgetUbicacion(automaticos, grupos),
    widgetPasos(automaticos, grupos),
    widgetTelefono(automaticos, grupos),
    widgetReuniones(automaticos, grupos),
    widgetSueno(automaticos, grupos, registros),
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
  });
  const orden: Lugar[] = ['clima', 'ubicacion', 'pasos', 'telefono', 'reuniones', 'sueno'];
  const celdas = orden.map((l) => ({ l, w: widgets.find((w) => w?.lugar === l) ?? null, apagada: apagadas.find((f) => LUGAR_DE[f] === l) }));
  if (!antes && !celdas.some((c) => c.w || c.apagada)) return null;
  return (
    <div className="widgets-auto">
      {antes}
      {celdas.map(({ l, w, apagada }) =>
        w ? (
          <Fragment key={l}>
            <button className="widget-auto" onClick={() => setAbierto(l)} aria-haspopup="dialog" aria-label={`${w.nombre}: ${w.linea}${w.sub ? `, ${w.sub}` : ''}`}>
              {w.icono}
              <span className="widget-linea">{w.linea}</span>
              {w.sub ? <span className="widget-sub">{w.sub}</span> : null}
            </button>
          </Fragment>
        ) : apagada ? (
          <WidgetApagado key={l} fuente={apagada} alTocar={() => alActivar(apagada)} />
        ) : l === 'sueno' && alContarSueno ? (
          // Sin reloj ni nada anotado: el lugar del sueño queda, para contar cómo dormiste.
          <button key={l} className={`widget-auto sin-datos${buscandoSalud ? ' buscando' : ''}`} onClick={alContarSueno} disabled={buscandoSalud}>
            <IconoSueno />
            <span className="widget-linea">{buscandoSalud ? t('Mirando el reloj…') : t('¿Cómo dormiste?')}</span>
            <span className="widget-sub">{buscandoSalud ? t('Health Connect') : t('Tocá para contarlo')}</span>
          </button>
        ) : null,
      )}
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
                  {w.lugar === 'ubicacion' || w.lugar === 'pasos' ? <RecorridoDelDia persona={persona} fecha={fecha} /> : null}
                  {w.lugar === 'pasos' ? <CaminatasDelDia persona={persona} fecha={fecha} /> : null}
                  {w.lugar === 'sueno' ? (
                    <>
                      <ResumenNoche persona={persona} fecha={fecha} />
                      <GraficoSueno persona={persona} fecha={fecha} />
                    </>
                  ) : null}
                  {w.lugar === 'clima' ? <ClimaDelDia persona={persona} fecha={fecha} todos={automaticos} /> : null}
                  {w.lugar === 'telefono' ? <AvisosDelTelefono persona={persona} fecha={fecha} /> : null}
                  {w.grupos.length && w.lugar !== 'clima' ? (
                    <ul className="detalle-auto">
                      {w.grupos.flatMap((g) => g.lineas).map((x) => (
                        <li key={`${x.concepto}-${x.valor}`}>
                          <span className="icono"><IconoCategoria clave={categorias.find((c) => c.id === x.categoria_id)?.clave} emoji={categorias.find((c) => c.id === x.categoria_id)?.icono} /></span>
                          <span className="que">{t(x.concepto)}</span>
                          <span className="valor-chip">{x.valor}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>,
              document.body,
            );
          })()
        : null}
    </div>
  );
}
