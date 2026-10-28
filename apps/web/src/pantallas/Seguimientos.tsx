// En Más: los seguimientos. Arriba los activos (con cuándo terminan, y terminarlos antes); abajo las plantillas, las de
// siempre y las propias, para activar por unos días o armar una nueva a partir de otra (qué cosas seguir, a qué horas
// pregunta Patty y por cuántos días). Lo puede hacer la persona o alguien de su familia, para ella.
import { useEffect, useState } from 'react';
import { ITEMS_SEGUIMIENTO, PLANTILLAS_SEGUIMIENTO, type Persona, type PlantillaSeguimiento, type Seguimiento } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { locale, t } from '../lib/idioma';
import { activarSeguimiento, EVENTO_SEGUIMIENTOS, terminarSeguimiento, traerSeguimientos } from '../lib/seguimientos';

type Propia = PlantillaSeguimiento & { id: number };
/** 0: hasta que se desactive. */
const DIAS = [1, 3, 5, 7, 14, 30, 0];
const nombreDias = (n: number) => (n === 0 ? t('Hasta que lo desactive') : n === 1 ? t('1 día') : t('{n} días', { n }));

export function Seguimientos({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const { festejar, avisar } = useEstado();
  const [activos, setActivos] = useState<Seguimiento[]>([]);
  const [propias, setPropias] = useState<Propia[]>([]);
  const [editando, setEditando] = useState<(PlantillaSeguimiento & { id?: number }) | null>(null);
  const [dias, setDias] = useState<Record<string, number>>({});
  /** La plantilla abierta (con el detalle de qué sigue). */
  const [detalle, setDetalle] = useState<string | null>(null);
  const traer = () =>
    void traerSeguimientos(persona.id)
      .then((r) => {
        setActivos(r.activos);
        setPropias(r.plantillas);
      })
      .catch(() => {});
  useEffect(() => {
    traer();
    window.addEventListener(EVENTO_SEGUIMIENTOS, traer);
    return () => window.removeEventListener(EVENTO_SEGUIMIENTOS, traer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.id]);

  const hacer = async (f: () => Promise<unknown>, ok?: string) => {
    try {
      await f();
      if (ok) festejar(ok);
      traer();
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const activar = (p: PlantillaSeguimiento, clave: string) => {
    const n = dias[clave] ?? p.dias;
    medir('seguimiento_activar', { plantilla: p.nombre, dias: n });
    void hacer(() => activarSeguimiento(persona.id, { ...p, dias: n }), n ? t('{emoji} Activado por {n} días', { emoji: p.emoji, n }) : t('{emoji} Activado hasta que lo desactives', { emoji: p.emoji }));
  };
  const guardar = (p: PlantillaSeguimiento & { id?: number }) =>
    void hacer(async () => {
      if (p.id) await api('PUT', `/api/seguimientos/plantillas/${p.id}`, p);
      else await api('POST', '/api/seguimientos/plantillas', { ...p, persona_id: persona.id });
      setEditando(null);
    }, t('Plantilla guardada'));
  const fecha = (iso: string) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));

  if (editando) return <Editor plantilla={editando} alGuardar={guardar} alCancelar={() => setEditando(null)} />;

  /** Las cosas de una plantilla en dos grupos: las que se piden en cada aviso y las de una vez al día. */
  const grupos = (p: PlantillaSeguimiento) => {
    const its = p.items.map((c) => ITEMS_SEGUIMIENTO.find((i) => i.clave === c)).filter((i): i is NonNullable<typeof i> => Boolean(i));
    return (['cada_vez', 'dia'] as const)
      .map((f) => ({ f, lista: its.filter((i) => i.frecuencia === f) }))
      .filter((g) => g.lista.length)
      .map((g) => (
        <div key={g.f} className="grupo-plantilla">
          <span className="rotulo-grupo chico">
            <span className={`frecuencia ${g.f}`}>{g.f === 'cada_vez' ? '↻' : '1×'}</span> {g.f === 'cada_vez' ? t('En cada aviso') : t('Una vez al día')}
          </span>
          <ul className="lista-plantilla">
            {g.lista.map((i) => (
              <li key={i.clave}>
                <span className="emoji-item" aria-hidden>{i.emoji}</span>
                <span>{t(i.nombre)}</span>
                {i.opcional ? <span className="suave chico">{t('si pasa')}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ));
  };
  const tarjeta = (p: PlantillaSeguimiento, clave: string, propia?: Propia) => {
    const abierta = detalle === clave;
    return (
      <div key={clave} className={`tarjeta plantilla-seguimiento${abierta ? ' abierta' : ''}`}>
        <button className="cabeza-plantilla" onClick={() => setDetalle(abierta ? null : clave)} aria-expanded={abierta}>
          <span className="emoji-plantilla" aria-hidden>{p.emoji}</span>
          <span>
            <strong>{t(p.nombre)}</strong>
            <span className="suave chico resumen-plantilla">
              {t('{n} cosas', { n: p.items.length })}
              {' · '}
              {p.horarios.length ? t('avisa {n} veces: {horas}', { n: p.horarios.length, horas: p.horarios.join(', ') }) : t('sin avisos')}
            </span>
          </span>
          <span className="suave" aria-hidden>{abierta ? '▴' : '▾'}</span>
        </button>
        {abierta ? <div className="detalle-plantilla">{grupos(p)}</div> : null}
        {puedeEscribir ? (
          <div className="acciones-plantilla">
            <select value={dias[clave] ?? p.dias} onChange={(e) => setDias({ ...dias, [clave]: Number(e.target.value) })} aria-label={t('Por cuántos días')}>
              {[...new Set([...DIAS, p.dias])].sort((a, b) => (a || 999) - (b || 999)).map((n) => <option key={n} value={n}>{nombreDias(n)}</option>)}
            </select>
            <button className="btn primario" onClick={() => activar(p, clave)}>{t('Activar')}</button>
          </div>
        ) : null}
        {puedeEscribir ? (
          <div className="fila enlaces-plantilla">
            <button className="enlace chico" onClick={() => setEditando(propia ?? { ...p, nombre: p.nombre })}>{propia ? t('Editar') : t('Armar una a partir de esta')}</button>
            {propia ? <button className="enlace chico" onClick={() => void hacer(() => api('DELETE', `/api/seguimientos/plantillas/${propia.id}`))}>{t('Borrar')}</button> : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <p className="suave chico">{t('Para cuando hace falta registrar más de cerca por un tiempo: Patty muestra en el Día qué falta de hoy y pregunta a las horas que elijas. Lo puede activar la persona o alguien de su familia.')}</p>
      <p className="suave chico leyenda-frecuencia">
        <span className="frecuencia cada_vez">↻</span> {t('se vuelve a pedir en cada aviso')} · <span className="frecuencia dia">1×</span> {t('alcanza con una vez al día')}
      </p>
      {activos.length ? (
        <div className="tarjeta">
          <h3>{t('Activos')}</h3>
          <ul className="lista-simple">
            {activos.map((s) => (
              <li key={s.id} className="fila-activo">
                <span>{s.emoji} <strong>{t(s.nombre)}</strong> <span className="suave chico">{s.dias ? t('hasta el {fecha}', { fecha: fecha(s.hasta) }) : t('hasta que lo desactives')}{s.activado_por ? ` · ${t('lo activó {quien}', { quien: s.activado_por })}` : ''}</span></span>
                {puedeEscribir ? <button className="btn chico" onClick={() => void hacer(() => terminarSeguimiento(s.id), t('Seguimiento terminado'))}>{t('Terminar')}</button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {propias.map((p) => tarjeta(p, `propia-${p.id}`, p))}
      {PLANTILLAS_SEGUIMIENTO.map((p) => tarjeta(p, p.nombre))}
      {puedeEscribir ? (
        <button className="btn ancho" onClick={() => setEditando({ nombre: '', emoji: '🩺', items: ['sentir'], horarios: ['20:00'], dias: 5 })}>{t('＋ Armar una plantilla nueva')}</button>
      ) : null}
    </>
  );
}

function Editor({ plantilla, alGuardar, alCancelar }: { plantilla: PlantillaSeguimiento & { id?: number }; alGuardar(p: PlantillaSeguimiento & { id?: number }): void; alCancelar(): void }) {
  const [p, setP] = useState(plantilla);
  const [hora, setHora] = useState('12:00');
  const alternar = (c: string) => setP({ ...p, items: p.items.includes(c) ? p.items.filter((x) => x !== c) : [...p.items, c] });
  return (
    <div className="tarjeta editor-seguimiento">
      <h3>{p.id ? t('Editar plantilla') : t('Nueva plantilla')}</h3>
      <div className="fila">
        <input className="emoji-input" value={p.emoji} onChange={(e) => setP({ ...p, emoji: e.target.value })} aria-label={t('Emoji')} />
        <input value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} placeholder={t('Ej: Muelas del juicio')} aria-label={t('Nombre')} />
      </div>
      <p className="rotulo-campo">{t('Qué seguir cada día')}</p>
      <div className="chips envolver">
        {ITEMS_SEGUIMIENTO.map((i) => (
          <button key={i.clave} type="button" className={`chip${p.items.includes(i.clave) ? ' activa' : ''}`} onClick={() => alternar(i.clave)}>
            {i.emoji} {t(i.nombre)} <span className={`frecuencia ${i.frecuencia}`}>{i.frecuencia === 'cada_vez' ? '↻' : '1×'}</span>
          </button>
        ))}
      </div>
      <p className="suave chico">
        <span className="frecuencia cada_vez">↻</span> {t('se vuelve a pedir en cada aviso (la fiebre, cómo te sentís)')} · <span className="frecuencia dia">1×</span> {t('alcanza con una vez al día (el almuerzo)')}
      </p>
      <p className="rotulo-campo">{t('A qué horas pregunta Patty')}</p>
      <div className="chips envolver">
        {p.horarios.map((h) => (
          <button key={h} type="button" className="chip activa" onClick={() => setP({ ...p, horarios: p.horarios.filter((x) => x !== h) })}>{h} ✕</button>
        ))}
      </div>
      <div className="fila">
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} aria-label={t('Hora')} />
        <button type="button" className="btn chico" onClick={() => setP({ ...p, horarios: [...new Set([...p.horarios, hora])].sort() })}>{t('Agregar hora')}</button>
      </div>
      <label>
        {t('Por cuántos días (de entrada)')}
        <select value={p.dias} onChange={(e) => setP({ ...p, dias: Number(e.target.value) })}>
          {[...new Set([...DIAS, p.dias])].sort((a, b) => (a || 999) - (b || 999)).map((n) => <option key={n} value={n}>{nombreDias(n)}</option>)}
        </select>
      </label>
      <div className="fila">
        <button className="btn primario" disabled={!p.nombre.trim() || !p.items.length} onClick={() => alGuardar(p)}>{t('Guardar')}</button>
        <button className="btn" onClick={alCancelar}>{t('Cancelar')}</button>
      </div>
    </div>
  );
}
