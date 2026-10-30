// Admin → Datos: lo que produjo la IA (y el motor) en una línea de tiempo, los patrones de todas las personas con su
// estadística, y la auditoría de lo que cambiaron los administradores.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';
import { Grilla, fechaHora, hace, useEditor, usePersonas, type Fila } from './AdminDatos';

interface LineaIa { tipo: string; id: string; persona_id: number | null; persona: string | null; creado: string; texto: string | null; datos: Record<string, unknown> | null }
interface DatosIa {
  dias: number;
  linea: LineaIa[];
  consumo: Array<{ tipo: string; pedidos: number; entrada: number; salida: number; usuarios: number }>;
  consumo_de: 'dueños' | 'todos';
  procesos: Array<{ nombre: string; ultimo_inicio: string | null; ultima_duracion_ms: number | null; ultimo_ok: boolean | null; ultimo_error: string | null; ultimo_trabajo: string | null; corridas: number; fallas: number; procesados: number }>;
}

const TIPOS: Record<string, [string, string]> = {
  analisis: ['🔎', 'Análisis de patrones'],
  resumen_noche: ['🌙', 'Resumen de la noche'],
  resumen_semana: ['🗓️', 'Resumen de la semana'],
  comentarios: ['💬', 'Comentario del día'],
  contexto_registro: ['⏪', '¿Qué pasó antes?'],
  fuera_de_lo_normal: ['📈', 'Fuera de lo normal'],
  preguntas: ['❓', 'Pregunta a Patty'],
  registros_ia: ['🦉', 'Anotación interpretada'],
};

/** Dónde vive cada cosa de la línea de tiempo, para abrirla en el editor. */
function claveDe(x: LineaIa): [string, Record<string, unknown>] {
  if (x.tipo === 'resumen_noche' || x.tipo === 'resumen_semana') {
    const [persona_id, f] = x.id.split('|');
    return [x.tipo, { persona_id, [x.tipo === 'resumen_noche' ? 'noche' : 'semana']: f }];
  }
  if (x.tipo === 'contexto_registro') return ['contexto_registro', { registro_id: x.id }];
  if (x.tipo === 'registros_ia') return ['registros', { id: x.id }];
  return [x.tipo, { id: x.id }];
}

