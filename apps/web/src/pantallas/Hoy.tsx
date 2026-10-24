// El día de la persona: lo anotado, en orden, y el botón para anotar más.
import { useCallback, useEffect, useState } from 'react';
import { esHoraDeEncuesta, useAlTocarAviso } from '../lib/encuesta';
import { hayVoz } from '../lib/voz';
import { guardarSentir, useAlPedirSentir, type Momento } from '../lib/sentir';
import { COMO_ME_SENTI, COMO_ME_SIENTO, TELE, teleDeTipo, teleEnCanal, estadoDe, type DatoAutomatico, type EstadoAnimo, type Persona, type Registro } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { agruparAutomaticos, duracion, resumenDelGrupo } from '../lib/automatico';
import { hoyEn, horaEn, nombreDia, sumarDias } from '../lib/fechas';
import { avisarAnotado } from '../mascota/cara';
import type { Cara } from '../mascota/dibujo';
import { Mascota } from '../mascota/Mascota';
import { Cargar } from './Cargar';
import { Editar } from './Editar';
import { Caritas, esMalo, Sentir } from './Sentir';

/** Después de contestar "¿cómo te sentís ahora?", cuánto tiempo no se vuelve a preguntar en el Día. */
const HORAS_SIN_PREGUNTAR = 3;

const ICONOS_FUENTE: Record<string, string> = { telefono: '📱', ubicacion: '📍', clima: '🌤️', reloj: '⌚' };

const PEDIDOS: Record<Cara, string> = {
  feliz: '',
  espera: '¿Cómo va el día? Contame algo y me pongo contenta.',
  triste: 'Hace días que no me contás nada… Anotá algo, aunque sea a qué hora te levantaste.',
};

/** «Tele: Noticias» y «Tele en TN» van con su «Tele»: en el Día se ve uno solo (y se borran juntos). */
const esParteDeTele = (r: Registro) => r.concepto.startsWith(teleDeTipo('')) || r.concepto.startsWith(teleEnCanal(''));
const partesDe = (r: Registro, todos: Registro[]) => (r.concepto === TELE ? todos.filter((o) => esParteDeTele(o) && o.inicio === r.inicio) : []);

function detalle(r: Registro, tipo: string | undefined): string {
  if (r.intensidad !== null && (r.concepto === COMO_ME_SIENTO || r.concepto === COMO_ME_SENTI)) {
    const e = estadoDe(r.intensidad);
    return `${e.emoji} ${e.nombre}`;
  }
  if (r.intensidad !== null) return `${r.intensidad}/10`;
  if (r.valor === null || tipo === 'hora') return '';
  if (tipo === 'duracion' || r.unidad === 'min') return duracion(r.valor);
  return `${Number(r.valor.toFixed(2))}${r.unidad ? ' ' + r.unidad : ''}`;
}

