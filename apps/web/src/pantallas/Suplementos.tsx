// Vitaminas y suplementos (en Más → Remedios): se cargan por nombre o con una foto del envase. Lo que sale de la foto queda marcado y se
// puede corregir, y la foto no se guarda. Abajo, qué cubre lo que comés y tomás y qué aparece poco en lo anotado. Sin IA se carga igual,
// a mano; lo que falta es el dato.
import { useCallback, useEffect, useState } from 'react';
import { AVISO_COBERTURA, AVISO_DECIDE_EL_MEDICO, FOTO_NO_LEIDA, NUTRIENTES, PODRIA_REVISAR, nombreNutriente, type Cobertura, type ComponenteSuplemento, type FuenteContenido, type LecturaEnvase, type NutrienteCubierto, type Persona, type RemedioVigilado, type Suplemento } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { sacarFoto, type Foto } from '../lib/foto';
import { t } from '../lib/idioma';
import { EfectosVigilados } from './EfectosRemedio';

const cantidadTexto = (c: Pick<ComponenteSuplemento, 'cantidad' | 'unidad'>) => (c.cantidad === null ? '' : ` ${c.cantidad}${c.unidad ? ` ${c.unidad}` : ''}`);
const nombreDe = (c: ComponenteSuplemento) => (c.nutriente !== 'otro' ? t(nombreNutriente(c.nutriente) ?? c.nombre) : c.nombre);

const FUENTE: Record<FuenteContenido, string> = {
  foto: '📷 Salió de la foto del envase, leída con IA. Revisala.',
  ia: '🤖 Es lo típico de ese nombre, según la IA: el tuyo puede ser distinto.',
  persona: '✏️ Lo cargaste vos.',
  sin_dato: 'No sé qué contiene. Si querés, cargalo vos o probá con una foto del envase.',
};

