// Más: lo que Patty junta sola (clima, ubicación, teléfono, reloj), los avisos, las personas, la cuenta y, aparte,
// lo avanzado (tokens para que otros dispositivos manden datos).
import { verTour } from '../ui/Tour';
import { BorrarCuenta } from '../ui/BorrarCuenta';
import { UsoIaMio } from '../ui/UsoIaMio';
import { PreguntasPatty } from './PreguntasPatty';
import { medir } from '../lib/analytics';
import { agregarWidget } from '../lib/push';
import { useEffect, useState, type ReactNode } from 'react';
import { CLAVES_SYNC, leerUltimaVez, UltimaVez } from '../ui/UltimaVez';
import { api, API_BASE } from '../api';
import { useEstado } from '../estado';
import { avisarAnotado, olvidarDeNoche } from '../mascota/cara';
import { anotarClima, climaActivado, horasRecientes, ponerClima, ubicacion } from '../lib/clima';
import { esIOS, instalada, instalarApp } from '../lib/instalar';
import { configEncuesta, ponerEncuesta } from '../lib/encuesta';
import { esNativa, plataforma } from '../lib/nativo';
import { ponerRecordatorios, recordatoriosActivos } from '../lib/remedios';
import { hayDatosDelTelefono } from '../lib/telefono';
import { perfilTexto } from 'shared';
import { ponerTema, temaActual, type Tema } from '../lib/tema';
import { idioma, idiomaElegido, locale, ponerIdioma, t } from '../lib/idioma';
import { Cuenta } from './Cuenta';
import { alPedirIrAMas, tomarSeccionPedida, verSeccionPedida } from '../lib/navegar';
import { IconoPreguntas, IconoSeguimientos } from '../ui/IconosMas';
import { Seguimientos } from './Seguimientos';
import { IconoAvanzado, IconoAvisos, IconoClima, IconoCuenta, IconoPermisos, IconoReloj, IconoTelefono, IconoFamilia, IconoGente, IconoLugares, IconoRemedios, IconoSalud } from '../ui/IconosMas';
import { DatosSalud } from './DatosSalud';
import { DatosCalendario, DatosTelefono } from './DatosTelefono';
import { Lugares } from './Lugares';
import { Perfil } from './Perfil';
import { alPedirGuia, Permisos, tomarGuia, type Paso } from './Permisos';
import { Gente } from './Gente';
import { Remedios } from './Remedios';
import { Supervision } from './Supervision';
import { NuevaPersona } from './NuevaPersona';
import { COMMIT, VERSION, versionNativa } from '../lib/version';

interface Fuente { id: number; tipo: string; nombre: string; ultimo_uso: string | null }

type Seccion = 'datos' | 'clima' | 'telefono' | 'reloj' | 'lugares' | 'remedios' | 'preguntas' | 'seguimientos' | 'avisos' | 'supervision' | 'personas' | 'salud' | 'cuenta' | 'avanzado';

