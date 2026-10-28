// Los malestares duran. Arriba del Día, los que siguen abiertos quedan como badges ("🤕 Dolor de cabeza · 3 h"):
// tocando uno se cuenta cómo va (ya se me pasó, mejor, igual, peor). Y en el Día, una línea tipo Gantt con una barra
// por malestar, de cuando empezó a cuando se pasó (o hasta ahora), con un puntito en cada vez que se contó cómo iba.
import { useEffect, useState } from 'react';
import type { Categoria, Persona, Registro } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { duracion } from '../lib/automatico';
import { horaEn, instanteDelDia } from '../lib/fechas';
import { t } from '../lib/idioma';

type Estado = 'paso' | 'igual' | 'mejor' | 'peor';

export function MalestaresAbiertos({ persona, vuelta, alCambiar }: { persona: Persona; vuelta: number; alCambiar(): void }) {
  const { festejar, avisar } = useEstado();
  const [lista, setLista] = useState<Registro[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);
  useEffect(() => {
    api<Registro[]>('GET', `/api/registros/abiertos?persona=${persona.id}`).then(setLista).catch(() => {});
  }, [persona.id, vuelta]);
  if (!lista.length) return null;
  const responder = async (r: Registro, estado: Estado) => {
    setAbierto(null);
    try {
      await api('POST', `/api/registros/${r.id}/seguir`, { estado });
      medir('malestar_sigue', { estado });
      const que = t(r.concepto).toLowerCase();
      festejar(
        estado === 'paso'
          ? t('¡Qué bueno! Se te pasó {que} (duró {cuanto}) 💜', { que, cuanto: duracion((Date.now() - Date.parse(r.inicio)) / 60000) })
          : estado === 'mejor'
            ? t('¡Bien que vaya mejorando! 💜')
            : t('Anotado. Te pregunto más tarde 💜'),
        estado === 'paso' || estado === 'mejor' ? 'feliz' : 'espera',
      );
      if (estado === 'paso') setLista((l) => l.filter((x) => x.id !== r.id));
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  return (
    <div className="malestares-abiertos">
      <span className="suave chico">{t('En curso')}</span>
      {lista.map((r) => (
        <span key={r.id} className="badge-malestar-envoltura">
          <button className={`badge-malestar${abierto === r.id ? ' activo' : ''}`} onClick={() => setAbierto(abierto === r.id ? null : r.id)} aria-expanded={abierto === r.id}>
            <span className="pulso" aria-hidden />
            {t(r.concepto)} · {duracion((Date.now() - Date.parse(r.inicio)) / 60000)}
          </button>
          {abierto === r.id ? (
            <span className="menu-malestar" role="menu">
              <span className="suave chico">{t('desde las {hora}', { hora: horaEn(r.inicio, persona.zona_horaria) })}</span>
              <button className="chip activa" onClick={() => void responder(r, 'paso')}>{t('✓ Ya se me pasó')}</button>
              <button className="chip" onClick={() => void responder(r, 'mejor')}>{t('Mejor')}</button>
              <button className="chip" onClick={() => void responder(r, 'igual')}>{t('Igual')}</button>
              <button className="chip" onClick={() => void responder(r, 'peor')}>{t('Peor')}</button>
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

const COLOR: Record<Estado, string> = { paso: 'var(--verde)', mejor: 'var(--verde)', igual: 'var(--ambar)', peor: 'var(--rojo)' };

/** La línea del día de los malestares (tipo Gantt): una barra por cada uno, con su evolución. */
export function LineaMalestares({ persona, fecha, hoy, registros, categorias }: { persona: Persona; fecha: string; hoy: string; registros: Registro[]; categorias: Categoria[] }) {
  const sintoma = categorias.find((c) => c.clave === 'sintoma')?.id;
  const lista = registros.filter((r) => r.categoria_id === sintoma && r.intensidad !== null && (r.fin || r.abierto || r.evolucion?.length));
  if (!lista.length) return null;
  // El día de Patty va de 5 a 5.
  const a = Date.parse(instanteDelDia(fecha, '05:00', persona.zona_horaria));
  const b = a + 24 * 3600000;
  const ahora = Date.now();
  const x = (ms: number) => `${Math.max(0, Math.min(100, ((ms - a) / (b - a)) * 100))}%`;
  const marcas = [8, 12, 16, 20, 24].map((h) => ({ h, ms: a + (h - 5) * 3600000 }));
  return (
    <div className="tarjeta linea-malestares">
      <p className="rotulo-campo">{t('🤕 Malestares del día')}</p>
      <div className="gantt">
        {lista.map((r) => {
          const ini = Date.parse(r.inicio);
          const fin = r.fin ? Date.parse(r.fin) : r.abierto && fecha === hoy ? ahora : ini + 30 * 60000;
          return (
            <div key={r.id} className="gantt-fila">
              <span className="gantt-nombre chico">{t(r.concepto)}</span>
              <span className="gantt-pista">
                <span className={`gantt-barra${r.abierto ? ' sigue' : ''}`} style={{ left: x(ini), width: `calc(${x(fin)} - ${x(ini)})` }} title={`${horaEn(r.inicio, persona.zona_horaria)}${r.fin ? `–${horaEn(r.fin, persona.zona_horaria)}` : ''}`} />
                {(r.evolucion ?? []).map((e) => (
                  <span key={e.t} className="gantt-punto" style={{ left: x(Date.parse(e.t)), background: COLOR[e.estado] }} title={`${horaEn(e.t, persona.zona_horaria)} · ${t(e.estado === 'paso' ? 'Se pasó' : e.estado === 'mejor' ? 'Mejor' : e.estado === 'igual' ? 'Igual' : 'Peor')}`} />
                ))}
              </span>
            </div>
          );
        })}
        <div className="gantt-fila gantt-horas">
          <span />
          <span className="gantt-pista">
            {marcas.map((m) => <span key={m.h} className="suave chico" style={{ left: x(m.ms) }}>{m.h % 24}h</span>)}
          </span>
        </div>
      </div>
    </div>
  );
}
