// En Más: los objetivos de la persona ("dormir mejor", "comer menos grasas" o lo que escriba). Cada uno tiene su plan, armado
// por la IA con lo que Patty ya sabe (o uno general, si no hay IA), con qué dato mide cada paso. Se pausan, se cumplen y se borran.
// En el Día aparece un seguimiento chico (MetaDelDia). En el código son "metas": `objetivos` son los de una semana.
import { useEffect, useState } from 'react';
import { SUGERENCIAS_META, type MedidaMeta, type Meta, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { t } from '../lib/idioma';

const numero = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** "Horas de sueño: 6,8 h por día (la semana pasada: 6,2)". */
export function textoMedida(m: MedidaMeta): string {
  const nombre = t(m.nombre);
  const ahora = m.ahora ?? null;
  const base =
    m.como === 'dias'
      ? t('{nombre}: {n} de 7 días', { nombre, n: ahora ?? 0 })
      : ahora === null
        ? `${nombre}: ${t('todavía sin datos')}`
        : m.unidad
          ? t('{nombre}: {valor} {unidad} por día', { nombre, valor: numero(ahora), unidad: m.unidad })
          : t('{nombre}: {valor} por día', { nombre, valor: numero(ahora) });
  return m.antes === null ? base : `${base} ${t('(la semana pasada: {valor})', { valor: numero(m.antes) })}`;
}

const AVISOS = {
  sin_ia: 'Sin IA en este servidor: quedó el plan general.',
  limite: 'Llegaste al límite de IA de hoy: quedó el plan que había. Mañana lo podés rehacer.',
  fallo: 'No pude armarlo con IA ahora: quedó el plan que había.',
};

type ConAviso = Meta & { aviso?: keyof typeof AVISOS };

export function Metas({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const { avisar, festejar, sesion } = useEstado();
  const [lista, setLista] = useState<Meta[] | null>(null);
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);
  /** Los objetivos con el plan armándose. */
  const [armando, setArmando] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Meta[]>('GET', `/api/metas?persona=${persona.id}`).then(setLista).catch(() => setLista([]));
  }, [persona.id]);

  const cambiar = (m: Meta) => setLista((l) => (l ?? []).map((x) => (x.id === m.id ? m : x)));
  const armarPlan = async (id: number, rehacer: boolean) => {
    setArmando((l) => [...l, id]);
    try {
      const { aviso, ...m } = await api<ConAviso>('POST', `/api/metas/${id}/plan`, { rehacer });
      cambiar(m);
      if (aviso && (rehacer || aviso !== 'sin_ia')) avisar(t(AVISOS[aviso]));
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setArmando((l) => l.filter((x) => x !== id));
    }
  };
  const crear = async (txt: string, clave?: string) => {
    if (guardando) return;
    setGuardando(true);
    try {
      const m = await api<Meta>('POST', '/api/metas', { persona_id: persona.id, texto: txt, clave });
      setLista((l) => [...(l ?? []), m]);
      setTexto('');
      setAbierta(m.id);
      medir('meta_crear', { sugerida: clave ?? 'libre' });
      // El de base ya se ve; si hay IA, lo cambia por uno a medida.
      if (sesion?.ia) void armarPlan(m.id, false);
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };
  const estado = async (m: Meta, nuevo: Meta['estado']) => {
    try {
      cambiar(await api<Meta>('PUT', `/api/metas/${m.id}`, { estado: nuevo }));
      if (nuevo === 'cumplida') festejar(t('¡Objetivo cumplido! 🏆'));
      medir('meta_estado', { estado: nuevo });
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const borrar = async (m: Meta) => {
    if (!confirm(t('¿Borrar «{objetivo}»? También se va su plan.', { objetivo: m.texto }))) return;
    try {
      await api('DELETE', `/api/metas/${m.id}`);
      setLista((l) => (l ?? []).filter((x) => x.id !== m.id));
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  if (lista === null) return null;
  const tarjeta = (m: Meta) => {
    const abierto = abierta === m.id;
    const midiendo = armando.includes(m.id);
    const logrado = m.estado === 'cumplida';
    return (
      <div key={m.id} className="tarjeta meta">
        <button className="cabeza-meta" onClick={() => setAbierta(abierto ? null : m.id)} aria-expanded={abierto}>
          <span className="emoji-objetivo" aria-hidden>{logrado ? '🏆' : m.emoji}</span>
          <span className="texto-objetivo">{m.texto}</span>
          <span className="suave" aria-hidden>{abierto ? '▾' : '▸'}</span>
        </button>
        {abierto ? (
          <div className="plan-meta">
            {midiendo ? <p className="suave chico">{t('Armando tu plan…')}</p> : null}
            <p>{m.plan.resumen}</p>
            <ol>
              {m.plan.pasos.map((p, i) => {
                const medida = m.medidas.find((x) => x.nombre === p.mide);
                return (
                  <li key={i}>
                    {p.texto}
                    {medida ? <span className="suave chico medida-meta">{textoMedida(medida)}</span> : p.mide ? <span className="suave chico medida-meta">{t('Se mide con: {dato}', { dato: t(p.mide) })}</span> : null}
                  </li>
                );
              })}
            </ol>
            <p className="suave chico">{m.plan.origen === 'ia' ? t('Plan armado con lo que sé de vos.') : t('Plan general, todavía sin tus datos.')}</p>
            {m.medico ? <p className="suave chico aviso-meta">{t('Patty no reemplaza a tu médico: acá van solo consejos generales. Por diagnósticos o cambios de tratamiento, consultalo con un profesional.')}</p> : null}
            {puedeEscribir ? (
              <div className="fila acciones-meta">
                {m.estado === 'activa' ? (
                  <>
                    {sesion?.ia ? <button className="btn chico" disabled={midiendo} onClick={() => void armarPlan(m.id, true)}>{t('Rehacer el plan')}</button> : null}
                    <button className="btn chico" onClick={() => void estado(m, 'pausada')}>{t('Pausar')}</button>
                    <button className="btn chico primario" onClick={() => void estado(m, 'cumplida')}>{t('¡Lo cumplí!')}</button>
                  </>
                ) : (
                  <button className="btn chico" onClick={() => void estado(m, 'activa')}>{t('Retomar')}</button>
                )}
                <button className="btn chico" onClick={() => void borrar(m)}>{t('Borrar')}</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };
  const grupo = (titulo: string, l: Meta[]) =>
    l.length ? (
      <>
        <h3 className="titulo-metas">{titulo}</h3>
        {l.map(tarjeta)}
      </>
    ) : null;
  const yaEsta = new Set(lista.filter((m) => m.estado !== 'cumplida').map((m) => m.clave));
  const sugeridas = SUGERENCIAS_META.filter((s) => !yaEsta.has(s.clave));

  return (
    <>
      {grupo(t('Activos'), lista.filter((m) => m.estado === 'activa'))}
      {puedeEscribir ? (
        <div className="tarjeta nueva-meta">
          <p className="suave">{t('¿Qué te gustaría lograr? Elegí uno o escribí el tuyo, y armo un plan con lo que ya sé de vos.')}</p>
          <div className="chips-meta">
            {sugeridas.map((s) => (
              <button key={s.clave} className="chip" disabled={guardando} onClick={() => void crear(t(s.texto), s.clave)}>
                <span aria-hidden>{s.emoji}</span> {t(s.texto)}
              </button>
            ))}
          </div>
          <form
            className="fila"
            onSubmit={(e) => {
              e.preventDefault();
              if (texto.trim()) void crear(texto.trim());
            }}
          >
            <input value={texto} maxLength={120} onChange={(e) => setTexto(e.target.value)} placeholder={t('Otro objetivo, con tus palabras')} aria-label={t('Otro objetivo, con tus palabras')} />
            <button className="btn primario" type="submit" disabled={guardando || !texto.trim()}>{t('Agregar')}</button>
          </form>
        </div>
      ) : null}
      {grupo(t('En pausa'), lista.filter((m) => m.estado === 'pausada'))}
      {grupo(t('Cumplidos'), lista.filter((m) => m.estado === 'cumplida'))}
    </>
  );
}