export function Mas({ alAdministrar }: { alAdministrar?: () => void }) {
  const { persona, personas, elegirPersona, usuario, salir, sesion, avisar } = useEstado();
  const [nueva, setNueva] = useState(false);
  const [permisos, setPermisos] = useState(false);
  // "Sincronizar ahora" de las fuentes que se traen de otro lado (el clima, por ejemplo).
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizar = async (f: () => Promise<void>, listo: string) => {
    setSincronizando(true);
    try {
      await f();
      avisar(listo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSincronizando(false);
    }
  };
  /** La sub-pantalla abierta (null: el menú). */
  const [seccion, setSeccion] = useState<Seccion | null>(() => verSeccionPedida() as Seccion | null);
  // Pedida desde otra pantalla con Más ya abierta (la tarjeta de remedios del Día, por ejemplo).
  useEffect(() => {
    tomarSeccionPedida();
    return alPedirIrAMas(() => {
      const s = tomarSeccionPedida();
      if (s) setSeccion(s as Seccion);
    });
  }, []);
  // Tocar «Más» abajo estando en una sección vuelve al menú.
  useEffect(() => {
    const f = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'mas') setSeccion(null);
    };
    window.addEventListener('patty-pestana-inicio', f);
    return () => window.removeEventListener('patty-pestana-inicio', f);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [seccion]);
  const [nativa, setNativa] = useState<string | null>(null);
  useEffect(() => void versionNativa().then(setNativa), []);
  const [guia, setGuia] = useState<Paso | undefined>(undefined);
  // Tocar el aviso de un permiso que falta abre los permisos con sus pasos.
  useEffect(() => {
    const abrir = () => {
      const g = tomarGuia();
      if (!g) return;
      setGuia(g);
      setSeccion(null);
      setPermisos(true);
    };
    abrir();
    return alPedirGuia(abrir);
  }, []);
  const [tema, setTema] = useState<Tema>(temaActual());
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [token, setToken] = useState<{ nombre: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [clima, setClima] = useState(climaActivado());
  const [encuesta, setEncuesta] = useState(configEncuesta());
  const [recordatorios, setRecordatorios] = useState(recordatoriosActivos());
  // Se guarda en la cuenta (lo manda el servidor), no en el teléfono.
  const [sinAnotar, setSinAnotar] = useState<boolean | null>(null);
  // Si cuenta todo a la noche: null = que Patty se dé cuenta sola (`deNocheVisto` es lo que ve en cómo anota).
  const [deNoche, setDeNoche] = useState<{ elegido: boolean | null; visto: boolean } | null>(null);
  useEffect(() => {
    api<{ avisar_sin_anotar: boolean; cuenta_de_noche: boolean | null; de_noche: boolean }>('GET', '/api/usuarios/yo/preferencias')
      .then((r) => {
        setSinAnotar(r.avisar_sin_anotar);
        setDeNoche({ elegido: r.cuenta_de_noche, visto: r.de_noche });
      })
      .catch(() => setSinAnotar(true));
  }, []);
  const cambiarDeNoche = async (elegido: boolean | null) => {
    try {
      const r = await api<{ cuenta_de_noche: boolean | null; de_noche: boolean }>('PUT', '/api/usuarios/yo/preferencias', { cuenta_de_noche: elegido });
      setDeNoche({ elegido: r.cuenta_de_noche, visto: r.de_noche });
      olvidarDeNoche();
      avisarAnotado();
    } catch (e) {
      setError((e as Error).message);
    }
  };
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
    if (!(await ponerRecordatorios(si))) setError(t('El teléfono no deja mandar avisos a Patty: habilitalos en los ajustes del teléfono.'));
  };
  const cambiarEncuesta = async (c: typeof encuesta) => {
    setEncuesta(c);
    if (!(await ponerEncuesta(c))) setError(t('El teléfono no deja mandar avisos a Patty: habilitalos en los ajustes del teléfono.'));
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
    if (!(await instalarApp())) alert(esIOS() ? t('En el iPhone: tocá Compartir y después «Agregar a inicio».') : t('Desde el menú del navegador: «Instalar app» o «Agregar a la pantalla de inicio».'));
  };

  /** Una sub-pantalla con su título y la flecha para volver al menú. */
  // El título de cada sección lleva el mismo ícono dibujado que en el menú (sin el emoji del texto).
  const ICONO_SECCION: Record<Seccion, () => ReactNode> = {
    salud: () => <IconoSalud />,
    datos: () => <IconoPermisos />,
    clima: () => <IconoClima />,
    telefono: () => <IconoTelefono />,
    reloj: () => <IconoReloj />,
    lugares: () => <IconoLugares />,
    remedios: () => <IconoRemedios />,
    preguntas: () => <IconoPreguntas />,
    seguimientos: () => <IconoSeguimientos />,
    avisos: () => <IconoAvisos />,
    supervision: () => <IconoFamilia />,
    personas: () => <IconoGente />,
    cuenta: () => <IconoCuenta />,
    avanzado: () => <IconoAvanzado />,
  };
  const pantalla = (titulo: string, contenido: ReactNode, sinTituloRepetido = false) => (
    <section className={`mas sub-mas${sinTituloRepetido ? ' sin-titulo-repetido' : ''}`}>
      <div className="cabeza-sub">
        <button className="btn-icono" onClick={() => setSeccion(null)} aria-label={t('Volver')}>‹</button>
        {seccion ? <span className="icono-titulo" aria-hidden>{ICONO_SECCION[seccion]()}</span> : null}
        <h2>{titulo.replace(/^[^\p{L}¿]+/u, '')}</h2>
      </div>
      {contenido}
    </section>
  );

  if (seccion === 'clima') return pantalla(t('Clima'), <>
      <div className="tarjeta">
        <label className="opcion">
          <input type="checkbox" checked={clima} onChange={(e) => {
            ponerClima(e.target.checked);
            setClima(e.target.checked);
            if (e.target.checked) void ubicacion(); // para que el teléfono pida el permiso ahora y no al anotar
          }} />
          <span>{t('Anotar el clima de cada hora donde estás (temperatura, lluvia, viento, sol, presión, aire).')}</span>
        </label>
        <p className="chico ejemplo-permiso">{t('💡 Por ejemplo: «con presión baja te duele más la cabeza» o «los días de lluvia tenés menos energía».')}</p>
        {clima && persona ? (
          <button className="btn primario ancho" disabled={sincronizando} onClick={() => void sincronizar(async () => {
            await anotarClima(persona.id, horasRecientes());
            try {
              localStorage.setItem(CLAVES_SYNC.clima, String(Date.now()));
            } catch {
              /* sin almacenamiento */
            }
          }, t('Listo: el clima de las últimas horas está al día'))}>
            {sincronizando ? t('Sincronizando…') : t('🔄 Sincronizar ahora')}
          </button>
        ) : null}
        {clima ? <UltimaVez ms={leerUltimaVez(CLAVES_SYNC.clima)} /> : null}
      </div>
  </>);
  if (seccion === 'telefono') return pantalla(t('Uso del teléfono'), <>
      {persona && hayDatosDelTelefono() ? <DatosTelefono persona={persona} /> : null}
      {persona && hayDatosDelTelefono() ? <DatosCalendario persona={persona} /> : null}
  </>);
  if (seccion === 'reloj') return pantalla(t('Reloj y salud'), <>
      {persona && esNativa() ? <DatosSalud persona={persona} /> : null}
  </>);
  if (seccion === 'lugares') return pantalla(t('📍 Lugares'), <>
      {persona ? <Lugares persona={persona} puedeEscribir={usuario?.rol !== 'lector'} /> : null}
  </>);
  if (seccion === 'seguimientos') return pantalla(t('Seguimientos'), <>
      {persona ? <Seguimientos persona={persona} puedeEscribir={usuario?.rol !== 'lector'} /> : null}
  </>);
  if (seccion === 'preguntas') return pantalla(t('Preguntas de Patty'), <>
      {persona ? <PreguntasPatty persona={persona} puedeEscribir={usuario?.rol !== 'lector'} /> : null}
  </>);
  if (seccion === 'remedios') return pantalla(t('💊 Remedios'), <>
      {persona ? (
        <>
          <Remedios persona={persona} puedeEscribir={usuario?.rol !== 'lector'} />
        </>
      ) : null}

  </>, true);
  if (seccion === 'avisos') return pantalla(t('🔔 Avisos'), <>
      {plataforma() === 'android' ? (
        <div className="tarjeta">
          <h3>{t('🦉 Widget en la pantalla de inicio')}</h3>
          <p className="suave chico">{t('Anotá cómo te sentís con un toque, o contale algo a Patty con la voz o una foto, sin buscar la app.')}</p>
          <button className="btn" onClick={() => { medir('agregar_widget'); void agregarWidget().then((ok) => !ok && avisar(t('Tu teléfono no deja agregarlo desde acá: mantené apretada la pantalla de inicio, tocá "Widgets" y buscá Patty.'))); }}>
            {t('Agregar el widget')}
          </button>
        </div>
      ) : null}
      <div className="tarjeta">
        <h3>{t('😢 Si no anoté nada')}</h3>
        <label className="opcion">
          <input type="checkbox" checked={sinAnotar ?? true} disabled={sinAnotar === null} onChange={(e) => void cambiarSinAnotar(e.target.checked)} />
          <span>{t('A las 19 h, si no anoté nada en el día, que Patty me lo recuerde.')}</span>
        </label>
        <p className="suave chico">{t('Si pasa más de una semana sin anotar, el aviso llega una vez por semana.')}</p>
      </div>
      {deNoche ? (
        <div className="tarjeta">
          <h3>{t('🌙 Cuento todo a la noche')}</h3>
          <p className="suave chico">{t('Si preferís no anotar nada durante el día y contarle todo junto a Patty a la noche: el búho no te espera durante el día y a la noche te invita a contar tu día.')}</p>
          <select value={deNoche.elegido === null ? 'auto' : deNoche.elegido ? 'si' : 'no'} onChange={(e) => void cambiarDeNoche(e.target.value === 'auto' ? null : e.target.value === 'si')}>
            <option value="auto">{deNoche.elegido === null && deNoche.visto ? t('Que Patty se dé cuenta (ahora: sí)') : t('Que Patty se dé cuenta')}</option>
            <option value="si">{t('Sí, cuento todo a la noche')}</option>
            <option value="no">{t('No, voy anotando durante el día')}</option>
          </select>
        </div>
      ) : null}
      <div className="tarjeta">
        <h3>{t('💊 Recordatorios de remedios')}</h3>
        <label className="opcion">
          <input type="checkbox" checked={recordatorios} onChange={(e) => void cambiarRecordatorios(e.target.checked)} />
          <span>{t('Avisarme a la hora de cada toma, y otra vez a la media hora si no la marqué.')}</span>
        </label>
        {esNativa() && sesion?.push ? (
          <button className="btn chico" onClick={() => void api<{ enviados: number }>('POST', '/api/dispositivos/probar').then((r) => avisar(r.enviados ? t('Te mandé un aviso de prueba') : t('No llegó: revisá los permisos de avisos'))).catch((e: Error) => setError(e.message))}>
            {t('🔔 Mandarme un aviso de prueba')}
          </button>
        ) : null}
        <p className="suave chico">
          {esNativa()
            ? t('Desde el aviso: «La tomé», «En 15 min» o «No la tomo». Con el teléfono bloqueado no se ve el remedio.')
            : t('Los avisos llegan con la app del teléfono. En el Día ves las tomas de hoy para marcarlas.')}
        </p>
      </div>
      <div className="tarjeta">
        <h3>{t('🌙 Encuesta de la noche')}</h3>
        <label className="opcion">
          <input type="checkbox" checked={encuesta.activa} onChange={(e) => void cambiarEncuesta({ ...encuesta, activa: e.target.checked })} />
          <span>{t('Preguntarme cómo me sentí en el día.')}</span>
        </label>
        {encuesta.activa ? (
          <label>
            {t('A las')}
            <input type="time" value={encuesta.hora} onChange={(e) => e.target.value && void cambiarEncuesta({ ...encuesta, hora: e.target.value })} />
          </label>
        ) : null}
        <p className="suave chico">
          {esNativa()
            ? t('Llega un aviso a esa hora; si no contestás, el Día te pregunta hasta las 5 de la mañana.')
            : t('Desde esa hora, el Día te pregunta cómo te sentiste (y en el teléfono llega un aviso).')}
        </p>
        {error ? <p className="neg">{error}</p> : null}
      </div>

  </>);
  if (seccion === 'supervision') return pantalla(t('👨‍👩‍👧 Familia'), <>
      <Supervision />
  </>, true);
  if (seccion === 'personas') return pantalla(t('👥 Tu gente y personas'), <>
      {persona ? <Gente persona={persona} puedeEscribir={usuario?.rol !== 'lector'} /> : null}
      <div className="tarjeta">
        <p className="suave chico">{t('De quién se anota el día. Tocá una para cambiar.')}</p>
        <ul className="lista">
          {personas.map((p) => (
            <li key={p.id} onClick={() => elegirPersona(p.id)} className={p.id === persona?.id ? 'marcada' : ''}>
              <span className="que">{p.nombre}</span>
              <span className="suave chico">{p.id === persona?.id ? t('✓ elegida') : p.supervisada ? t('tu familia') : ''}</span>
            </li>
          ))}
        </ul>
        {nueva ? <NuevaPersona alTerminar={() => setNueva(false)} /> : usuario?.rol !== 'lector' ? <button className="btn ancho" onClick={() => setNueva(true)}>{t('＋ Agregar persona')}</button> : null}
      </div>
  </>);
  if (seccion === 'salud') return pantalla(t('🩺 Tus datos de salud'), <>
      {/* Los datos se completan acá mismo, a la vista (sin otra tarjeta que abrir). */}
      {persona ? (
        usuario?.rol !== 'lector' ? (
          <Perfil key={persona.id} persona={persona} enLinea alTerminar={() => {}} />
        ) : (
          <div className="tarjeta">
            <h3>{t('🩺 Datos de {nombre}', { nombre: persona.nombre })}</h3>
            <p className="suave chico">{perfilTexto(persona, new Date(), idioma()) || t('Sin datos todavía.')}</p>
          </div>
        )
      ) : null}
  </>, true);
  if (seccion === 'cuenta') return pantalla(t('👤 Tu cuenta'), <>
      <Cuenta />
      <UsoIaMio />
      <div className="tarjeta">
        <h3>{t('🎨 Tema')}</h3>
        <div className="segmentos ancho">
          {(['auto', 'claro', 'oscuro'] as Tema[]).map((x) => (
            <button key={x} className={tema === x ? 'activa' : ''} onClick={() => { ponerTema(x); setTema(x); }}>{x === 'auto' ? t('Automático') : x === 'claro' ? t('Claro') : t('Oscuro')}</button>
          ))}
        </div>
      </div>
      <div className="tarjeta">
        <h3>{t('🌐 Idioma')}</h3>
        <div className="segmentos ancho">
          {(['auto', 'es', 'en'] as const).map((x) => (
            <button key={x} className={idiomaElegido() === x ? 'activa' : ''} onClick={() => ponerIdioma(x)}>{x === 'auto' ? t('Automático') : x === 'es' ? 'Español' : 'English'}</button>
          ))}
        </div>
      </div>

      <div className="tarjeta">
        <h3>{t('🦉 El tour de Patty')}</h3>
        <p className="suave chico">{t('Volvé a ver para qué sirve cada parte de la app.')}</p>
        <button className="btn" onClick={() => { window.dispatchEvent(new CustomEvent('patty-ir-al-dia')); verTour(); }}>{t('Ver el tour')}</button>
      </div>
      <BorrarCuenta />
  </>);
  if (seccion === 'avanzado') return pantalla(t('⚙️ Otros dispositivos'), <>
      {usuario?.rol !== 'lector' ? (
        <div className="avanzado">
          <p className="suave chico">
            {t('Para un reloj, un atajo del teléfono o un servicio que mande datos por su cuenta a')}{' '}
            <code>{(API_BASE || location.origin) + '/api/ingesta'}</code>. {t('Cada uno con su token. La app ya manda lo suyo: esto es para otros dispositivos.')}
          </p>
          {fuentes.length ? (
            <ul className="lista">
              {fuentes.map((f) => (
                <li key={f.id}>
                  <span className="que">{t(f.nombre)}</span>
                  <span className="suave chico">{f.ultimo_uso ? t('último dato {fecha}', { fecha: new Date(f.ultimo_uso).toLocaleDateString(locale()) }) : t('sin datos')}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {token ? (
            <div className="nota-ia">
              <p>{t('Token de «{nombre}» (se muestra una sola vez):', { nombre: token.nombre })}</p>
              <code className="token">{token.token}</code>
            </div>
          ) : null}
          <div className="columna">
            <button className="btn" onClick={() => nuevaFuente('reloj', 'Reloj')}>{t('⌚ Nuevo token para un reloj')}</button>
            <button className="btn" onClick={() => nuevaFuente('telefono', 'Atajo del teléfono')}>{t('📱 Nuevo token para un atajo')}</button>
          </div>
        </div>
      ) : null}
  </>);

  const opciones: Array<{ clave: Seccion; icono: ReactNode; titulo: string; sub: string; ver?: boolean; accion?: () => void }> = [
    { clave: 'salud', icono: <IconoSalud />, titulo: t('Tus datos de salud'), sub: t('Edad, peso, altura y condiciones'), ver: Boolean(persona) },
    { clave: 'datos', icono: <IconoPermisos />, titulo: t('Permisos de este teléfono'), sub: t('Avisos, ubicación, uso del teléfono y salud'), ver: esNativa() && Boolean(persona), accion: () => setPermisos(true) },
    { clave: 'clima', icono: <IconoClima />, titulo: t('Clima'), sub: t('El clima de cada hora donde estás') },
    { clave: 'telefono', icono: <IconoTelefono />, titulo: t('Uso del teléfono'), sub: t('Pantalla, apps y llamadas'), ver: hayDatosDelTelefono() && Boolean(persona) },
    { clave: 'reloj', icono: <IconoReloj />, titulo: t('Reloj y salud'), sub: t('Sueño, pasos y pulso'), ver: esNativa() && Boolean(persona) },
    { clave: 'lugares', icono: <IconoLugares />, titulo: t('Lugares'), sub: t('Casa, trabajo y los lugares a los que vas'), ver: Boolean(persona) },
    { clave: 'remedios', icono: <IconoRemedios />, titulo: t('Remedios'), sub: t('Tratamientos y tomas'), ver: Boolean(persona) },
    { clave: 'seguimientos', icono: <IconoSeguimientos />, titulo: t('Seguimientos'), sub: t('Más de cerca por unos días: enfermo, panza…'), ver: Boolean(persona) },
    { clave: 'preguntas', icono: <IconoPreguntas />, titulo: t('Preguntas de Patty'), sub: t('El detalle de lo que anotás: café con azúcar…'), ver: Boolean(persona) },
    { clave: 'avisos', icono: <IconoAvisos />, titulo: t('Avisos'), sub: t('Recordatorios, encuesta de la noche') },
    { clave: 'supervision', icono: <IconoFamilia />, titulo: t('Familia'), sub: t('Sumar a tu familia y acompañarse') },
    { clave: 'personas', icono: <IconoGente />, titulo: t('Tu gente y personas'), sub: t('Con quién estás y de quién se anota') },
    { clave: 'cuenta', icono: <IconoCuenta />, titulo: t('Tu cuenta'), sub: t('Foto, apodo, tema, idioma') },
    { clave: 'avanzado', icono: <IconoAvanzado />, titulo: t('Otros dispositivos'), sub: t('Relojes y atajos con token'), ver: usuario?.rol !== 'lector' },
  ];

  return (
    <section className="mas">
      {permisos && persona ? (
        <>
          <div className="velo" onClick={() => { setPermisos(false); setGuia(undefined); }} />
          <Permisos key={guia ?? 'todos'} persona={persona} guia={guia} alTerminar={() => { setPermisos(false); setGuia(undefined); }} />
        </>
      ) : null}
      <ul className="menu-mas">
        {opciones.filter((o) => o.ver !== false).map((o) => (
          <li key={o.clave}>
            <button onClick={() => (o.accion ? o.accion() : setSeccion(o.clave))}>
              <span className="icono-menu" aria-hidden>{o.icono}</span>
              <span className="que">
                <strong>{o.titulo}</strong>
                <span className="suave chico">{o.sub}</span>
              </span>
              <span className="suave" aria-hidden>›</span>
            </button>
          </li>
        ))}
      </ul>
      {usuario?.rol === 'admin' && alAdministrar ? (
        <button className="btn ancho admin-entrar" onClick={alAdministrar}>{t('🛠️ Administración: usuarios y actividad')}</button>
      ) : null}
      {!instalada() && !esNativa() ? <button className="btn ancho" onClick={instalar}>{t('📲 Instalar Patty en el teléfono')}</button> : null}
      <button className="btn ancho salir" onClick={salir}>{t('Salir ({nombre})', { nombre: usuario?.nombre ?? '' })}</button>
      <p className="version-app">
        Patty {VERSION}{COMMIT ? ` · ${COMMIT}` : ''}{nativa && nativa !== VERSION ? ` · ${t('app instalada {v}', { v: nativa })}` : ''}
      </p>
    </section>
  );
}
