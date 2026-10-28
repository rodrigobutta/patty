// En Más → Tu cuenta: cuánto usé hoy de lo que tiene límite (contarle a Patty, fotos, dictados, preguntas, buscar
// patrones) y el plan. Se renueva cada día.
import { useEffect, useState } from 'react';
import { NOMBRES_USO_IA, PLANES, USOS_IA, type Limites } from 'shared';
import { api } from '../api';
import { t } from '../lib/idioma';

export function UsoIaMio() {
  const [d, setD] = useState<{ plan: string; limites: Limites; hoy: Record<string, number>; sinLimite: boolean } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof d>>('GET', '/api/uso-ia').then(setD).catch(() => {});
  }, []);
  if (!d) return null;
  return (
    <div className="tarjeta uso-ia-mio">
      <h3>{t('🤖 Lo que usaste hoy')}</h3>
      <p className="suave chico">{d.sinLimite ? t('Sin límite (administrador).') : t('Plan {plan}. Se renueva cada día.', { plan: t(PLANES[d.plan]?.nombre ?? d.plan) })}</p>
      {USOS_IA.map((k) => {
        const n = d.hoy[k] ?? 0;
        const lim = d.limites[k];
        const ilimitado = d.sinLimite || lim >= 100000;
        return (
          <div key={k} className="uso-fila">
            <span className="chico">{t(NOMBRES_USO_IA[k])}</span>
            <span className="uso-barra"><span style={{ width: `${ilimitado ? 0 : Math.min(100, (n / lim) * 100)}%` }} className={!ilimitado && n >= lim ? 'lleno' : ''} /></span>
            <span className="suave chico">{ilimitado ? n : `${n}/${lim}`}</span>
          </div>
        );
      })}
    </div>
  );
}
