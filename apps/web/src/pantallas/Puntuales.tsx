// "¿Algo puntual?": tengo sueño, tengo hambre, estoy con energía… Ni bien ni mal: al tocarlo aparece una ventanita que
// pregunta cuánto, y con eso se anota.
// "Con dolor" pregunta qué (cabeza, garganta, panza… o un malestar común: fiebre, resfrío) y va a «Dolores y molestias»,
// así Patty puede buscar qué lo causa.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CUANTO, DOLORES, ENFERMO, ESTADOS_PUNTUALES, MALESTARES, TEMPERATURA_CORPORAL, type Persona } from 'shared';
import { api } from '../api';
import { idioma, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { anotarClima } from '../lib/clima';
import { genteGuardada, traerGente, type Alguien } from '../lib/gente';

export function Puntuales({ persona, alGuardar }: { persona: Persona; alGuardar(): void }) {
  const { categorias, festejar } = useEstado();
  /** Un estado puntual, 'otro', o 'dolor' (y entonces `dolor` dice cuál). */
  const [elegido, setElegido] = useState<string | null>(null);
  const [dolor, setDolor] = useState<string | null>(null);
  const [otro, setOtro] = useState('');
  const [error, setError] = useState('');
  const animo = categorias.find((c) => c.clave === 'animo');
  // Al abrir "Con dolor", que se vea qué elegir (queda abajo de todos los chips).
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (elegido === 'dolor' || elegido === 'gente') panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [elegido]);
  // "Con gente": a quiénes eligió (de su gente, o nombres nuevos que se dan de alta al anotar).
  const [gente, setGente] = useState<Alguien[]>(genteGuardada(persona.id));
  const [conQuien, setConQuien] = useState<string[]>([]);
  const [nuevaGente, setNuevaGente] = useState('');
  const anotarGente = async () => {
    const cat = categorias.find((c) => c.clave === 'gente');
    if (!cat || !conQuien.length) return;
    setError('');
    const inicio = new Date().toISOString();
    try {
      for (const n of conQuien) {
        if (!gente.some((a) => a.nombre === n)) await api('POST', '/api/gente', { persona_id: persona.id, nombre: n });
        await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: n, categoria_id: cat.id, inicio });
      }
      festejar(t('Anotado: con {lista} 👥', { lista: conQuien.join(idioma() === 'en' ? ' and ' : ' y ') }));
      setConQuien([]);
      setElegido(null);
      void traerGente(persona.id).then(setGente).catch(() => {});
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  /** Lo que se está por anotar: mientras tanto, la ventanita de "¿cuánto?". */
  const [preguntando, setPreguntando] = useState<string | null>(null);
  const sintoma = categorias.find((c) => c.clave === 'sintoma');

  const guardar = async (nombre: string, intensidad: number, cuanto: string) => {
    const cat = elegido === 'dolor' ? sintoma : animo;
    if (!cat) return;
    setError('');
    const inicio = new Date().toISOString();
    try {
      await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: nombre, categoria_id: cat.id, inicio, intensidad });
      void anotarClima(persona.id, [inicio]);
      const vars = { que: t(nombre).toLowerCase(), cuanto: t(cuanto).toLowerCase() };
      festejar(elegido === 'dolor' ? t('Anotado: {que}, {cuanto}. ¡Que se te pase pronto!', vars) : t('Anotado: {que}, {cuanto}', vars));
      setElegido(null);
      setDolor(null);
      setOtro('');
      setPreguntando(null);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const elegir = (e: string) => {
    setElegido(elegido === e ? null : e);
    setDolor(null);
    setOtro('');
    // Un estado puntual ya está elegido: se pregunta cuánto.
    if (e !== 'dolor' && e !== 'otro' && e !== 'gente' && elegido !== e) setPreguntando(e);
    if (e === 'gente' && elegido !== 'gente') void traerGente(persona.id).then(setGente).catch(() => {});
  };
  // La temperatura (con el número), solo acá, con lo del cuerpo.
  const [grados, setGrados] = useState('');
  const anotarTemperatura = async () => {
    const n = Number(grados.replace(',', '.'));
    if (!sintoma || !(n >= 34 && n <= 43)) return setError(t('Poné la temperatura, por ejemplo 37,8.'));
    setError('');
    try {
      const inicio = new Date().toISOString();
      await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: TEMPERATURA_CORPORAL, categoria_id: sintoma.id, inicio, valor: n, unidad: '°C' });
      festejar(n >= 37.5 ? t('Anotado: {n} °C. ¡Cuidate mucho! 💜', { n: String(n).replace('.', ',') }) : t('Anotado: {n} °C', { n: String(n).replace('.', ',') }));
      setGrados('');
      setElegido(null);
      setDolor(null);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const elegirDolor = (d: string) => {
    setDolor(dolor === d ? null : d);
    if (d !== 'otro' && dolor !== d) setPreguntando(d);
  };
  const cancelar = () => {
    setPreguntando(null);
    setError('');
    // Si era un estado puntual, se deselecciona; en "Con dolor" queda abierto para elegir otra cosa.
    if (elegido !== 'dolor' && elegido !== 'otro') setElegido(null);
    else if (dolor !== 'otro') setDolor(null);
  };
  const chipDolor = (d: { nombre: string; emoji: string }) => (
    <button key={d.nombre} className={`chip${dolor === d.nombre ? ' activa' : ''}`} onClick={() => elegirDolor(d.nombre)}>
      <span aria-hidden>{d.emoji}</span> {idioma() === 'en' ? t(d.nombre) : d.nombre.replace(/^Dolor (de )?/, '').replace(/^./, (x) => x.toUpperCase())}
    </button>
  );

  return (
    <div className="puntuales">
      <p className="rotulo suave chico">{t('¿Algo puntual?')}</p>
      <div className="chips envolver">
        <button className={`chip${elegido === 'dolor' ? ' activa' : ''}`} onClick={() => elegir('dolor')}>
          <span aria-hidden>🤕</span> {t('Con dolor o malestar')}
        </button>
        <button className={`chip${elegido === 'gente' ? ' activa' : ''}`} onClick={() => elegir('gente')}>
          <span aria-hidden>👥</span> {t('Con gente')}
        </button>
        {ESTADOS_PUNTUALES.map((e) => (
          <button key={e.nombre} className={`chip${elegido === e.nombre ? ' activa' : ''}`} onClick={() => elegir(e.nombre)}>
            <span aria-hidden>{e.emoji}</span> {t(e.nombre)}
          </button>
        ))}
        <button className={`chip${elegido === 'otro' ? ' activa' : ''}`} onClick={() => elegir('otro')}>{t('✏️ Otro')}</button>
      </div>
      {elegido === 'dolor' ? (
        <div className="que-duele" ref={panel}>
          <p className="rotulo suave chico">{t('¿Qué te duele?')}</p>
          <div className="chips envolver">{DOLORES.map(chipDolor)}</div>
          <p className="rotulo suave chico">{t('¿Algún malestar?')}</p>
          <div className="chips envolver">
            {MALESTARES.map(chipDolor)}
            <button className={`chip${dolor === 'otro' ? ' activa' : ''}`} onClick={() => elegirDolor('otro')}>{t('✏️ Otro')}</button>
          </div>
          <p className="rotulo suave chico">{t('¿Estás enfermo/a?')}</p>
          <div className="chips envolver">
            <button className={`chip${dolor === ENFERMO ? ' activa' : ''}`} onClick={() => elegirDolor(ENFERMO)}>
              <span aria-hidden>🤒</span> {t('Me siento enfermo/a')}
            </button>
            <button className={`chip${dolor === 'temperatura' ? ' activa' : ''}`} onClick={() => setDolor(dolor === 'temperatura' ? null : 'temperatura')}>
              <span aria-hidden>🌡️</span> {t('Me tomé la fiebre')}
            </button>
          </div>
          {dolor === 'temperatura' ? (
            <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); void anotarTemperatura(); }}>
              <input inputMode="decimal" value={grados} onChange={(e) => setGrados(e.target.value)} placeholder="37,8" autoFocus aria-label={t('Temperatura corporal')} />
              <span className="suave">°C</span>
              <button className="btn primario" disabled={!grados.trim()}>{t('Anotar')}</button>
            </form>
          ) : null}
        </div>
      ) : null}
      {elegido === 'gente' ? (
        <div className="que-duele" ref={panel}>
          <p className="rotulo suave chico">{t('¿Con quién estás?')}</p>
          <div className="chips envolver">
            {gente.map((a) => (
              <button key={a.id} className={`chip${conQuien.includes(a.nombre) ? ' activa' : ''}`} onClick={() => setConQuien((l) => (l.includes(a.nombre) ? l.filter((x) => x !== a.nombre) : [...l, a.nombre]))}>
                {conQuien.includes(a.nombre) ? '✓ ' : ''}{a.nombre}
              </button>
            ))}
          </div>
          <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); const escrito = nuevaGente.trim(); const n = gente.find((x) => x.nombre.toLowerCase() === escrito.toLowerCase())?.nombre ?? escrito; if (n && !conQuien.includes(n)) setConQuien([...conQuien, n]); setNuevaGente(''); }}>
            <input value={nuevaGente} onChange={(e) => setNuevaGente(e.target.value)} placeholder={gente.length ? t('¿Alguien más?') : t('ej: Mamá, Juan, amigos')} list="gente-sugerida" />
            <datalist id="gente-sugerida">{gente.map((x) => <option key={x.id} value={x.nombre} />)}</datalist>
            <button className="btn" disabled={!nuevaGente.trim()}>{t('Sumar')}</button>
          </form>
          {conQuien.filter((n) => !gente.some((a) => a.nombre === n)).length ? (
            <p className="suave chico">{t('Nuevos: {lista}', { lista: conQuien.filter((n) => !gente.some((a) => a.nombre === n)).join(', ') })}</p>
          ) : null}
          <button className="btn primario ancho" disabled={!conQuien.length} onClick={() => void anotarGente()}>{t('Anotar')}</button>
        </div>
      ) : null}
      {elegido === 'otro' || dolor === 'otro' ? (
        <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); if (otro.trim()) setPreguntando(otro.trim()); }}>
          <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder={dolor === 'otro' ? t('ej: dolor de rodilla, sinusitis, herpes') : t('ej: con frío en los pies, con ganas de salir')} autoFocus />
          <button className="btn primario" disabled={!otro.trim()}>{t('Seguir')}</button>
        </form>
      ) : null}
      {/* En el body: adentro del Día (que se anima con transform) el fixed quedaría atado a la tarjeta. */}
      {preguntando ? createPortal(
        <>
          <div className="velo" onClick={cancelar} />
          <div className="hoja modal-cuanto" role="dialog" aria-label={t('¿Cuánto?')}>
            <p className="pregunta-cuanto">{t('¿Cuánto?')} <strong>{t(preguntando)}</strong></p>
            <div className="botones-cuanto">
              {CUANTO.map((c) => (
                <button key={c.nombre} className="btn primario" onClick={() => void guardar(preguntando, c.intensidad, c.nombre)}>{t(c.nombre)}</button>
              ))}
            </div>
            {error ? <p className="neg">{error}</p> : null}
            <button className="enlace chico cancelar-cuanto" onClick={cancelar}>{t('Cancelar')}</button>
          </div>
        </>,
        document.body,
      ) : null}
      {error && !preguntando ? <p className="neg">{error}</p> : null}
    </div>
  );
}
