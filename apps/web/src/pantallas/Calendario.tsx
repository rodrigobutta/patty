// "Calendario" (en Patrones): un mes con cada día pintado según una capa (horas de sueño, ánimo, dolores, ejercicio,
// comida chatarra, clima, temperatura, pasos, pantalla). Más fuerte es más; verde cuando más es mejor (sueño, pasos),
// rojizo cuando es peor (dolores, chatarra). Tocar un día muestra el detalle.
import { useEffect, useMemo, useState } from 'react';
import { CAPAS_CALENDARIO, type CalendarioCapa, type CapaCalendario, type Persona } from 'shared';
import { api } from '../api';
import { hoyEn } from '../lib/fechas';

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const diaSemana = (fecha: string) => (new Date(fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;
const sumarMes = (anioMes: string, n: number) => {
  const d = new Date(anioMes + '-15T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const finDeMes = (anioMes: string) => `${anioMes}-${String(new Date(Date.UTC(Number(anioMes.slice(0, 4)), Number(anioMes.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
const nombreMes = (anioMes: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(anioMes + '-15T12:00:00Z')).replace(/^./, (x) => x.toUpperCase());
const corto = (v: number, unidad: string | null) =>
  unidad === '°C' ? `${Math.round(v)}°` : unidad === 'pasos' ? (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v))) : unidad === 'min' && v >= 60 ? `${Math.round(v / 6) / 10}h` : unidad === '/10' ? String(Math.round(v)) : String(Math.round(v * 10) / 10);

export function Calendario({ persona }: { persona: Persona }) {
  const hoy = hoyEn(persona.zona_horaria);
  const [capa, setCapa] = useState<CapaCalendario>('sueno');
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [datos, setDatos] = useState<CalendarioCapa | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    setElegido(null);
    const hasta = finDeMes(mes) < hoy ? finDeMes(mes) : hoy;
    api<CalendarioCapa>('GET', `/api/estadisticas/calendario?persona=${persona.id}&capa=${capa}&desde=${mes}-01&hasta=${hasta}`)
      .then(setDatos)
      .catch(() => {});
  }, [persona.id, capa, mes, hoy]);

  const porFecha = useMemo(() => new Map(datos?.dias.map((d) => [d.fecha, d]) ?? []), [datos]);
  const [min, max] = useMemo(() => {
    const v = datos?.dias.map((d) => d.valor).filter((x): x is number => x !== null) ?? [];
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
  }, [datos]);
  const fuerza = (v: number | null) => (v === null ? 0.5 : max === min ? 0.75 : 0.3 + ((v - min) / (max - min)) * 0.7);
  const celdas = useMemo(() => {
    const largo = Number(finDeMes(mes).slice(8));
    return [...Array<null>(diaSemana(mes + '-01')).fill(null), ...Array.from({ length: largo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)];
  }, [mes]);
  const d = elegido ? porFecha.get(elegido) : undefined;
  const info = CAPAS_CALENDARIO.find((c) => c.clave === capa)!;

  return (
    <div className="calendario-capas">
      <div className="chips capas">
        {CAPAS_CALENDARIO.map((c) => (
          <button key={c.clave} className={`chip${capa === c.clave ? ' activa' : ''}`} onClick={() => setCapa(c.clave)}>
            <span aria-hidden>{c.icono}</span> {c.nombre}
          </button>
        ))}
      </div>
      <div className={`tarjeta calendario capa-${datos?.mejor ?? 'neutro'}`}>
        <div className="cabeza-mes">
          <button className="btn-icono" onClick={() => setMes(sumarMes(mes, -1))} aria-label="Mes anterior">‹</button>
          <strong>{info.icono} {nombreMes(mes)}</strong>
          <button className="btn-icono" onClick={() => setMes(sumarMes(mes, 1))} disabled={mes >= hoy.slice(0, 7)} aria-label="Mes siguiente">›</button>
        </div>
        <div className="grilla-mes" key={`${capa}${mes}`}>
          {DIAS_SEMANA.map((x, i) => <span key={`c${i}`} className="dia-semana">{x}</span>)}
          {celdas.map((f, i) => {
            if (!f) return <span key={`v${i}`} />;
            const x = porFecha.get(f);
            const futuro = f > hoy;
            return (
              <button
                key={f}
                className={`dia-capa${x ? (datos?.tipo === 'emoji' ? ' con-emoji' : ' con-valor') : ''}${futuro ? ' futuro' : ''}${elegido === f ? ' elegido' : ''}`}
                style={x && datos?.tipo !== 'emoji' ? { ['--fuerza' as string]: fuerza(x.valor), ['--i' as string]: i } : { ['--i' as string]: i }}
                onClick={() => setElegido(x ? f : null)}
                disabled={!x}
              >
                <span className="num-dia">{Number(f.slice(8))}</span>
                {x ? <span className="valor-dia">{datos?.tipo === 'emoji' ? x.emoji : x.valor !== null ? corto(x.valor, datos!.unidad) : '•'}</span> : null}
              </button>
            );
          })}
        </div>
        {d && elegido ? (
          <p className="detalle-dia">
            {new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(elegido + 'T12:00:00Z'))}:{' '}
            <strong>{d.detalle ?? (d.valor !== null ? `${Math.round(d.valor * 10) / 10}${datos?.unidad ? ' ' + datos.unidad : ''}` : '')}</strong>
          </p>
        ) : datos ? (
          <p className="suave centro resumen-capa">{datos.resumen}</p>
        ) : (
          <p className="suave centro">Cargando…</p>
        )}
        {datos?.tipo === 'numero' && datos.dias.length ? (
          <div className="leyenda-capa" aria-hidden>
            <span className="suave chico">{datos.mejor === 'menos' ? 'poco' : 'menos'}</span>
            {[0.3, 0.5, 0.7, 0.9, 1].map((k) => <span key={k} className="muestra" style={{ ['--fuerza' as string]: k }} />)}
            <span className="suave chico">{datos.mejor === 'menos' ? 'mucho' : 'más'}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
