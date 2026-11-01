// "Cómo venís", abajo de los widgets del Día: la semana o el mes de un vistazo. El gráfico principal sigue la idea del
// mapa "Qué llegó cada día" de Persona 360 en la administración (una tira por cosa, un cuadradito por día, más fuerte
// cuanto más hay: parece un ADN) y le suma arriba las primeras cosas como hebras que se cruzan, sobre los mismos días.
// Abajo, un gráfico chico por cosa. Tocar un día muestra sus valores reales, con el paso para ir a ese día.
import { useEffect, useState } from 'react';
import type { Persona, TendenciaDia, Tendencias } from 'shared';
import { api } from '../api';
import { irAlDia } from '../lib/avisos';
import { guardado } from '../lib/guardado';
import { locale, t } from '../lib/idioma';
import { placaDeTendencias } from '../lib/placas';
import { BotonCompartir } from '../ui/HojaCompartir';
import { hebra, METRICAS, metricasConDatos, normalizar, resumenDe, textoDelDia, textoValor, valoresDe, type Metrica } from '../lib/tendencias';

/** Cuántas hebras se cruzan arriba: con más ya no se sigue ninguna (en las tiras entran todas). */
const MAX_HEBRAS = 4;
const color = (m: Metrica) => `var(--tend-${m.clave})`;
const fechaLarga = (fecha: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(fecha + 'T12:00:00Z'));
const letraDia = (fecha: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'narrow' }).format(new Date(fecha + 'T12:00:00Z'));
const numeroDia = (fecha: string) => String(Number(fecha.slice(8)));

export function TendenciasDelDia({ persona, vuelta, puedeCompartir = false }: { persona: Persona; vuelta: number; puedeCompartir?: boolean }) {
  const [periodo, setPeriodo] = useState<7 | 30>(7);
  const ruta = `/api/estadisticas/tendencias?persona=${persona.id}&dias=${periodo}`;
  // Lo guardado se ve enseguida; lo nuevo lo reemplaza cuando contesta el servidor.
  const [datos, setDatos] = useState<Tendencias | null>(() => guardado<Tendencias>(ruta) ?? null);
  const [fallo, setFallo] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setDatos(guardado<Tendencias>(ruta) ?? null);
    setFallo(false);
    api<Tendencias>('GET', ruta)
      .then((d) => {
        if (vigente) setDatos(d);
      })
      .catch(() => {
        if (vigente) setFallo(true);
      });
    return () => {
      vigente = false;
    };
  }, [ruta, vuelta]);

  const dias = datos?.dias ?? [];
  const metricas = metricasConDatos(dias);
  const dia = dias.find((d) => d.fecha === elegida) ?? null;
  const placa = puedeCompartir ? placaDeTendencias(dias, periodo) : null;
  const verDia = (fecha: string) => {
    irAlDia(fecha);
    window.scrollTo({ top: 0 });
  };

  return (
    <section className="tarjeta tendencias" aria-label={t('Cómo venís')}>
      <div className="tendencias-cabeza">
        <h3>{t('Cómo venís')}</h3>
        <div className="segmentos" role="group" aria-label={t('Período de los gráficos')}>
          <button className={periodo === 7 ? 'activa' : ''} aria-pressed={periodo === 7} onClick={() => setPeriodo(7)}>{t('Semana')}</button>
          <button className={periodo === 30 ? 'activa' : ''} aria-pressed={periodo === 30} onClick={() => setPeriodo(30)}>{t('Mes')}</button>
        </div>
      </div>
      {!datos ? (
        <p className="suave chico">{fallo ? t('No pude traer los gráficos. Probá de nuevo en un rato.') : t('Cargando')}</p>
      ) : !metricas.length ? (
        <p className="suave chico">
          {periodo === 7
            ? t('Todavía hay pocos datos de esta semana para dibujar. Contá cómo te sentís o conectá el reloj y acá vas a ver cómo venís.')
            : t('Todavía hay pocos datos de este mes para dibujar. Contá cómo te sentís o conectá el reloj y acá vas a ver cómo venís.')}
        </p>
      ) : (
        <>
          <GraficoPrincipal dias={dias} metricas={metricas} elegida={elegida} alElegir={setElegida} />
          {dia ? (
            <DetalleDia dia={dia} metricas={metricas} alVer={() => verDia(dia.fecha)} />
          ) : (
            <p className="suave chico">{t('Cada fila es una cosa y cada columna, un día: más fuerte, más alto en este período. Arriba, las primeras cuatro superpuestas, cada una en su propia escala. Tocá un día para ver sus valores.')}</p>
          )}
          <div className="tend-chicos">
            {metricas.map((m) => (
              <GraficoChico key={m.clave} metrica={m} dias={dias} elegida={elegida} alElegir={setElegida} />
            ))}
          </div>
          {placa ? <div className="fila-compartir centrada"><BotonCompartir armar={() => placa} /></div> : null}
        </>
      )}
    </section>
  );
}

