// Remedios (en Más): los tratamientos de la persona, con su próxima toma y cuántas lleva, y el formulario para cargar
// uno a mano o cambiarlo. Lo más cómodo igual es contárselo a Patty ("el médico me dijo paracetamol cada 8 horas por 5
// días"): esto queda para revisar y ajustar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dosisTexto, frecuenciaTexto, tomasEntre, UNIDADES_DOSIS, type NuevoTratamiento, type Persona, type Sugerencia, type Tratamiento } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { horaAhora, horaEn, instanteLocal, nombreDia } from '../lib/fechas';
import { tomasCambiaron } from '../lib/remedios';
// `t` ya es el tratamiento en todo el archivo: la traducción va como `tr`.
import { idioma, t as tr } from '../lib/idioma';

/** AAAA-MM-DD del calendario (no del día de Patty) en la zona. */
const fechaLocal = (i: Date, zona: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(i);

/** "hoy 14:30", "jue 29 oct 06:30" */
export function cuandoTexto(iso: string, zona: string): string {
  const dia = fechaLocal(new Date(iso), zona);
  return `${nombreDia(dia, zona).toLowerCase()} ${horaEn(iso, zona)}`;
}

/** Cuántas tomas salen y cuándo son la primera y la última (para revisar antes de guardar). */
export function resumenTomas(t: Pick<Tratamiento, 'cada_horas' | 'horarios' | 'inicio' | 'fin'>, zona: string): string {
  if (!t.cada_horas && !t.horarios.length) return tr('Sin recordatorios: lo anotás cuando lo tomes.');
  const conv = (f: string, h: string) => new Date(instanteLocal(f, h, zona));
  const hasta = t.fin ? new Date(t.fin) : new Date(Date.parse(t.inicio) + 7 * 86400000);
  const lista = tomasEntre({ ...t, terminado: null }, new Date(t.inicio), hasta, (i) => fechaLocal(i, zona), conv);
  if (!lista.length) return tr('Con esas fechas no queda ninguna toma.');
  const primera = cuandoTexto(lista[0].toISOString(), zona);
  if (!t.fin) return tr('La primera toma es {primera}, y sigue sin fecha de fin.', { primera });
  const ultima = cuandoTexto(lista.at(-1)!.toISOString(), zona);
  if (lista.length === 1) return tr('Son 1 toma: la primera {primera} y la última {ultima}.', { primera, ultima });
  return tr('Son {n} tomas: la primera {primera} y la última {ultima}.', { n: lista.length, primera, ultima });
}

export function Remedios({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const [lista, setLista] = useState<Tratamiento[] | null>(null);
  const [editando, setEditando] = useState<Tratamiento | 'nuevo' | null>(null);
  const [error, setError] = useState('');
  const { avisar } = useEstado();

  const traer = useCallback(async () => {
    try {
      setLista(await api<Tratamiento[]>('GET', `/api/tratamientos?persona=${persona.id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [persona.id]);
  useEffect(() => void traer(), [traer]);

  const terminar = async (t: Tratamiento, retomar = false) => {
    if (!retomar && !confirm(tr('¿Terminar {remedio}? No te va a recordar más tomas.', { remedio: t.remedio }))) return;
    try {
      await api('POST', `/api/tratamientos/${t.id}/terminar`, { retomar });
      avisar(retomar ? tr('Retomado') : tr('Terminado'));
      tomasCambiaron();
      void traer();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const activos = lista?.filter((t) => t.activo) ?? [];
  const terminados = lista?.filter((t) => !t.activo) ?? [];
  const renglon = (t: Tratamiento) => (
    <li key={t.id} className="tratamiento">
      <span className="que">
        <strong>{t.remedio}</strong>
        {t.dosis !== null || t.unidad ? <span className="valor-chip">{dosisTexto(t.dosis, t.unidad, idioma())}</span> : null}
        <span className="suave chico renglon-sub">
          {frecuenciaTexto(t, idioma())}
          {t.motivo ? ` · ${tr('por {motivo}', { motivo: t.motivo })}` : ''}
        </span>
        <span className="suave chico renglon-sub">
          {t.activo
            ? [
                t.proxima ? tr('próxima: {cuando}', { cuando: cuandoTexto(t.proxima, persona.zona_horaria) }) : '',
                t.total ? tr('{tomadas} de {total} tomas', { tomadas: t.tomadas, total: t.total }) : t.tomadas ? tr('{n} tomadas', { n: t.tomadas }) : '',
                t.fin ? tr('hasta {cuando}', { cuando: cuandoTexto(t.fin, persona.zona_horaria) }) : '',
              ].filter(Boolean).join(' · ')
            : `${t.terminado ? tr('terminado') : tr('terminó')} · ${t.total ? tr('{tomadas} de {total} tomas', { tomadas: t.tomadas, total: t.total }) : tr('{n} tomas', { n: t.tomadas })}`}
        </span>
      </span>
      {puedeEscribir ? (
        <span className="columna-chica">
          <button className="btn chico" onClick={() => setEditando(t)}>{tr('Cambiar')}</button>
          {t.activo ? <button className="enlace chico" onClick={() => void terminar(t)}>{tr('Terminar')}</button> : t.terminado && (!t.fin || Date.parse(t.fin) > Date.now()) ? <button className="enlace chico" onClick={() => void terminar(t, true)}>{tr('Retomar')}</button> : null}
        </span>
      ) : null}
    </li>
  );

  return (
    <div className="tarjeta remedios">
      <h3>{tr('💊 Remedios')}</h3>
      <p className="suave chico">
        {tr('Te aviso a la hora de cada toma y llevo la cuenta de las que tomaste. Lo más fácil es contárselo a Patty: «el médico me dijo ibuprofeno 400 cada 8 horas por 3 días».')}
      </p>
      {lista === null ? null : activos.length ? <ul className="lista">{activos.map(renglon)}</ul> : <p className="suave">{tr('No hay remedios programados.')}</p>}
      {terminados.length ? (
        <details className="terminados">
          <summary>{tr('Terminados ({n})', { n: terminados.length })}</summary>
          <ul className="lista">{terminados.map(renglon)}</ul>
        </details>
      ) : null}
      {error ? <p className="neg">{error}</p> : null}
      {puedeEscribir ? <button className="btn ancho" onClick={() => setEditando('nuevo')}>{tr('＋ Agregar un remedio')}</button> : null}
      {editando ? (
        <>
          <div className="velo" onClick={() => setEditando(null)} />
          <FormRemedio
            persona={persona}
            tratamiento={editando === 'nuevo' ? null : editando}
            alCerrar={() => setEditando(null)}
            alGuardar={() => {
              setEditando(null);
              tomasCambiaron();
              void traer();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

type Modo = 'cada' | 'horario' | 'falta';

export function FormRemedio({ persona, tratamiento, alGuardar, alCerrar }: {
  persona: Persona;
  tratamiento: Tratamiento | null;
  alGuardar(): void;
  alCerrar(): void;
}) {
  const { categorias, festejar, avisar } = useEstado();
  const zona = persona.zona_horaria;
  const t = tratamiento;
  const [nombre, setNombre] = useState(t?.remedio ?? '');
  const [sugeridos, setSugeridos] = useState<Sugerencia[]>([]);
  const [dosis, setDosis] = useState(t?.dosis !== null && t?.dosis !== undefined ? String(t.dosis) : '');
  const [unidad, setUnidad] = useState(t?.unidad ?? '');
  const [modo, setModo] = useState<Modo>(t ? (t.cada_horas ? 'cada' : t.horarios.length ? 'horario' : 'falta') : 'cada');
  const [cada, setCada] = useState(String(t?.cada_horas ?? 8));
  const [horarios, setHorarios] = useState<string[]>(t?.horarios.length ? t.horarios : ['09:00']);
  const fechaOriginal = t ? fechaLocal(new Date(t.inicio), zona) : fechaLocal(new Date(), zona);
  const [fecha, setFecha] = useState(fechaOriginal);
  const [hora, setHora] = useState(t ? horaEn(t.inicio, zona) : horaAhora(zona));
  const [conFin, setConFin] = useState(t ? Boolean(t.fin) : true);
  const [dias, setDias] = useState(t?.fin ? String(Math.max(1, Math.round((Date.parse(t.fin) - Date.parse(t.inicio)) / 86400000))) : '7');
  const [motivo, setMotivo] = useState(t?.motivo ?? '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Los remedios que ya existen, para no crear "Paracetamol" dos veces.
  const medicacion = categorias.find((c) => c.clave === 'medicacion');
  useEffect(() => {
    if (!medicacion) return;
    api<Sugerencia[]>('GET', `/api/conceptos/buscar?q=&categoria=${medicacion.id}&limite=30`).then(setSugeridos).catch(() => {});
  }, [medicacion]);

  const valores = useMemo((): Omit<NuevoTratamiento, 'persona_id'> | null => {
    if (!/^\d{2}:\d{2}$/.test(hora) && modo === 'cada') return null;
    // A horario fijo: desde ahora si empieza hoy (las de más temprano no cuentan), o desde el principio de ese día.
    const inicio =
      modo === 'cada'
        ? instanteLocal(fecha, hora, zona)
        : t && fecha === fechaOriginal
          ? t.inicio
          : fecha === fechaLocal(new Date(), zona)
            ? new Date().toISOString()
            : instanteLocal(fecha, '00:00', zona);
    const n = Number(dias);
    return {
      dosis: dosis.trim() ? Number(dosis.replace(',', '.')) : null,
      unidad: unidad.trim() || null,
      cada_horas: modo === 'cada' ? Number(cada.replace(',', '.')) : null,
      horarios: modo === 'horario' ? horarios.filter((h) => /^\d{2}:\d{2}$/.test(h)) : [],
      inicio,
      fin: modo !== 'falta' && conFin && n > 0 ? new Date(Date.parse(inicio) + n * 86400000).toISOString() : null,
      motivo: motivo.trim() || null,
    };
  }, [hora, modo, fecha, fechaOriginal, zona, t, dias, dosis, unidad, cada, horarios, conFin, motivo]);

  const guardar = async () => {
    if (!nombre.trim()) return setError(tr('¿Qué remedio?'));
    if (!valores) return setError(tr('Revisá la hora.'));
    setEnviando(true);
    setError('');
    const existente = sugeridos.find((s) => s.nombre.toLowerCase() === nombre.trim().toLowerCase());
    const cuerpo = {
      ...valores,
      persona_id: persona.id,
      ...(existente ? { concepto_id: existente.id } : t && nombre.trim() === t.remedio ? {} : { concepto_nombre: nombre.trim() }),
    };
    try {
      if (t) await api('PUT', `/api/tratamientos/${t.id}`, cuerpo);
      else await api('POST', '/api/tratamientos', cuerpo);
      festejar(t ? tr('Listo, {remedio} actualizado', { remedio: nombre.trim() }) : tr('¡Listo! Te aviso cada toma de {remedio} ⏰', { remedio: nombre.trim() }));
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  const borrar = async () => {
    if (!t || !confirm(tr('¿Borrar {remedio}? Lo que ya anotaste como tomado queda en el Día.', { remedio: t.remedio }))) return;
    try {
      await api('DELETE', `/api/tratamientos/${t.id}`);
      avisar(tr('Borrado'));
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="hoja form-remedio" role="dialog" aria-label={t ? tr('Cambiar {remedio}', { remedio: t.remedio }) : tr('Nuevo remedio')}>
      <div className="hoja-cabeza">
        <h3>{t ? t.remedio : tr('Nuevo remedio')}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={tr('Cerrar')}>✕</button>
      </div>
      <label>
        {tr('Remedio')}
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} list="remedios-conocidos" placeholder={tr('Paracetamol, vitamina D…')} autoFocus={!t} />
        <datalist id="remedios-conocidos">{sugeridos.map((s) => <option key={s.id} value={s.nombre} />)}</datalist>
      </label>
      <label>
        {tr('Dosis por toma')}
        <span className="fila">
          <input inputMode="decimal" value={dosis} onChange={(e) => setDosis(e.target.value)} placeholder="1" className="corto" />
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder={tr('unidad')} />
        </span>
        <span className="chips envolver">
          {UNIDADES_DOSIS.map((u) => <button key={u} type="button" className={`chip chico${unidad === u ? ' activa' : ''}`} onClick={() => setUnidad(u)}>{tr(u)}</button>)}
        </span>
      </label>
      <div className="segmentos ancho">
        <button className={modo === 'cada' ? 'activa' : ''} onClick={() => setModo('cada')}>{tr('Cada tantas horas')}</button>
        <button className={modo === 'horario' ? 'activa' : ''} onClick={() => setModo('horario')}>{tr('A horario fijo')}</button>
        <button className={modo === 'falta' ? 'activa' : ''} onClick={() => setModo('falta')}>{tr('Si hace falta')}</button>
      </div>
      {modo === 'cada' ? (
        <>
          <label>
            {tr('Cada cuántas horas')}
            <span className="chips">
              {[4, 6, 8, 12, 24].map((h) => <button key={h} type="button" className={`chip${Number(cada) === h ? ' activa' : ''}`} onClick={() => setCada(String(h))}>{h} h</button>)}
              <input inputMode="decimal" value={cada} onChange={(e) => setCada(e.target.value)} className="corto" aria-label={tr('Horas')} />
            </span>
          </label>
          <label>
            {tr('Primera toma')}
            <span className="fila">
              <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </span>
          </label>
        </>
      ) : modo === 'horario' ? (
        <>
          <label>
            {tr('Todos los días a las')}
            <span className="chips envolver">
              {horarios.map((h, i) => (
                <span key={i} className="horario">
                  <input type="time" value={h} onChange={(e) => setHorarios((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
                  {horarios.length > 1 ? <button type="button" className="btn-icono chico" onClick={() => setHorarios((l) => l.filter((_, j) => j !== i))} aria-label={tr('Sacar horario')}>✕</button> : null}
                </span>
              ))}
              <button type="button" className="chip" onClick={() => setHorarios((l) => [...l, '21:00'])}>{tr('＋ otro')}</button>
            </span>
          </label>
          <label>{tr('Desde')}<input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} /></label>
        </>
      ) : (
        <p className="suave chico">{tr('No te aviso: lo anotás con un toque en el Día cuando lo tomes.')}</p>
      )}
      {modo !== 'falta' ? (
        <label className="opcion">
          <input type="checkbox" checked={conFin} onChange={(e) => setConFin(e.target.checked)} />
          <span>
            {tr('Por')}{' '}
            <input inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className="corto" disabled={!conFin} aria-label={tr('Días')} /> {tr('días')}
            {conFin ? '' : tr(' (sin fecha de fin: lo dejás cuando quieras)')}
          </span>
        </label>
      ) : null}
      <label>{tr('Para qué (opcional)')}<input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tr('anginas, presión, vitaminas…')} /></label>
      {valores ? <p className="nota-ia resumen-tomas">⏰ {resumenTomas(valores as Tratamiento, zona)}</p> : null}
      <p className="suave chico">{tr('Patty te recuerda lo que te indicaron; ante cualquier duda con la dosis, consultá con tu médico.')}</p>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" onClick={() => void guardar()} disabled={enviando}>{enviando ? tr('Guardando…') : t ? tr('Guardar cambios') : tr('Programar recordatorios')}</button>
      {t ? <button className="enlace" onClick={() => void borrar()}>{tr('Borrar este remedio')}</button> : null}
    </div>
  );
}

