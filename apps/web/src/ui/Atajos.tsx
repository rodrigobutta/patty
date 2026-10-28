// Lo de todos los días con un solo toque (pis, caca, dientes, enjuague, ducha, agua): se anota en el momento, sin
// preguntar nada. Lo que se toca seguido va primero.
import { useState } from 'react';
import { ATAJOS, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { t } from '../lib/idioma';
import { comoDetalles, preguntasYa, usePreguntas } from '../lib/preguntas';
import { PreguntasDetalle } from './PreguntasDetalle';
import type { Detalle } from 'shared';

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
  // Si la cosa tiene preguntas configuradas (Caca → "¿Cómo fue?"), se preguntan antes de anotar.
  usePreguntas(persona.id, null);
  const [preguntando, setPreguntando] = useState<(typeof ATAJOS)[number] | null>(null);
  const [respuestas, setRespuestas] = useState<Record<number, string[]>>({});
  const preguntas = preguntando ? preguntasYa(persona.id, preguntando.nombre) : [];
  const u = usos();
  const lista = [...ATAJOS].sort((a, b) => (u[b.nombre] ?? 0) - (u[a.nombre] ?? 0));
  const tocar = async (a: (typeof ATAJOS)[number], detalles?: Detalle[]) => {
    const cat = categorias.find((c) => c.clave === a.categoria);
    if (!cat || ocupado) return;
    if (!detalles && preguntasYa(persona.id, a.nombre).length) {
      setRespuestas({});
      return setPreguntando(a);
    }
    setPreguntando(null);
    setOcupado(a.nombre);
    try {
      await api('POST', '/api/registros', {
        persona_id: persona.id,
        concepto_nombre: a.nombre,
        categoria_id: cat.id,
        inicio: new Date().toISOString(),
        ...(a.categoria === 'bebida' ? { valor: 1, unidad: 'vasos' } : {}),
        ...(detalles?.length ? { detalles } : {}),
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
      {preguntando ? (
        <div className="tarjeta atajo-preguntas">
          <p><strong>{preguntando.emoji} {t(preguntando.corto)}</strong></p>
          <PreguntasDetalle preguntas={preguntas} elegidas={respuestas} alCambiar={setRespuestas} />
          <div className="fila">
            <button className="btn primario" disabled={Boolean(ocupado)} onClick={() => void tocar(preguntando, comoDetalles(preguntas, respuestas))}>{t('Anotar')}</button>
            <button className="btn" onClick={() => setPreguntando(null)}>{t('Cancelar')}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
