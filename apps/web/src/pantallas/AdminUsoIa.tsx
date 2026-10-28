// Admin → IA: cuánto usa la IA cada uno (hoy contra su límite, y los últimos 30 días con el costo estimado), y el plan
// de cada usuario con sus límites propios (si se cambian). Lo que hace Patty sola (resúmenes, comentarios) va aparte.
import { useEffect, useState } from 'react';
import { NOMBRES_USO_IA, PLANES, USOS_IA, type UsoIa } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';

interface Fila {
  id: number;
  nombre: string;
  usuario: string;
  rol: string;
  plan: string;
  limites: Partial<Record<UsoIa, number>> | null;
  efectivos: Record<UsoIa, number>;
  hoy: Partial<Record<string, number>>;
  pedidos_mes: number;
  tokens_mes: number;
  costo_mes: number;
}
interface Datos { precios: { entrada: number; salida: number }; usuarios: Fila[]; patty_sola: { pedidos: number; costo_mes: number } }

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

export function AdminUsoIa() {
  const { avisar } = useEstado();
  const [d, setD] = useState<Datos | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [propios, setPropios] = useState<Partial<Record<UsoIa, string>>>({});
  const traer = () => void api<Datos>('GET', '/api/admin/uso-ia').then(setD).catch(() => {});
  useEffect(traer, []);
  if (!d) return <p className="suave">{t('Cargando…')}</p>;
  const guardar = async (u: Fila, plan: string, limites: Partial<Record<UsoIa, number>> | null) => {
    try {
      await api('PUT', `/api/admin/usuarios/${u.id}/plan`, { plan, limites });
      setEditando(null);
      traer();
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const total = d.usuarios.reduce((s, u) => s + u.costo_mes, 0) + d.patty_sola.costo_mes;
  return (
    <div className="admin-salud">
      <div className="tarjeta">
        <p><strong>{t('Últimos 30 días: {total} estimados', { total: usd(total) })}</strong></p>
        <p className="suave chico">
          {t('Patty sola (resúmenes, comentarios, patrones de la noche): {n} pedidos, {costo}.', { n: d.patty_sola.pedidos, costo: usd(d.patty_sola.costo_mes) })}{' '}
          {t('Estimado con US$ {e} por millón de tokens de entrada y US$ {s} de salida (se cambia en el servidor).', { e: d.precios.entrada, s: d.precios.salida })}
        </p>
      </div>
      {d.usuarios.map((u) => (
        <div key={u.id} className="tarjeta uso-ia-usuario">
          <div className="fila-activo">
            <span>
              <strong>{u.nombre}</strong> <span className="suave chico">@{u.usuario}{u.rol === 'admin' ? ` · ${t('admin, sin límite')}` : ''}</span>
            </span>
            <select
              value={u.plan}
              onChange={(e) => void guardar(u, e.target.value, u.limites)}
              aria-label={t('Plan')}
            >
              {Object.entries(PLANES).map(([k, p]) => <option key={k} value={k}>{t(p.nombre)}</option>)}
            </select>
          </div>
          <div className="usos-hoy">
            {USOS_IA.map((k) => {
              const n = u.hoy[k] ?? 0;
              const lim = u.efectivos[k];
              return (
                <span key={k} className={`chip chico estatico${n >= lim ? ' alerta' : ''}${u.limites?.[k] !== undefined ? ' propio' : ''}`}>
                  {t(NOMBRES_USO_IA[k])}: {n}/{lim >= 100000 ? '∞' : lim}
                </span>
              );
            })}
          </div>
          <p className="suave chico">{t('30 días: {n} pedidos · {tokens} tokens · {costo}', { n: u.pedidos_mes, tokens: u.tokens_mes.toLocaleString(), costo: usd(u.costo_mes) })}</p>
          {editando === u.id ? (
            <div className="limites-propios">
              {USOS_IA.map((k) => (
                <label key={k}>
                  {t(NOMBRES_USO_IA[k])}
                  <input inputMode="numeric" value={propios[k] ?? ''} placeholder={String(PLANES[u.plan]?.limites[k] ?? '')} onChange={(e) => setPropios({ ...propios, [k]: e.target.value })} />
                </label>
              ))}
              <div className="fila">
                <button className="btn primario" onClick={() => void guardar(u, u.plan, Object.fromEntries(Object.entries(propios).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [k, Number(v)])))}>{t('Guardar')}</button>
                <button className="btn" onClick={() => void guardar(u, u.plan, null)}>{t('Volver a los del plan')}</button>
                <button className="enlace chico" onClick={() => setEditando(null)}>{t('Cancelar')}</button>
              </div>
            </div>
          ) : (
            <button className="enlace chico" onClick={() => { setEditando(u.id); setPropios(Object.fromEntries(Object.entries(u.limites ?? {}).map(([k, v]) => [k, String(v)]))); }}>
              {t('Límites propios')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