export function Hoy({ persona, cara }: { persona: Persona; cara: Cara | null }) {
  const { categorias, avisar, festejar, sesion } = useEstado();
  const [fecha, setFecha] = useState(() => hoyEn(persona.zona_horaria));
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [automaticos, setAutomaticos] = useState<DatoAutomatico[]>([]);
  /** La fuente de datos automáticos que está abierta (se ve todo lo que llegó de ella). */
  const [abierto, setAbierto] = useState<string | null>(null);
  /** La hoja de anotar abierta: normal, o directo en "Contarlo" (el botón grande de hablarle). */
  const [cargando, setCargando] = useState<false | 'normal' | 'contar'>(false);
  /** La hoja de "¿cómo te sentís?" abierta: en el momento o del día, con el estado ya elegido o no. */
  const [sintiendo, setSintiendo] = useState<{ momento: Momento; estado: EstadoAnimo | null } | null>(null);
  const [error, setError] = useState('');
  /** Lo anotado que se está cambiando (al tocarlo). */
  const [editando, setEditando] = useState<Registro | null>(null);
  const hoy = hoyEn(persona.zona_horaria);

  const traer = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        api<Registro[]>('GET', `/api/registros?persona=${persona.id}&desde=${fecha}`),
        api<DatoAutomatico[]>('GET', `/api/registros/automaticos?persona=${persona.id}&fecha=${fecha}`).catch(() => []),
      ]);
      setRegistros(r);
      setAutomaticos(a);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [persona.id, fecha]);
  useEffect(() => {
    setRegistros(null);
    setAutomaticos([]);
    void traer();
  }, [traer]);

  const borrar = async (r: Registro) => {
    if (!confirm(`¿Borrar «${r.concepto}» de las ${horaEn(r.inicio, persona.zona_horaria)}?`)) return;
    for (const x of [r, ...partesDe(r, registros ?? [])]) await api('DELETE', `/api/registros/${x.id}`);
    avisar('Borrado');
    avisarAnotado();
    void traer();
  };

  // Tocar el aviso de la noche abre la encuesta del día de hoy.
  useAlTocarAviso(
    useCallback(() => {
      setFecha(hoyEn(persona.zona_horaria));
      setSintiendo({ momento: 'dia', estado: null });
    }, [persona.zona_horaria]),
  );

  // A la noche (desde la hora de la encuesta), si todavía no se contestó, se pregunta por el día entero.
  const [, setVisto] = useState(0);
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && setVisto((n) => n + 1);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  const yaContestoElDia = registros?.some((r) => r.concepto === COMO_ME_SENTI) ?? false;
  const momento: Momento = fecha === hoy && esHoraDeEncuesta() && !yaContestoElDia ? 'dia' : 'ahora';
  // La primera vez que se abre Patty a esa hora sin haber contestado, la encuesta se abre sola (una vez por día):
  // así funciona aunque el aviso se toque agrupado con otros, o se abra la app sin tocarlo.
  useEffect(() => {
    if (momento !== 'dia' || registros === null || sintiendo) return;
    const clave = `encuesta-abierta-${hoy}`;
    try {
      if (localStorage.getItem(clave)) return;
      localStorage.setItem(clave, '1');
    } catch {
      return;
    }
    setSintiendo({ momento: 'dia', estado: null });
  });
  const sentir = async (e: EstadoAnimo) => {
    if (esMalo(e)) return setSintiendo({ momento, estado: e });
    try {
      await guardarSentir({ persona, categorias, momento, estado: e, fecha });
      festejar(`¡Qué bueno! Anotado: ${e.nombre.toLowerCase()}`);
      void traer();
      avisarAnotado();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Tocar la mascota de arriba abre "¿Cómo te sentís?" cuando sea.
  useAlPedirSentir(
    useCallback(() => {
      setFecha(hoyEn(persona.zona_horaria));
      setSintiendo({ momento: 'ahora', estado: null });
    }, [persona.zona_horaria]),
  );

  // Si contestó "cómo me siento" hace menos de 3 horas, la pregunta no aparece (vuelve cada tanto, o tocando la mascota).
  const ultimoSentir = momento === 'ahora' ? registros?.filter((r) => r.concepto === COMO_ME_SIENTO).at(-1) : undefined;
  const contestadoHacePoco = ultimoSentir && Date.now() - new Date(ultimoSentir.inicio).getTime() < HORAS_SIN_PREGUNTAR * 3600000;

  const tipoDe = (r: Registro) => categorias.find((c) => c.id === r.categoria_id);

  return (
    <section className="dia">
      <div className="navdia">
        <button className="btn-icono" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior">‹</button>
        <h2>{nombreDia(fecha, persona.zona_horaria)}</h2>
        <button className="btn-icono" onClick={() => setFecha(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente">›</button>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {fecha === hoy ? (
        contestadoHacePoco ? null : (
          <div className={`tarjeta como-te-sentis${momento === 'dia' ? ' encuesta' : ''}`}>
            <h3>{momento === 'dia' ? '¿Cómo te sentiste hoy?' : '¿Cómo te sentís ahora?'}</h3>
            <Caritas elegir={(e) => void sentir(e)} />
          </div>
        )
      ) : null}
      {registros === null ? (
        <p className="suave centro">…</p>
      ) : registros.length === 0 ? (
        <div className="vacio">
          {fecha === hoy && cara ? <Mascota cara={cara} tamano={120} className="grande" /> : null}
          <p>Nada anotado {fecha === hoy ? 'todavía hoy' : 'este día'}.</p>
          {fecha === hoy && cara && PEDIDOS[cara] ? <p>{PEDIDOS[cara]}</p> : null}
          <p className="suave">Tocá ＋ para anotar a qué hora te levantaste, qué comiste, cómo te sentiste…</p>
        </div>
      ) : (
        <ul className="lista linea">
          {registros.filter((r) => !esParteDeTele(r) || !registros.some((o) => o.concepto === TELE && o.inicio === r.inicio)).map((r) => {
            const cat = tipoDe(r);
            return (
              <li key={r.id} className="tocable" onClick={() => setEditando(r)} onContextMenu={(e) => { e.preventDefault(); void borrar(r); }}>
                <span className="hora">{horaEn(r.inicio, persona.zona_horaria)}</span>
                <span className="icono">{cat?.icono}</span>
                <span className="que">
                  {r.concepto}
                  {detalle(r, cat?.tipo_valor) ? <span className="valor-chip">{detalle(r, cat?.tipo_valor)}</span> : null}
                  {r.nota ? <span className="suave chico"> — {r.nota}</span> : null}
                </span>
                <button className="btn-icono chico" onClick={(e) => { e.stopPropagation(); void borrar(r); }} aria-label={`Borrar ${r.concepto}`}>🗑</button>
              </li>
            );
          })}
        </ul>
      )}
      {automaticos.length ? (
        <div className="tarjeta automatico">
          <h3 className="chico suave">Llegó solo</h3>
          <ul className="lista">
            {agruparAutomaticos(automaticos).map((g) => (
              <li key={g.fuente} className="grupo-auto">
                <button className="renglon-auto" onClick={() => setAbierto(abierto === g.fuente ? null : g.fuente)} aria-expanded={abierto === g.fuente}>
                  <span className="icono">{ICONOS_FUENTE[g.tipo] ?? '📊'}</span>
                  <span className="que">
                    {g.fuente}
                    <span className="suave chico resumen-auto">{resumenDelGrupo(g)}</span>
                  </span>
                  <span className="suave" aria-hidden>{abierto === g.fuente ? '▴' : '▾'}</span>
                </button>
                {abierto === g.fuente ? (
                  <ul className="detalle-auto">
                    {g.lineas.map((l) => (
                      <li key={l.concepto}>
                        <span className="icono">{categorias.find((c) => c.id === l.categoria_id)?.icono}</span>
                        <span className="que">{l.concepto}</span>
                        <span className="valor-chip">{l.valor}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {editando ? (
        <>
          <div className="velo" onClick={() => setEditando(null)} />
          <Editar
            persona={persona}
            registro={editando}
            partes={partesDe(editando, registros ?? [])}
            alCerrar={() => setEditando(null)}
            alGuardar={() => { setEditando(null); void traer(); }}
          />
        </>
      ) : null}
      {sintiendo ? (
        <>
          <div className="velo" onClick={() => setSintiendo(null)} />
          <Sentir
            persona={persona}
            momento={sintiendo.momento}
            estado={sintiendo.estado}
            fecha={fecha}
            alCerrar={() => setSintiendo(null)}
            alGuardar={() => { setSintiendo(null); void traer(); avisarAnotado(); }}
          />
        </>
      ) : null}
      {sesion?.ia ? (
        <button className="contale" onClick={() => setCargando('contar')}>
          <span aria-hidden>{hayVoz() ? '🎙️' : '✍️'}</span>
          Contale a Patty
        </button>
      ) : null}
      <button className="fab" onClick={() => setCargando('normal')} aria-label="Anotar">＋</button>
      {cargando ? (
        <>
          <div className="velo" onClick={() => setCargando(false)} />
          <Cargar persona={persona} fecha={fecha} contar={cargando === 'contar'} alCerrar={() => setCargando(false)} alGuardar={() => { setCargando(false); void traer(); avisarAnotado(); }} />
        </>
      ) : null}
    </section>
  );
}
