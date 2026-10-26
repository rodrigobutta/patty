// Administración (solo administradores): cómo viene el uso mientras se prueba. Resumen con números y actividad por día,
// usuarios (con su último acceso y lo que anotan; se crean, desactivan y se les cambia el rol o la clave) y lo último
// que se anotó en toda la app. Se entra desde Más, o con patty.today/#admin en la compu.
import { useCallback, useEffect, useState } from 'react';
import { conUnidad } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { idioma, locale, t } from '../lib/idioma';
import { Avatar } from '../ui/Avatar';
import { VERSION } from '../lib/version';
import type { VersionApp } from 'shared';

interface Resumen {
  usuarios: number;
  activos_hoy: number;
  activos_semana: number;
  personas: number;
  registros_hoy: number;
  registros_semana: number;
  registros_total: number;
  mediciones_hoy: number;
  telefonos_android: number;
  telefonos_ios: number;
  tratamientos_activos: number;
  supervisiones: number;
  analisis_semana: number;
  por_dia: Array<{ fecha: string; registros: number; usuarios: number }>;
}

interface FilaUsuario {
  id: number;
  usuario: string;
  nombre: string;
  email: string | null;
  foto?: string | null;
  rol: 'admin' | 'editor' | 'lector';
  activo: boolean;
  creado: string;
  ultimo_acceso: string | null;
  personas: number;
  registros: number;
  registros_semana: number;
  ultimo_registro: string | null;
  telefonos: string | null;
  supervisa: number;
  supervisado: number;
  instalacion: Instalacion | null;
}

interface Instalacion {
  plataforma: string;
  estado: {
    permisos: { avisos?: string; ubicacion?: string; uso_apps?: string; llamadas?: string; salud?: number | string };
    activos: Record<string, boolean>;
    ultimos: { telefono?: string | null; salud?: string | null };
    version?: { web?: string | null; commit?: string | null; app?: string | null };
  };
  creado?: string;
  actualizado: string;
}

/** La versión de la web (y de la app instalada, si es la nativa); en ámbar si es más vieja que la de ahora. */
function VersionDe({ v }: { v: NonNullable<Instalacion['estado']['version']> }) {
  const vieja = (x?: string | null) => Boolean(x) && x !== VERSION && x!.localeCompare(VERSION, undefined, { numeric: true }) < 0;
  return (
    <span className={vieja(v.web) || vieja(v.app) ? 'version-vieja' : ''}>
      v{v.web}{v.app && v.app !== v.web ? ` (${t('app {v}', { v: v.app })})` : ''}
    </span>
  );
}

/** Los permisos de un dispositivo en chips: verde lo dado, ámbar a medias, gris lo que falta. */
function ChipsPermisos({ i }: { i: Instalacion }) {
  const p = i.estado.permisos ?? {};
  const a = i.estado.activos ?? {};
  const chips: Array<[string, 'si' | 'medio' | 'no' | null]> = [
    [t('🔔 avisos'), p.avisos === 'si' ? 'si' : p.avisos === 'no_aplica' ? null : 'no'],
    [p.ubicacion === 'siempre' ? t('📍 ubicación siempre') : p.ubicacion === 'en_uso' ? t('📍 ubicación solo abierta') : t('📍 ubicación'), p.ubicacion === 'siempre' ? 'si' : p.ubicacion === 'en_uso' ? 'medio' : 'no'],
    [t('📱 uso de apps'), p.uso_apps === 'no_aplica' || p.uso_apps === undefined ? null : p.uso_apps === 'si' ? 'si' : 'no'],
    [t('📞 llamadas'), p.llamadas === 'no_aplica' || p.llamadas === undefined ? null : p.llamadas === 'si' ? 'si' : 'no'],
    [typeof p.salud === 'number' && p.salud > 0 ? t('⌚ salud ({n} datos)', { n: p.salud }) : t('⌚ salud'), p.salud === 'no_aplica' ? null : typeof p.salud === 'number' && p.salud > 0 ? 'si' : 'no'],
    ['🚀 push', a.push ? 'si' : i.plataforma === 'web' ? null : 'no'],
  ];
  const prendidos = Object.entries(a).filter(([k, v]) => v && k !== 'push').map(([k]) => k);
  return (
    <span className="chips-permisos">
      {chips.filter(([, e]) => e !== null).map(([c, e]) => <span key={c} className={`chip-permiso ${e}`}>{c}</span>)}
      {prendidos.length ? <span className="suave chico renglon-sub">{t('prendido en Patty: {lista}', { lista: prendidos.join(', ') })}</span> : null}
    </span>
  );
}

