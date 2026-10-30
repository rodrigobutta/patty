// El detalle del clima del día (al tocar su widget): los datos en tarjetitas ordenadas (temperatura, sensación,
// humedad, viento, lluvia, sol, UV, presión, aire) y abajo lo que Patty deduce: si hace más calor que en la semana,
// si bajó la presión, si el UV pega fuerte… y los patrones de la persona en los que el clima tiene que ver.
import { useEffect, useState, type ReactNode } from 'react';
import { nombreRasgo, type DatoAutomatico, type Hallazgo, type Persona } from 'shared';
import { api } from '../api';
import { idioma, locale, t } from '../lib/idioma';
import { Mascota } from '../mascota/Mascota';

type Contexto = { maxima_semana: number | null; maxima_ayer: number | null; patrones: Hallazgo[] };

const V = 'var(--acento)';
const trazo = { fill: 'none', stroke: V, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
    {children}
  </svg>
);
const ICONOS: Record<string, ReactNode> = {
  temp: <Svg><path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z" {...trazo} /><path d="M12 10v6" {...trazo} /></Svg>,
  sensacion: <Svg><circle cx="12" cy="8" r="3" {...trazo} /><path d="M6 20c1-4 3-6 6-6s5 2 6 6" {...trazo} /></Svg>,
  humedad: <Svg><path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11Z" {...trazo} /></Svg>,
  viento: <Svg><path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3" {...trazo} /></Svg>,
  lluvia: <Svg><path d="M7 15a4 4 0 0 1 .5-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7Z" {...trazo} /><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" {...trazo} /></Svg>,
  sol: <Svg><circle cx="12" cy="12" r="4" {...trazo} /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" {...trazo} /></Svg>,
  uv: <Svg><path d="M4 18h16" {...trazo} /><path d="M7 18a5 5 0 0 1 10 0" {...trazo} /><path d="M12 6v3M5.5 9.5l2 2M18.5 9.5l-2 2" {...trazo} /></Svg>,
  presion: <Svg><circle cx="12" cy="13" r="8" {...trazo} /><path d="M12 13l4-4" {...trazo} /><path d="M8 17h8" {...trazo} /></Svg>,
  aire: <Svg><path d="M5 19c8 0 14-6 14-14C11 5 5 10 5 19Z" {...trazo} /><path d="M5 19 13 11" {...trazo} /></Svg>,
  luna: <Svg><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" {...trazo} /></Svg>,
  nubes: <Svg><path d="M7 18a4 4 0 0 1 .5-8A5 5 0 0 1 17 11a3.5 3.5 0 0 1 0 7Z" {...trazo} /></Svg>,
};

const num = (n: number, d = 0) => Number(n.toFixed(d)).toLocaleString(locale());

/** El valor de un dato del clima: el resumen del día si está; si no, de las horas (promedio, máximo o mínimo). */
function valor(todos: DatoAutomatico[], resumen: string | null, hora: string | null, como: 'prom' | 'max' | 'min' | 'suma' = 'prom'): number | null {
  const r = resumen ? todos.find((d) => d.tipo_fuente === 'clima' && d.concepto === resumen) : undefined;
  if (r) return r.suma;
  const h = hora ? todos.find((d) => d.tipo_fuente === 'clima' && d.concepto === hora) : undefined;
  if (!h) return null;
  return como === 'max' ? h.maximo : como === 'min' ? h.minimo : como === 'suma' ? h.suma : h.suma / Math.max(1, h.cantidad);
}