const ANCHO = 340;
const IZQ = 80;
const ALTO_HEBRAS = 92;
const FILA = 16;
const MARGEN = 7;

function GraficoPrincipal({ dias, metricas, elegida, alElegir }: { dias: TendenciaDia[]; metricas: Metrica[]; elegida: string | null; alElegir(f: string): void }) {
  const col = (ANCHO - IZQ) / dias.length;
  const x = (i: number) => IZQ + col * (i + 0.5);
  const yHebra = (n: number) => MARGEN + (1 - n) * (ALTO_HEBRAS - 2 * MARGEN);
  const inicioFilas = ALTO_HEBRAS + 4;
  const finFilas = inicioFilas + FILA * metricas.length;
  const alto = finFilas + 16;
  const niveles = new Map(metricas.map((m) => [m.clave, normalizar(valoresDe(dias, m.clave), m.dominio)]));
  const hebras = metricas.slice(0, MAX_HEBRAS);
  const iElegida = dias.findIndex((d) => d.fecha === elegida);
  // En el mes no entra un rótulo por día: uno por semana, contando desde hoy para atrás.
  const conRotulo = (i: number) => dias.length <= 7 || (dias.length - 1 - i) % 7 === 0;
  return (
    <svg className="tend-principal" viewBox={`0 0 ${ANCHO} ${alto}`} role="group" aria-label={t('Varias cosas a la vez, día por día')}>
      {hebras.map((m) => {
        const { caminos, sueltos } = hebra(niveles.get(m.clave)!.map((n, i) => (n === null ? null : { x: x(i), y: yHebra(n) })));
        return (
          <g key={m.clave} data-hebra={m.clave}>
            {caminos.map((d, i) => <path key={i} d={d} className="tend-hebra" style={{ stroke: color(m) }} />)}
            {sueltos.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} className="tend-punto" style={{ fill: color(m) }} />)}
          </g>
        );
      })}
      {metricas.map((m, f) => {
        const y = inicioFilas + FILA * f;
        return (
          <g key={m.clave} data-tira={m.clave}>
            <rect x={0} y={y + 3.5} width={8} height={8} rx={2} style={{ fill: color(m) }} />
            <text x={12} y={y + 11.5} className="fila">{m.nombre}</text>
            {niveles.get(m.clave)!.map((n, i) => (
              <rect
                key={dias[i].fecha}
                x={IZQ + col * i + 1}
                y={y + 1}
                width={col - 2}
                height={FILA - 2}
                rx={2}
                className={n === null ? 'tend-vacia' : undefined}
                style={n === null ? undefined : { fill: color(m), opacity: 0.2 + 0.8 * n }}
              />
            ))}
          </g>
        );
      })}
      {dias.map((d, i) => (conRotulo(i) ? <text key={d.fecha} x={x(i)} y={alto - 3} textAnchor="middle">{dias.length <= 7 ? letraDia(d.fecha) : numeroDia(d.fecha)}</text> : null))}
      {iElegida >= 0 ? (
        <>
          <rect x={IZQ + col * iElegida} y={0} width={col} height={finFilas + 1} rx={3} className="tend-marca" />
          {hebras.map((m) => {
            const n = niveles.get(m.clave)![iElegida];
            return n === null ? null : <circle key={m.clave} cx={x(iElegida)} cy={yHebra(n)} r={4} className="tend-punto" style={{ fill: color(m) }} />;
          })}
        </>
      ) : null}
      {/* Encima de todo, un blanco de toque por día, del alto del gráfico entero. */}
      {dias.map((d, i) => {
        const valores = METRICAS.map((m) => {
          const v = textoDelDia(m.clave, d);
          return v ? `${m.nombre} ${v}` : null;
        }).filter(Boolean);
        return (
          <rect
            key={d.fecha}
            x={IZQ + col * i}
            y={0}
            width={col}
            height={alto}
            className="tend-columna"
            role="button"
            tabIndex={0}
            aria-pressed={d.fecha === elegida}
            aria-label={`${fechaLarga(d.fecha)}: ${valores.length ? valores.join(', ') : t('sin dato')}`}
            onClick={() => alElegir(d.fecha)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                alElegir(d.fecha);
              }
            }}
          />
        );
      })}
    </svg>
  );
}

