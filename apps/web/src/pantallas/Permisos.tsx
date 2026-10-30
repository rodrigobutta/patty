// "Para que Patty te ayude más": activar, uno por uno y explicado, lo que la app puede hacer sola (avisos, ubicación,
// uso del teléfono y llamadas, salud). Se ofrece una vez después de la bienvenida (todo salteable) y se puede volver a
// abrir desde Más. Cada fila dice para qué sirve, tiene su botón y queda tildada cuando el permiso está dado; al volver
// de los ajustes del teléfono se vuelve a mirar. «¿Cómo lo activo?» muestra los pasos exactos para la marca del teléfono
// (se abre solo al tocar el aviso de un permiso que falta).
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { useCallback, useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { permisoAvisos } from '../lib/avisos';
import { ponerClima } from '../lib/clima';
import { leerEstado, reportarEstado, type EstadoTelefono } from '../lib/estadoTelefono';
import { esNativa, plataforma } from '../lib/nativo';
import { programarRecordatorios } from '../lib/remedios';
import { pedirPermisoSalud, ponerSalud, sincronizarSalud } from '../lib/salud';
import { hayDatosDelTelefono, ponerDatos, sincronizar, Telefono } from '../lib/telefono';
import { ponerSeguimiento } from '../lib/ubicacion';
import { Mascota } from '../mascota/Mascota';
import { t } from '../lib/idioma';
import { Escucha, escuchasActivadas, hayEscuchas, permisoEscuchas, ponerEscuchas, sincronizarEscuchas } from '../lib/escuchas';
import { IconoCampana, IconoCategoria } from '../ui/IconosPatty';
import { funcionesAvisos, hayAvisosTelefono, ponerFuncionAvisos, sincronizarAvisos } from '../lib/avisosTelefono';
import { FUNCIONES_AVISOS, type FuncionAvisos, type FuncionesAvisos } from 'shared';
import type { ReactNode } from 'react';
import { averiguarMarca, marcaDelTelefono, NOMBRE_MARCA, pasosPara } from '../lib/guiasPermisos';

const CLAVE = 'permisos-ofrecidos';

/** Si todavía no se ofreció este paso en este teléfono (solo en la app nativa: en la web casi no hay permisos). */
export function ofrecerPermisos(): boolean {
  if (!esNativa()) return false;
  try {
    return localStorage.getItem(CLAVE) !== 'si';
  } catch {
    return false;
  }
}
const yaOfrecido = () => {
  try {
    localStorage.setItem(CLAVE, 'si');
  } catch {
    /* sin almacenamiento */
  }
};

export type Paso = 'avisos' | 'ubicacion' | 'telefono' | 'salud';
/**
 * Las filas de esta pantalla: los pasos y, aparte (no son una fuente del Día), lo que suena en el teléfono y lo que
 * avisan las apps (los dos con el acceso a las notificaciones de Android).
 */
type Fila = Paso | 'escuchas' | 'notificaciones';

/** Lo que hace cada interruptor de «Lo que avisan las apps» y qué lee exactamente. */
const FUNCIONES: Record<FuncionAvisos, { titulo: string; lee: string }> = {
  interrupciones: {
    titulo: 'Interrupciones',
    lee: 'Cuántos avisos te llegan por día y por hora, qué apps avisan más y cuáles sonaron de noche (de 23 a 7). Solo la app y la hora: nunca el texto.',
  },
  social: {
    titulo: 'Vida social',
    lee: 'Cuántos mensajes recibís en WhatsApp, Telegram, Instagram, Messenger, Signal y SMS. Solo cuántos: nunca de quién ni qué dicen.',
  },
  pedidos: {
    titulo: 'Comida pedida',
    lee: 'Cuando PedidosYa, Rappi o Uber Eats avisan que tu pedido está en camino o llegó, Patty te pregunta qué fue para anotarlo. El aviso se lee en el teléfono y solo sale «llegó un pedido».',
  },
  viajes: {
    titulo: 'Viajes en apps',
    lee: 'Los avisos de Uber, Cabify y DiDi de que llega el auto o terminó el viaje, para marcar tus viajes «en Uber». Se leen en el teléfono y solo sale la app y la hora.',
  },
  ejercicio: {
    titulo: 'Ejercicio',
    lee: 'Cuando Strava, Nike Run Club, Garmin, Samsung Health, Google Fit o adidas Running avisan que terminaste un entrenamiento, se anota solo (con los minutos y los km si el aviso los dice), salvo que ya esté anotado.',
  },
};

/** El aviso push de un permiso que falta se tocó: Más abre los permisos con los pasos de ese a la vista. */
let guiaPendiente: Paso | null = null;
const EVENTO_GUIA = 'patty-guia-permiso';
export function pedirGuia(p: Paso): void {
  guiaPendiente = p;
  window.dispatchEvent(new Event(EVENTO_GUIA));
}
/** Para Más: la guía pedida (se consume al leerla) y avisar cuando llegue otra. */
export function tomarGuia(): Paso | null {
  const g = guiaPendiente;
  guiaPendiente = null;
  return g;
}
export function alPedirGuia(f: () => void): () => void {
  window.addEventListener(EVENTO_GUIA, f);
  return () => window.removeEventListener(EVENTO_GUIA, f);
}

/**
 * Pide un permiso y prende lo que va con él. Devuelve una nota si falta algo (un paso en los ajustes del teléfono) o
 * si no se pudo. Lo usan esta pantalla y los widgets grises del Día.
 */
export async function activarPermiso(paso: Paso, persona: Persona): Promise<string | void> {
  if (paso === 'avisos') {
    if (!(await permisoAvisos())) return t('El teléfono no lo dejó: activalo en Ajustes → Notificaciones → Patty.');
    await programarRecordatorios();
    return;
  }
  if (paso === 'ubicacion') {
    const p = await BackgroundGeolocation.requestPermissions().catch(() => null);
    ponerClima(true);
    ponerSeguimiento(true);
    const fondo = p?.backgroundLocation === 'granted' || (p?.backgroundLocation as string) === 'always';
    if (!fondo) {
      return plataforma() === 'ios'
        ? t('Para contar viajes con la app cerrada, en Ajustes → Patty → Ubicación elegí «Siempre».')
        : t('Para contar viajes con la app cerrada, en los ajustes elegí «Permitir todo el tiempo».');
    }
    return;
  }
  if (paso === 'telefono') {
    ponerDatos(true);
    const p = await Telefono.pedirPermisoLlamadas().catch(() => null);
    if (p?.uso !== 'granted') {
      // El acceso al uso de apps se da en una pantalla de Ajustes: se abre y al volver se mira de nuevo.
      await Telefono.pedirPermisoUso();
      return t('En la lista que se abre, buscá Patty y activá «Permitir acceso al uso». Después volvé acá.');
    }
    void sincronizar(persona.id).catch(() => {});
    return;
  }
  ponerSalud(true);
  const r = await pedirPermisoSalud();
  if (!r.disponible) {
    return plataforma() === 'android'
      ? t('Este teléfono no tiene Health Connect. Se instala desde Play Store (es de Google) y después volvés acá.')
      : t('Este teléfono no tiene Salud disponible.');
  }
  if (!r.permitidos.length) return t('No se dio permiso a ningún dato. Podés volver a intentarlo cuando quieras.');
  void sincronizarSalud(persona.id).catch(() => {});
  return plataforma() === 'android' ? t('Listo. Si usás un reloj, revisá que su app comparta los datos con Health Connect.') : undefined;
}

/** Si el permiso ya está dado del todo (la ubicación, "siempre"; el teléfono, uso y llamadas). */
export function permisoListo(paso: Paso, e: EstadoTelefono | null): boolean {
  const p = e?.permisos;
  if (!p) return false;
  if (paso === 'avisos') return p.avisos === 'si';
  if (paso === 'ubicacion') return p.ubicacion === 'siempre';
  if (paso === 'telefono') return p.uso_apps === 'si' && p.llamadas === 'si';
  return typeof p.salud === 'number' && p.salud > 0;
}

export function Permisos({ persona, bienvenida = false, guia, alTerminar }: { persona: Persona; bienvenida?: boolean; guia?: Paso; alTerminar(): void }) {
  const [abierta, setAbierta] = useState<Fila | null>(guia ?? null);
  const [marca, setMarca] = useState(marcaDelTelefono());
  useEffect(() => void averiguarMarca().then(setMarca), []);
  const [estado, setEstado] = useState<EstadoTelefono | null>(null);
  const [ocupado, setOcupado] = useState<Fila | null>(null);
  const [nota, setNota] = useState<Partial<Record<Fila, string>>>({});
  /** Lo que suena: si el teléfono dio el acceso a las notificaciones y si está prendido en Patty. */
  const [escuchas, setEscuchas] = useState({ permiso: false, activo: escuchasActivadas() });
  /** Los interruptores de lo que avisan las apps (null: la app instalada es vieja y no los tiene). */
  const [funciones, setFunciones] = useState<FuncionesAvisos | null>(null);

  const mirar = useCallback(() => {
    void leerEstado().then(setEstado);
    void permisoEscuchas().then((permiso) => setEscuchas({ permiso, activo: escuchasActivadas() }));
    void funcionesAvisos().then(setFunciones);
  }, []);
  // Al volver de los ajustes del teléfono se vuelve a mirar.
  useEffect(() => {
    mirar();
    const f = () => document.visibilityState === 'visible' && mirar();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [mirar]);

  const hacer = async (paso: Fila, f: () => Promise<string | void>) => {
    setOcupado(paso);
    try {
      const n = await f();
      setNota((x) => ({ ...x, [paso]: n ?? '' }));
    } catch (e) {
      setNota((x) => ({ ...x, [paso]: (e as Error).message }));
    } finally {
      setOcupado(null);
      mirar();
    }
  };

  const avisos = () => hacer('avisos', () => activarPermiso('avisos', persona));
  const ubicacion = () => hacer('ubicacion', () => activarPermiso('ubicacion', persona));
  const telefono = () => hacer('telefono', () => activarPermiso('telefono', persona));
  const salud = () => hacer('salud', () => activarPermiso('salud', persona));
  const escuchar = () =>
    hacer('escuchas', async () => {
      const n = await ponerEscuchas(true);
      if (!n) void sincronizarEscuchas(persona.id).catch(() => {});
      return n;
    });
  const dejarDeEscuchar = () => hacer('escuchas', async () => void (await ponerEscuchas(false)));
  /** Lo que avisan las apps: el permiso es el mismo que el de lo que suena (se da en Ajustes). */
  const leerAvisos = () =>
    hacer('notificaciones', async () => {
      if (!funciones) return t('Para esto hace falta la última versión de la app.');
      if (!(await permisoEscuchas())) {
        await Escucha.pedirPermiso().catch(() => {});
        return t('En la lista que se abre, buscá Patty y activá el acceso a las notificaciones. Después volvé acá.');
      }
      // Con el acceso dado, si estaban todas apagadas, se prenden todas.
      if (!FUNCIONES_AVISOS.some((f) => funciones[f])) for (const f of FUNCIONES_AVISOS) setFunciones(await ponerFuncionAvisos(f, true));
      void sincronizarAvisos(persona.id).catch(() => {});
    });
  const cambiarFuncion = async (f: FuncionAvisos, prendida: boolean) => {
    const r = await ponerFuncionAvisos(f, prendida);
    if (r) setFunciones(r);
  };

  const terminar = () => {
    yaOfrecido();
    void reportarEstado(true);
    alTerminar();
  };

  const p = estado?.permisos;
  const algunaAvisos = funciones !== null && FUNCIONES_AVISOS.some((f) => funciones[f]);
  const filas: Array<{ paso: Fila; icono: ReactNode; titulo: string; para: string; ejemplo: string; listo: boolean; parcial?: boolean; accion(): void; apagar?(): void; mostrar: boolean; extra?: ReactNode }> = [
    {
      paso: 'avisos',
      ejemplo: t('💡 Así no se te pasa ningún remedio, y contestás cómo te sentís desde el mismo aviso.'),
      icono: '🔔',
      titulo: t('Avisos'),
      para: t('Para recordarte cada toma de un remedio y preguntarte a la noche cómo te fue.'),
      listo: p?.avisos === 'si',
      accion: avisos,
      mostrar: true,
    },
    {
      paso: 'ubicacion',
      ejemplo: t('💡 Patty puede descubrir cosas como «los días que vas a la oficina dormís peor», y cruzar el calor, la humedad o la presión con tus dolores.'),
      icono: '📍',
      titulo: t('Ubicación'),
      para: t('Para anotar el clima de cada momento y contar tus viajes y lugares, sola.'),
      listo: p?.ubicacion === 'siempre',
      parcial: p?.ubicacion === 'en_uso',
      accion: ubicacion,
      mostrar: true,
    },
    {
      paso: 'telefono',
      ejemplo: t('💡 Por ejemplo: «los días con más de 4 h de pantalla te cuesta dormir» o «cuando hablás más con gente, te sentís mejor».'),
      icono: '📱',
      titulo: t('Uso del teléfono y llamadas'),
      para: t('Cuánto usás cada app y cuántas llamadas hacés (nunca números ni nombres).'),
      listo: p?.uso_apps === 'si' && p?.llamadas === 'si',
      parcial: p?.uso_apps === 'si' || p?.llamadas === 'si',
      accion: telefono,
      mostrar: hayDatosDelTelefono(),
    },
    {
      paso: 'escuchas',
      ejemplo: t('💡 Así Patty puede ver cosas como «los días que escuchás más música dormís mejor». Para esto solo mira qué suena.'),
      icono: <IconoCategoria clave="musica" tamano={28} />,
      titulo: t('Qué estás escuchando o mirando'),
      para: t('La música, los podcasts y las series que suenan en el teléfono (Spotify, YouTube Music, Netflix…): título, artista y cuánto. Android lo llama «acceso a las notificaciones».'),
      listo: escuchas.permiso && escuchas.activo,
      parcial: escuchas.activo,
      accion: escuchar,
      apagar: dejarDeEscuchar,
      mostrar: hayEscuchas(),
    },
    {
      paso: 'notificaciones',
      ejemplo: t('Así Patty puede ver cosas como «los días con muchas notificaciones estás más ansioso», «las noches con avisos dormís peor» o «cuando charlás más, estás de mejor ánimo».'),
      icono: <IconoCampana tamano={28} />,
      titulo: t('Lo que avisan las apps'),
      para: t('Con el mismo «acceso a las notificaciones»: cada cosa se prende o se apaga por separado. El texto de tus avisos nunca sale del teléfono.'),
      listo: escuchas.permiso && algunaAvisos,
      parcial: escuchas.permiso,
      accion: leerAvisos,
      mostrar: hayAvisosTelefono(),
      extra:
        funciones && escuchas.permiso ? (
          <span className="funciones-avisos">
            {FUNCIONES_AVISOS.map((f) => (
              <label key={f} className="opcion">
                <input type="checkbox" checked={funciones[f]} disabled={ocupado !== null} onChange={(e) => void cambiarFuncion(f, e.target.checked)} />
                <span>
                  <strong>{t(FUNCIONES[f].titulo)}</strong>
                  <span className="suave chico renglon-sub">{t(FUNCIONES[f].lee)}</span>
                </span>
              </label>
            ))}
          </span>
        ) : null,
    },
    {
      paso: 'salud',
      ejemplo: t('💡 Sin anotar nada, cómo dormiste y cuánto te moviste se cruzan con tu ánimo, tus dolores y lo que comiste.'),
      icono: '⌚',
      titulo: plataforma() === 'ios' ? t('Salud') : t('Reloj y salud'),
      para: t('Tu sueño, pasos y pulso, desde el reloj o el teléfono.'),
      listo: typeof p?.salud === 'number' && p.salud > 0,
      accion: salud,
      mostrar: true,
    },
  ];
  const visibles = filas.filter((f) => f.mostrar);
  const listos = visibles.filter((f) => f.listo).length;

  return (
    <div className={bienvenida ? 'perfil perfil-bienvenida permisos' : 'hoja perfil permisos'} role={bienvenida ? undefined : 'dialog'} aria-label={t('Permisos')}>
      <div className="hoja-cabeza">
        <h3>{bienvenida ? t('Para que te ayude más') : t('Permisos de este teléfono')}</h3>
        {bienvenida ? <button className="enlace" onClick={terminar}>{t('Ahora no')}</button> : <button className="btn-icono" onClick={terminar} aria-label={t('Cerrar')}>✕</button>}
      </div>
      <p className="suave chico">
        {t('Así Patty junta datos sola y te avisa. Todo opcional: activalo ahora o después desde Más.')}
      </p>
      <ul className="lista-permisos">
        {visibles.map((f) => (
          <li key={f.paso} className={f.listo ? 'listo' : ''}>
            <span className="icono-permiso">{f.icono}</span>
            <span className="que">
              <strong>{f.titulo}</strong>
              <span className="suave chico renglon-sub">{f.para}</span>
              <span className="chico renglon-sub ejemplo-permiso">{f.ejemplo}</span>
              {nota[f.paso] ? <span className="chico renglon-sub nota-permiso">{nota[f.paso]}</span> : null}
              {f.extra}
              {pasosPara(f.paso === 'notificaciones' ? 'escuchas' : f.paso, marca).length ? (
                <button className="enlace chico como-activar" onClick={() => setAbierta(abierta === f.paso ? null : f.paso)} aria-expanded={abierta === f.paso}>
                  {abierta === f.paso ? t('Ocultar los pasos') : t('¿Cómo lo activo?')}
                </button>
              ) : null}
              {abierta === f.paso ? (
                <span className="guia-permiso" ref={(el) => { if (el && guia === f.paso) el.scrollIntoView({ block: 'center' }); }}>
                  <span className="suave chico">{t('En tu {marca}:', { marca: NOMBRE_MARCA[marca] })}</span>
                  <ol>{pasosPara(f.paso === 'notificaciones' ? 'escuchas' : f.paso, marca).map((x) => <li key={x}>{x}</li>)}</ol>
                </span>
              ) : null}
            </span>
            {f.listo ? (
              <span className="listo-permiso">
                <span className="tilde" aria-label={t('Activado')}>✓</span>
                {f.apagar ? <button className="enlace chico" disabled={ocupado !== null} onClick={f.apagar}>{t('Apagar')}</button> : null}
              </span>
            ) : (
              <button className={`btn chico ${f.parcial ? '' : 'primario'}`} disabled={ocupado !== null} onClick={f.accion}>
                {ocupado === f.paso ? '…' : f.parcial ? t('Completar') : t('Activar')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {listos === visibles.length ? (
        <div className="todo-listo">
          <Mascota cara="feliz" tamano={44} />
          <span>{t('¡Todo listo! Ya puedo ayudarte un montón.')}</span>
        </div>
      ) : null}
      <button className="btn primario ancho" onClick={terminar}>{listos ? t('Listo') : t('Seguir sin activar')}</button>
    </div>
  );
}
