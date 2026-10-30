// Administración → Versiones: qué tiene cada usuario en cada teléfono o navegador, contra lo último publicado, para ver
// que todos anden con lo último. La app lo cuenta al abrirse: lo de quien hace días que no la abre puede haber cambiado.
import { useEffect, useMemo, useState } from 'react';
import { compararVersiones } from 'shared';
import { api } from '../api';
import { t } from '../lib/idioma';
import { ChipsPermisos, type Instalacion } from './Admin';
import { hace } from './AdminDatos';

interface Fila {
  usuario_id: number;
  nombre: string;
  usuario: string;
  email: string | null;
  personas: string | null;
  ultimo_acceso: string | null;
  instalacion: string | null;
  plataforma: string | null;
  actualizado: string | null;
  web: string | null;
  commit: string | null;
  app: string | null;
  permisos: Instalacion['estado']['permisos'] | null;
  activos: Instalacion['estado']['activos'] | null;
}
interface Datos { web: string; app: string | null; filas: Fila[] }

const PLATAFORMA: Record<string, string> = { android: 'Android', ios: 'iPhone', web: 'Navegador' };
/** Sin abrir la app hace más de estos días: lo que dice puede estar viejo. */
const DIAS_SIN_ABRIR = 7;
const sinAbrir = (f: Fila) => !f.actualizado || Date.now() - Date.parse(f.actualizado) > DIAS_SIN_ABRIR * 86400e3;

/** Si la web y la app de una instalación están al día. `null`: no aplica (la web no tiene app instalada). */
export function estadoDe(f: Pick<Fila, 'plataforma' | 'web' | 'app'>, ultimas: { web: string; app: string | null }) {
  const web = Boolean(f.web) && compararVersiones(f.web!, ultimas.web) >= 0;
  const nativa = f.plataforma === 'android' || f.plataforma === 'ios';
  // Solo se compara con la publicada la de Android (la de iPhone todavía no se publica).
  const app = f.plataforma === 'android' && ultimas.app ? Boolean(f.app) && compararVersiones(f.app!, ultimas.app) >= 0 : null;
  return { web, app, nativa, alDia: web && app !== false };
}

const Estado = ({ ok, version }: { ok: boolean | null; version: string | null }) =>
  version ? <span className={`estado-version ${ok === null ? 'nada' : ok ? 'ok' : 'vieja'}`}>{version}</span> : <span className="estado-version nada">—</span>;

export function AdminVersiones({ alElegir }: { alElegir(id: number): void }) {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [plataforma, setPlataforma] = useState('');
  const [soloViejas, setSoloViejas] = useState(false);
  useEffect(() => {
    api<Datos>('GET', '/api/admin/versiones').then(setD).catch((e: Error) => setError(e.message));
  }, []);
  const filas = useMemo(() => {
    if (!d) return [];
    const con = d.filas.map((f) => ({ f, e: estadoDe(f, d) }));
    // Primero lo que hay que revisar: lo desactualizado, y dentro de eso, quien la usó hace menos.
    return con.sort((a, b) => Number(a.e.alDia) - Number(b.e.alDia) || Number(!a.f.instalacion) - Number(!b.f.instalacion) || Date.parse(b.f.actualizado ?? '0') - Date.parse(a.f.actualizado ?? '0'));
  }, [d]);
  if (!d) return <p className="suave centro">{error || t('Cargando…')}</p>;
  const instaladas = filas.filter((x) => x.f.instalacion);
  const resumen = (['android', 'ios', 'web'] as const).map((p) => {
    const de = instaladas.filter((x) => x.f.plataforma === p);
    return { p, total: de.length, alDia: de.filter((x) => x.e.alDia).length };
  }).filter((x) => x.total);
  const sinApp = filas.filter((x) => !x.f.instalacion).length;
  const visibles = filas.filter((x) => (!plataforma || x.f.plataforma === plataforma) && (!soloViejas || (x.f.instalacion && !x.e.alDia)));
  return (
    <>
      <div className="kpis">
        <div className="tarjeta dato"><strong>{d.web}</strong><span className="suave chico">{t('última de la web')}</span></div>
        <div className="tarjeta dato"><strong>{d.app ?? '—'}</strong><span className="suave chico">{t('última de Android publicada')}</span></div>
        {resumen.map((r) => (
          <div key={r.p} className={`tarjeta dato ${r.alDia < r.total ? 'gravedad-media' : ''}`}>
            <strong>{r.alDia} / {r.total}</strong>
            <span className="suave chico">{t('{p} al día', { p: t(PLATAFORMA[r.p]) })}</span>
          </div>
        ))}
        {sinApp ? <div className="tarjeta dato"><strong>{sinApp}</strong><span className="suave chico">{t('usuarios que nunca la abrieron')}</span></div> : null}
      </div>
      <div className="barra-tabla">
        <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)} aria-label={t('Plataforma')}>
          <option value="">{t('Todas las plataformas')}</option>
          {Object.entries(PLATAFORMA).map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
        </select>
        <label className="opcion">
          <input type="checkbox" checked={soloViejas} onChange={(e) => setSoloViejas(e.target.checked)} />
          <span>{t('Solo las desactualizadas')}</span>
        </label>
      </div>
      <div className="tarjeta">
        <div className="grilla-caja">
          <table className="grilla">
            <thead>
              <tr><th>{t('Usuario')}</th><th>{t('Personas')}</th><th>{t('Plataforma')}</th><th>{t('Estado')}</th><th>{t('Web cargada')}</th><th>{t('App instalada')}</th><th>{t('Abrió la app')}</th><th>{t('Permisos')}</th></tr>
            </thead>
            <tbody>
              {visibles.map(({ f, e }, i) => (
                <tr key={i} className={`clic ${f.instalacion && sinAbrir(f) ? 'apagada' : ''}`} onClick={() => alElegir(f.usuario_id)}>
                  <td>{f.nombre} <span className="suave chico">{f.email ?? f.usuario}</span></td>
                  <td>{f.personas ?? '—'}</td>
                  {f.instalacion ? (
                    <>
                      <td>{t(PLATAFORMA[f.plataforma ?? ''] ?? f.plataforma ?? '')}</td>
                      <td><span className={`estado-version ${e.alDia ? 'ok' : 'vieja'}`}>{e.alDia ? t('Al día') : t('Desactualizado')}</span></td>
                      <td><Estado ok={e.web} version={f.web} /></td>
                      <td>{e.nativa ? <Estado ok={e.app} version={f.app} /> : <span className="suave">—</span>}</td>
                      <td title={f.actualizado ?? ''}>{hace(f.actualizado)}</td>
                      <td>{f.permisos ? <ChipsPermisos i={{ plataforma: f.plataforma ?? '', estado: { permisos: f.permisos, activos: f.activos ?? {}, ultimos: {} } }} /> : '—'}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="suave">{t('Nunca abrió la app')}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="suave chico">{t('Cada teléfono o navegador cuenta su versión al abrir Patty. Si no la abre, sigue figurando la de la última vez (en gris, si pasaron más de {n} días). La web se actualiza sola al abrir; la app de Android hay que instalarla.', { n: DIAS_SIN_ABRIR })}</p>
      </div>
    </>
  );
}
