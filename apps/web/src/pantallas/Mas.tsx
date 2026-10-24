// Más: lo que Patty junta sola (clima, ubicación, teléfono, reloj), los avisos, las personas, la cuenta y, aparte,
// lo avanzado (tokens para que otros dispositivos manden datos).
import { useEffect, useState } from 'react';
import { api, API_BASE } from '../api';
import { useEstado } from '../estado';
import { climaActivado, ponerClima, ubicacion } from '../lib/clima';
import { esIOS, instalada, instalarApp } from '../lib/instalar';
import { configEncuesta, ponerEncuesta } from '../lib/encuesta';
import { esNativa } from '../lib/nativo';
import { ponerRecordatorios, recordatoriosActivos } from '../lib/remedios';
import { hayDatosDelTelefono } from '../lib/telefono';
import { perfilTexto } from 'shared';
import { ponerTema, temaActual, type Tema } from '../lib/tema';
import { Cuenta } from './Cuenta';
import { DatosSalud } from './DatosSalud';
import { DatosTelefono } from './DatosTelefono';
import { Lugares } from './Lugares';
import { Perfil } from './Perfil';
import { Permisos } from './Permisos';
import { Remedios } from './Remedios';
import { Supervision } from './Supervision';
import { NuevaPersona } from './NuevaPersona';

interface Fuente { id: number; tipo: string; nombre: string; ultimo_uso: string | null }

