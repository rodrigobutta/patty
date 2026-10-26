// El tablero de puntos de los últimos 7 días: la familia (quienes supervisás o te supervisan), con una meta de la
// semana entre todos, y el general (todos los que quieren aparecer, con su apodo). Se puede salir del general.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { t } from '../lib/idioma';
import { Avatar } from '../ui/Avatar';

interface Fila {
  usuario_id: number;
  apodo: string;
  foto: string | null;
  yo: boolean;
  semana: number;
  hoy: number;
}
interface Datos {
  familia: Fila[];
  meta_familia: { suma: number; meta: number };
  general: { posicion: number; total: number; top: Fila[] };
  ranking: boolean;
}

const MEDALLAS = ['🥇', '🥈', '🥉'];

function Lista({ filas }: { filas: Fila[] }) {
  const max = Math.max(1, ...filas.map((f) => f.semana));
  return (
    <ul className="lista tablero-lista">
      {filas.map((f, i) => (
        <li key={f.usuario_id} className={f.yo ? 'yo' : ''} style={{ ['--i' as string]: i }}>
          <span className="puesto">{MEDALLAS[i] ?? `${i + 1}°`}</span>
          <Avatar foto={f.foto} nombre={f.apodo} tamano={34} />
          <span className="que">
            <strong>{f.apodo}{f.yo ? ` (${t('vos')})` : ''}</strong>
            <span className="barra-ranking"><span style={{ width: `${(f.semana / max) * 100}%` }} /></span>
          </span>
          <span className="cifra">
            <span><strong>{f.semana}</strong></span>
            <span className="suave chico">{t('hoy {n}', { n: f.hoy })}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Tablero({ alCerrar }: { alCerrar(): void }) {
  const [d, setD] = useState<Datos | null>(null);
  const [vista, setVista] = useState<'familia' | 'general'>('familia');
  const traer = () => void api<Datos>('GET', '/api/puntos/tablero').then(setD).catch(() => {});
  useEffect(traer, []);

  const cambiarRanking = async (si: boolean) => {
    await api('PUT', '/api/usuarios/yo/preferencias', { ranking: si }).catch(() => {});
    traer();
  };

  return (
    <div className="hoja tablero" role="dialog" aria-label={t('Tablero')}>
      <div className="hoja-cabeza">
        <h3>{t('🏆 Tablero de la semana')}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>
      <div className="segmentos ancho">
        <button className={vista === 'familia' ? 'activa' : ''} onClick={() => setVista('familia')}>{t('👨‍👩‍👧 Familia')}</button>
        <button className={vista === 'general' ? 'activa' : ''} onClick={() => setVista('general')}>{t('🌎 General')}</button>
      </div>
      {!d ? (
        <p className="suave centro">{t('Cargando…')}</p>
      ) : vista === 'familia' ? (
        <>
          <div className="meta-familia">
            <p>
              <strong>{t('Entre todos: {suma} de {meta}', { suma: d.meta_familia.suma.toLocaleString(), meta: d.meta_familia.meta.toLocaleString() })}</strong>
            </p>
            <span className="barra-ranking grande"><span style={{ width: `${Math.min(100, (d.meta_familia.suma / Math.max(1, d.meta_familia.meta)) * 100)}%` }} /></span>
            <p className="suave chico">
              {d.meta_familia.suma >= d.meta_familia.meta
                ? t('¡Meta de la semana cumplida! 🎉')
                : t('La meta es que cada uno sume 60 puntos por día. Se cuentan los últimos 7 días.')}
            </p>
          </div>
          <Lista filas={d.familia} />
          {d.familia.length === 1 ? <p className="suave chico">{t('Sumá a tu familia desde Más → Familia para competir y cumplir la meta juntos.')}</p> : null}
        </>
      ) : (
        <>
          {d.ranking ? (
            <p className="posicion-general">{t('Estás en el puesto {n} de {total}', { n: d.general.posicion, total: d.general.total })}</p>
          ) : (
            <p className="suave">{t('No aparecés en el general: los demás no te ven.')}</p>
          )}
          <Lista filas={d.general.top} />
          <label className="opcion">
            <input type="checkbox" checked={d.ranking} onChange={(e) => void cambiarRanking(e.target.checked)} />
            <span>{t('Aparecer en el general (con tu apodo y tu foto, solo los puntos)')}</span>
          </label>
        </>
      )}
    </div>
  );
}