/** El día tocado, con sus valores reales: lo que se está dibujando y cualquier otra cosa que ese día tenga. */
function DetalleDia({ dia, metricas, alVer }: { dia: TendenciaDia; metricas: Metrica[]; alVer(): void }) {
  const filas = METRICAS.filter((m) => metricas.includes(m) || dia[m.clave] !== null);
  return (
    <div className="tend-dia" aria-live="polite">
      <h4>{fechaLarga(dia.fecha)}</h4>
      <ul>
        {filas.map((m) => {
          const texto = textoDelDia(m.clave, dia);
          return (
            <li key={m.clave}>
              <span className="tend-muestra" style={{ background: color(m) }} />
              <span>{m.nombre}</span>
              {texto ? <b>{texto}</b> : <b className="sin">{t('sin dato')}</b>}
            </li>
          );
        })}
      </ul>
      <button className="btn" onClick={alVer}>{t('Ver este día')}</button>
    </div>
  );
}

const ANCHO_CHICO = 150;
const ALTO_CHICO = 44;

function GraficoChico({ metrica: m, dias, elegida, alElegir }: { metrica: Metrica; dias: TendenciaDia[]; elegida: string | null; alElegir(f: string): void }) {
  const col = ANCHO_CHICO / dias.length;
  const x = (i: number) => col * (i + 0.5);
  const valores = valoresDe(dias, m.clave);
  const dia = dias.find((d) => d.fecha === elegida);
  // Con un día elegido se lee el de ese día; si no, cómo vino el período.
  const delDia = dia ? dia[m.clave] : null;
  const texto = dia ? (delDia === null ? t('sin dato') : m.clave === 'animo' ? textoDelDia(m.clave, dia)! : textoValor(m.clave, delDia)) : resumenDe(m, dias);
  const iElegida = dias.findIndex((d) => d.fecha === elegida);
  let trazo = null;
  if (m.forma === 'barras') {
    // Las barras arrancan de cero, para que el alto diga cuánto de verdad.
    const max = Math.max(...valores.map((v) => v ?? 0));
    trazo = valores.map((v, i) => {
      if (v === null) return null;
      const h = Math.max(2, (v / max) * (ALTO_CHICO - 4));
      return <rect key={dias[i].fecha} x={col * i + Math.min(1, col * 0.15)} y={ALTO_CHICO - h} width={col - 2 * Math.min(1, col * 0.15)} height={h} rx={Math.min(2, col / 3)} style={{ fill: color(m) }} />;
    });
  } else {
    const y = (n: number) => 5 + (1 - n) * (ALTO_CHICO - 10);
    const { caminos, sueltos } = hebra(normalizar(valores, m.dominio).map((n, i) => (n === null ? null : { x: x(i), y: y(n) })));
    trazo = (
      <>
        {caminos.map((d, i) => <path key={i} d={d} className="tend-linea" style={{ stroke: color(m) }} />)}
        {sueltos.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} className="tend-punto" style={{ fill: color(m) }} />)}
      </>
    );
  }
  return (
    <div className="tend-chico" data-chico={m.clave}>
      <span className="nombre"><span className="tend-muestra" style={{ background: color(m) }} />{m.nombre}{!dia && !m.contarDias ? <span className="prom">{t('prom.')}</span> : null}</span>
      <span className="valor" title={texto}>{texto}</span>
      {/* Para el lector de pantalla ya están los días del gráfico principal: estos toques son un atajo con el dedo. */}
      <svg viewBox={`0 0 ${ANCHO_CHICO} ${ALTO_CHICO}`} aria-hidden>
        {iElegida >= 0 ? <rect x={col * iElegida} y={0} width={col} height={ALTO_CHICO} rx={2} className="tend-marca" /> : null}
        {trazo}
        {dias.map((d, i) => <rect key={d.fecha} x={col * i} y={0} width={col} height={ALTO_CHICO} className="tend-columna" onClick={() => alElegir(d.fecha)} />)}
      </svg>
    </div>
  );
}
