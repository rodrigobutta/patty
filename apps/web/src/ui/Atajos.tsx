// Lo de todos los días con un solo toque (pis, caca, dientes, enjuague, ducha, agua): se anota en el momento, sin
// preguntar nada. Lo que se toca seguido va primero.
import { useState } from 'react';
import { ATAJOS, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { t } from '../lib/idioma';

const USOS = 'atajos-usos';
const usos = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(USOS) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
};

export function Atajos({ persona, alAnotar }: { persona: Persona; alAnotar(): void }) {
  const { categorias, festejar, avisar } = useEstado();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const u = usos();
  const lista = [...ATAJOS].sort((a, b) => (u[b.nombre] ?? 0) - (u[a.nombre] ?? 0));
  const tocar = async (a: (typeof ATAJOS)[number]) => {
    const cat = categorias.find((c) => c.clave === a.categoria);
    if (!cat || ocupado) return;
    setOcupado(a.nombre);
    try {
      await api('POST', '/api/registros', {
        persona_id: persona.id,
        concepto_nombre: a.nombre,
        categoria_id: cat.id,
        inicio: new Date().toISOString(),
        ...(a.categoria === 'bebida' ? { valor: 1, unidad: 'vasos' } : {}),
      });
      try {
        localStorage.setItem(USOS, JSON.stringify({ ...u, [a.nombre]: (u[a.nombre] ?? 0) + 1 }));
      } catch {
        /* sin almacenamiento */
      }
      medir('anotar', { metodo: 'atajo', que: a.corto });
      festejar(t('¡Anotado! {que}', { que: `${a.emoji} ${t(a.corto)}` }));
      alAnotar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };
  return (
    <div className="atajos">
      <p className="suave chico">{t('Con un toque')}</p>
      <div className="atajos-fila">
        {lista.map((a) => (
          <button key={a.nombre} className="atajo" disabled={Boolean(ocupado)} onClick={() => void tocar(a)}>
            <span aria-hidden>{a.emoji}</span>
            {t(a.corto)}
          </button>
        ))}
      </div>
    </div>
  );
}