export function AdminDatosIa() {
  const gente = usePersonas();
  const [persona, setPersona] = useState('');
  const [tipo, setTipo] = useState('');
  const [dias, setDias] = useState(14);
  const [d, setD] = useState<DatosIa | null>(null);
  const [error, setError] = useState('');
  const traer = useCallback(() => {
    const q = new URLSearchParams({ dias: String(dias) });
    if (persona) q.set('persona_id', persona);
    if (tipo) q.set('tipo', tipo);
    api<DatosIa>('GET', `/api/admin/datos/ia?${q}`).then(setD).catch((e: Error) => setError(e.message));
  }, [persona, tipo, dias]);
  useEffect(() => traer(), [traer]);
  const { abrir, editor } = useEditor(traer);

  const porTipo = d ? Object.entries(d.linea.reduce<Record<string, number>>((a, x) => ({ ...a, [x.tipo]: (a[x.tipo] ?? 0) + 1 }), {})) : [];
  return (
    <>
      <div className="filtros-datos">
        <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label={t('Persona')}>
          <option value="">{t('Todas las personas')}</option>
          {gente.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label={t('Tipo')}>
          <option value="">{t('Todo lo que hizo la IA')}</option>
          {Object.entries(TIPOS).map(([k, [, n]]) => <option key={k} value={k}>{t(n)}</option>)}
        </select>
        <div className="segmentos">
          {[1, 7, 14, 30, 90].map((n) => <button key={n} className={dias === n ? 'activa' : ''} onClick={() => setDias(n)}>{n === 1 ? t('24 h') : t('{n} días', { n })}</button>)}
        </div>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {!d ? <p className="suave centro">{t('Cargando…')}</p> : (
        <div className="columnas-admin">
          <div>
            <div className="tarjeta">
              <h3>{t('Línea de tiempo')} <span className="suave chico">({d.linea.length}{d.linea.length >= 300 ? '+' : ''})</span></h3>
              <div className="chips envolver">
                {porTipo.map(([k, n]) => <span key={k} className="chip">{t(TIPOS[k]?.[1] ?? k)} · {n}</span>)}
              </div>
              {d.linea.length ? (
                <ul className="lista-simple linea-ia">
                  {d.linea.map((x) => (
                    <li key={`${x.tipo}|${x.id}`} onClick={() => abrir(...claveDe(x))}>
                      <span className="suave chico">
                        {t(TIPOS[x.tipo]?.[1] ?? x.tipo)} · {x.persona ?? '—'} · {fechaHora(x.creado)}
                      </span>
                      <span>{x.texto || <span className="neg">{t('(sin texto: la IA no contestó)')}</span>}</span>
                      {x.datos ? <span className="suave chico datos-ia">{JSON.stringify(x.datos)}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="suave">{t('Nada en este período.')}</p>}
            </div>
          </div>
          <div>
            <div className="tarjeta">
              <h3>{d.consumo_de === 'todos' ? t('Consumo de la IA por tipo') : t('Consumo de la IA de los dueños de esta persona')}</h3>
              <Grilla filas={d.consumo.map((c) => ({ tipo: c.tipo, pedidos: c.pedidos, usuarios: c.usuarios, 'tokens entrada': Number(c.entrada), 'tokens salida': Number(c.salida) }))} />
            </div>
            <div className="tarjeta">
              <h3>{t('Procesos que corren solos')} <span className="suave chico">({t('de toda la app')})</span></h3>
              <Grilla
                filas={d.procesos.map((p) => ({ proceso: p.nombre, estado: p.ultimo_ok === false ? `Error: ${p.ultimo_error ?? ''}` : p.ultimo_ok ? 'OK' : '—', corrió: hace(p.ultimo_inicio), 'último trabajo': hace(p.ultimo_trabajo), corridas: p.corridas, fallas: p.fallas, procesados: p.procesados }))}
                marcar={(f) => (String(f.estado).startsWith('Error') ? 'con-error' : undefined)}
              />
            </div>
          </div>
        </div>
      )}
      {editor}
    </>
  );
}

const ESTADOS = ['nuevo', 'confirmado', 'obvio', 'descartado'];
const pct = (x: unknown) => `${Math.round(Number(x) * 100)}%`;

export function AdminDatosHallazgos() {
  const { avisar } = useEstado();
  const gente = usePersonas();
  const [persona, setPersona] = useState('');
  const [estado, setEstado] = useState('');
  const [lista, setLista] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');
  const traer = useCallback(() => {
    const q = new URLSearchParams();
    if (persona) q.set('persona_id', persona);
    if (estado) q.set('estado', estado);
    api<Fila[]>('GET', `/api/admin/datos/hallazgos?${q}`).then(setLista).catch((e: Error) => setError(e.message));
  }, [persona, estado]);
  useEffect(() => traer(), [traer]);
  const { abrir, editor } = useEditor(traer);

  const cambiarEstado = async (id: unknown, nuevo: string) => {
    try {
      await api('POST', '/api/admin/datos/tablas/hallazgos/editar', { clave: { id }, cambios: { estado: nuevo } });
      avisar(t('Estado cambiado'));
      traer();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="filtros-datos">
        <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label={t('Persona')}>
          <option value="">{t('Todas las personas')}</option>
          {gente.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label={t('Estado')}>
          <option value="">{t('Todos los estados')}</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {!lista ? <p className="suave centro">{t('Cargando…')}</p> : !lista.length ? <p className="tarjeta suave">{t('Todavía no hay patrones.')}</p> : (
        <div className="tarjeta">
          <h3>{t('{n} patrones', { n: lista.length })}</h3>
          <div className="grilla-caja">
            <table className="grilla">
              <thead>
                <tr>
                  <th>{t('Persona')}</th><th>{t('Causa')}</th><th>{t('Efecto')}</th><th>{t('Días después')}</th><th>{t('Con / sin')}</th><th>lift</th><th>p</th><th>q</th>
                  <th>{t('Soporte')}</th><th>{t('Puntaje')}</th><th>{t('Estado')}</th><th>{t('Explicación')}</th><th>{t('Detectado')}</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((h) => (
                  <tr key={String(h.id)} className={h.estado === 'descartado' ? 'borrada' : undefined}>
                    <td>{String(h.persona)}</td>
                    <td className="clic" onClick={() => abrir('hallazgos', { id: h.id })}>
                      {h.protege ? t('protege') + ' · ' : ''}{String(h.causa)} <span className="suave chico">{String(h.causa_modo)}{h.umbral !== null ? ` ≥${String(h.umbral)}` : ''}</span>
                      {Array.isArray(h.causas_extra) && h.causas_extra.length ? <span className="suave chico"> +{h.causas_extra.length}</span> : null}
                    </td>
                    <td>{String(h.efecto)} <span className="suave chico">{String(h.efecto_modo)}</span></td>
                    <td>{String(h.desfase_dias)}</td>
                    <td>{pct(h.prob_con)} / {pct(h.prob_sin)}</td>
                    <td>{Number(h.lift).toFixed(2)}</td>
                    <td>{Number(h.p_valor).toFixed(3)}</td>
                    <td className={Number(h.q_valor) > 0.2 ? 'neg' : undefined}>{Number(h.q_valor).toFixed(3)}</td>
                    <td>{String(h.soporte)}/{String(h.dias_causa)} <span className="suave chico">({String(h.dias_evaluados)} d)</span></td>
                    <td>{Number(h.puntaje).toFixed(2)}</td>
                    <td>
                      <select value={String(h.estado)} onChange={(e) => void cambiarEstado(h.id, e.target.value)}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </td>
                    <td className="texto-largo" title={String(h.explicacion ?? '')}>{h.explicacion ? String(h.explicacion) : <span className="neg">{t('sin explicación')}</span>}</td>
                    <td>{fechaHora(String(h.detectado))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editor}
    </>
  );
}

interface Auditoria { id: number; accion: string; tabla: string | null; clave: unknown; antes: unknown; despues: unknown; detalle: string | null; creado: string; usuario: string | null }

const ACCION: Record<string, string> = { editar: 'Editó', borrar: 'Borró', borrar_logico: 'Marcó borrada', corregir: 'Corrigió' };

export function AdminDatosAuditoria() {
  const [lista, setLista] = useState<Auditoria[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => void api<Auditoria[]>('GET', '/api/admin/datos/auditoria').then(setLista).catch((e: Error) => setError(e.message)), []);
  if (!lista) return <p className="suave centro">{error || t('Cargando…')}</p>;
  if (!lista.length) return <p className="tarjeta suave">{t('Todavía nadie cambió nada desde acá.')}</p>;
  return (
    <div className="tarjeta">
      <h3>{t('Lo que cambiaron los administradores')}</h3>
      <ul className="lista-simple auditoria">
        {lista.map((a) => (
          <li key={a.id}>
            <span>
              <strong>{t(ACCION[a.accion] ?? a.accion)}</strong> {a.tabla ? <code>{a.tabla}</code> : null} <code>{JSON.stringify(a.clave)}</code>
              <span className="suave chico"> · {a.usuario ?? '—'} · {fechaHora(a.creado)}</span>
            </span>
            {a.detalle ? <span className="suave chico">{a.detalle}</span> : null}
            <span className="cambio-auditoria">
              <code className="antes">{a.antes === null ? '—' : JSON.stringify(a.antes)}</code>
              <span>→</span>
              <code className="despues">{a.despues === null ? '—' : JSON.stringify(a.despues)}</code>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
