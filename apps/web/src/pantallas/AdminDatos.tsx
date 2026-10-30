// Administración → Datos: lo que comparten las pantallas de datos (la grilla, el editor de filas) y el navegador de tablas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { locale, t } from '../lib/idioma';

export interface Columna { nombre: string; tipo: string; nula: boolean; defecto: boolean }
export interface MetaTabla { nombre: string; vista: boolean; grupo: string; filas: number; columnas: Columna[]; clave: string[]; editable: boolean }
export type Fila = Record<string, unknown>;
export interface PersonaAdmin {
  id: number;
  nombre: string;
  zona_horaria: string;
  duenos: string | null;
  registros: number;
  mediciones: number;
}

// ---------- Ayudas compartidas por las subpestañas ----------

let tablasPedidas: Promise<MetaTabla[]> | null = null;
/** Las tablas con sus columnas (se piden una vez por visita a la administración). */
export function tablas(): Promise<MetaTabla[]> {
  tablasPedidas ??= api<MetaTabla[]>('GET', '/api/admin/datos/tablas').catch((e) => {
    tablasPedidas = null;
    throw e;
  });
  return tablasPedidas;
}

/** Las personas, siempre frescas: "lo último" de cada una cambia todo el tiempo. */
export function usePersonas(): PersonaAdmin[] {
  const [lista, setLista] = useState<PersonaAdmin[]>([]);
  useEffect(() => {
    let vigente = true;
    api<PersonaAdmin[]>('GET', '/api/admin/datos/personas').then((l) => vigente && setLista(l)).catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);
  return lista;
}

const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
/** Postgres manda "2026-10-29 17:43:35.36-03": se lleva a ISO para que lo entienda cualquier navegador. */
const aIso = (v: string) => v.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
export const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(aIso(iso)));

export function hace(iso: string | null | undefined): string {
  if (!iso) return t('nunca');
  const s = (Date.now() - Date.parse(aIso(iso))) / 1000;
  if (s < 60) return t('recién');
  if (s < 3600) return t('hace {n} min', { n: Math.round(s / 60) });
  if (s < 86400) return t('hace {n} h', { n: Math.round(s / 3600) });
  return t('hace {n} días', { n: Math.round(s / 86400) });
}

/** Un valor de una celda, corto: instantes como fecha y hora, objetos como JSON, vacío como "—". */
export function celda(v: unknown): { texto: string; vacio?: boolean; titulo?: string } {
  if (v === null || v === undefined) return { texto: '—', vacio: true };
  if (typeof v === 'boolean') return { texto: v ? 'sí' : 'no' };
  if (typeof v === 'number') return { texto: Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000) };
  if (typeof v === 'string') {
    if (ISO.test(v) && !Number.isNaN(Date.parse(aIso(v)))) return { texto: fechaHora(v), titulo: v };
    return v.length > 80 ? { texto: `${v.slice(0, 78)}…`, titulo: v } : { texto: v };
  }
  const json = JSON.stringify(v);
  return json.length > 80 ? { texto: `${json.slice(0, 78)}…`, titulo: json } : { texto: json };
}

