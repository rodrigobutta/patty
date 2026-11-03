// El calendario del ciclo (se abre desde la tarjeta del ciclo en el Día): un mes donde se toca un día para marcar el
// primer día del período (también uno pasado), corregirlo, marcar cuándo terminó o borrarlo. Muestra lo anotado
// (relleno) separado de lo estimado (punteado): próximas menstruaciones, ventana fértil, ovulación y premenstruales.
// Abajo, cuánto duran sus ciclos y sus períodos, si son regulares, y cuándo conviene comentarlo con su médico.
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { diasDelCiclo, type ConsultaCiclo, type DiaCiclo, type Periodo, type ResumenCiclo } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { sumarDias } from '../lib/fechas';
import { locale, t } from '../lib/idioma';

const DIAS_SEMANA = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'narrow' }).format(new Date(Date.UTC(2024, 0, 1 + i, 12))).toUpperCase(),
);
const diaSemana = (fecha: string) => (new Date(fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;
export const sumarMes = (anioMes: string, n: number) => {
  const d = new Date(anioMes + '-15T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
export const finDeMes = (anioMes: string) =>
  `${anioMes}-${String(new Date(Date.UTC(Number(anioMes.slice(0, 4)), Number(anioMes.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
const nombreMes = (anioMes: string) =>
  new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(anioMes + '-15T12:00:00Z')).replace(/^./, (x) => x.toUpperCase());
const largo = (fecha: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(fecha + 'T12:00:00Z'));
export const corta = (fecha: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(fecha + 'T12:00:00Z'));
const entre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Qué se está eligiendo al tocar un día: nada especial, el día en que vino, el nuevo primer día o el último día. */
export type ModoCalendario = { tipo: 'normal' } | { tipo: 'inicio' } | { tipo: 'mover'; inicio: string } | { tipo: 'fin' };

const CONSULTAS: Record<ConsultaCiclo, string> = {
  irregular: 'Tus ciclos varían bastante de un mes a otro.',
  cortos: 'Varios de tus ciclos duraron menos de 21 días.',
  largos: 'Varios de tus ciclos duraron más de 35 días.',
  atraso: 'Ya pasaron {n} días de la fecha estimada.',
  periodo_largo: 'Tus períodos suelen durar 8 días o más.',
};

export function CalendarioCiclo({ personaId, ciclo, modoInicial = { tipo: 'normal' }, alCambiar, cerrar }: {
  personaId: number;
  ciclo: ResumenCiclo;
  modoInicial?: ModoCalendario;
  alCambiar(): void;
  cerrar(): void;
}) {
  const { festejar, avisar, usuario } = useEstado();
  const puede = usuario?.rol !== 'lector';
  const hoy = ciclo.hoy;
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [elegido, setElegido] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoCalendario>(modoInicial);
  /** Al marcar un período viejo: se pregunta cuánto duró antes de guardarlo. */
  const [cuanto, setCuanto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const celdas = useMemo(() => {
    const n = Number(finDeMes(mes).slice(8));
    return [...Array<null>(diaSemana(mes + '-01')).fill(null), ...Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)];
  }, [mes]);
  const porFecha = useMemo(() => new Map(diasDelCiclo(ciclo, `${mes}-01`, finDeMes(mes)).map((d) => [d.fecha, d])), [ciclo, mes]);

  const hacer = async (ruta: string, cuerpo: Record<string, unknown>, mensaje: string) => {
    setOcupado(true);
    try {
      await api('POST', `/api/ciclo/${ruta}`, { persona_id: personaId, ...cuerpo });
      festejar(mensaje);
      setElegido(null);
      setCuanto(null);
      setModo({ tipo: 'normal' });
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const marcarInicio = (fecha: string, dias?: number) => hacer('inicio', { fecha, ...(dias ? { dias } : {}) }, t('¡Anotado! 🩸'));
  const marcarFin = (fecha: string) => hacer('fin', { fecha }, t('Listo, terminó el {fecha}', { fecha: corta(fecha) }));

  /** El período anotado que contiene ese día, y el que podría terminar ese día (empezó hasta 14 días antes). */
  const periodoDe = (f: string) => ciclo.periodos.find((p) => p.inicio <= f && f <= p.fin);
  const puedeTerminar = (f: string): Periodo | undefined => {
    const i = ciclo.periodos.findIndex((p, k) => p.inicio < f && entre(p.inicio, f) <= 14 && !(ciclo.periodos[k + 1] && ciclo.periodos[k + 1].inicio <= f));
    return i >= 0 ? ciclo.periodos[i] : undefined;
  };

  const tocar = (f: string) => {
    if (!puede || f > hoy) {
      setElegido(f);
      return;
    }
    if (modo.tipo === 'mover') {
      void hacer('mover', { inicio: modo.inicio, fecha: f }, t('Listo, empezó el {fecha}', { fecha: corta(f) }));
      return;
    }
    if (modo.tipo === 'fin' && puedeTerminar(f)) {
      void marcarFin(f);
      return;
    }
    setCuanto(null);
    setElegido(f);
  };

  const d = elegido ? porFecha.get(elegido) : undefined;
  const enPeriodo = elegido ? periodoDe(elegido) : undefined;
  const terminable = elegido && !enPeriodo ? puedeTerminar(elegido) : undefined;

  const aviso =
    modo.tipo === 'inicio'
      ? t('Tocá el día en que te vino.')
      : modo.tipo === 'mover'
        ? t('Tocá el día en que empezó en realidad.')
        : modo.tipo === 'fin'
          ? t('Tocá el último día que tuviste.')
          : null;

  return createPortal(
    <>
      <div className="velo" onClick={cerrar} />
      <div className="hoja calendario-ciclo" role="dialog" aria-label={t('Calendario del ciclo')}>
        <div className="hoja-cabeza">
          <h3>{t('🩸 Tu ciclo')}</h3>
          <button className="btn-icono" onClick={cerrar} aria-label={t('Cerrar')}>✕</button>
        </div>

        {aviso ? (
          <p className="aviso-modo-ciclo">
            {aviso}{' '}
            <button className="enlace" onClick={() => setModo({ tipo: 'normal' })}>{t('Cancelar')}</button>
          </p>
        ) : null}

        <div className="cabeza-mes">
          <button className="btn-icono" onClick={() => setMes(sumarMes(mes, -1))} aria-label={t('Mes anterior')}>‹</button>
          <strong>{nombreMes(mes)}</strong>
          <button className="btn-icono" onClick={() => setMes(sumarMes(mes, 1))} disabled={mes >= sumarMes(hoy.slice(0, 7), 6)} aria-label={t('Mes siguiente')}>›</button>
        </div>
        <div className="grilla-mes" key={mes}>
          {DIAS_SEMANA.map((x, i) => <span key={`c${i}`} className="dia-semana">{x}</span>)}
          {celdas.map((f, i) => (f ? <Celda key={f} fecha={f} dia={porFecha.get(f)} hoy={hoy} elegido={elegido === f} tocar={() => tocar(f)} /> : <span key={`v${i}`} />))}
        </div>
        <Leyenda />

        {elegido ? (
          <div className="panel-dia-ciclo">
            <p className="titulo-dia-ciclo">{largo(elegido).replace(/^./, (x) => x.toUpperCase())}</p>
            <p className="suave chico">{queEs(d, elegido, hoy)}</p>
            {puede && elegido <= hoy ? (
              cuanto === elegido ? (
                <>
                  <p className="chico pregunta-ciclo">{t('¿Cuántos días duró?')}</p>
                  <div className="chips envolver">
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <button key={n} className="chip" disabled={ocupado} onClick={() => void marcarInicio(elegido, n)}>{t('{n} días', { n })}</button>
                    ))}
                    <button className="chip" disabled={ocupado} onClick={() => void marcarInicio(elegido)}>{t('No me acuerdo')}</button>
                  </div>
                </>
              ) : enPeriodo ? (
                <div className="acciones-dia-ciclo">
                  {enPeriodo.inicio === elegido ? (
                    <button className="btn" disabled={ocupado} onClick={() => { setModo({ tipo: 'mover', inicio: enPeriodo.inicio }); setElegido(null); }}>{t('Corregir el primer día')}</button>
                  ) : null}
                  {enPeriodo.fin !== elegido || !enPeriodo.terminado ? (
                    <button className="btn" disabled={ocupado} onClick={() => void marcarFin(elegido)}>{t('Terminó este día')}</button>
                  ) : null}
                  <button
                    className="btn peligro"
                    disabled={ocupado}
                    onClick={() => {
                      if (confirm(t('¿Borrar el período que empezó el {fecha}?', { fecha: corta(enPeriodo.inicio) }))) void hacer('borrar', { inicio: enPeriodo.inicio }, t('Borrado'));
                    }}
                  >
                    {t('Borrar este período')}
                  </button>
                </div>
              ) : (
                <div className="acciones-dia-ciclo">
                  <button
                    className="btn primario"
                    disabled={ocupado}
                    onClick={() => (entre(elegido, hoy) <= 2 ? void marcarInicio(elegido) : setCuanto(elegido))}
                  >
                    {t('🩸 Me vino este día')}
                  </button>
                  {terminable ? <button className="btn" disabled={ocupado} onClick={() => void marcarFin(elegido)}>{t('Terminó este día')}</button> : null}
                </div>
              )
            ) : null}
          </div>
        ) : puede ? (
          <p className="suave chico ayuda-ciclo">{t('Tocá un día para marcar cuándo te vino, corregirlo o borrarlo.')}</p>
        ) : null}

        <Estadisticas ciclo={ciclo} />
      </div>
    </>,
    document.body,
  );
}

/** Qué es ese día, dicho para una persona (lo estimado, aclarado). */
function queEs(d: DiaCiclo | undefined, fecha: string, hoy: string): string {
  const partes: string[] = [];
  if (d?.periodo === 'confirmado') partes.push(t('Período anotado'));
  if (d?.periodo === 'estimado') partes.push(d.proxima ? t('Próxima menstruación (estimada)') : t('Período (estimado)'));
  if (d?.ovulacion) partes.push(t('Ovulación (estimada)'));
  else if (d?.fertil) partes.push(t('Días fértiles (estimados)'));
  if (d?.premenstrual && d.periodo !== 'confirmado') partes.push(t('Días premenstruales (estimados)'));
  if (!partes.length) partes.push(fecha > hoy ? t('Nada estimado para este día.') : t('Nada anotado.'));
  return partes.join(' · ');
}

function Celda({ fecha, dia, hoy, elegido, tocar }: { fecha: string; dia: DiaCiclo | undefined; hoy: string; elegido: boolean; tocar(): void }) {
  const clases = [
    'dia-ciclo',
    dia?.periodo === 'confirmado' ? 'confirmado' : dia?.periodo === 'estimado' ? 'estimado' : '',
    dia?.fertil && !dia.periodo ? 'fertil' : '',
    dia?.ovulacion && !dia.periodo ? 'ovulacion' : '',
    dia?.premenstrual && !dia.periodo ? 'premenstrual' : '',
    fecha === hoy ? 'hoy' : '',
    fecha > hoy ? 'futuro' : '',
    elegido ? 'elegido' : '',
  ].filter(Boolean);
  const etiqueta = [largo(fecha), queEs(dia, fecha, hoy)].join(': ');
  return (
    <button className={clases.join(' ')} onClick={tocar} aria-label={etiqueta} aria-pressed={elegido} data-fecha={fecha}>
      <span className="num-dia">{Number(fecha.slice(8))}</span>
      {dia?.ovulacion && !dia.periodo ? <span className="marca-dia" aria-hidden>🥚</span> : dia?.inicio ? <span className="marca-dia" aria-hidden>🩸</span> : null}
    </button>
  );
}

function Leyenda() {
  return (
    <div className="leyenda-ciclo chico">
      <span><i className="muestra confirmado" /> {t('Anotado')}</span>
      <span><i className="muestra estimado" /> {t('Período estimado')}</span>
      <span><i className="muestra fertil" /> {t('Fértil (estimado)')}</span>
      <span>🥚 {t('Ovulación (estimada)')}</span>
      <span><i className="muestra premenstrual" /> {t('Premenstrual (estimado)')}</span>
    </div>
  );
}

/** Cuánto duran sus ciclos y sus períodos, si son regulares, y cuándo comentarlo con su médico (sin alarmar). */
export function Estadisticas({ ciclo }: { ciclo: ResumenCiclo }) {
  if (!ciclo.periodos.length) {
    return <p className="suave chico">{t('Marcá el primer día de tu último período y calculo lo demás. Mientras tanto uso valores típicos: ciclos de 28 días y períodos de 5.')}</p>;
  }
  const historial = ciclo.historial.slice(-6).reverse();
  return (
    <div className="estadisticas-ciclo">
      <p className="chico pregunta-ciclo">{t('Tus ciclos')}</p>
      <ul className="datos-ciclo">
        <li>
          🔁{' '}
          {ciclo.tipico_ciclo
            ? t('Todavía no hay un ciclo completo anotado: uso 28 días, un valor típico.')
            : ciclo.ciclos === 1
              ? t('Tu último ciclo duró {n} días (con uno solo, es aproximado).', { n: ciclo.duracion_ciclo })
              : t('Tus ciclos duran ~{n} días (entre {min} y {max}).', { n: ciclo.duracion_ciclo, min: ciclo.ciclo_min!, max: ciclo.ciclo_max! })}
        </li>
        <li>
          🩸{' '}
          {ciclo.tipico_periodo
            ? t('Todavía no sé cuánto duran tus períodos: uso 5 días, un valor típico.')
            : t('Tus períodos duran ~{n} días.', { n: ciclo.duracion_periodo })}
        </li>
        <li>
          📏{' '}
          {ciclo.regular === true
            ? t('Son regulares: varían menos de una semana.')
            : ciclo.regular === false
              ? t('Varían bastante de un mes a otro, así que las fechas estimadas son menos precisas.')
              : t('Con más ciclos anotados te digo si son regulares.')}
        </li>
      </ul>
      {historial.length > 1 ? (
        <ul className="historial-ciclo chico">
          {historial.map((h) => (
            <li key={h.inicio}>
              <strong>{corta(h.inicio)}</strong>
              <span className="suave">
                {[h.ciclo !== null ? t('ciclo de {n} días', { n: h.ciclo }) : t('ciclo actual'), h.periodo !== null ? t('período de {n}', { n: h.periodo }) : null].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {ciclo.consultar.length ? (
        <p className="nota-medico chico">
          💬 {ciclo.consultar.map((c) => t(CONSULTAS[c], { n: ciclo.atraso ?? 0 })).join(' ')}{' '}
          {t('Puede pasar y no siempre significa algo, pero si sigue así o te preocupa, podés comentarlo con tu médica o médico.')}
        </p>
      ) : null}
      <p className="suave chico">{t('Es información orientativa, calculada con lo que anotaste: no sirve como método anticonceptivo ni reemplaza una consulta médica.')}</p>
    </div>
  );
}

/**
 * Lo que Patty pregunta cuando se puede confirmar algo: "¿te vino?" al llegar la fecha estimada, o "¿ya terminó?"
 * pasados los días que suele durar. Se contesta con un toque, "todavía no" corre la fecha, y ✕ no pregunta más esta vez.
 */
export function PreguntaDelCiclo({ personaId, ciclo, alCambiar, abrirCalendario }: {
  personaId: number;
  ciclo: ResumenCiclo;
  alCambiar(): void;
  abrirCalendario(modo: ModoCalendario): void;
}) {
  const { festejar, avisar, usuario } = useEstado();
  const [ocupado, setOcupado] = useState(false);
  const p = ciclo.pregunta;
  if (!p || usuario?.rol === 'lector') return null;
  const hoy = ciclo.hoy;
  const hacer = async (ruta: string, cuerpo: Record<string, unknown>, mensaje: string) => {
    setOcupado(true);
    try {
      await api('POST', `/api/ciclo/${ruta}`, { persona_id: personaId, ...cuerpo });
      festejar(mensaje);
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const ayer = sumarDias(hoy, -1);
  return (
    <div className="pregunta-del-ciclo" role="group" aria-label={t('Pregunta del ciclo')}>
      <div className="fila-pregunta-ciclo">
        <p className="chico pregunta-ciclo">
          {p.tipo === 'inicio'
            ? p.estimada >= hoy
              ? t('¿Te vino? Hoy era la fecha estimada.')
              : t('¿Te vino? La esperaba alrededor del {fecha}.', { fecha: corta(p.estimada) })
            : t('¿Ya terminó tu período?')}
        </p>
        <button
          className="btn-icono chico"
          disabled={ocupado}
          aria-label={t('No preguntar por ahora')}
          onClick={() => void hacer('respuesta', { tipo: p.tipo === 'inicio' ? 'descartar_inicio' : 'descartar_fin' }, t('No te pregunto más por ahora'))}
        >
          ✕
        </button>
      </div>
      <div className="chips envolver">
        {p.tipo === 'inicio' ? (
          <>
            <button className="chip" disabled={ocupado} onClick={() => void hacer('inicio', { fecha: hoy }, t('¡Anotado! 🩸'))}>{t('Sí, hoy')}</button>
            <button className="chip" disabled={ocupado} onClick={() => void hacer('respuesta', { tipo: 'todavia_no' }, t('Dale, te pregunto en unos días'))}>{t('Todavía no')}</button>
            <button className="chip" disabled={ocupado} onClick={() => abrirCalendario({ tipo: 'inicio' })}>{t('Vino otro día')}</button>
          </>
        ) : (
          <>
            {p.ultimo < hoy ? (
              <button className="chip" disabled={ocupado} onClick={() => void hacer('fin', { fecha: p.ultimo }, t('Listo, terminó el {fecha}', { fecha: corta(p.ultimo) }))}>
                {p.ultimo === ayer ? t('Sí, ayer') : t('Sí, el {fecha}', { fecha: corta(p.ultimo) })}
              </button>
            ) : null}
            <button className="chip" disabled={ocupado} onClick={() => void hacer('fin', { fecha: hoy }, t('Listo, terminó hoy'))}>{t('Sí, hoy')}</button>
            <button className="chip" disabled={ocupado} onClick={() => void hacer('respuesta', { tipo: 'sigue' }, t('Dale, te pregunto en unos días'))}>{t('Todavía sigue')}</button>
            <button className="chip" disabled={ocupado} onClick={() => abrirCalendario({ tipo: 'fin' })}>{t('Otro día')}</button>
          </>
        )}
      </div>
    </div>
  );
}
