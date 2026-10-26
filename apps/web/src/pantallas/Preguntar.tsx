// "Preguntale a Patty" (arriba de Descubrir): una pregunta libre sobre los propios datos ("¿cuándo comí huevos?").
// Contesta la IA con lo anotado; los días de la respuesta se tocan para ir a verlos y las cosas, para buscarlas.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { irAlDia } from '../lib/avisos';
import { locale, t } from '../lib/idioma';

interface Respuesta {
  respuesta: string;
  fechas: string[];
  conceptos: Array<{ id: number; nombre: string }>;
}

const EJEMPLOS = [t('¿Cuándo comí huevos?'), t('¿Cuántas veces me dolió la cabeza este mes?'), t('¿Cómo vengo durmiendo?')];

const fechaCorta = (f: string) =>
  new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${f}T12:00:00Z`));

export function Preguntar({ persona, alBuscar }: { persona: Persona; alBuscar(conceptoId: number): void }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [r, setR] = useState<(Respuesta & { pregunta: string }) | null>(null);
  const [error, setError] = useState('');
  const [ultimas, setUltimas] = useState<string[]>([]);
  useEffect(() => {
    setR(null);
    api<string[]>('GET', `/api/preguntar/ultimas?persona=${persona.id}`).then(setUltimas).catch(() => {});
  }, [persona.id]);

  const preguntar = async (pregunta: string) => {
    const q = pregunta.trim();
    if (!q || pensando) return;
    setTexto(q);
    setPensando(true);
    setError('');
    try {
      const x = await api<Respuesta>('POST', '/api/preguntar', { persona_id: persona.id, pregunta: q });
      setR({ ...x, pregunta: q });
      setUltimas((l) => [q, ...l.filter((y) => y !== q)].slice(0, 5));
      setAbierto(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPensando(false);
    }
  };

  const sugerencias = [...ultimas, ...EJEMPLOS.filter((e) => !ultimas.includes(e))].slice(0, 6);
  return (
    <div className="tarjeta preguntar">
      <form
        className="preguntar-fila"
        onSubmit={(e) => {
          e.preventDefault();
          void preguntar(texto);
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder={t('🦉 Preguntale a Patty sobre tus datos…')}
          enterKeyHint="search"
          maxLength={500}
        />
        <button className="btn primario" type="submit" disabled={pensando || !texto.trim()} aria-label={t('Preguntar')}>
          {pensando ? '…' : '➜'}
        </button>
      </form>
      {abierto && !pensando && !r ? (
        <div className="chips envolver">
          {sugerencias.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => void preguntar(s)}>{s}</button>
          ))}
        </div>
      ) : null}
      {pensando ? <p className="suave chico">{t('Patty está mirando tus datos…')}</p> : null}
      {error ? <p className="neg">{error}</p> : null}
      {r && !pensando ? (
        <div className="nota-ia respuesta-patty">
          <p>{r.respuesta}</p>
          {r.fechas.length ? (
            <div className="chips envolver">
              {r.fechas.map((f) => (
                <button key={f} type="button" className="chip" onClick={() => irAlDia(f)}>📅 {fechaCorta(f)}</button>
              ))}
            </div>
          ) : null}
          {r.conceptos.length ? (
            <p className="suave chico">
              {t('Ver en el calendario:')}{' '}
              {r.conceptos.slice(0, 4).map((c, i) => (
                <span key={c.id}>
                  {i ? ' · ' : ''}
                  <button type="button" className="enlace" onClick={() => alBuscar(c.id)}>{t(c.nombre)}</button>
                </span>
              ))}
            </p>
          ) : null}
          <button type="button" className="enlace chico" onClick={() => { setR(null); setTexto(''); setAbierto(true); }}>{t('Preguntar otra cosa')}</button>
        </div>
      ) : null}
    </div>
  );
}
