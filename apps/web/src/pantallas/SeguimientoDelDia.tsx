// En el Día: los seguimientos activos, con lo de hoy como una lista para tildar. Lo hecho queda tildado (según lo
// anotado); lo que falta se anota desde acá: las comidas contándolas, cómo me siento con las caritas, lo demás con un
// toque (la temperatura, con el número).
import { useEffect, useState } from 'react';
import { inicioDeVentana, ITEMS_SEGUIMIENTO, itemsHechos, type Categoria, type Persona, type Registro, type Seguimiento } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { pedirSentir } from '../lib/sentir';
import { useMinuto } from '../lib/reloj';
import { EVENTO_SEGUIMIENTOS, traerSeguimientos } from '../lib/seguimientos';
import { EVENTO_CONTAR } from './PuntosDelDia';

/** La hora (HH:MM) de lo último anotado hoy que cuenta para ese ítem. */
function ultimaHora(clave: string, anotado: Array<{ concepto: string; categoria: string; hora: number }>): string | null {
  const l = anotado.filter((a) => itemsHechos([clave], [a]).has(clave)).map((a) => a.hora);
  if (!l.length) return null;
  const h = Math.max(...l);
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
}

export function SeguimientoDelDia({ persona, registros, categorias, alAnotar }: { persona: Persona; registros: Registro[]; categorias: Categoria[]; alAnotar(): void }) {
  const { festejar, avisar } = useEstado();
  const [activos, setActivos] = useState<Seguimiento[]>([]);
  const [midiendo, setMidiendo] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  // A la hora de cada aviso, lo de "cada vez" vuelve a faltar: se mira la hora cada minuto.
  const ahora = useMinuto();
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
        // Lo de "cada vez" cuenta desde el último horario que pasó; lo de una vez al día, todo el día.
        const [hh, mm] = horaEn(new Date(ahora).toISOString(), persona.zona_horaria).split(':').map(Number);
        const hechos = itemsHechos(s.items, anotado, inicioDeVentana(s.horarios, hh + mm / 60));
        const dia = Math.floor((ahora - Date.parse(s.desde)) / 86400000) + 1;
        const pendientes = s.items.filter((c) => !hechos.has(c) && !ITEMS_SEGUIMIENTO.find((i) => i.clave === c)?.opcional).length;
        return (
          <div key={s.id} className="tarjeta seguimiento-dia">
            <div className="seguimiento-cabeza">
              <strong>{s.emoji} {t(s.nombre)}</strong>
              <span className="suave chico">{s.dias ? t('día {n} de {total}', { n: Math.min(dia, s.dias), total: s.dias }) : t('día {n}', { n: dia })}{pendientes ? ` · ${t('faltan {n}', { n: pendientes })}` : ` · ${t('¡todo al día!')}`}</span>
            </div>
            <ul className="seguimiento-lista">
              {s.items.map((clave) => {
                const it = ITEMS_SEGUIMIENTO.find((i) => i.clave === clave);
                if (!it) return null;
                const hecho = hechos.has(clave);
                // La última vez que se anotó hoy (para mostrar la hora en lo hecho).
                const ultima = hecho ? ultimaHora(clave, anotado) : null;
                return (
                  <li key={clave} className={`fila-seguimiento${hecho ? ' hecho' : ''}${it.opcional ? ' opcional' : ''}`}>
                    <span className="emoji-item" aria-hidden>{it.emoji}</span>
                    <span className="nombre-item">
                      {t(it.nombre)}{' '}
                      <span className={`frecuencia ${it.frecuencia}`} title={it.frecuencia === 'cada_vez' ? t('Se vuelve a pedir en cada aviso') : t('Una vez al día')}>
                        {it.frecuencia === 'cada_vez' ? '↻' : '1×'}
                      </span>
                    </span>
                    <span className="estado-item suave chico">{hecho ? `✓ ${ultima ?? ''}` : it.opcional ? t('si pasa') : t('falta')}</span>
                    <button className={`btn chico${hecho || it.opcional ? '' : ' primario'}`} onClick={() => void anotar(clave)} aria-label={t('Anotar {que}', { que: t(it.nombre) })}>
                      {hecho ? '＋' : t('Anotar')}
                    </button>
                  </li>
                );
              })}
            </ul>
            {midiendo && s.items.includes(midiendo) ? (
              <div className="fila medir-seguimiento">
                <input inputMode="decimal" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder="37,5" aria-label={t('Temperatura corporal')} />
                <span className="suave">°C</span>
                <button className="btn primario chico" disabled={!(Number(valor.replace(',', '.')) > 30)} onClick={() => void anotar(midiendo, Number(valor.replace(',', '.')))}>{t('Anotar')}</button>
                <button className="btn chico" onClick={() => setMidiendo(null)}>{t('Cancelar')}</button>
              </div>
            ) : null}
            <p className="suave chico">
              <span className="frecuencia cada_vez">↻</span> {t('se vuelve a pedir en cada aviso')} · <span className="frecuencia dia">1×</span> {t('una vez al día')}
              {s.activado_por ? ` · ${t('Lo activó {quien}.', { quien: s.activado_por })}` : ''}
            </p>
          </div>
        );
      })}
    </>
  );
}
