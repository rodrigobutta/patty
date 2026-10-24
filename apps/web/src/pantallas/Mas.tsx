// Personas, dispositivos, tema, instalar la app y salir.
import { useEffect, useState } from 'react';
import { api, API_BASE } from '../api';
import { useEstado } from '../estado';
import { climaActivado, ponerClima, ubicacion } from '../lib/clima';
import { esIOS, instalada, instalarApp } from '../lib/instalar';
import { configEncuesta, ponerEncuesta } from '../lib/encuesta';
import { esNativa } from '../lib/nativo';
import { hayDatosDelTelefono } from '../lib/telefono';
import { ponerTema, temaActual, type Tema } from '../lib/tema';
import { DatosSalud } from './DatosSalud';
import { DatosTelefono } from './DatosTelefono';
import { Lugares } from './Lugares';
import { NuevaPersona } from './NuevaPersona';

interface Fuente { id: number; tipo: string; nombre: string; ultimo_uso: string | null }

export function Mas() {
  const { persona, personas, elegirPersona, usuario, salir } = useEstado();
  const [nueva, setNueva] = useState(false);
  const [tema, setTema] = useState<Tema>(temaActual());
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [token, setToken] = useState<{ nombre: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [clima, setClima] = useState(climaActivado());
  const [encuesta, setEncuesta] = useState(configEncuesta());
  const cambiarEncuesta = async (c: typeof encuesta) => {
    setEncuesta(c);
    if (!(await ponerEncuesta(c))) setError('El teléfono no deja mandar avisos a Patty: habilitalos en los ajustes del teléfono.');
  };

  useEffect(() => {
    if (persona) api<Fuente[]>('GET', `/api/personas/${persona.id}/fuentes`).then(setFuentes).catch(() => {});
  }, [persona]);

  const nuevaFuente = async (tipo: string, nombre: string) => {
    try {
      const f = await api<Fuente & { token: string }>('POST', `/api/personas/${persona!.id}/fuentes`, { tipo, nombre });
      setToken({ nombre: f.nombre, token: f.token });
      setFuentes((l) => [...l, f]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const instalar = async () => {
    if (!(await instalarApp())) alert(esIOS() ? 'En el iPhone: tocá Compartir y después «Agregar a inicio».' : 'Desde el menú del navegador: «Instalar app» o «Agregar a la pantalla de inicio».');
  };

  return (
    <section className="mas">
      <div className="tarjeta">
        <h3>Personas</h3>
        <ul className="lista">
          {personas.map((p) => (
            <li key={p.id} onClick={() => elegirPersona(p.id)} className={p.id === persona?.id ? 'marcada' : ''}>{p.nombre}<span className="suave chico"> · {p.zona_horaria}</span></li>
          ))}
        </ul>
        {nueva ? <NuevaPersona alTerminar={() => setNueva(false)} /> : usuario?.rol !== 'lector' ? <button className="btn" onClick={() => setNueva(true)}>＋ Agregar persona</button> : null}
      </div>

      <div className="tarjeta">
        <h3>Reloj, teléfono y clima</h3>
        <p className="suave chico">
          Cada dispositivo manda sus datos (pasos, pulso, tiempo de pantalla, temperatura) a <code>{(API_BASE || location.origin) + '/api/ingesta'}</code> con su propio token.
        </p>
        <label className="opcion">
          <input type="checkbox" checked={clima} onChange={(e) => {
            ponerClima(e.target.checked);
            setClima(e.target.checked);
            if (e.target.checked) void ubicacion(); // para que el teléfono pida el permiso ahora y no al anotar
          }} />
          <span>Anotar el clima solo (temperatura, sensación, humedad, lluvia, viento, nubes, sol, UV, presión y calidad del aire) de cada hora, con la ubicación de este teléfono.</span>
        </label>
        <ul className="lista">
          {fuentes.map((f) => <li key={f.id}>{f.nombre}<span className="suave chico"> · {f.ultimo_uso ? `último dato ${new Date(f.ultimo_uso).toLocaleString('es-AR')}` : 'sin datos todavía'}</span></li>)}
        </ul>
        {token ? (
          <div className="nota-ia">
            <p>Token de «{token.nombre}» (se muestra una sola vez):</p>
            <code className="token">{token.token}</code>
          </div>
        ) : null}
        {usuario?.rol !== 'lector' ? (
          <div className="chips">
            <button className="chip" onClick={() => nuevaFuente('reloj', 'Reloj')}>⌚ Reloj</button>
            <button className="chip" onClick={() => nuevaFuente('telefono', 'Teléfono')}>📱 Teléfono</button>
            <button className="chip" onClick={() => nuevaFuente('clima', 'Clima')}>🌤️ Clima</button>
          </div>
        ) : null}
        {error ? <p className="neg">{error}</p> : null}
      </div>

      <div className="tarjeta">
        <h3>Encuesta de la noche</h3>
        <label className="opcion">
          <input type="checkbox" checked={encuesta.activa} onChange={(e) => void cambiarEncuesta({ ...encuesta, activa: e.target.checked })} />
          <span>Preguntarme cómo me sentí en el día.</span>
        </label>
        {encuesta.activa ? (
          <label>
            A las
            <input type="time" value={encuesta.hora} onChange={(e) => e.target.value && void cambiarEncuesta({ ...encuesta, hora: e.target.value })} />
          </label>
        ) : null}
        <p className="suave chico">
          {esNativa()
            ? 'Llega un aviso a esa hora; si no lo contestás, el Día te lo vuelve a preguntar hasta las 5 de la mañana.'
            : 'Desde esa hora, el Día te pregunta cómo te sentiste. Con la app de Android o iPhone, además, llega un aviso.'}
        </p>
      </div>

      {persona ? <Lugares persona={persona} puedeEscribir={usuario?.rol !== 'lector'} /> : null}
      {persona && hayDatosDelTelefono() ? <DatosTelefono persona={persona} /> : null}
      {persona && esNativa() ? <DatosSalud persona={persona} /> : null}

      <div className="tarjeta">
        <h3>Tema</h3>
        <div className="segmentos">
          {(['auto', 'claro', 'oscuro'] as Tema[]).map((t) => (
            <button key={t} className={tema === t ? 'activa' : ''} onClick={() => { ponerTema(t); setTema(t); }}>{t === 'auto' ? 'Automático' : t === 'claro' ? 'Claro' : 'Oscuro'}</button>
          ))}
        </div>
      </div>

      {!instalada() && !esNativa() ? <button className="btn ancho" onClick={instalar}>📲 Instalar Patty en el teléfono</button> : null}
      <button className="btn ancho" onClick={salir}>Salir ({usuario?.nombre})</button>
    </section>
  );
}
