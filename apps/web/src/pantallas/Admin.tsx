// Administración (solo administradores): cómo viene el uso mientras se prueba. Resumen con números y actividad por día,
// usuarios (con su último acceso y lo que anotan; se crean, desactivan y se les cambia el rol o la clave) y lo último
// que se anotó en toda la app. Se entra desde Más, o con patty.today/#admin en la compu.
import { useCallback, useEffect, useState } from 'react';
import { conUnidad } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { idioma, locale, t } from '../lib/idioma';
import { Avatar } from '../ui/Avatar';

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
  };
  creado?: string;
  actualizado: string;
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
  const [vista, setVista] = useState<'resumen' | 'usuarios' | 'actividad'>('resumen');
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
      </div>
      {vista === 'resumen' ? <VistaResumen /> : vista === 'actividad' ? <VistaActividad /> : elegido ? <DetalleUsuario id={elegido} alVolver={() => setElegido(null)} /> : <VistaUsuarios alElegir={setElegido} />}
    </section>
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
    ['👀', r.supervisiones, t('supervisiones')],
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
                  {u.supervisa ? ` · ${t('supervisa a {n}', { n: u.supervisa })}` : ''}
                  {u.supervisado ? ` · ${t('supervisado')}` : ''}
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

      {d.instalaciones.length ? (
        <div className="tarjeta">
          <h3>{t('Cómo tiene configurada la app')}</h3>
          {d.instalaciones.map((i, n) => (
            <div key={n} className="instalacion">
              <p className="chico">
                <strong>{i.plataforma === 'ios' ? '🍎 iPhone' : i.plataforma === 'android' ? '🤖 Android' : t('🌐 Navegador')}</strong>
                <span className="suave"> · {t('visto {cuando}', { cuando: hace(i.actualizado) })}</span>
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
              <h3>{t('Supervisión')}</h3>
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
