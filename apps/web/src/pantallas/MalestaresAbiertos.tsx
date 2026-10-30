// Lo que dura (malestares y actividades), en una sola línea del día tipo Gantt: una barra por cada uno, de cuando
// empezó a cuando terminó (o hasta ahora, rayada, si sigue), con un puntito cada vez que se contó cómo iba. Al lado,
// cómo está ("sigue · 3 h 12 min" o "terminó · 1 h 05"). Tocando la fila se resuelve ahí: un malestar, ya se me pasó /
// mejor / igual / peor; una actividad, terminé (a la hora que vio la ubicación, o recién) / sigo; lo terminado, editar.
// Lo que sigue abierto desde otro día también aparece (entra por la izquierda).
import { IconoCategoria, IconoMedio } from '../ui/IconosPatty';
import { IconoLapiz } from '../ui/Iconos';
import { useEffect, useState } from 'react';
import type { Categoria, Persona, Registro, SesionEscucha } from 'shared';
import { api } from '../api';
import { guardado } from '../lib/guardado';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { duracion } from '../lib/automatico';
import { borrarEscuchas } from '../lib/escuchas';
import { NOMBRE_ESCUCHA, principal } from './EscuchasDelDia';
import { horaEn, instanteDelDia } from '../lib/fechas';
import { t } from '../lib/idioma';
import { useMinuto } from '../lib/reloj';

type Estado = 'paso' | 'igual' | 'mejor' | 'peor';
const COLOR: Record<Estado, string> = { paso: 'var(--verde)', mejor: 'var(--verde)', igual: 'var(--ambar)', peor: 'var(--rojo)' };

