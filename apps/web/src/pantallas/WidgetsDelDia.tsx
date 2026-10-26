// Lo que llegó solo en el Día, en widgets chicos: un ícono dibujado (el del clima cambia según el día) y un resumen
// cortito, sin títulos. Cuatro lugares fijos: clima, ubicación, teléfono, sueño y salud. Los que no tienen datos porque
// falta el permiso van grises (ver FuenteApagada); tocando uno con datos se ve el detalle a lo ancho.
import { Fragment, useState, type ReactNode } from 'react';
import type { Categoria, DatoAutomatico, Registro } from 'shared';
import { agruparAutomaticos, duracion, reloj, type GrupoAutomatico } from '../lib/automatico';
import { locale, t } from '../lib/idioma';
import { IconoCelular, IconoCielo, IconoLugar, IconoSueno, type Cielo } from '../ui/IconosWidget';
import { WidgetApagado, type Fuente } from './FuenteApagada';

type Lugar = 'clima' | 'ubicacion' | 'telefono' | 'sueno';

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

function widgetUbicacion(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const viajes = dato(todos, 'ubicacion', 'Viajes');
  const km = dato(todos, 'ubicacion', 'Km recorridos');
  if (!viajes && !km) return null;
  const n = Math.round(viajes?.suma ?? 0);
  return {
    lugar: 'ubicacion',
    icono: <IconoLugar />,
    linea: n === 0 ? t('Sin viajes') : n === 1 ? t('1 viaje') : t('{n} viajes', { n }),
    sub: km && km.suma >= 0.1 ? `${Number(km.suma.toFixed(1)).toLocaleString(locale())} km` : undefined,
    grupos: grupos.filter((g) => g.tipo === 'ubicacion'),
    nombre: t('Ubicación'),
  };
}

function widgetTelefono(todos: DatoAutomatico[], grupos: GrupoAutomatico[]): Widget | null {
  const pantalla = dato(todos, 'telefono', 'Tiempo de pantalla');
  const llamadas = dato(todos, 'telefono', 'Llamadas');
  if (!pantalla && !llamadas) return null;
  const n = Math.round(llamadas?.suma ?? 0);
  return {
    lugar: 'telefono',
    icono: <IconoCelular />,
    linea: pantalla ? duracion(pantalla.suma) : '—',
    sub: llamadas ? (n === 1 ? t('1 llamada') : t('{n} llamadas', { n })) : undefined,
    grupos: grupos.filter((g) => g.tipo === 'telefono'),
    nombre: t('Uso del teléfono'),
  };
}

function widgetSueno(todos: DatoAutomatico[], grupos: GrupoAutomatico[], registros: Registro[]): Widget | null {
  const horas = dato(todos, 'reloj', 'Horas de sueño');
  const pasos = dato(todos, 'reloj', 'Pasos');
  const pulso = dato(todos, 'reloj', 'Pulso en reposo');
  // Sin reloj, lo que se anotó a mano: a qué hora se levantó.
  const levanto = registros.find((r) => r.concepto === 'Me levanté' && r.valor !== null);
  if (!horas && !pasos && !pulso && !levanto) return null;
  const linea = horas ? duracion(horas.suma * 60) : pasos ? t('{n} pasos', { n: entero(pasos.suma) }) : levanto ? t('Arriba {hora}', { hora: reloj(levanto.valor!) }) : '—';
  const sub = horas && pasos ? t('{n} pasos', { n: entero(pasos.suma) }) : pulso ? t('{n} lpm en reposo', { n: entero(pulso.suma) }) : undefined;
  return { lugar: 'sueno', icono: <IconoSueno />, linea, sub, grupos: grupos.filter((g) => g.tipo === 'reloj'), nombre: t('Sueño y salud') };
}

/** El lugar de cada permiso que falta (el de la ubicación también trae el clima). */
const LUGAR_DE: Record<Fuente, Lugar> = { ubicacion: 'ubicacion', telefono: 'telefono', salud: 'sueno' };

export function WidgetsDelDia({ automaticos, registros, categorias, apagadas, alActivar, alContarSueno }: {
  automaticos: DatoAutomatico[];
  registros: Registro[];
  categorias: Categoria[];
  apagadas: Fuente[];
  alActivar(f: Fuente): void;
  /** Si se puede anotar: sin datos de sueño, el widget invita a contar cómo durmió. */
  alContarSueno?: () => void;
}) {
  const [abierto, setAbierto] = useState<Lugar | null>(null);
  const grupos = agruparAutomaticos(automaticos);
  const widgets = [
    widgetClima(automaticos, grupos),
    widgetUbicacion(automaticos, grupos),
    widgetTelefono(automaticos, grupos),
    widgetSueno(automaticos, grupos, registros),
  ];
  const orden: Lugar[] = ['clima', 'ubicacion', 'telefono', 'sueno'];
  const celdas = orden.map((l) => ({ l, w: widgets.find((w) => w?.lugar === l) ?? null, apagada: apagadas.find((f) => LUGAR_DE[f] === l) }));
  if (!celdas.some((c) => c.w || c.apagada)) return null;
  return (
    <div className="widgets-auto">
      {celdas.map(({ l, w, apagada }) =>
        w ? (
          <Fragment key={l}>
            <button className={`widget-auto${abierto === l ? ' abierto' : ''}`} onClick={() => setAbierto(abierto === l ? null : l)} aria-expanded={abierto === l} aria-label={`${w.nombre}: ${w.linea}${w.sub ? `, ${w.sub}` : ''}`}>
              {w.icono}
              <span className="widget-linea">{w.linea}</span>
              {w.sub ? <span className="widget-sub">{w.sub}</span> : null}
            </button>
            {abierto === l && w.grupos.length ? (
              <ul className="detalle-auto widget-detalle">
                {w.grupos.flatMap((g) => g.lineas).map((x) => (
                  <li key={x.concepto}>
                    <span className="icono">{categorias.find((c) => c.id === x.categoria_id)?.icono}</span>
                    <span className="que">{t(x.concepto)}</span>
                    <span className="valor-chip">{x.valor}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Fragment>
        ) : apagada ? (
          <WidgetApagado key={l} fuente={apagada} alTocar={() => alActivar(apagada)} />
        ) : l === 'sueno' && alContarSueno ? (
          // Sin reloj ni nada anotado: el lugar del sueño queda, para contar cómo dormiste.
          <button key={l} className="widget-auto sin-datos" onClick={alContarSueno}>
            <IconoSueno />
            <span className="widget-linea">{t('¿Cómo dormiste?')}</span>
            <span className="widget-sub">{t('Tocá para contarlo')}</span>
          </button>
        ) : null,
      )}
    </div>
  );
}