export function Suplementos({ persona, puedeEscribir, vigilados, alCambiar }: { persona: Persona; puedeEscribir: boolean; vigilados: RemedioVigilado[]; alCambiar(): void }) {
  const [lista, setLista] = useState<Suplemento[] | null>(null);
  const [editando, setEditando] = useState<Propuesta | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const [vuelta, setVuelta] = useState(0);
  const { avisar } = useEstado();

  const traer = useCallback(async () => {
    try {
      setLista(await api<Suplemento[]>('GET', `/api/suplementos?persona=${persona.id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [persona.id]);
  useEffect(() => void traer(), [traer]);
  const cambio = () => {
    setVuelta((v) => v + 1);
    alCambiar();
    void traer();
  };

  const conFoto = async (origen: 'camara' | 'galeria') => {
    setError('');
    let f: Foto | null;
    try {
      f = await sacarFoto(origen);
    } catch (e) {
      return setError((e as Error).message);
    }
    if (!f) return;
    setLeyendo(true);
    try {
      const r = await api<LecturaEnvase>('POST', '/api/suplementos/leer-foto', { persona_id: persona.id, imagen: f.datos, tipo: f.tipo });
      if (r.reconocido) setEditando({ nombre: r.nombre, contenido: r.contenido, deFoto: true });
      else setError(t(FOTO_NO_LEIDA));
    } catch (e) {
      // Sin IA (o sin conexión con ella) se puede cargar igual, a mano.
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

  const terminar = async (s: Suplemento, retomar = false) => {
    try {
      await api('POST', `/api/suplementos/${s.id}/terminar`, { retomar });
      avisar(retomar ? t('Retomado') : t('Terminado'));
      cambio();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const activos = lista?.filter((s) => s.activo) ?? [];
  const terminados = lista?.filter((s) => !s.activo) ?? [];
  const renglon = (s: Suplemento) => {
    const v = vigilados.find((x) => x.suplemento_ids.includes(s.id));
    return (
      <li key={s.id} className="tratamiento">
        <span className="que">
          <strong>{s.nombre}</strong>
          {s.contenido.length ? <span className="chico renglon-sub">{s.contenido.map((c) => nombreDe(c) + cantidadTexto(c)).join(' · ')}</span> : null}
          <span className="suave chico renglon-sub">{t(FUENTE[s.fuente])}{s.corregido && s.fuente !== 'persona' ? ` ${t('Corregido por vos.')}` : ''}</span>
          {v && s.activo ? <EfectosVigilados remedio={v} /> : null}
        </span>
        {puedeEscribir ? (
          <span className="columna-chica">
            <button className="btn chico" onClick={() => setEditando({ id: s.id, nombre: s.nombre, contenido: s.contenido, deFoto: false })}>{t('Corregir')}</button>
            {s.activo ? <button className="enlace chico" onClick={() => void terminar(s)}>{t('Terminar')}</button> : <button className="enlace chico" onClick={() => void terminar(s, true)}>{t('Retomar')}</button>}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <div className="tarjeta suplementos">
        <h3>{t('🌿 Vitaminas y suplementos')}</h3>
        <p className="suave chico">{t('Contame cuáles tomás, por nombre o con una foto del envase, así sé qué tienen. La foto no se guarda.')}</p>
        {lista === null ? null : activos.length ? <ul className="lista">{activos.map(renglon)}</ul> : <p className="suave">{t('No hay vitaminas ni suplementos cargados.')}</p>}
        {terminados.length ? (
          <details className="terminados">
            <summary>{t('Terminados ({n})', { n: terminados.length })}</summary>
            <ul className="lista">{terminados.map(renglon)}</ul>
          </details>
        ) : null}
        {error ? <p className="neg">{error}</p> : null}
        {leyendo ? <p className="suave chico">{t('Leyendo el envase…')}</p> : null}
        {puedeEscribir ? (
          <div className="fila botones-suplemento">
            <button className="btn" onClick={() => setEditando({ nombre: '', contenido: [], deFoto: false })}>{t('＋ Por nombre')}</button>
            <button className="btn" disabled={leyendo} onClick={() => void conFoto('camara')}>{t('📷 Foto')}</button>
            <button className="btn" disabled={leyendo} onClick={() => void conFoto('galeria')}>{t('🖼️ Galería')}</button>
          </div>
        ) : null}
        {editando ? (
          <>
            <div className="velo" onClick={() => setEditando(null)} />
            <FormSuplemento
              persona={persona}
              propuesta={editando}
              alCerrar={() => setEditando(null)}
              alGuardar={() => {
                setEditando(null);
                cambio();
              }}
            />
          </>
        ) : null}
      </div>
      <CoberturaTarjeta persona={persona} vuelta={vuelta} />
    </>
  );
}

interface Propuesta {
  id?: number;
  nombre: string;
  contenido: ComponenteSuplemento[];
  deFoto: boolean;
}

interface Fila {
  nutriente: string;
  nombre: string;
  cantidad: string;
  unidad: string;
}

const aFila = (c: ComponenteSuplemento): Fila => ({ nutriente: c.nutriente, nombre: c.nombre, cantidad: c.cantidad === null ? '' : String(c.cantidad), unidad: c.unidad ?? '' });
const aComponente = (f: Fila): ComponenteSuplemento => {
  const n = Number(f.cantidad.replace(',', '.'));
  return { nutriente: f.nutriente, nombre: f.nutriente === 'otro' ? f.nombre.trim() : nombreNutriente(f.nutriente) ?? f.nombre.trim(), cantidad: f.cantidad.trim() && n > 0 ? n : null, unidad: f.unidad.trim() || null };
};

export function FormSuplemento({ persona, propuesta, alGuardar, alCerrar }: { persona: Persona; propuesta: Propuesta; alGuardar(): void; alCerrar(): void }) {
  const [nombre, setNombre] = useState(propuesta.nombre);
  const original = JSON.stringify(propuesta.contenido.map(aFila));
  const [filas, setFilas] = useState<Fila[]>(() => propuesta.contenido.map(aFila));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiarFila = (i: number, c: Partial<Fila>) => setFilas((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)));

  const guardar = async () => {
    if (!nombre.trim()) return setError(t('¿Cómo se llama?'));
    setEnviando(true);
    setError('');
    const tocado = JSON.stringify(filas) !== original;
    const contenido = filas.filter((f) => f.nutriente !== 'otro' || f.nombre.trim()).map(aComponente);
    try {
      if (propuesta.id) {
        await api('PUT', `/api/suplementos/${propuesta.id}`, { nombre: nombre.trim(), ...(tocado ? { contenido } : {}) });
      } else if (propuesta.deFoto) {
        await api('POST', '/api/suplementos', { persona_id: persona.id, nombre: nombre.trim(), contenido, origen: 'foto', corregido: tocado });
      } else {
        // Por nombre, sin decir qué tiene: vale lo típico de ese nombre, si se sabe.
        await api('POST', '/api/suplementos', { persona_id: persona.id, nombre: nombre.trim(), ...(contenido.length ? { contenido } : {}) });
      }
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  const borrar = async () => {
    if (!propuesta.id || !confirm(t('¿Borrar {que}?', { que: propuesta.nombre }))) return;
    try {
      await api('DELETE', `/api/suplementos/${propuesta.id}`);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="hoja form-remedio" role="dialog" aria-label={t('Vitamina o suplemento')}>
      <div className="hoja-cabeza">
        <h3>{propuesta.id ? propuesta.nombre : t('Vitamina o suplemento')}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>
      {propuesta.deFoto ? <p className="nota-ia chico">{t('📷 Esto salió de la foto, leído con IA. Revisalo y corregí lo que esté mal antes de guardar.')}</p> : null}
      <label>{t('Nombre')}<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('Vitamina D, Supradyn…')} autoFocus={!propuesta.nombre} /></label>
      <p className="etiqueta-contenido">{t('Qué contiene, por toma')}</p>
      {!filas.length ? <p className="suave chico">{t('Si no sabés, dejalo así y veo si lo conozco por el nombre.')}</p> : null}
      {filas.map((f, i) => (
        <div key={i} className="fila fila-contenido">
          <select value={f.nutriente} onChange={(e) => cambiarFila(i, { nutriente: e.target.value })} aria-label={t('Qué')}>
            {NUTRIENTES.map((n) => <option key={n.clave} value={n.clave}>{t(n.nombre)}</option>)}
            <option value="otro">{t('Otro')}</option>
          </select>
          {f.nutriente === 'otro' ? <input value={f.nombre} onChange={(e) => cambiarFila(i, { nombre: e.target.value })} placeholder={t('Cuál')} aria-label={t('Cuál')} /> : null}
          <input inputMode="decimal" className="corto" value={f.cantidad} onChange={(e) => cambiarFila(i, { cantidad: e.target.value })} placeholder={t('cant.')} aria-label={t('Cantidad')} />
          <input className="corto" value={f.unidad} onChange={(e) => cambiarFila(i, { unidad: e.target.value })} placeholder="mg" aria-label={t('Unidad')} />
          <button type="button" className="btn-icono chico" onClick={() => setFilas((l) => l.filter((_, j) => j !== i))} aria-label={t('Sacar')}>✕</button>
        </div>
      ))}
      <button type="button" className="chip" onClick={() => setFilas((l) => [...l, { nutriente: NUTRIENTES[0].clave, nombre: '', cantidad: '', unidad: '' }])}>{t('＋ agregar')}</button>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" onClick={() => void guardar()} disabled={enviando}>{enviando ? t('Guardando…') : t('Guardar')}</button>
      {propuesta.id ? <button className="enlace" onClick={() => void borrar()}>{t('Borrar')}</button> : null}
    </div>
  );
}

/** Qué cubre lo que comés y tomás. No mide cantidades: dice dónde aparece cada cosa, y que lo poco se revisa con el médico. */
export function CoberturaTarjeta({ persona, vuelta }: { persona: Persona; vuelta: number }) {
  const [c, setC] = useState<Cobertura | null>(null);
  useEffect(() => {
    api<Cobertura>('GET', `/api/remedios/cobertura?persona=${persona.id}`).then(setC).catch(() => setC(null));
  }, [persona.id, vuelta]);
  if (!c) return null;
  const de = (e: NutrienteCubierto['estado']) => c.nutrientes.filter((n) => n.estado === e);
  const nombre = (n: NutrienteCubierto) => t(nombreNutriente(n.clave) ?? n.clave);
  const toma = de('toma');
  const comida = de('comida');
  const poco = de('poco');
  return (
    <div className="tarjeta cobertura">
      <h3>{t('🧩 Lo que cubre lo que comés y tomás')}</h3>
      {toma.length ? (
        <>
          <p className="chico"><strong>{t('En lo que tomás')}</strong></p>
          <ul className="lista-simple chico">
            {toma.map((n) => <li key={n.clave}>{nombre(n)}: {n.toma.map((x) => x.nombre + cantidadTexto(x)).join(', ')}{n.toma.some((x) => x.fuente === 'foto') ? ' 📷' : n.toma.some((x) => x.fuente === 'ia') ? ' 🤖' : ''}</li>)}
          </ul>
        </>
      ) : null}
      {!c.suficiente ? (
        <p className="suave chico">{t('Para decir algo de lo que comés me hacen falta más días con comidas anotadas: llevo {n} de {minimo} en el último mes.', { n: c.dias_con_comida, minimo: 10 })}</p>
      ) : (
        <>
          {comida.length ? (
            <>
              <p className="chico"><strong>{t('En lo que comés')}</strong></p>
              <ul className="lista-simple chico">
                {comida.map((n) => <li key={n.clave}>{nombre(n)}: {n.alimentos.join(', ')} <span className="suave">· {t('{n} de {total} días', { n: n.dias, total: c.dias_con_comida })}</span></li>)}
              </ul>
            </>
          ) : null}
          {poco.length ? (
            <div className="nota-ia">
              <p className="chico"><strong>{poco.map(nombre).join(', ')}</strong></p>
              <p className="chico">{t(PODRIA_REVISAR)}</p>
            </div>
          ) : null}
        </>
      )}
      <p className="suave chico">{t(AVISO_COBERTURA)} {t(AVISO_DECIDE_EL_MEDICO)}</p>
    </div>
  );
}
