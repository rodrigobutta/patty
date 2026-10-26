// En el Día: las tomas de remedios de ese día, para marcar "La tomé" o "No la tomo". Las que ya pasaron sin marcar se
// ven atrasadas (todavía se pueden tomar) y, después de unas horas, olvidadas. Los remedios "cuando haga falta" tienen
// su botón para anotarlos con un toque.
import { useCallback, useEffect, useState } from 'react';
import { dosisTexto, HORAS_PARA_OLVIDADA, type Persona, type Toma, type Tratamiento } from 'shared';
import { api } from '../api';
import { idioma, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { desmarcarToma, marcarToma, tomasCambiaron, useAlCambiarTomas } from '../lib/remedios';

const CLAVE_ABIERTO = 'remedios-abierto';
/** Lo último traído de cada día (persona|fecha), para que la tarjeta no aparezca de golpe al volver al Día. */
const YA_TRAIDO = new Map<string, { tomas: Toma[]; cuandoHaceFalta: Tratamiento[] }>();

/** Cuánto antes de la hora ya se ofrece marcarla. */
const ANTES_MIN = 60;

type Situacion = 'tomada' | 'salteada' | 'olvidada' | 'atrasada' | 'ahora' | 'despues';

function situacion(tm: Toma, ahora: number): Situacion {
  if (tm.estado) return tm.estado;
  const x = Date.parse(tm.programada);
  if (ahora - x > HORAS_PARA_OLVIDADA * 3600000) return 'olvidada';
  if (ahora - x > 15 * 60000) return 'atrasada';
  return x - ahora <= ANTES_MIN * 60000 ? 'ahora' : 'despues';
}

const LEYENDA: Record<Situacion, string> = {
  tomada: t('tomada'),
  salteada: t('no la tomaste'),
  olvidada: t('sin marcar'),
  atrasada: t('atrasada'),
  ahora: t('ahora'),
  despues: '',
};

export function RemediosDelDia({ persona, fecha, hoy, vuelta, alCambiar }: {
  persona: Persona;
  fecha: string;
  hoy: string;
  /** Cambia cada vez que el Día se vuelve a traer (se anotó o borró algo): las tomas se actualizan con él. */
  vuelta: number;
  alCambiar(): void;
}) {
  const { festejar, avisar, usuario } = useEstado();
  const [tomas, setTomas] = useState<Toma[]>(() => YA_TRAIDO.get(`${persona.id}|${fecha}`)?.tomas ?? []);
  const [cuandoHaceFalta, setCuandoHaceFalta] = useState<Tratamiento[]>(() => YA_TRAIDO.get(`${persona.id}|${fecha}`)?.cuandoHaceFalta ?? []);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Plegado de entrada (lo central de Patty es contar el día): se recuerda si se dejó abierto.
  const [abierto, setAbierto] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_ABIERTO) === 'si';
    } catch {
      return false;
    }
  });
  const puede = usuario?.rol !== 'lector';

  const traer = useCallback(async () => {
    try {
      const [tm, l] = await Promise.all([
        api<Toma[]>('GET', `/api/tratamientos/tomas?persona=${persona.id}&fecha=${fecha}`),
        fecha === hoy ? api<Tratamiento[]>('GET', `/api/tratamientos?persona=${persona.id}`) : Promise.resolve([]),
      ]);
      const chf = l.filter((x) => x.activo && !x.cada_horas && !x.horarios.length);
      YA_TRAIDO.set(`${persona.id}|${fecha}`, { tomas: tm, cuandoHaceFalta: chf });
      setTomas(tm);
      setCuandoHaceFalta(chf);
    } catch {
      /* sin conexión: el Día sigue igual */
    }
  }, [persona.id, fecha, hoy]);
  useEffect(() => {
    setTomas(YA_TRAIDO.get(`${persona.id}|${fecha}`)?.tomas ?? []);
  }, [persona.id, fecha]);
  useEffect(() => {
    void traer();
  }, [traer, vuelta]);
  useAlCambiarTomas(traer);

  if (!tomas.length && !cuandoHaceFalta.length) return null;
  const ahora = Date.now();

  const marcar = async (tm: Toma, estado: 'tomada' | 'salteada') => {
    const clave = tm.tratamiento_id + tm.programada;
    setOcupado(clave);
    try {
      // Si es de hace rato, se anota a la hora en que tocaba (se acuerda de que la tomó, no la toma ahora).
      const vieja = ahora - Date.parse(tm.programada) > HORAS_PARA_OLVIDADA * 3600000;
      await marcarToma(tm, estado, vieja ? tm.programada : undefined);
      if (estado === 'tomada') festejar(t('¡Bien! {que} tomado 💊', { que: t(tm.remedio) }));
      else festejar(t('¡Ey! Anotado que no la tomaste… La próxima no te la saltees 😤'), 'enojada');
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const desmarcar = async (tm: Toma) => {
    if (!confirm(t('¿Desmarcar la toma de {que} de las {hora}?', { que: t(tm.remedio), hora: horaEn(tm.programada, persona.zona_horaria) }))) return;
    try {
      await desmarcarToma(tm);
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  const tomarAhora = async (tm: Tratamiento) => {
    setOcupado(`prn${tm.id}`);
    try {
      await api('POST', '/api/registros', { persona_id: persona.id, concepto_id: tm.concepto_id, inicio: new Date().toISOString(), valor: tm.dosis, unidad: tm.unidad });
      festejar(t('¡Anotado! {que} 💊', { que: t(tm.remedio) }));
      tomasCambiaron();
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const tomadas = tomas.filter((tm) => tm.estado === 'tomada').length;
  const vencidas = tomas.filter((tm) => Date.parse(tm.programada) <= ahora).length;
  const paraTomar = tomas.filter((tm) => ['ahora', 'atrasada'].includes(situacion(tm, ahora))).length;
  const proxima = tomas.find((tm) => situacion(tm, ahora) === 'despues');
  const cambiarAbierto = () => {
    setAbierto(!abierto);
    try {
      localStorage.setItem(CLAVE_ABIERTO, abierto ? 'no' : 'si');
    } catch {
      /* sin almacenamiento */
    }
  };

  return (
    <div className={`tarjeta remedios-dia${abierto ? ' abierto' : ''}`}>
      <button className="cabeza-plegable" onClick={cambiarAbierto} aria-expanded={abierto}>
        <span className="titulo-plegable">{t('💊 Remedios')}</span>
        <span className="suave chico resumen-plegable">
          {paraTomar ? <span className="para-tomar">{t('{n} para tomar', { n: paraTomar })}</span> : null}
          {tomas.length ? t('{n} de {total} tomadas', { n: tomadas, total: fecha === hoy ? vencidas || tomas.length : tomas.length }) : t('cuando haga falta')}
          {proxima && !paraTomar ? ' · ' + t('próxima {hora}', { hora: horaEn(proxima.programada, persona.zona_horaria) }) : ''}
        </span>
        <span className="suave" aria-hidden>{abierto ? '▴' : '▾'}</span>
      </button>
      {abierto ? (
      <>
      <ul className="lista tomas">
        {tomas.map((tm) => {
          const s = situacion(tm, ahora);
          const clave = tm.tratamiento_id + tm.programada;
          return (
            <li key={clave} className={`toma ${s}`}>
              <span className="hora">{horaEn(tm.programada, persona.zona_horaria)}</span>
              <span className="que">
                {t(tm.remedio)}
                {tm.dosis !== null || tm.unidad ? <span className="valor-chip">{dosisTexto(tm.dosis, tm.unidad, idioma())}</span> : null}
                {LEYENDA[s] ? (
                  <span className={`estado-toma ${s}`}>
                    {s === 'tomada' ? '✓ ' : ''}
                    {LEYENDA[s]}
                    {s === 'tomada' && tm.tomada ? ` ${horaEn(tm.tomada, persona.zona_horaria)}` : ''}
                  </span>
                ) : null}
              </span>
              {!puede ? null : tm.estado ? (
                <button className="enlace chico" onClick={() => void desmarcar(tm)}>{t('Deshacer')}</button>
              ) : s !== 'despues' ? (
                <span className="botones-toma">
                  <button className="btn chico primario" disabled={ocupado === clave} onClick={() => void marcar(tm, 'tomada')}>{t('La tomé')}</button>
                  <button className="btn chico" disabled={ocupado === clave} onClick={() => void marcar(tm, 'salteada')} aria-label={t('No la tomo')}>{t('No')}</button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {puede && cuandoHaceFalta.length ? (
        <div className="chips envolver cuando-hace-falta">
          {cuandoHaceFalta.map((tm) => (
            <button key={tm.id} className="chip" disabled={ocupado === `prn${tm.id}`} onClick={() => void tomarAhora(tm)}>
              {t('＋ Tomé {que}', { que: t(tm.remedio) })}{tm.dosis !== null ? ` ${dosisTexto(tm.dosis, tm.unidad, idioma())}` : ''}
            </button>
          ))}
        </div>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
