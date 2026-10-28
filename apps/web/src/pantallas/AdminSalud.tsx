// Admin → Salud: cómo anda todo. Cada proceso que corre solo (cuándo corrió, si falló, la última vez que hizo algo),
// los errores del servidor, de la app y de los procesos (con su detalle), el tamaño de la base y el respaldo para bajar.
import { useEffect, useState } from 'react';
import { api, API_BASE } from '../api';
import { locale, t } from '../lib/idioma';

interface Proceso { nombre: string; ultimo_inicio: string | null; ultima_duracion_ms: number | null; ultimo_ok: boolean | null; ultimo_error: string | null; ultimo_trabajo: string | null; corridas: number; fallas: number; procesados: number }
interface ErrorFila { id: number; origen: string; mensaje: string; detalle: string | null; donde: string | null; version: string | null; creado: string; usuario: string | null }
interface Salud {
  procesos: Proceso[];
  errores: ErrorFila[];
  porOrigen: Array<{ origen: string; dia: number; semana: number }>;
  tablas: Array<{ tabla: string; filas: number; bytes: number }>;
  base: number;
  version: string;
  arranco: string;
}

const hace = (iso: string | null) => {
  if (!iso) return '—';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return t('recién');
  if (min < 60) return t('hace {n} min', { n: min });
  if (min < 48 * 60) return t('hace {n} h', { n: Math.round(min / 60) });
  return t('hace {n} días', { n: Math.round(min / 1440) });
};
const tamano = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export function AdminSalud() {
  const [s, setS] = useState<Salud | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const traer = () => void api<Salud>('GET', '/api/admin/salud').then(setS).catch(() => {});
  useEffect(() => {
    traer();
    const i = setInterval(traer, 60000);
    return () => clearInterval(i);
  }, []);
  if (!s) return <p className="suave">{t('Cargando…')}</p>;
  const ORIGEN: Record<string, string> = { servidor: t('Servidor'), app: t('App'), proceso: t('Procesos') };
  return (
    <div className="admin-salud">
      <div className="tarjeta">
        <p>
          <strong>{t('Versión {v}', { v: s.version })}</strong> · <span className="suave">{t('arrancó {cuando}', { cuando: hace(s.arranco) })}</span> · <span className="suave">{t('base: {tam}', { tam: tamano(s.base) })}</span>
        </p>
        <div className="fila envolver">
          {(['servidor', 'app', 'proceso'] as const).map((o) => {
            const x = s.porOrigen.find((p) => p.origen === o);
            return (
              <span key={o} className={`chip estatico${x?.dia ? ' alerta' : ''}`}>
                {ORIGEN[o]}: {t('{n} hoy', { n: x?.dia ?? 0 })} · {t('{n} en 7 días', { n: x?.semana ?? 0 })}
              </span>
            );
          })}
        </div>
        <a className="btn" href={`${API_BASE}/api/admin/respaldo`} download>{t('⬇️ Bajar un respaldo de la base')}</a>
        <p className="suave chico">{t('Es toda la base en un archivo comprimido (sin las sesiones). Guardalo en un lugar seguro: tiene datos de salud.')}</p>
      </div>

      <div className="tarjeta">
        <h3>{t('Procesos')}</h3>
        <div className="tabla-scroll">
          <table className="tabla-salud">
            <thead>
              <tr><th>{t('Proceso')}</th><th>{t('Corrió')}</th><th>{t('Tardó')}</th><th>{t('Estado')}</th><th>{t('Hizo algo')}</th><th>{t('Fallas')}</th></tr>
            </thead>
            <tbody>
              {s.procesos.map((p) => {
                const parado = !p.ultimo_inicio || Date.now() - Date.parse(p.ultimo_inicio) > 5 * 60000;
                return (
                  <tr key={p.nombre} className={!p.ultimo_ok ? 'mal' : parado ? 'parado' : ''}>
                    <td>{t(p.nombre)}</td>
                    <td>{hace(p.ultimo_inicio)}</td>
                    <td>{p.ultima_duracion_ms === null ? '—' : p.ultima_duracion_ms < 1000 ? `${p.ultima_duracion_ms} ms` : `${(p.ultima_duracion_ms / 1000).toFixed(1)} s`}</td>
                    <td title={p.ultimo_error ?? ''}>{!p.ultimo_ok ? `✗ ${p.ultimo_error ?? ''}`.slice(0, 60) : parado ? t('⏸ parado') : '✓'}</td>
                    <td>{hace(p.ultimo_trabajo)}</td>
                    <td>{p.fallas ? `${p.fallas} / ${p.corridas}` : `0 / ${p.corridas}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="suave chico">{t('Corren cada minuto. "Parado": hace más de 5 minutos que no corre (el servidor se reinició o algo lo trabó).')}</p>
      </div>

      <div className="tarjeta">
        <h3>{t('Errores de las últimas 48 horas')}</h3>
        {s.errores.length ? (
          <ul className="lista-simple errores-salud">
            {s.errores.map((e) => (
              <li key={e.id} onClick={() => setAbierto(abierto === e.id ? null : e.id)}>
                <span className={`chip chico estatico origen-${e.origen}`}>{ORIGEN[e.origen] ?? e.origen}</span>{' '}
                <strong>{e.mensaje}</strong>
                <span className="suave chico">
                  {' · '}
                  {new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(e.creado))}
                  {e.donde ? ` · ${e.donde}` : ''}
                  {e.usuario ? ` · ${e.usuario}` : ''}
                  {e.version ? ` · v${e.version}` : ''}
                </span>
                {abierto === e.id && e.detalle ? <pre className="detalle-error">{e.detalle}</pre> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="suave">{t('Sin errores. 🎉')}</p>
        )}
      </div>

      <div className="tarjeta">
        <h3>{t('Tablas más grandes')}</h3>
        <ul className="lista-simple">
          {s.tablas.map((x) => <li key={x.tabla}>{x.tabla} <span className="suave chico">· {x.filas.toLocaleString(locale())} {t('filas')} · {tamano(Number(x.bytes))}</span></li>)}
        </ul>
      </div>
    </div>
  );
}
