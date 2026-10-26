// Cambiar algo ya anotado: la hora, la cantidad o los minutos, la intensidad (o cómo te sentías) y la nota. Lo que
// fue (el concepto) no se cambia acá: para eso se borra y se anota de nuevo.
import { useEffect, useState } from 'react';
import { COMO_ME_SENTI, COMO_ME_SIENTO, CUANTO, ESTADOS, ESTADOS_PUNTUALES, estadoDe, unidadPara, type Donde, type Persona, type Registro } from 'shared';
import { api } from '../api';
import { idioma, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { horaEn, instanteDelDia } from '../lib/fechas';
import { DondeComida } from '../ui/DondeComida';
import { genteGuardada, traerGente, type Alguien } from '../lib/gente';

export function Editar({ persona, registro: r, partes, alGuardar, alCerrar, alBorrar }: {
  persona: Persona;
  registro: Registro;
  /** Los que van con este y se mueven juntos (la tele: tipo y canal; lo que se sintió; con quién estuvo). */
  partes: Registro[];
  alGuardar(): void;
  alCerrar(): void;
  /** Borrarlo (pregunta antes). */
  alBorrar(): Promise<void>;
}) {
  const { categorias, avisar } = useEstado();
  const cat = categorias.find((c) => c.id === r.categoria_id);
  const esSentir = r.concepto === COMO_ME_SIENTO || r.concepto === COMO_ME_SENTI;
  /** "Con sueño" y compañía: poco, bastante o mucho en vez de 0 a 10. */
  const esPuntual = ESTADOS_PUNTUALES.some((e) => e.nombre === r.concepto);
  const [hora, setHora] = useState(horaEn(r.inicio, persona.zona_horaria));
  const [valor, setValor] = useState(r.valor === null ? '' : String(r.valor));
  const [intensidad, setIntensidad] = useState<number | null>(r.intensidad);
  const [nota, setNota] = useState(r.nota ?? '');
  /** Comidas y bebidas: dónde fue. */
  const esComida = cat?.clave === 'comida' || cat?.clave === 'bebida';
  const [donde, setDonde] = useState<Donde | null>(r.donde ?? null);
  const [lugar, setLugar] = useState(r.lugar ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Con quién estuvo: la gente anotada junto con esto (a la misma hora), para sumar o sacar personas de tu gente.
  const genteId = categorias.find((c) => c.clave === 'gente')?.id;
  const conGente = genteId !== undefined && r.categoria_id !== genteId;
  const compania = partes.filter((p) => p.categoria_id === genteId);
  const [conQuien, setConQuien] = useState<string[]>(compania.map((p) => p.concepto));
  const [gente, setGente] = useState<Alguien[]>(genteGuardada(persona.id));
  const [nuevaGente, setNuevaGente] = useState('');
  useEffect(() => {
    if (conGente) void traerGente(persona.id).then(setGente).catch(() => {});
  }, [conGente, persona.id]);
  const nombresGente = [...new Set([...gente.map((a) => a.nombre), ...conQuien])];
  // La hora de "Me levanté" es el valor mismo: no lleva cantidad aparte.
  const llevaValor = cat?.tipo_valor !== 'hora' && (r.valor !== null || r.unidad !== null || cat?.tipo_valor === 'duracion' || cat?.tipo_valor === 'cantidad');
  const llevaIntensidad = r.intensidad !== null || cat?.tipo_valor === 'intensidad';

  const guardar = async () => {
    setError('');
    const n = valor.trim() === '' ? null : Number(valor.replace(',', '.'));
    if (n !== null && !Number.isFinite(n)) return setError(t('La cantidad tiene que ser un número.'));
    setGuardando(true);
    const inicio = instanteDelDia(r.fecha, hora, persona.zona_horaria);
    const cambio = (x: Registro, propio: boolean) =>
      api('PUT', `/api/registros/${x.id}`, {
        persona_id: x.persona_id,
        concepto_id: x.concepto_id,
        inicio,
        // Si tenía fin (algo con duración), se corre igual que el inicio.
        fin: x.fin ? new Date(new Date(x.fin).getTime() + (Date.parse(inicio) - Date.parse(x.inicio))).toISOString() : null,
        valor: propio && llevaValor ? n : x.valor,
        unidad: x.unidad,
        intensidad: propio ? intensidad : x.intensidad,
        nota: propio ? nota.trim() || null : x.nota,
        ...(propio && esComida ? { donde, lugar: lugar.trim() || null } : {}),
      });
    try {
      await cambio(r, true);
      // Los que se sacaron de "con quién" se borran; lo demás que va con esto se mueve a la nueva hora.
      for (const p of partes) {
        if (genteId !== undefined && p.categoria_id === genteId && !conQuien.includes(p.concepto)) await api('DELETE', `/api/registros/${p.id}`);
        else await cambio(p, false);
      }
      for (const n of conQuien.filter((x) => !compania.some((p) => p.concepto === x))) {
        if (!gente.some((a) => a.nombre === n)) await api('POST', '/api/gente', { persona_id: persona.id, nombre: n });
        await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: n, categoria_id: genteId, inicio });
      }
      avisar(t('Cambiado'));
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <div className="hoja" role="dialog" aria-label={t('Cambiar {que}', { que: t(r.concepto) })}>
      <div className="hoja-cabeza">
        <h3>{cat?.icono} {t(r.concepto)}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>
      <div className="valor">
        {esSentir ? (
          <div className="caritas">
            {ESTADOS.map((e) => (
              <button key={e.clave} className={`carita${intensidad !== null && estadoDe(intensidad).clave === e.clave ? ' activa' : ''}`} onClick={() => setIntensidad(e.intensidad)}>
                <span className="emoji" aria-hidden>{e.emoji}</span>
                {t(e.nombre)}
              </button>
            ))}
          </div>
        ) : esPuntual ? (
          <div className="segmentos ancho">
            {CUANTO.map((c) => (
              <button key={c.nombre} className={intensidad !== null && Math.abs(intensidad - c.intensidad) <= 1 ? 'activa' : ''} onClick={() => setIntensidad(c.intensidad)}>{t(c.nombre)}</button>
            ))}
          </div>
        ) : llevaIntensidad ? (
          <fieldset className="escala">
            <legend>{t('Intensidad')}</legend>
            {Array.from({ length: 11 }, (_, i) => (
              <button key={i} className={intensidad === i ? 'activa' : ''} style={{ ['--i' as string]: i }} onClick={() => setIntensidad(i)}>{i}</button>
            ))}
            <div className="escala-pie suave chico"><span>{t('nada')}</span><span>{t('insoportable')}</span></div>
          </fieldset>
        ) : null}
        {llevaValor ? (
          <label>
            {r.unidad === 'min' || cat?.tipo_valor === 'duracion'
              ? t('Minutos')
              : r.unidad
                ? t('Cantidad ({u})', { u: idioma() === 'en' ? unidadPara(2, r.unidad, idioma()) : r.unidad })
                : t('Cantidad')}
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>
        ) : null}
        <label>{cat?.tipo_valor === 'hora' ? t('Hora') : t('Cuándo')}<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
        {esComida ? <DondeComida personaId={persona.id} donde={donde} lugar={lugar} alCambiar={(d, l) => { setDonde(d); setLugar(l); }} /> : null}
        {conGente ? (
          <div className="con-quien">
            <p className="rotulo-campo">{t('👥 Con quién')}</p>
            <div className="chips envolver">
              {nombresGente.map((n) => (
                <button key={n} type="button" className={`chip${conQuien.includes(n) ? ' activa' : ''}`} onClick={() => setConQuien((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]))}>
                  {conQuien.includes(n) ? '✓ ' : ''}{n}
                </button>
              ))}
            </div>
            <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); const n = nuevaGente.trim(); if (n && !conQuien.includes(n)) setConQuien([...conQuien, n]); setNuevaGente(''); }}>
              <input value={nuevaGente} onChange={(e) => setNuevaGente(e.target.value)} placeholder={nombresGente.length ? t('¿Alguien más?') : t('ej: Mamá, Juan, amigos')} />
              <button className="btn" disabled={!nuevaGente.trim()}>{t('Sumar')}</button>
            </form>
          </div>
        ) : null}
        <label>{t('Nota')}<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={t('detalle, marca, cómo fue…')} /></label>
        {error ? <p className="neg">{error}</p> : null}
        <button className="btn primario ancho" disabled={guardando} onClick={() => void guardar()}>{guardando ? t('Guardando…') : t('Guardar cambios')}</button>
        <button className="borrar-chico" disabled={guardando} onClick={() => void alBorrar()}>{t('🗑 Borrar')}</button>
      </div>
    </div>
  );
}