interface Registro {
  id: number;
  inicio: string;
  creado: string;
  origen: string;
  valor: number | null;
  unidad: string | null;
  intensidad: number | null;
  nota?: string | null;
  concepto: string;
  icono: string;
  persona: string;
  usuario?: string;
}

interface Detalle {
  usuario: FilaUsuario;
  personas: Array<{
    id: number;
    nombre: string;
    rol: string;
    nacimiento: string | null;
    sexo: string | null;
    altura_cm: number | null;
    peso_kg: number | null;
    condiciones: string[];
    registros: number;
    dias: number;
    mediciones: number;
    fuentes: string | null;
    por_dia: Array<{ fecha: string; n: number }>;
  }>;
  ultimos: Registro[];
  telefonos: Array<{ plataforma: string; avisos_hasta: string | null; creado: string; actualizado: string }>;
  instalaciones: Instalacion[];
  tratamientos: Array<{ id: number; remedio: string; dosis: number | null; unidad: string | null; cada_horas: number | null; horarios: string[]; fin: string | null; terminado: string | null; persona: string }>;
  supervisiones: Array<{ estado: string; relacion: string; otro: string }>;
  analisis: Array<{ id: number; persona_id: number; origen: 'manual' | 'noche'; creado: string; dias: number; resumen: string | null; sugerencias: string[] | null; nuevos: number; hallazgos: number }>;
  hallazgos: Array<{ id: number; persona_id: number; explicacion: string | null; estado: string; causa: string; efecto: string }>;
  avisos: Array<{ id: number; tipo: string | null; titulo: string; cuerpo: string; resultado: string; creado: string }>;
}