export function ClimaDelDia({ persona, fecha, todos }: { persona: Persona; fecha: string; todos: DatoAutomatico[] }) {
  const [ctx, setCtx] = useState<Contexto | null>(null);
  useEffect(() => {
    api<Contexto>('GET', `/api/clima/contexto?persona=${persona.id}&fecha=${fecha}`).then(setCtx).catch(() => setCtx(null));
  }, [persona.id, fecha]);

  const max = valor(todos, 'Temperatura máxima', 'Temperatura', 'max');
  const min = valor(todos, 'Temperatura mínima', 'Temperatura', 'min');
  const sensacion = valor(todos, 'Sensación térmica media', 'Sensación térmica');
  const temp = valor(todos, 'Temperatura media', 'Temperatura');
  const humedad = valor(todos, 'Humedad media', 'Humedad');
  const viento = valor(todos, 'Viento medio', 'Viento');
  const rafaga = valor(todos, 'Ráfaga máxima', 'Ráfagas', 'max');
  const lluvia = valor(todos, 'Lluvia del día', 'Lluvia', 'suma');
  const horasLluvia = valor(todos, 'Horas con lluvia', null);
  const sol = valor(todos, 'Horas de sol', null) ?? ((valor(todos, null, 'Minutos de sol', 'suma') ?? NaN) / 60);
  const nubes = valor(todos, 'Nubosidad de día', 'Nubosidad');
  const uv = valor(todos, 'Índice UV máximo', 'Índice UV', 'max');
  const presion = valor(todos, 'Presión media', 'Presión');
  const cambioPresion = valor(todos, 'Cambio de presión', null);
  const aire = valor(todos, 'Calidad del aire media', 'Calidad del aire');
  const luz = valor(todos, 'Horas de luz', null);
  const luna = valor(todos, 'Luna iluminada', null);
  const amplitud = valor(todos, 'Amplitud térmica', null) ?? (max !== null && min !== null ? max - min : null);

  const tarjetas: Array<{ icono: ReactNode; titulo: string; valor: string; sub?: string }> = [];
  if (max !== null) tarjetas.push({ icono: ICONOS.temp, titulo: t('Temperatura'), valor: min !== null ? `${num(max)}° / ${num(min)}°` : `${num(max)}°`, sub: amplitud !== null ? t('{n}° de diferencia', { n: num(amplitud) }) : undefined });
  if (sensacion !== null) tarjetas.push({ icono: ICONOS.sensacion, titulo: t('Sensación'), valor: `${num(sensacion)}°`, sub: t('en promedio') });
  if (humedad !== null) tarjetas.push({ icono: ICONOS.humedad, titulo: t('Humedad'), valor: `${num(humedad)}%` });
  if (viento !== null) tarjetas.push({ icono: ICONOS.viento, titulo: t('Viento'), valor: `${num(viento)} km/h`, sub: rafaga !== null ? t('ráfagas de {n}', { n: num(rafaga) }) : undefined });
  if (lluvia !== null) tarjetas.push({ icono: ICONOS.lluvia, titulo: t('Lluvia'), valor: lluvia >= 0.1 ? `${num(lluvia, 1)} mm` : t('Nada'), sub: horasLluvia ? t('{n} h con lluvia', { n: num(horasLluvia) }) : undefined });
  if (!Number.isNaN(sol)) tarjetas.push({ icono: ICONOS.sol, titulo: t('Sol'), valor: `${num(sol, 1)} h`, sub: nubes !== null ? t('{n}% nublado', { n: num(nubes) }) : undefined });
  else if (nubes !== null) tarjetas.push({ icono: ICONOS.nubes, titulo: t('Nubes'), valor: `${num(nubes)}%` });
  if (uv !== null) tarjetas.push({ icono: ICONOS.uv, titulo: t('UV máximo'), valor: num(uv), sub: uv >= 8 ? t('muy alto') : uv >= 6 ? t('alto') : uv >= 3 ? t('moderado') : t('bajo') });
  if (presion !== null) tarjetas.push({ icono: ICONOS.presion, titulo: t('Presión'), valor: `${num(presion)} hPa`, sub: cambioPresion !== null && Math.abs(cambioPresion) >= 1 ? (cambioPresion > 0 ? t('subió {n}', { n: num(cambioPresion) }) : t('bajó {n}', { n: num(-cambioPresion) })) : undefined });
  if (aire !== null) tarjetas.push({ icono: ICONOS.aire, titulo: t('Aire'), valor: num(aire), sub: aire <= 50 ? t('bueno') : aire <= 100 ? t('aceptable') : t('cargado') });
  if (luz !== null) tarjetas.push({ icono: ICONOS.sol, titulo: t('Horas de luz'), valor: `${num(luz, 1)} h` });
  if (luna !== null) tarjetas.push({ icono: ICONOS.luna, titulo: t('Luna'), valor: `${num(luna)}%`, sub: luna >= 97 ? t('llena') : luna <= 3 ? t('nueva') : t('iluminada') });

  // Lo que Patty deduce del día: solo lo que se sale de lo común.
  const notas: string[] = [];
  if (max !== null && ctx?.maxima_semana != null && Math.abs(max - ctx.maxima_semana) >= 3)
    notas.push(max > ctx.maxima_semana
      ? t('Hoy hace {n}° más que el promedio de la última semana.', { n: num(max - ctx.maxima_semana) })
      : t('Hoy hace {n}° menos que el promedio de la última semana.', { n: num(ctx.maxima_semana - max) }));
  else if (max !== null && ctx?.maxima_ayer != null && Math.abs(max - ctx.maxima_ayer) >= 4)
    notas.push(max > ctx.maxima_ayer ? t('Bastante más calor que ayer.') : t('Bastante más fresco que ayer.'));
  if (amplitud !== null && amplitud >= 12) notas.push(t('Mucha diferencia entre la mañana y la tarde: conviene salir con algo de abrigo.'));
  if (sensacion !== null && temp !== null && Math.abs(sensacion - temp) >= 3)
    notas.push(sensacion > temp ? t('Se siente más calor del que marca el termómetro.') : t('Se siente más frío del que marca el termómetro.'));
  if (humedad !== null && humedad >= 80 && max !== null && max >= 25) notas.push(t('Día pesado: húmedo y caluroso. Tomá agua.'));
  if (cambioPresion !== null && cambioPresion <= -4) notas.push(t('Bajó la presión: a mucha gente le trae dolor de cabeza o cansancio.'));
  if (uv !== null && uv >= 8) notas.push(t('El sol pega fuerte al mediodía: protector y sombra.'));
  if (aire !== null && aire > 100) notas.push(t('El aire está cargado: si podés, evitá el ejercicio fuerte afuera.'));
  if (rafaga !== null && rafaga >= 50) notas.push(t('Ráfagas fuertes de viento.'));

  const cuando = (d: number) => (d === 0 ? t('el mismo día') : d === 1 ? t('al día siguiente') : t('{n} días después', { n: d }));
  return (
    <div className="clima-del-dia">
      <div className="clima-tarjetas">
        {tarjetas.map((x) => (
          <div key={x.titulo} className="clima-tarjeta">
            {x.icono}
            <span className="titulo">{x.titulo}</span>
            <strong>{x.valor}</strong>
            {x.sub ? <span className="sub">{x.sub}</span> : null}
          </div>
        ))}
      </div>
      {notas.length ? (
        <div className="clima-notas">
          <h4><Mascota cara="feliz" tamano={26} /> {t('Lo que noto del día')}</h4>
          <ul>
            {notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {ctx?.patrones.length ? (
        <div className="clima-notas">
          <h4>{t('Lo que el clima te hace a vos')}</h4>
          <ul>
            {ctx.patrones.map((h) => (
              <li key={h.id}>
                <strong>
                  {[{ nombre: h.causa, tipo: h.causa_tipo, modo: h.causa_modo }, ...(h.causas_extra ?? [])].map((c) => nombreRasgo(c.nombre, c.tipo, c.modo, idioma())).join(' + ')}
                  {' → '}
                  {nombreRasgo(h.efecto, h.efecto_tipo, h.efecto_modo, idioma())}
                </strong>{' '}
                <span className="suave chico">{cuando(h.desfase_dias)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
