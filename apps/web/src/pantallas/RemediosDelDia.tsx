// En el Día: las tomas de remedios de ese día, para marcar "La tomé" o "No la tomo". Las que ya pasaron sin marcar se
// ven atrasadas (todavía se pueden tomar) y, después de unas horas, olvidadas. Los remedios "cuando haga falta" tienen
// su botón para anotarlos con un toque.
import { useCallback, useEffect, useState } from 'react';
import { dosisTexto, HORAS_PARA_OLVIDADA, type Persona, type Toma, type Tratamiento } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { desmarcarToma, marcarToma, tomasCambiaron, useAlCambiarTomas } from '../lib/remedios';

/** Cuánto antes de la hora ya se ofrece marcarla. */
const ANTES_MIN = 60;

type Situacion = 'tomada' | 'salteada' | 'olvidada' | 'atrasada' | 'ahora' | 'despues';

function situacion(t: Toma, ahora: number): Situacion {
  if (t.estado) return t.estado;
  const x = Date.parse(t.programada);
  if (ahora - x > HORAS_PARA_OLVIDADA * 3600000) return 'olvidada';
  if (ahora - x > 15 * 60000) return 'atrasada';
  return x - ahora <= ANTES_MIN * 60000 ? 'ahora' : 'despues';
}

const LEYENDA: Record<Situacion, string> = {
  tomada: 'tomada',
  salteada: 'no la tomaste',
  olvidada: 'sin marcar',
  atrasada: 'atrasada',
  ahora: 'ahora',
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
  const [tomas, setTomas] = useState<Toma[]>([]);
  const [cuandoHaceFalta, setCuandoHaceFalta] = useState<Tratamiento[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const puede = usuario?.rol !== 'lector';

  const traer = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        api<Toma[]>('GET', `/api/tratamientos/tomas?persona=${persona.id}&fecha=${fecha}`),
        fecha === hoy ? api<Tratamiento[]>('GET', `/api/tratamientos?persona=${persona.id}`) : Promise.resolve([]),
      ]);
      setTomas(t);
      setCuandoHaceFalta(l.filter((x) => x.activo && !x.cada_horas && !x.horarios.length));
    } catch {
      /* sin conexión: el Día sigue igual */
    }
  }, [persona.id, fecha, hoy]);
  useEffect(() => {
    setTomas([]);
  }, [persona.id, fecha]);
  useEffect(() => {
    void traer();
  }, [traer, vuelta]);
  useAlCambiarTomas(traer);

  if (!tomas.length && !cuandoHaceFalta.length) return null;
  const ahora = Date.now();

  const marcar = async (t: Toma, estado: 'tomada' | 'salteada') => {
    const clave = t.tratamiento_id + t.programada;
    setOcupado(clave);
    try {
      // Si es de hace rato, se anota a la hora en que tocaba (se acuerda de que la tomó, no la toma ahora).
      const vieja = ahora - Date.parse(t.programada) > HORAS_PARA_OLVIDADA * 3600000;
      await marcarToma(t, estado, vieja ? t.programada : undefined);
      if (estado === 'tomada') festejar(`¡Bien! ${t.remedio} tomado 💊`);
      else avisar('Anotado que no la tomaste');
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const desmarcar = async (t: Toma) => {
    if (!confirm(`¿Desmarcar la toma de ${t.remedio} de las ${horaEn(t.programada, persona.zona_horaria)}?`)) return;
    try {
      await desmarcarToma(t);
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  const tomarAhora = async (t: Tratamiento) => {
    setOcupado(`prn${t.id}`);
    try {
      await api('POST', '/api/registros', { persona_id: persona.id, concepto_id: t.concepto_id, inicio: new Date().toISOString(), valor: t.dosis, unidad: t.unidad });
      festejar(`¡Anotado! ${t.remedio} 💊`);
      tomasCambiaron();
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const tomadas = tomas.filter((t) => t.estado === 'tomada').length;
  const vencidas = tomas.filter((t) => Date.parse(t.programada) <= ahora).length;

  return (
    <div className="tarjeta remedios-dia">
      <h3>
        💊 Remedios
        {tomas.length ? <span className="suave chico"> · {tomadas} de {fecha === hoy ? vencidas || tomas.length : tomas.length} tomadas</span> : null}
      </h3>
      <ul className="lista tomas">
        {tomas.map((t) => {
          const s = situacion(t, ahora);
          const clave = t.tratamiento_id + t.programada;
          return (
            <li key={clave} className={`toma ${s}`}>
              <span className="hora">{horaEn(t.programada, persona.zona_horaria)}</span>
              <span className="que">
                {t.remedio}
                {t.dosis !== null || t.unidad ? <span className="valor-chip">{dosisTexto(t.dosis, t.unidad)}</span> : null}
                {LEYENDA[s] ? (
                  <span className={`estado-toma ${s}`}>
                    {s === 'tomada' ? '✓ ' : ''}
                    {LEYENDA[s]}
                    {s === 'tomada' && t.tomada ? ` ${horaEn(t.tomada, persona.zona_horaria)}` : ''}
                  </span>
                ) : null}
              </span>
              {!puede ? null : t.estado ? (
                <button className="enlace chico" onClick={() => void desmarcar(t)}>Deshacer</button>
              ) : s !== 'despues' ? (
                <span className="botones-toma">
                  <button className="btn chico primario" disabled={ocupado === clave} onClick={() => void marcar(t, 'tomada')}>La tomé</button>
                  <button className="btn chico" disabled={ocupado === clave} onClick={() => void marcar(t, 'salteada')} aria-label="No la tomo">No</button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {puede && cuandoHaceFalta.length ? (
        <div className="chips envolver cuando-hace-falta">
          {cuandoHaceFalta.map((t) => (
            <button key={t.id} className="chip" disabled={ocupado === `prn${t.id}`} onClick={() => void tomarAhora(t)}>
              ＋ Tomé {t.remedio}{t.dosis !== null ? ` ${dosisTexto(t.dosis, t.unidad)}` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