/** Una tabla de filas crudas, con las columnas que vengan (o las pedidas), orden por encabezado y clic por fila. */
export function Grilla({
  filas,
  columnas,
  alClic,
  orden,
  alOrdenar,
  marcar,
}: {
  filas: Fila[];
  columnas?: string[];
  alClic?(f: Fila): void;
  orden?: { col: string; dir: 'asc' | 'desc' };
  alOrdenar?(col: string): void;
  /** Una clase para resaltar algunas filas (borradas, con error). */
  marcar?(f: Fila): string | undefined;
}) {
  const cols = columnas ?? [...new Set(filas.flatMap((f) => Object.keys(f)))];
  if (!filas.length) return <p className="suave chico">{t('Nada.')}</p>;
  return (
    <div className="grilla-caja">
      <table className="grilla">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} onClick={alOrdenar ? () => alOrdenar(c) : undefined} className={alOrdenar ? 'ordenable' : ''}>
                {c}
                {orden?.col === c ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} onClick={alClic ? () => alClic(f) : undefined} className={[alClic ? 'clic' : '', marcar?.(f) ?? ''].join(' ').trim() || undefined}>
              {cols.map((c) => {
                const v = celda(f[c]);
                return (
                  <td key={c} title={v.titulo} className={v.vacio ? 'vacio' : undefined}>
                    {v.texto}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Abre una fila de cualquier tabla en el editor: la busca por su clave (así llega completa). */
export async function traerFila(tabla: string, clave: Record<string, unknown>): Promise<{ meta: MetaTabla; fila: Fila } | null> {
  const meta = (await tablas()).find((x) => x.nombre === tabla);
  if (!meta) return null;
  const q = new URLSearchParams(Object.entries(clave).map(([k, v]) => [`f.${k}`, String(v)]));
  const r = await api<{ filas: Fila[] }>('GET', `/api/admin/datos/tablas/${tabla}?${q}`);
  return r.filas[0] ? { meta, fila: r.filas[0] } : null;
}

/** El valor de una columna como texto para editarlo (y de vuelta). */
const aTexto = (v: unknown, tipo: string) =>
  v === null || v === undefined ? '' : tipo === 'jsonb' || tipo === 'json' ? JSON.stringify(v, null, 2) : Array.isArray(v) ? v.join(', ') : String(v);

/** La hoja para editar o borrar una fila. Solo manda las columnas que cambiaron; todo queda en la auditoría. */
export function EditorFila({ meta, fila, alCerrar, alCambiar }: { meta: MetaTabla; fila: Fila; alCerrar(): void; alCambiar?(): void }) {
  const { avisar } = useEstado();
  const inicial = useMemo(() => Object.fromEntries(meta.columnas.map((c) => [c.nombre, aTexto(fila[c.nombre], c.tipo)])), [meta, fila]);
  const [valores, setValores] = useState(inicial);
  const [vacios, setVacios] = useState<Record<string, boolean>>(() => Object.fromEntries(meta.columnas.map((c) => [c.nombre, fila[c.nombre] === null || fila[c.nombre] === undefined])));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const clave = Object.fromEntries(meta.clave.map((k) => [k, fila[k]]));
  const cambios = Object.fromEntries(
    meta.columnas
      .filter((c) => !meta.clave.includes(c.nombre))
      .filter((c) => valores[c.nombre] !== inicial[c.nombre] || vacios[c.nombre] !== (fila[c.nombre] === null || fila[c.nombre] === undefined))
      .map((c) => [c.nombre, vacios[c.nombre] ? null : valores[c.nombre]]),
  );
  const hayCambios = Object.keys(cambios).length > 0;

  const correr = async (f: () => Promise<unknown>, aviso: string) => {
    setError('');
    setGuardando(true);
    try {
      await f();
      avisar(aviso);
      alCambiar?.();
      alCerrar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };
  const guardar = () => correr(() => api('POST', `/api/admin/datos/tablas/${meta.nombre}/editar`, { clave, cambios }), t('Guardado'));
  const borrar = (logico: boolean) => {
    if (!confirm(logico ? t('¿Marcar esta fila como borrada? (como cuando la borra la persona)') : t('¿Borrar esta fila para siempre? Queda una copia en la auditoría.'))) return;
    void correr(() => api('POST', `/api/admin/datos/tablas/${meta.nombre}/borrar`, { clave, logico }), t('Borrada'));
  };
  const conBorrado = meta.columnas.some((c) => c.nombre === 'borrado');

  return (
    <div className="admin-modal" onClick={alCerrar}>
      <div className="admin-modal-caja" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Editar fila')}>
        <div className="admin-modal-cabeza">
          <h3>
            {meta.nombre} <span className="suave chico">{meta.clave.map((k) => `${k}=${String(fila[k])}`).join(' · ')}</span>
          </h3>
          <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
        </div>
        {!meta.editable ? <p className="suave chico">{t('Esta tabla es solo para mirar.')}</p> : null}
        <div className="admin-campos">
          {meta.columnas.map((c) => {
            const esClave = meta.clave.includes(c.nombre);
            const bloqueado = esClave || !meta.editable;
            const largo = c.tipo === 'jsonb' || c.tipo === 'json' || (c.tipo === 'text' && (valores[c.nombre]?.length ?? 0) > 60);
            return (
              <label key={c.nombre} className={cambios[c.nombre] !== undefined ? 'cambiado' : ''}>
                <span className="campo-nombre">
                  {c.nombre} <span className="suave chico">{c.tipo}{esClave ? ' · clave' : ''}</span>
                  {c.nula && !bloqueado ? (
                    <span className="campo-nulo">
                      <input type="checkbox" checked={vacios[c.nombre]} onChange={(e) => setVacios({ ...vacios, [c.nombre]: e.target.checked })} /> {t('vacío')}
                    </span>
                  ) : null}
                </span>
                {c.tipo === 'boolean' ? (
                  <select disabled={bloqueado || vacios[c.nombre]} value={valores[c.nombre]} onChange={(e) => { setValores({ ...valores, [c.nombre]: e.target.value }); setVacios({ ...vacios, [c.nombre]: false }); }}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : largo ? (
                  <textarea rows={c.tipo === 'jsonb' ? 5 : 3} disabled={bloqueado || vacios[c.nombre]} value={valores[c.nombre]} onChange={(e) => setValores({ ...valores, [c.nombre]: e.target.value })} />
                ) : (
                  <input disabled={bloqueado || vacios[c.nombre]} value={valores[c.nombre]} onChange={(e) => setValores({ ...valores, [c.nombre]: e.target.value })} />
                )}
              </label>
            );
          })}
        </div>
        {error ? <p className="neg">{error}</p> : null}
        {meta.editable ? (
          <div className="fila admin-modal-pie">
            {conBorrado && !fila.borrado ? <button className="btn" disabled={guardando} onClick={() => borrar(true)}>{t('Marcar borrada')}</button> : null}
            <button className="btn peligro" disabled={guardando} onClick={() => borrar(false)}>{t('Borrar')}</button>
            <span className="espacio" />
            <button className="btn primario" disabled={guardando || !hayCambios} onClick={() => void guardar()}>
              {hayCambios ? t('Guardar {n} cambios', { n: Object.keys(cambios).length }) : t('Sin cambios')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Para las pantallas que abren filas sueltas: el estado del editor y cómo abrirlo. */
export function useEditor(alCambiar?: () => void) {
  const [abierta, setAbierta] = useState<{ meta: MetaTabla; fila: Fila } | null>(null);
  const { avisar } = useEstado();
  const abrir = useCallback(
    (tabla: string, clave: Record<string, unknown>) =>
      void traerFila(tabla, clave)
        .then((x) => (x ? setAbierta(x) : avisar(t('Esa fila ya no existe'))))
        .catch((e: Error) => avisar(e.message)),
    [avisar],
  );
  const editor = abierta ? <EditorFila meta={abierta.meta} fila={abierta.fila} alCerrar={() => setAbierta(null)} alCambiar={alCambiar} /> : null;
  return { abrir, editor };
}

// ---------- Navegador de tablas ----------

const GRUPOS: Array<[string, string]> = [
  ['persona', 'Lo que carga la persona'],
  ['automatico', 'Automático (teléfono, reloj, servicios)'],
  ['ia', 'IA y procesos'],
  ['catalogo', 'Catálogo'],
  ['sistema', 'Sistema'],
];

export interface PedidoTabla {
  tabla: string;
  filtros?: Record<string, string>;
  persona_id?: number;
}

export function VistaTablas({ pedido }: { pedido: PedidoTabla | null }) {
  const [lista, setLista] = useState<MetaTabla[]>([]);
  const [tabla, setTabla] = useState(pedido?.tabla ?? 'registros');
  const [persona, setPersona] = useState(pedido?.persona_id ? String(pedido.persona_id) : '');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>(pedido?.filtros ?? {});
  const [nuevoFiltro, setNuevoFiltro] = useState({ col: '', valor: '' });
  const [orden, setOrden] = useState<{ col: string; dir: 'asc' | 'desc' } | undefined>();
  const [pagina, setPagina] = useState(1);
  const [por, setPor] = useState(50);
  const [datos, setDatos] = useState<{ filas: Fila[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const gente = usePersonas();
  const meta = lista.find((x) => x.nombre === tabla);

  useEffect(() => void tablas().then(setLista).catch((e: Error) => setError(e.message)), []);

  const traer = useCallback(() => {
    const q = new URLSearchParams({ pagina: String(pagina), por: String(por) });
    if (persona) q.set('persona_id', persona);
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    if (buscar.trim()) q.set('buscar', buscar.trim());
    if (orden) {
      q.set('orden', orden.col);
      q.set('dir', orden.dir);
    }
    for (const [k, v] of Object.entries(filtros)) q.set(`f.${k}`, v);
    setError('');
    api<{ filas: Fila[]; total: number }>('GET', `/api/admin/datos/tablas/${tabla}?${q}`)
      .then(setDatos)
      .catch((e: Error) => setError(e.message));
  }, [tabla, persona, desde, hasta, buscar, filtros, orden, pagina, por]);
  useEffect(() => {
    const id = setTimeout(traer, 250);
    return () => clearTimeout(id);
  }, [traer]);
  const { editor, abrir } = useEditor(traer);

  const elegir = (n: string) => {
    setTabla(n);
    setFiltros({});
    setOrden(undefined);
    setPagina(1);
    setDatos(null);
  };
  const ordenar = (col: string) => setOrden((o) => (o?.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }));
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / por)) : 1;
  const tienePersona = meta?.columnas.some((c) => c.nombre === 'persona_id');

  const bajarCsv = () => {
    if (!datos?.filas.length) return;
    const cols = meta?.columnas.map((c) => c.nombre) ?? Object.keys(datos.filas[0]);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...datos.filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${tabla}-p${pagina}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="admin-tablas">
      <aside className="admin-tablas-lista">
        <select className="solo-movil" value={tabla} onChange={(e) => elegir(e.target.value)}>
          {GRUPOS.map(([g, nombre]) => (
            <optgroup key={g} label={t(nombre)}>
              {lista.filter((x) => x.grupo === g).map((x) => <option key={x.nombre} value={x.nombre}>{x.nombre}</option>)}
            </optgroup>
          ))}
        </select>
        <div className="solo-compu">
          {GRUPOS.map(([g, nombre]) => (
            <div key={g}>
              <p className="suave chico grupo-tablas">{t(nombre)}</p>
              {lista.filter((x) => x.grupo === g).map((x) => (
                <button key={x.nombre} className={`tabla-boton ${x.nombre === tabla ? 'activa' : ''}`} onClick={() => elegir(x.nombre)}>
                  <span>{x.nombre}{x.vista ? ' 👁' : ''}</span>
                  <span className="suave chico">{x.filas.toLocaleString(locale())}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div className="admin-tablas-cuerpo">
        <div className="filtros-datos">
          {tienePersona ? (
            <select value={persona} onChange={(e) => { setPersona(e.target.value); setPagina(1); }} aria-label={t('Persona')}>
              <option value="">{t('Todas las personas')}</option>
              {gente.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          ) : null}
          <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} aria-label={t('Desde')} />
          <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} aria-label={t('Hasta')} />
          <input placeholder={t('Buscar en el texto…')} value={buscar} onChange={(e) => { setBuscar(e.target.value); setPagina(1); }} />
          <select value={nuevoFiltro.col} onChange={(e) => setNuevoFiltro({ ...nuevoFiltro, col: e.target.value })} aria-label={t('Columna')}>
            <option value="">{t('Columna…')}</option>
            {meta?.columnas.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <input placeholder={t('= valor (o null)')} value={nuevoFiltro.valor} onChange={(e) => setNuevoFiltro({ ...nuevoFiltro, valor: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && nuevoFiltro.col) { setFiltros({ ...filtros, [nuevoFiltro.col]: nuevoFiltro.valor }); setNuevoFiltro({ col: '', valor: '' }); setPagina(1); } }} />
          <button className="btn" disabled={!nuevoFiltro.col} onClick={() => { setFiltros({ ...filtros, [nuevoFiltro.col]: nuevoFiltro.valor }); setNuevoFiltro({ col: '', valor: '' }); setPagina(1); }}>{t('Filtrar')}</button>
        </div>
        {Object.keys(filtros).length ? (
          <div className="chips envolver">
            {Object.entries(filtros).map(([k, v]) => (
              <button key={k} className="chip" onClick={() => { const { [k]: _, ...resto } = filtros; void _; setFiltros(resto); }}>{k} = {v} ✕</button>
            ))}
          </div>
        ) : null}
        <div className="barra-tabla">
          <strong>{tabla}</strong>
          <span className="suave chico">
            {datos ? t('{n} filas', { n: datos.total.toLocaleString(locale()) }) : t('Cargando…')}
            {meta && !meta.editable ? ` · ${t('solo para mirar')}` : ''}
          </span>
          <span className="espacio" />
          <select value={por} onChange={(e) => { setPor(Number(e.target.value)); setPagina(1); }} aria-label={t('Filas por página')}>
            {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn chico-btn" onClick={bajarCsv}>CSV</button>
          <button className="btn chico-btn" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹</button>
          <span className="suave chico">{pagina} / {paginas}</span>
          <button className="btn chico-btn" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>›</button>
        </div>
        {error ? <p className="neg">{error}</p> : null}
        {datos ? (
          <Grilla
            filas={datos.filas}
            columnas={meta?.columnas.map((c) => c.nombre)}
            orden={orden}
            alOrdenar={ordenar}
            marcar={(f) => (f.borrado ? 'borrada' : undefined)}
            alClic={meta?.clave.length ? (f) => abrir(tabla, Object.fromEntries(meta.clave.map((k) => [k, f[k]]))) : undefined}
          />
        ) : null}
      </div>
      {editor}
    </div>
  );
}