export function LineaDelDia({ persona, fecha, hoy, registros, categorias, vuelta, alCambiar, alEditar }: {
  persona: Persona;
  fecha: string;
  hoy: string;
  registros: Registro[];
  categorias: Categoria[];
  vuelta: number;
  alCambiar(): void;
  alEditar(r: Registro): void;
}) {
  const { festejar, avisar } = useEstado();
  const sintoma = categorias.find((c) => c.clave === 'sintoma')?.id;
  const actividad = categorias.find((c) => c.clave === 'actividad')?.id;
  const ahora = useMinuto();
  // Lo abierto de otros días (un dolor de anoche que sigue): se trae aparte.
  const [abiertos, setAbiertos] = useState<Registro[]>([]);
  const [tocada, setTocada] = useState<number | null>(null);
  const cada10 = Math.floor(ahora / 600000);
  useEffect(() => {
    if (fecha !== hoy) return setAbiertos([]);
    api<Registro[]>('GET', `/api/registros/abiertos?persona=${persona.id}`).then(setAbiertos).catch(() => {});
  }, [persona.id, fecha, hoy, vuelta, cada10]);

  // Lo que sonó en el teléfono (música, podcasts, videos): una fila más por tipo, al final y cerrada; al tocarla, las
  // sesiones con lo que más sonó y sus géneros.
  const [escuchas, setEscuchas] = useState<SesionEscucha[]>(() => guardado<SesionEscucha[]>(`/api/medios/escuchas?persona=${persona.id}&fecha=${fecha}`) ?? []);
  const [escuchaAbierta, setEscuchaAbierta] = useState<SesionEscucha['tipo'] | null>(null);
  useEffect(() => {
    api<SesionEscucha[]>('GET', `/api/medios/escuchas?persona=${persona.id}&fecha=${fecha}`).then(setEscuchas).catch(() => setEscuchas([]));
  }, [persona.id, fecha, vuelta, cada10]);

  const delDia = registros.filter(
    (r) => (r.categoria_id === sintoma && r.intensidad !== null && (r.fin || r.abierto || r.evolucion?.length)) || (r.categoria_id === actividad && (r.fin || r.abierto)),
  );
  const lista = [...delDia, ...abiertos.filter((a) => !delDia.some((r) => r.id === a.id))].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  if (!lista.length && !escuchas.length) return null;

  // El día de Patty va de 5 a 5.
  const a = Date.parse(instanteDelDia(fecha, '05:00', persona.zona_horaria));
  const b = a + 24 * 3600000;
  const x = (ms: number) => `${Math.max(0, Math.min(100, ((ms - a) / (b - a)) * 100))}%`;
  const marcas = [8, 12, 16, 20, 24].map((h) => ({ h, ms: a + (h - 5) * 3600000 }));

  const borrarTodoLoEscuchado = async () => {
    if (!confirm(t('¿Borrar todo lo que Patty anotó que escuchaste o miraste en el teléfono? No se puede deshacer.'))) return;
    try {
      await borrarEscuchas(persona.id);
      setEscuchas([]);
      avisar(t('Borrado'));
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  const responder = async (r: Registro, estado: Estado, fin?: string) => {
    setTocada(null);
    const esActividad = r.categoria_id === actividad;
    try {
      await api('POST', `/api/registros/${r.id}/seguir`, { estado, ...(fin ? { fin } : {}) });
      medir(esActividad ? 'actividad_sigue' : 'malestar_sigue', { estado });
      const cuanto = duracion(((fin ? Date.parse(fin) : Date.now()) - Date.parse(r.inicio)) / 60000);
      festejar(
        esActividad
          ? estado === 'paso'
            ? t('¡Bien ahí! {que}: {cuanto} 💪', { que: t(r.concepto), cuanto })
            : t('¡Dale! Te pregunto después 💪')
          : estado === 'paso'
            ? t('¡Qué bueno! Se te pasó {que} (duró {cuanto}) 💜', { que: t(r.concepto).toLowerCase(), cuanto })
            : estado === 'mejor'
              ? t('¡Bien que vaya mejorando! 💜')
              : t('Anotado. Te pregunto más tarde 💜'),
        esActividad || estado === 'paso' || estado === 'mejor' ? 'feliz' : 'espera',
      );
      if (estado === 'paso') setAbiertos((l) => l.filter((y) => y.id !== r.id));
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  return (
    <div className="tarjeta linea-malestares malestares-abiertos">
      <div className="gantt">
        {lista.map((r) => {
          const esActividad = r.categoria_id === actividad;
          const ini = Date.parse(r.inicio);
          const sigue = Boolean(r.abierto);
          const fin = r.fin ? Date.parse(r.fin) : sigue ? ahora : ini + 30 * 60000;
          const abierta = tocada === r.id;
          const estado = sigue
            ? t('sigue · {cuanto}', { cuanto: duracion((ahora - ini) / 60000) })
            : r.fin
              ? t('terminó · {cuanto}', { cuanto: duracion((fin - ini) / 60000) })
              : t('a las {hora}', { hora: horaEn(r.inicio, persona.zona_horaria) });
          return (
            <div key={r.id} className={`gantt-item${abierta ? ' abierta' : ''}`}>
              <button className={`gantt-fila tocable-gantt${esActividad ? ' actividad' : ''}`} onClick={() => setTocada(abierta ? null : r.id)} aria-expanded={abierta}>
                <span className="gantt-nombre">
                  <span className="chico">{t(r.concepto)}</span>
                  <span className={`gantt-estado${sigue ? ' sigue' : ''}`}>
                    {sigue ? <span className="pulso" aria-hidden /> : null}
                    {estado}
                  </span>
                </span>
                <span className="gantt-pista">
                  {marcas.map((m) => <span key={m.h} className="gantt-tick" style={{ left: x(m.ms) }} aria-hidden />)}
                  {fecha === hoy ? <span className="gantt-ahora" style={{ left: x(ahora) }} aria-hidden /> : null}
                  {ini < a ? <span className="gantt-antes" aria-hidden>◂</span> : null}
                  <span className={`gantt-barra${sigue ? ' sigue' : ''}${esActividad ? ' actividad' : ''}`} style={{ left: x(ini), width: `calc(${x(fin)} - ${x(ini)})` }} />
                  {(r.evolucion ?? []).map((e) => (
                    <span key={e.t} className="gantt-punto" style={{ left: x(Date.parse(e.t)), background: COLOR[e.estado] }} />
                  ))}
                  {(r.remedios ?? []).map((m) => (
                    <span key={`${m.t}${m.concepto}`} className="gantt-remedio" style={{ left: x(Date.parse(m.t)) }} title={t(m.concepto)} aria-hidden>
                      <IconoCategoria clave="medicacion" tamano={16} />
                    </span>
                  ))}
                </span>
              </button>
              {abierta ? (
                <div className="gantt-acciones">
                  <span className="suave chico">
                    {horaEn(r.inicio, persona.zona_horaria)}
                    {r.fin ? `–${horaEn(r.fin, persona.zona_horaria)}` : ` → ${t('ahora')}`}
                  </span>
                  {(r.remedios ?? []).map((m) => (
                    <span key={`${m.t}${m.concepto}`} className="suave chico remedio-del-malestar">
                      <IconoCategoria clave="medicacion" tamano={16} /> {t(m.concepto)} {horaEn(m.t, persona.zona_horaria)}
                    </span>
                  ))}
                  <div className="gantt-botones">
                    {sigue && esActividad ? (
                      <>
                        {r.fin_sugerido ? (
                          <button className="btn chico" onClick={() => void responder(r, 'paso', r.fin_sugerido!)}>{t('Terminé a las {hora}', { hora: horaEn(r.fin_sugerido, persona.zona_horaria) })}</button>
                        ) : null}
                        <button className="btn chico" onClick={() => void responder(r, 'paso')}>{t('Terminé recién')}</button>
                        <button className="btn chico" onClick={() => void responder(r, 'igual')}>{t('Sigo')}</button>
                      </>
                    ) : sigue ? (
                      <>
                        <button className="btn chico" onClick={() => void responder(r, 'paso')}>{t('Ya se me pasó')}</button>
                        <button className="btn chico" onClick={() => void responder(r, 'mejor')}>{t('Mejor')}</button>
                        <button className="btn chico" onClick={() => void responder(r, 'igual')}>{t('Igual')}</button>
                        <button className="btn chico" onClick={() => void responder(r, 'peor')}>{t('Peor')}</button>
                      </>
                    ) : null}
                    <button className="btn chico" onClick={() => { setTocada(null); alEditar(r); }}><IconoLapiz tamano={16} /> {t('Editar')}</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {(['musica', 'podcast', 'video'] as const).map((tipo) => {
          const ses = escuchas.filter((s) => s.tipo === tipo);
          if (!ses.length) return null;
          const minutos = ses.reduce((n, s) => n + s.minutos, 0);
          const abierta = escuchaAbierta === tipo;
          const generos = [...new Set(ses.flatMap((s) => s.generos ?? []))];
          return (
            <div key={tipo} className={`gantt-item escucha${abierta ? ' abierta' : ''}`}>
              <button className="gantt-fila tocable-gantt escucha" onClick={() => setEscuchaAbierta(abierta ? null : tipo)} aria-expanded={abierta}>
                <span className="gantt-nombre">
                  <span className="chico"><IconoMedio tipo={tipo === 'video' ? 'tele' : tipo} tamano={14} /> {t(NOMBRE_ESCUCHA[tipo])}</span>
                  <span className="gantt-estado">{duracion(minutos)}{generos.length ? ` · ${generos.slice(0, 2).map((g) => t(g)).join(', ')}` : ''}</span>
                </span>
                <span className="gantt-pista">
                  {marcas.map((m) => <span key={m.h} className="gantt-tick" style={{ left: x(m.ms) }} aria-hidden />)}
                  {fecha === hoy ? <span className="gantt-ahora" style={{ left: x(ahora) }} aria-hidden /> : null}
                  {ses.map((s) => (
                    <span key={s.inicio} className="gantt-barra escucha" style={{ left: x(s.inicio), width: `max(3px, calc(${x(s.fin)} - ${x(s.inicio)}))` }} />
                  ))}
                </span>
              </button>
              {abierta ? (
                <div className="gantt-acciones escuchas-detalle">
                  {ses.map((s) => (
                    <div key={s.inicio} className="escucha-sesion">
                      <span className="suave chico">
                        {horaEn(new Date(s.inicio).toISOString(), persona.zona_horaria)}–{horaEn(new Date(s.fin).toISOString(), persona.zona_horaria)} · {duracion(s.minutos)} · {s.apps.join(', ')}
                      </span>
                      <span>{principal(s)}</span>
                      {s.generos?.length ? (
                        <span className="chips envolver">
                          {s.generos.map((g) => <span key={g} className="chip chico">{t(g)}</span>)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  <button className="enlace chico" onClick={() => void borrarTodoLoEscuchado()}>{t('Borrar todo lo escuchado')}</button>
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="gantt-fila gantt-horas">
          <span />
          <span className="gantt-pista">
            {/* La hora que cae justo donde dice "ahora" no se escribe (se pisarían). */}
            {marcas.filter((m) => fecha !== hoy || Math.abs(m.ms - ahora) > 80 * 60000).map((m) => <span key={m.h} className="suave chico" style={{ left: x(m.ms) }}>{m.h % 24}h</span>)}
            {fecha === hoy ? <span className="gantt-ahora-rotulo" style={{ left: x(ahora) }}>{t('ahora')}</span> : null}
          </span>
        </div>
      </div>
    </div>
  );
}