/** "hace 5 min", "hace 3 h", "ayer", "hace 4 días" */
function hace(iso: string | null): string {
  if (!iso) return t('nunca');
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return t('recién');
  if (s < 3600) return t('hace {n} min', { n: Math.round(s / 60) });
  if (s < 86400) return t('hace {n} h', { n: Math.round(s / 3600) });
  if (s < 172800) return t('ayer');
  return t('hace {n} días', { n: Math.round(s / 86400) });
}
const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
/** "1 anotación", "3 anotaciones" */
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? t(uno) : t(varios)}`;
const valorDe = (r: Registro) =>
  r.intensidad !== null ? `${r.intensidad}/10` : r.valor !== null ? conUnidad(r.valor, r.unidad, 2, idioma()) : '';

function Barritas({ datos, alto = 60 }: { datos: number[]; alto?: number }) {
  const max = Math.max(1, ...datos);
  return (
    <div className="barras-dias" style={{ height: alto }}>
      {datos.map((n, i) => <span key={i} className={n ? '' : 'cero'} style={{ height: `${(n / max) * 100}%`, ['--i' as string]: i }} title={String(n)} />)}
    </div>
  );
}

export function Admin({ alVolver }: { alVolver(): void }) {
  const [vista, setVista] = useState<'resumen' | 'usuarios' | 'actividad' | 'avisos'>('resumen');
  const [elegido, setElegido] = useState<number | null>(null);
  return (
    <section className="admin">
      <div className="admin-cabeza">
        <button className="btn-icono" onClick={alVolver} aria-label={t('Volver')}>‹</button>
        <h2>{t('🛠️ Administración')}</h2>
      </div>
      <div className="segmentos ancho subvistas">
        <button className={vista === 'resumen' ? 'activa' : ''} onClick={() => { setVista('resumen'); setElegido(null); }}>{t('Resumen')}</button>
        <button className={vista === 'usuarios' ? 'activa' : ''} onClick={() => setVista('usuarios')}>{t('Usuarios')}</button>
        <button className={vista === 'actividad' ? 'activa' : ''} onClick={() => { setVista('actividad'); setElegido(null); }}>{t('Actividad')}</button>
        <button className={vista === 'avisos' ? 'activa' : ''} onClick={() => { setVista('avisos'); setElegido(null); }}>{t('📣 Avisos')}</button>
      </div>
      {vista === 'avisos' ? <VistaAvisos /> : vista === 'resumen' ? <VistaResumen /> : vista === 'actividad' ? <VistaActividad /> : elegido ? <DetalleUsuario id={elegido} alVolver={() => setElegido(null)} /> : <VistaUsuarios alElegir={setElegido} />}
    </section>
  );
}

/** Mandar un aviso a un usuario o a todos, y publicar la versión nueva de la app de Android (avisando a quien la tiene vieja). */
function VistaAvisos() {
  const { avisar } = useEstado();
  const [usuarios, setUsuarios] = useState<FilaUsuario[]>([]);
  const [para, setPara] = useState('');
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mandando, setMandando] = useState(false);
  const [version, setVersion] = useState<{ actual: VersionApp | null; desactualizados: number | null } | null>(null);
  const [nueva, setNueva] = useState({ version: VERSION, url: '' });
  const [avisarViejos, setAvisarViejos] = useState(true);
  const [error, setError] = useState('');
  const traerVersion = () =>
    void api<{ actual: VersionApp | null; desactualizados: number | null }>('GET', '/api/admin/version-app')
      .then((v) => {
        setVersion(v);
        if (v.actual) setNueva((n) => ({ ...n, url: n.url || v.actual!.url }));
      })
      .catch(() => {});
  useEffect(() => {
    void api<FilaUsuario[]>('GET', '/api/admin/usuarios').then(setUsuarios).catch(() => {});
    traerVersion();
  }, []);

  const mandar = async () => {
    if (!mensaje.trim()) return;
    const quien = para ? usuarios.find((u) => String(u.id) === para)?.nombre : t('todos');
    if (!confirm(t('¿Mandar el aviso a {quien}?', { quien: quien ?? '' }))) return;
    setMandando(true);
    setError('');
    try {
      const r = await api<{ enviados: number; telefonos: number }>('POST', '/api/admin/avisos', { usuario_id: para ? Number(para) : null, titulo, cuerpo: mensaje });
      avisar(t('Llegó a {n} de {total} teléfonos', { n: r.enviados, total: r.telefonos }));
      setMensaje('');
      setTitulo('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMandando(false);
    }
  };

  const publicar = async () => {
    setError('');
    try {
      const r = await api<{ desactualizados: number; enviados: number }>('PUT', '/api/admin/version-app', { ...nueva, avisar: avisarViejos });
      avisar(avisarViejos ? t('Publicada. Avisé a {n} teléfonos con la app vieja', { n: r.enviados }) : t('Publicada'));
      traerVersion();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="tarjeta">
        <h3>{t('📣 Mandar un aviso')}</h3>
        <label>
          {t('A quién')}
          <select value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">{t('A todos')}</option>
            {usuarios.filter((u) => u.activo).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <label>{t('Título (opcional)')}<input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Patty" /></label>
        <label>{t('Mensaje')}<textarea rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={400} /></label>
        <button className="btn primario ancho" disabled={mandando || !mensaje.trim()} onClick={() => void mandar()}>{mandando ? t('Mandando…') : t('Mandar')}</button>
      </div>
      <div className="tarjeta">
        <h3>{t('📲 Versión de la app')}</h3>
        <p className="suave chico">
          {version?.actual
            ? t('Publicada: {v}. Con una más vieja: {n} usuarios.', { v: version.actual.version, n: version.desactualizados ?? 0 })
            : t('Todavía no se publicó ninguna versión.')}
        </p>
        <label>{t('Versión')}<input value={nueva.version} onChange={(e) => setNueva({ ...nueva, version: e.target.value.trim() })} placeholder="1.4.0" /></label>
        <label>{t('Link para bajar el APK')}<input value={nueva.url} onChange={(e) => setNueva({ ...nueva, url: e.target.value.trim() })} placeholder="https://…" /></label>
        <label className="opcion">
          <input type="checkbox" checked={avisarViejos} onChange={(e) => setAvisarViejos(e.target.checked)} />
          <span>{t('Mandar un aviso a quienes tienen una versión más vieja')}</span>
        </label>
        <button className="btn primario ancho" onClick={() => void publicar()}>{t('Publicar versión')}</button>
        <p className="suave chico">{t('Quien tenga una más vieja ve además un cartel en la app para bajarla.')}</p>
      </div>
      {error ? <p className="neg">{error}</p> : null}
    </>
  );
}

function VistaResumen() {
  const [r, setR] = useState<Resumen | null>(null);
  useEffect(() => void api<Resumen>('GET', '/api/admin/resumen').then(setR).catch(() => {}), []);
  if (!r) return <p className="suave centro">{t('Cargando…')}</p>;
  const tiles: Array<[string, number | string, string]> = [
    ['👥', r.usuarios, t('usuarios')],
    ['🟢', `${r.activos_hoy} / ${r.activos_semana}`, t('activos hoy / en la semana')],
    ['📝', r.registros_hoy, t('anotaciones hoy')],
    ['🗓️', r.registros_semana, t('anotaciones en 7 días')],
    ['📚', r.registros_total, t('anotaciones en total')],
    ['📡', r.mediciones_hoy, t('datos automáticos hoy')],
    ['🤖', r.telefonos_android, t('teléfonos Android')],
    ['🍎', r.telefonos_ios, 'iPhone'],
    ['💊', r.tratamientos_activos, t('remedios activos')],
    ['👀', r.supervisiones, t('vínculos de familia')],
    ['🧍', r.personas, t('personas')],
    ['✨', r.analisis_semana, t('búsquedas de patrones (7 días)')],
  ];
  return (
    <>
      <div className="mosaico admin-tiles">
        {tiles.map(([i, n, etiqueta]) => (
          <div key={etiqueta} className="tarjeta dato">
            <span className="icono-dato">{i}</span>
            <strong>{n}</strong>
            <span className="suave chico">{etiqueta}</span>
          </div>
        ))}
      </div>
      <div className="tarjeta">
        <h3>{t('Anotaciones por día')}</h3>
        <Barritas datos={r.por_dia.map((d) => d.registros)} alto={90} />
        <p className="suave chico eje"><span>{t('hace 14 días')}</span><span>{t('hoy')}</span></p>
        <h3>{t('Usuarios que anotaron, por día')}</h3>
        <Barritas datos={r.por_dia.map((d) => d.usuarios)} />
      </div>
    </>
  );
}

function VistaUsuarios({ alElegir }: { alElegir(id: number): void }) {
  const { avisar } = useEstado();
  const [lista, setLista] = useState<FilaUsuario[] | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState('');
  const traer = useCallback(() => api<FilaUsuario[]>('GET', '/api/admin/usuarios').then(setLista).catch((e: Error) => setError(e.message)), []);
  useEffect(() => void traer(), [traer]);

  const crear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await api('POST', '/api/usuarios', d);
      avisar(t('Usuario {usuario} creado', { usuario: String(d.usuario) }));
      setNuevo(false);
      void traer();
    } catch (x) {
      setError((x as Error).message);
    }
  };

  return (
    <>
      {nuevo ? (
        <form className="tarjeta" onSubmit={crear}>
          <h3>{t('Nuevo usuario')}</h3>
          <label>{t('Nombre')}<input name="nombre" required /></label>
          <label>{t('Usuario (para entrar)')}<input name="usuario" required autoCapitalize="none" /></label>
          <label>{t('Mail (opcional, para entrar con Google)')}<input name="email" type="email" autoCapitalize="none" /></label>
          <label>{t('Clave inicial')}<input name="clave" required minLength={6} /></label>
          <label>
            {t('Rol')}
            <select name="rol" defaultValue="editor">
              <option value="editor">{t('Usuario normal')}</option>
              <option value="lector">{t('Solo mirar')}</option>
              <option value="admin">{t('Administrador')}</option>
            </select>
          </label>
          {error ? <p className="neg">{error}</p> : null}
          <div className="fila">
            <button type="button" className="btn" onClick={() => setNuevo(false)}>{t('Cancelar')}</button>
            <button className="btn primario">{t('Crear')}</button>
          </div>
        </form>
      ) : (
        <button className="btn ancho" onClick={() => setNuevo(true)}>{t('＋ Nuevo usuario')}</button>
      )}
      {!nuevo && error ? <p className="neg">{error}</p> : null}
      {lista ? (
        <ul className="lista admin-usuarios">
          {lista.map((u) => (
            <li key={u.id} className={u.activo ? '' : 'tachado'} onClick={() => alElegir(u.id)}>
              <Avatar foto={u.foto} nombre={u.nombre} tamano={36} />
              <span className="que">
                <strong>{u.nombre}</strong> <span className="suave chico">{u.usuario}{u.email ? ` · ${u.email}` : ''}</span>
                <span className="suave chico renglon-sub">
                  {t(u.registros_semana === 1 ? 'entró {cuando} · {n} anotación en 7 días ({total} en total)' : 'entró {cuando} · {n} anotaciones en 7 días ({total} en total)', { cuando: hace(u.ultimo_acceso), n: u.registros_semana, total: u.registros })}
                  {u.supervisa ? ` · ${t('acompaña a {n}', { n: u.supervisa })}` : ''}
                  {u.instalacion?.estado.version?.web ? <> · <VersionDe v={u.instalacion.estado.version} /></> : null}
                  {u.supervisado ? ` · ${t('acompañado')}` : ''}
                </span>
                {u.instalacion ? <ChipsPermisos i={u.instalacion} /> : <span className="suave chico renglon-sub">{t('todavía no abrió la app con esta versión')}</span>}
              </span>
              <span className="columna-chica">
                {u.rol !== 'editor' ? <span className="etiqueta">{u.rol === 'admin' ? t('admin') : t('solo mira')}</span> : null}
                <span aria-label={t('Teléfonos')}>{(u.telefonos ?? '').split(',').filter(Boolean).map((p) => (p === 'ios' ? '🍎' : '🤖')).join(' ') || '🌐'}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="suave centro">{t('Cargando…')}</p>
      )}
    </>
  );
}

function DetalleUsuario({ id, alVolver }: { id: number; alVolver(): void }) {
  const { avisar, usuario: yo } = useEstado();
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  const traer = useCallback(() => api<Detalle>('GET', `/api/admin/usuarios/${id}`).then(setD).catch((e: Error) => setError(e.message)), [id]);
  useEffect(() => void traer(), [traer]);

  const cambiar = async (cambios: Record<string, unknown>, aviso: string) => {
    setError('');
    try {
      await api('PUT', `/api/usuarios/${id}`, cambios);
      avisar(aviso);
      void traer();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!d) return <p className="suave centro">{error || t('Cargando…')}</p>;
  const u = d.usuario;
  const soyYo = yo?.id === u.id;

  return (
    <div className="admin-detalle">
      <button className="volver" onClick={alVolver}>‹ {t('Usuarios')}</button>
      <div className="tarjeta">
        <h3>{u.nombre} {u.activo ? null : <span className="etiqueta">{t('desactivado')}</span>}</h3>
        <p className="suave chico">
          {u.usuario}{u.email ? ` · ${u.email}` : ''} · {t('creado {fecha}', { fecha: fechaHora(u.creado) })} · {t('entró {cuando}', { cuando: hace(u.ultimo_acceso) })}
        </p>
        <label>
          {t('Rol')}
          <select value={u.rol} disabled={soyYo} onChange={(e) => void cambiar({ rol: e.target.value }, t('Rol cambiado'))}>
            <option value="editor">{t('Usuario normal')}</option>
            <option value="lector">{t('Solo mirar')}</option>
            <option value="admin">{t('Administrador')}</option>
          </select>
        </label>
        <div className="fila">
          {!soyYo ? (
            <button className="btn" onClick={() => confirm(u.activo ? t('¿Desactivar a {nombre}? No va a poder entrar.', { nombre: u.nombre }) : t('¿Reactivar a {nombre}?', { nombre: u.nombre })) && void cambiar({ activo: !u.activo }, u.activo ? t('Desactivado') : t('Reactivado'))}>
              {u.activo ? t('Desactivar') : t('Reactivar')}
            </button>
          ) : null}
          <button className="btn" onClick={() => {
            const clave = prompt(t('Clave nueva para {nombre} (al menos 6 letras):', { nombre: u.nombre }))?.trim();
            if (clave) void cambiar({ clave }, t('Clave cambiada'));
          }}>{t('Cambiar clave')}</button>
        </div>
        {error ? <p className="neg">{error}</p> : null}
      </div>

      {d.personas.map((p) => (
        <div key={p.id} className="tarjeta">
          <h3>🧍 {p.nombre} <span className="suave chico">{p.rol === 'dueno' ? t('suya') : p.rol}</span></h3>
          <p className="suave chico">
            {t('{registros} en {dias}', { registros: cuantos(p.registros, 'anotación', 'anotaciones'), dias: cuantos(p.dias, 'día', 'días') })} · {cuantos(p.mediciones, 'dato automático', 'datos automáticos')}{p.fuentes ? ` (${p.fuentes})` : ''}
            {p.sexo || p.nacimiento || p.condiciones?.length ? ` · ${[p.sexo, p.nacimiento, p.altura_cm ? `${p.altura_cm} cm` : '', p.peso_kg ? `${p.peso_kg} kg` : '', ...(p.condiciones ?? [])].filter(Boolean).join(', ')}` : ''}
          </p>
          <Barritas datos={p.por_dia.map((x) => x.n)} alto={44} />
          <p className="suave chico eje"><span>{t('hace 14 días')}</span><span>{t('hoy')}</span></p>
        </div>
      ))}

      <LoQuePattyLeDice d={d} />

      {d.instalaciones.length ? (
        <div className="tarjeta">
          <h3>{t('Cómo tiene configurada la app')}</h3>
          {d.instalaciones.map((i, n) => (
            <div key={n} className="instalacion">
              <p className="chico">
                <strong>{i.plataforma === 'ios' ? '🍎 iPhone' : i.plataforma === 'android' ? '🤖 Android' : t('🌐 Navegador')}</strong>
                <span className="suave"> · {t('visto {cuando}', { cuando: hace(i.actualizado) })}</span>
                {i.estado.version?.web ? <span className="suave"> · <VersionDe v={i.estado.version} /></span> : null}
                {i.estado.ultimos?.telefono ? <span className="suave"> · {t('mandó uso del teléfono {cuando}', { cuando: hace(i.estado.ultimos.telefono) })}</span> : null}
                {i.estado.ultimos?.salud ? <span className="suave"> · {t('mandó salud {cuando}', { cuando: hace(i.estado.ultimos.salud) })}</span> : null}
              </p>
              <ChipsPermisos i={i} />
            </div>
          ))}
        </div>
      ) : null}

      {d.telefonos.length || d.tratamientos.length || d.supervisiones.length ? (
        <div className="tarjeta">
          {d.telefonos.length ? (
            <>
              <h3>{t('Teléfonos')}</h3>
              <ul className="lista-simple">
                {d.telefonos.map((tel, i) => (
                  <li key={i}>{tel.plataforma === 'ios' ? '🍎 iPhone' : '🤖 Android'} · {t('desde {fecha}', { fecha: fechaHora(tel.creado) })} · {t('última vez {cuando}', { cuando: hace(tel.actualizado) })}</li>
                ))}
              </ul>
            </>
          ) : null}
          {d.tratamientos.length ? (
            <>
              <h3>{t('Remedios')}</h3>
              <ul className="lista-simple">
                {d.tratamientos.map((x) => (
                  <li key={x.id}>
                    💊 {x.remedio}{x.dosis !== null ? ` ${conUnidad(x.dosis, x.unidad, 2, idioma())}` : ''} · {x.cada_horas ? t('cada {n} h', { n: x.cada_horas }) : x.horarios.length ? x.horarios.join(', ') : t('si hace falta')} · {x.persona}
                    {x.terminado ? ` · ${t('terminado')}` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {d.supervisiones.length ? (
            <>
              <h3>{t('Familia')}</h3>
              <ul className="lista-simple">
                {d.supervisiones.map((s, i) => <li key={i}>👀 {s.relacion} {s.otro} ({s.estado})</li>)}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="tarjeta">
        <h3>{t('Lo último que anotó')}</h3>
        {d.ultimos.length ? <ListaRegistros lista={d.ultimos} /> : <p className="suave">{t('Nada todavía.')}</p>}
      </div>
    </div>
  );
}

/** Los análisis de patrones de sus personas (resumen y sugerencias), lo que encontró y los avisos que le llegaron. */
function LoQuePattyLeDice({ d }: { d: Detalle }) {
  const nombre = new Map(d.personas.map((p) => [p.id, p.nombre]));
  const varias = d.personas.length > 1;
  const ultimo = d.analisis[0];
  return (
    <div className="tarjeta">
      <h3>🦉 {t('Lo que Patty le dice')}</h3>
      {ultimo ? (
        <>
          {ultimo.resumen ? <p>{ultimo.resumen}</p> : null}
          {ultimo.sugerencias?.length ? (
            <>
              <p className="suave chico">{t('Sugerencias')}</p>
              <ul className="lista-simple">{ultimo.sugerencias.map((x, i) => <li key={i}>💡 {x}</li>)}</ul>
            </>
          ) : null}
        </>
      ) : (
        <p className="suave">{t('Todavía no se buscaron patrones.')}</p>
      )}
      {d.hallazgos.length ? (
        <details>
          <summary>{t('Lo que encontró')} ({d.hallazgos.length})</summary>
          <ul className="lista-simple">
            {d.hallazgos.map((h) => (
              <li key={h.id}>
                {h.estado === 'confirmado' ? '✅' : h.estado === 'descartado' ? '🚫' : '🔎'} {h.explicacion ?? `${t(h.causa)} → ${t(h.efecto)}`}
                {varias ? <span className="suave chico"> · {nombre.get(h.persona_id)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {d.analisis.length ? (
        <details>
          <summary>{t('Análisis de patrones')} ({d.analisis.length})</summary>
          <ul className="lista-simple">
            {d.analisis.map((a) => (
              <li key={a.id}>
                {a.origen === 'noche' ? '🌙' : '👆'} {fechaHora(a.creado)} · {a.origen === 'noche' ? t('de noche') : t('a mano')} · {cuantos(a.dias, 'día', 'días')} ·{' '}
                {cuantos(a.hallazgos, 'hallazgo', 'hallazgos')}{a.nuevos ? ` · ${t('{n} nuevos', { n: a.nuevos })}` : ''}
                {varias ? <span className="suave chico"> · {nombre.get(a.persona_id)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <details>
        <summary>{t('Avisos que le llegaron')} ({d.avisos.length})</summary>
        {d.avisos.length ? (
          <ul className="lista-simple">
            {d.avisos.map((a) => (
              <li key={a.id}>
                <strong>{a.titulo}</strong> {a.cuerpo}
                <span className="suave chico"> · {hace(a.creado)}{a.resultado !== 'ok' ? ` · ${t('no llegó')}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="suave">{t('Nada todavía.')}</p>
        )}
      </details>
    </div>
  );
}

