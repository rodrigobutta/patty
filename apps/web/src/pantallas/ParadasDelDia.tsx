// En el Día: los lugares sin nombre donde la persona se quedó un buen rato ("Estuviste 3 h 30 min cerca de Av. Cabildo
// 2100"), para que diga qué lugar es (lo de papá, el trabajo). Con nombre pasa a ser un lugar: cuenta el tiempo ahí,
// también los días anteriores, y entra en los patrones. "No es nada" lo deja de preguntar (en este teléfono).
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { distanciaMetros, type Lugar, type ParadaSinNombre, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { duracion } from '../lib/automatico';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { ponerLugares } from '../lib/ubicacion';
import { Mapa } from '../ui/Mapa';

const CLAVE_DESCARTADAS = 'paradas-descartadas';
const SUGERENCIAS = ['Casa de mis viejos', 'Trabajo', 'Casa de amigos', 'Gimnasio', 'Facultad', 'Club', 'Médico', 'Supermercado'];

const descartadas = (): Array<{ lat: number; lon: number }> => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_DESCARTADAS) ?? '[]') as Array<{ lat: number; lon: number }>;
  } catch {
    return [];
  }
};

export function ParadasDelDia({ persona, fecha, vuelta, alCambiar }: { persona: Persona; fecha: string; vuelta: number; alCambiar(): void }) {
  const { festejar, usuario } = useEstado();
  const [paradas, setParadas] = useState<ParadaSinNombre[]>([]);
  const [nombrando, setNombrando] = useState<ParadaSinNombre | null>(null);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  /** La parada cuyo mapita está abierto (se toca la dirección). */
  const [viendo, setViendo] = useState<string | null>(null);

  const traer = useCallback(() => {
    api<ParadaSinNombre[]>('GET', `/api/ubicacion/paradas?persona=${persona.id}&fecha=${fecha}`)
      .then((l) => {
        const no = descartadas();
        setParadas(l.filter((p) => !no.some((d) => distanciaMetros(d, p) < 200)));
      })
      .catch(() => setParadas([]));
  }, [persona.id, fecha]);
  useEffect(() => traer(), [traer, vuelta]);

  if (!paradas.length || usuario?.rol === 'lector') return null;

  const descartar = (p: ParadaSinNombre) => {
    try {
      localStorage.setItem(CLAVE_DESCARTADAS, JSON.stringify([...descartadas(), { lat: p.lat, lon: p.lon }].slice(-100)));
    } catch {
      /* sin almacenamiento */
    }
    setParadas((l) => l.filter((x) => x !== p));
  };

  const guardar = async () => {
    if (!nombrando || !nombre.trim()) return;
    setGuardando(true);
    setError('');
    try {
      await api('POST', '/api/ubicacion/lugares', { persona_id: persona.id, nombre: nombre.trim(), lat: nombrando.lat, lon: nombrando.lon });
      // El teléfono también tiene que saber del lugar nuevo (para avisar cuando entra o sale).
      void api<Lugar[]>('GET', `/api/ubicacion/lugares?persona=${persona.id}`).then(ponerLugares).catch(() => {});
      festejar(t('¡Listo! Ahora sé cuándo estás en {lugar} 📍', { lugar: nombre.trim() }));
      setNombrando(null);
      setNombre('');
      traer();
      alCambiar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="tarjeta paradas">
      <h3>{t('📍 ¿Dónde estuviste?')}</h3>
      <ul className="lista">
        {paradas.map((p) => (
          <li key={p.llegada} className="parada">
            <button className="que boton-parada" onClick={() => setViendo(viendo === p.llegada ? null : p.llegada)} aria-expanded={viendo === p.llegada}>
              <strong>{p.direccion ? t('Cerca de {dir}', { dir: p.direccion }) : t('En un lugar sin nombre')}</strong>
              <span className="suave chico renglon-sub">
                {t('{desde} a {hasta} · {tiempo}', { desde: horaEn(p.llegada, persona.zona_horaria), hasta: horaEn(p.salida, persona.zona_horaria), tiempo: duracion(p.minutos) })}
                {p.otros_dias ? ` · ${p.otros_dias === 1 ? t('y 1 día más este mes') : t('y {n} días más este mes', { n: p.otros_dias })}` : ''}
              </span>
              <span className="chico ver-mapa">{viendo === p.llegada ? t('Ocultar el mapa') : t('🗺️ Ver en el mapa')}</span>
            </button>
            <span className="botones-parada">
              <button className="btn chico primario" onClick={() => { setNombrando(p); setNombre(''); setError(''); }}>{t('¿Qué es?')}</button>
              <button className="enlace chico" onClick={() => descartar(p)}>{t('No importa')}</button>
            </span>
            {viendo === p.llegada ? <Mapa puntos={[{ lat: p.lat, lon: p.lon, radio: 150 }]} alto={170} className="mapa-parada" /> : null}
          </li>
        ))}
      </ul>
      {nombrando
        ? createPortal(
            <>
              <div className="velo" onClick={() => setNombrando(null)} />
              <form className="hoja modal-cuanto modal-lugar" role="dialog" aria-label={t('¿Qué lugar es?')} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
                <p className="pregunta-cuanto">{t('¿Qué lugar es?')}</p>
                <p className="suave chico">
                  {nombrando.direccion ? `${nombrando.direccion} · ` : ''}
                  {t('estuviste {tiempo}', { tiempo: duracion(nombrando.minutos) })}
                </p>
                <Mapa puntos={[{ lat: nombrando.lat, lon: nombrando.lon, radio: 150 }]} alto={150} />
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('ej: casa de mi papá, la oficina')} maxLength={80} />
                <div className="chips envolver">
                  {SUGERENCIAS.map((s) => (
                    <button type="button" key={s} className={`chip${nombre === t(s) ? ' activa' : ''}`} onClick={() => setNombre(t(s))}>{t(s)}</button>
                  ))}
                </div>
                {error ? <p className="neg">{error}</p> : null}
                <button className="btn primario ancho" disabled={!nombre.trim() || guardando}>{guardando ? '…' : t('Guardar lugar')}</button>
                <button type="button" className="enlace chico cancelar-cuanto" onClick={() => setNombrando(null)}>{t('Cancelar')}</button>
              </form>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
