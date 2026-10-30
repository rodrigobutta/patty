// Admin → Datos → Calidad: los chequeos de los datos (duplicados, días mal puestos, huecos de sincronización, procesos
// que no corrieron…) con cuántas filas tiene cada uno, los ejemplos y el botón para corregir los que tienen arreglo.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';
import { Grilla, useEditor, type Fila, type PedidoTabla } from './AdminDatos';

interface Chequeo { clave: string; titulo: string; descripcion: string; gravedad: 'alta' | 'media' | 'baja' | 'info'; tabla: string; arreglo: string | null; ia: boolean; n: number }

const GRAVEDAD: Record<Chequeo['gravedad'], string> = { alta: 'Alta', media: 'Media', baja: 'Baja', info: 'Info' };

export function AdminDatosCalidad({ abrirTabla }: { abrirTabla(p: PedidoTabla): void }) {
  const { avisar } = useEstado();
  const [lista, setLista] = useState<Chequeo[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ejemplos, setEjemplos] = useState<Fila[] | null>(null);
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(true);
  const [error, setError] = useState('');

  const traer = useCallback(() => {
    setError('');
    api<Chequeo[]>('GET', '/api/admin/datos/calidad').then(setLista).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => traer(), [traer]);

  const verEjemplos = useCallback((clave: string) => {
    setEjemplos(null);
    api<Fila[]>('GET', `/api/admin/datos/calidad/${clave}`).then(setEjemplos).catch((e: Error) => setError(e.message));
  }, []);
  const { abrir, editor } = useEditor(() => {
    traer();
    if (abierto) verEjemplos(abierto);
  });

  const alternar = (clave: string) => {
    if (abierto === clave) return setAbierto(null);
    setAbierto(clave);
    verEjemplos(clave);
  };

  const corregir = async (c: Chequeo) => {
    const aviso = c.ia ? t('Usa la IA (cuesta tokens y tarda un poco). ¿Seguir?') : t('Se van a tocar {n} filas. Queda en la auditoría. ¿Seguir?', { n: c.n });
    if (!confirm(`${c.arreglo}\n\n${aviso}`)) return;
    setCorriendo(c.clave);
    try {
      const r = await api<{ corregidas: number }>('POST', `/api/admin/datos/calidad/${c.clave}/corregir`);
      avisar(t('Listo: {n} corregidas', { n: r.corregidas }));
      traer();
      if (abierto === c.clave) verEjemplos(c.clave);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCorriendo(null);
    }
  };

  if (!lista) return <p className="suave centro">{error || t('Revisando los datos…')}</p>;
  const conProblemas = lista.filter((c) => c.n > 0);
  const totales = (['alta', 'media', 'baja', 'info'] as const).map((g) => [g, lista.filter((c) => c.gravedad === g && c.n > 0).length] as const);
  const visibles = soloProblemas ? conProblemas : lista;
  /** Una fila de ejemplo se abre en el editor si es de la tabla del chequeo y trae su id. */
  const abrirEjemplo = (c: Chequeo) => (f: Fila) => {
    if (f.id !== undefined) abrir(c.tabla, { id: f.id });
    else if (f.persona_id !== undefined) abrirTabla({ tabla: c.tabla, persona_id: Number(f.persona_id) });
  };

  return (
    <>
      <div className="mosaico admin-tiles">
        {totales.map(([g, n]) => (
          <div key={g} className={`tarjeta dato gravedad-${g}`}>
            <strong>{n}</strong>
            <span className="suave chico">{t('chequeos con problemas · {g}', { g: t(GRAVEDAD[g]) })}</span>
          </div>
        ))}
      </div>
      <div className="barra-tabla">
        <label className="opcion">
          <input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} />
          <span>{t('Solo los que tienen algo ({n} de {total})', { n: conProblemas.length, total: lista.length })}</span>
        </label>
        <span className="espacio" />
        <button className="btn chico-btn" onClick={() => { setLista(null); traer(); }}>{t('↻ Revisar de nuevo')}</button>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {!visibles.length ? <p className="tarjeta">✅ {t('No hay problemas en los datos.')}</p> : null}
      {visibles.map((c) => (
        <div key={c.clave} className={`tarjeta chequeo gravedad-${c.gravedad} ${c.n ? '' : 'sin-problemas'}`}>
          <div className="chequeo-cabeza" onClick={() => alternar(c.clave)}>
            <span className={`gravedad gravedad-${c.gravedad}`}>{t(GRAVEDAD[c.gravedad])}</span>
            <strong className="chequeo-titulo">{t(c.titulo)}</strong>
            <span className="chequeo-n">{c.n ? c.n.toLocaleString() : '✓'}</span>
          </div>
          <p className="suave chico">{t(c.descripcion)}</p>
          <div className="fila">
            <button className="btn chico-btn" onClick={() => alternar(c.clave)}>{abierto === c.clave ? t('Ocultar') : t('Ver ejemplos')}</button>
            <button className="btn chico-btn" onClick={() => abrirTabla({ tabla: c.tabla })}>{t('Tabla {tabla}', { tabla: c.tabla })}</button>
            {c.arreglo && c.n > 0 ? (
              <button className="btn chico-btn primario" disabled={corriendo !== null} onClick={() => void corregir(c)}>
                {corriendo === c.clave ? t('Corrigiendo…') : `🛠️ ${t(c.arreglo)}`}
              </button>
            ) : null}
          </div>
          {abierto === c.clave ? (ejemplos ? <Grilla filas={ejemplos} alClic={abrirEjemplo(c)} /> : <p className="suave chico">{t('Cargando…')}</p>) : null}
        </div>
      ))}
      {editor}
    </>
  );
}