function ListaRegistros({ lista, conUsuario = false }: { lista: Registro[]; conUsuario?: boolean }) {
  return (
    <ul className="lista-actividad">
      {lista.map((r) => (
        <li key={r.id}>
          <span className="icono">{r.icono}</span>
          <span className="que">
            {t(r.concepto)}
            {valorDe(r) ? <span className="valor-chip">{valorDe(r)}</span> : null}
            <span className="suave chico renglon-sub">
              {conUsuario && r.usuario ? `${r.usuario} · ` : ''}{r.persona} · {fechaHora(r.inicio)}{r.origen !== 'manual' ? ` · ${r.origen}` : ''}
            </span>
          </span>
          <span className="suave chico">{hace(r.creado)}</span>
        </li>
      ))}
    </ul>
  );
}

function VistaActividad() {
  const [lista, setLista] = useState<Registro[] | null>(null);
  useEffect(() => {
    const traer = () => api<Registro[]>('GET', '/api/admin/actividad').then(setLista).catch(() => {});
    void traer();
    // Se actualiza sola mientras se mira.
    const iv = setInterval(traer, 30000);
    return () => clearInterval(iv);
  }, []);
  if (!lista) return <p className="suave centro">{t('Cargando…')}</p>;
  return (
    <div className="tarjeta">
      <h3>{t('Lo último que se anotó')} <span className="suave chico">{t('(se actualiza solo)')}</span></h3>
      {lista.length ? <ListaRegistros lista={lista} conUsuario /> : <p className="suave">{t('Nada todavía.')}</p>}
    </div>
  );
}