export function Mas({ alAdministrar }: { alAdministrar?: () => void }) {
  const { persona, personas, elegirPersona, usuario, salir, sesion, avisar } = useEstado();
  const [nueva, setNueva] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const [permisos, setPermisos] = useState(false);
  const [tema, setTema] = useState<Tema>(temaActual());
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [token, setToken] = useState<{ nombre: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [clima, setClima] = useState(climaActivado());
  const [encuesta, setEncuesta] = useState(configEncuesta());
  const [recordatorios, setRecordatorios] = useState(recordatoriosActivos());
  // Se guarda en la cuenta (lo manda el servidor), no en el teléfono.
  const [sinAnotar, setSinAnotar] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ avisar_sin_anotar: boolean }>('GET', '/api/usuarios/yo/preferencias').then((r) => setSinAnotar(r.avisar_sin_anotar)).catch(() => setSinAnotar(true));
  }, []);
  const cambiarSinAnotar = async (si: boolean) => {
    setSinAnotar(si);
    try {
      await api('PUT', '/api/usuarios/yo/preferencias', { avisar_sin_anotar: si });
    } catch (e) {
      setSinAnotar(!si);
      setError((e as Error).message);
    }
  };
  const cambiarRecordatorios = async (si: boolean) => {
    setRecordatorios(si);
    if (!(await ponerRecordatorios(si))) setError('El teléfono no deja mandar avisos a Patty: habilitalos en los ajustes del teléfono.');
  };
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
      <h2 className="seccion">Lo que Patty junta sola</h2>
      {esNativa() && persona ? (
        <>
          <button className="btn ancho" onClick={() => setPermisos(true)}>🔐 Revisar los permisos de este teléfono</button>
          {permisos ? (
            <>
              <div className="velo" onClick={() => setPermisos(false)} />
              <Permisos persona={persona} alTerminar={() => setPermisos(false)} />
            </>
          ) : null}
        </>
      ) : null}
      <div className="tarjeta">
        <h3>🌤️ Clima</h3>
        <label className="opcion">
          <input type="checkbox" checked={clima} onChange={(e) => {
            ponerClima(e.target.checked);
            setClima(e.target.checked);
            if (e.target.checked) void ubicacion(); // para que el teléfono pida el permiso ahora y no al anotar
          }} />
          <span>Anotar el clima de cada hora donde estás: temperatura, humedad, lluvia, viento, sol, presión y calidad del aire.</span>
        </label>
      </div>
      {persona ? <Lugares persona={persona} puedeEscribir={usuario?.rol !== 'lector'} /> : null}
      {persona && hayDatosDelTelefono() ? <DatosTelefono persona={persona} /> : null}
      {persona && esNativa() ? <DatosSalud persona={persona} /> : null}

      {persona ? (
        <>
          <h2 className="seccion">Remedios</h2>
          <Remedios persona={persona} puedeEscribir={usuario?.rol !== 'lector'} />
        </>
      ) : null}

      <h2 className="seccion">Avisos</h2>
      <div className="tarjeta">
        <h3>😢 Si no anoté nada</h3>
        <label className="opcion">
          <input type="checkbox" checked={sinAnotar ?? true} disabled={sinAnotar === null} onChange={(e) => void cambiarSinAnotar(e.target.checked)} />
          <span>A las 19 h, si no anoté nada en el día, que Patty me lo recuerde.</span>
        </label>
        <p className="suave chico">Si pasa más de una semana sin anotar, el aviso llega una vez por semana.</p>
      </div>
      <div className="tarjeta">
        <h3>💊 Recordatorios de remedios</h3>
        <label className="opcion">
          <input type="checkbox" checked={recordatorios} onChange={(e) => void cambiarRecordatorios(e.target.checked)} />
          <span>Avisarme a la hora de cada toma, y otra vez a la media hora si no la marqué.</span>
        </label>
        {esNativa() && sesion?.push ? (
          <button className="btn chico" onClick={() => void api<{ enviados: number }>('POST', '/api/dispositivos/probar').then((r) => avisar(r.enviados ? 'Te mandé un aviso de prueba' : 'No llegó: revisá los permisos de avisos')).catch((e: Error) => setError(e.message))}>
            🔔 Mandarme un aviso de prueba
          </button>
        ) : null}
        <p className="suave chico">
          {esNativa()
            ? 'Desde el aviso contestás «La tomé», «En 15 min» o «No la tomo». En la pantalla bloqueada no se ve qué remedio es.'
            : 'Los avisos llegan con la app de Android o iPhone. Acá, en el Día, ves las tomas de hoy para marcarlas.'}
        </p>
      </div>
      <div className="tarjeta">
        <h3>🌙 Encuesta de la noche</h3>
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
        {error ? <p className="neg">{error}</p> : null}
      </div>

      <h2 className="seccion">Supervisión</h2>
      <Supervision />

      <h2 className="seccion">Personas</h2>
      <div className="tarjeta">
        <p className="suave chico">De quién se anota el día. Tocá una para cambiar.</p>
        <ul className="lista">
          {personas.map((p) => (
            <li key={p.id} onClick={() => elegirPersona(p.id)} className={p.id === persona?.id ? 'marcada' : ''}>
              <span className="que">{p.nombre}</span>
              <span className="suave chico">{p.id === persona?.id ? '✓ elegida' : p.supervisada ? 'supervisás' : ''}</span>
            </li>
          ))}
        </ul>
        {nueva ? <NuevaPersona alTerminar={() => setNueva(false)} /> : usuario?.rol !== 'lector' ? <button className="btn ancho" onClick={() => setNueva(true)}>＋ Agregar persona</button> : null}
      </div>

      {persona ? (
        <div className="tarjeta">
          <h3>🧍 Datos de {persona.nombre}</h3>
          <p className="suave chico">{perfilTexto(persona) || 'Edad, altura, peso y condiciones crónicas: opcional, ayuda a entender mejor los patrones.'}</p>
          {usuario?.rol !== 'lector' ? <button className="btn ancho" onClick={() => setPerfil(true)}>{perfilTexto(persona) ? 'Cambiar' : 'Completar'}</button> : null}
          {perfil ? (
            <>
              <div className="velo" onClick={() => setPerfil(false)} />
              <Perfil persona={persona} alTerminar={() => setPerfil(false)} />
            </>
          ) : null}
        </div>
      ) : null}

      {usuario?.rol === 'admin' && alAdministrar ? (
        <button className="btn ancho admin-entrar" onClick={alAdministrar}>🛠️ Administración: usuarios y actividad</button>
      ) : null}

      <h2 className="seccion">Tu cuenta</h2>
      <Cuenta />
      <div className="tarjeta">
        <h3>🎨 Tema</h3>
        <div className="segmentos ancho">
          {(['auto', 'claro', 'oscuro'] as Tema[]).map((t) => (
            <button key={t} className={tema === t ? 'activa' : ''} onClick={() => { ponerTema(t); setTema(t); }}>{t === 'auto' ? 'Automático' : t === 'claro' ? 'Claro' : 'Oscuro'}</button>
          ))}
        </div>
      </div>
      {!instalada() && !esNativa() ? <button className="btn ancho" onClick={instalar}>📲 Instalar Patty en el teléfono</button> : null}
      <button className="btn ancho salir" onClick={salir}>Salir ({usuario?.nombre})</button>

      {usuario?.rol !== 'lector' ? (
        <details className="avanzado">
          <summary>Avanzado: conectar otro dispositivo</summary>
          <p className="suave chico">
            Para un reloj, un atajo del teléfono o un servicio que mande datos por su cuenta a{' '}
            <code>{(API_BASE || location.origin) + '/api/ingesta'}</code>. Cada uno usa su propio token. La app ya manda
            lo suyo sola: esto es solo para otros dispositivos.
          </p>
          {fuentes.length ? (
            <ul className="lista">
              {fuentes.map((f) => (
                <li key={f.id}>
                  <span className="que">{f.nombre}</span>
                  <span className="suave chico">{f.ultimo_uso ? `último dato ${new Date(f.ultimo_uso).toLocaleDateString('es-AR')}` : 'sin datos'}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {token ? (
            <div className="nota-ia">
              <p>Token de «{token.nombre}» (se muestra una sola vez):</p>
              <code className="token">{token.token}</code>
            </div>
          ) : null}
          <div className="columna">
            <button className="btn" onClick={() => nuevaFuente('reloj', 'Reloj')}>⌚ Nuevo token para un reloj</button>
            <button className="btn" onClick={() => nuevaFuente('telefono', 'Atajo del teléfono')}>📱 Nuevo token para un atajo</button>
          </div>
        </details>
      ) : null}
    </section>
  );
}
