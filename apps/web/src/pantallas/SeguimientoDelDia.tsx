// En el Día: los seguimientos activos, con lo de hoy como una lista para tildar. Lo hecho queda tildado (según lo
// anotado); lo que falta se anota desde acá: las comidas contándolas, cómo me siento con las caritas, lo demás con un
// toque (la temperatura, con el número).
import { useEffect, useState } from 'react';
import { ITEMS_SEGUIMIENTO, itemsHechos, type Categoria, type Persona, type Registro, type Seguimiento } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { pedirSentir } from '../lib/sentir';
import { EVENTO_SEGUIMIENTOS, traerSeguimientos } from '../lib/seguimientos';
import { EVENTO_CONTAR } from './PuntosDelDia';

export function SeguimientoDelDia({ persona, registros, categorias, alAnotar }: { persona: Persona; registros: Registro[]; categorias: Categoria[]; alAnotar(): void }) {
  const { festejar, avisar } = useEstado();
  const [activos, setActivos] = useState<Seguimiento[]>([]);
  const [midiendo, setMidiendo] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  useEffect(() => {
    const traer = () => void traerSeguimientos(persona.id).then((r) => setActivos(r.activos)).catch(() => {});
    traer();
    window.addEventListener(EVENTO_SEGUIMIENTOS, traer);
    return () => window.removeEventListener(EVENTO_SEGUIMIENTOS, traer);
  }, [persona.id]);
  if (!activos.length) return null;

  const claveDe = (id: number) => categorias.find((c) => c.id === id)?.clave ?? '';
  const anotado = registros.map((r) => {
    const [h, m] = horaEn(r.inicio, persona.zona_horaria).split(':').map(Number);
    return { concepto: r.concepto, categoria: claveDe(r.categoria_id), hora: h + m / 60 };
  });

  const anotar = async (clave: string, numero?: number) => {
    const it = ITEMS_SEGUIMIENTO.find((i) => i.clave === clave)!;
    medir('seguimiento_anotar', { item: clave });
    if (it.tipo === 'sentir') return pedirSentir();
    if (it.tipo === 'comida') return window.dispatchEvent(new CustomEvent(EVENTO_CONTAR, { detail: clave }));
    if (it.tipo === 'medida' && numero === undefined) {
      setValor('');
      return setMidiendo(clave);
    }
    const cat = categorias.find((c) => c.clave === it.categoria);
    if (!cat) return;
    try {
      await api('POST', '/api/registros', {
        persona_id: persona.id,
        concepto_nombre: it.concepto ?? it.nombre,
        categoria_id: cat.id,
        inicio: new Date().toISOString(),
        ...(numero !== undefined ? { valor: numero, unidad: it.unidad ?? null } : it.categoria === 'sintoma' ? { intensidad: 5 } : it.categoria === 'bebida' ? { valor: 1, unidad: 'vasos' } : {}),
      });
      setMidiendo(null);
      festejar(t('¡Anotado! {que}', { que: `${it.emoji} ${t(it.nombre)}` }));
      alAnotar();
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  return (
    <>
      {activos.map((s) => {
        const hechos = itemsHechos(s.items, anotado);
        const dia = Math.min(s.dias, Math.floor((Date.now() - Date.parse(s.desde)) / 86400000) + 1);
        const pendientes = s.items.filter((c) => !hechos.has(c) && !ITEMS_SEGUIMIENTO.find((i) => i.clave === c)?.opcional).length;
        return (
          <div key={s.id} className="tarjeta seguimiento-dia">
            <div className="seguimiento-cabeza">
              <strong>{s.emoji} {t(s.nombre)}</strong>
              <span className="suave chico">{t('día {n} de {total}', { n: dia, total: s.dias })}{pendientes ? ` · ${t('faltan {n}', { n: pendientes })}` : ` · ${t('¡todo al día!')}`}</span>
            </div>
            <div className="seguimiento-items">
              {s.items.map((clave) => {
                const it = ITEMS_SEGUIMIENTO.find((i) => i.clave === clave);
                if (!it) return null;
                const hecho = hechos.has(clave);
                return (
                  <button key={clave} className={`item-seguimiento${hecho ? ' hecho' : ''}${it.opcional ? ' opcional' : ''}`} onClick={() => void anotar(clave)}>
                    <span aria-hidden>{hecho ? '✓' : it.emoji}</span>
                    {t(it.nombre)}
                  </button>
                );
              })}
            </div>
            {midiendo && s.items.includes(midiendo) ? (
              <div className="fila medir-seguimiento">
                <input inputMode="decimal" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder="37,5" aria-label={t('Temperatura corporal')} />
                <span className="suave">°C</span>
                <button className="btn primario chico" disabled={!(Number(valor.replace(',', '.')) > 30)} onClick={() => void anotar(midiendo, Number(valor.replace(',', '.')))}>{t('Anotar')}</button>
                <button className="btn chico" onClick={() => setMidiendo(null)}>{t('Cancelar')}</button>
              </div>
            ) : null}
            {s.activado_por ? <p className="suave chico">{t('Lo activó {quien}.', { quien: s.activado_por })}</p> : null}
          </div>
        );
      })}
    </>
  );
}
