// Anotar algo, en tres toques: categoría (opcional), qué fue (sugerido o nuevo) y su valor. O contarlo en texto libre.
import { useState } from 'react';
import { UNIDADES_SUGERIDAS, type Categoria, type Concepto, type Persona, type Registro, type TipoValor } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { anotarClima } from '../lib/clima';
import { horaAhora, horaEn, instanteDelDia } from '../lib/fechas';
import { Autocompletar } from '../ui/Autocompletar';
import { Tele } from './Tele';

interface Elegido {
  concepto_id?: number;
  nombre: string;
  categoria: Categoria;
  tipo_valor: TipoValor;
  unidad: string | null;
  /** Si ya se preguntó si lleva cantidad (los nuevos, todavía no). */
  cantidad_decidida: boolean;
}

interface Propuesta {
  categoria_id: number;
  concepto_id: number | null;
  concepto_nombre: string;
  nuevo: boolean;
  inicio: string;
  fin: string | null;
  valor: number | null;
  unidad: string | null;
  intensidad: number | null;
  nota: string | null;
}

export function Cargar({ persona, fecha, alGuardar, alCerrar }: { persona: Persona; fecha: string; alGuardar(): void; alCerrar(): void }) {
  const { categorias, sesion, avisar } = useEstado();
  const [modo, setModo] = useState<'rapido' | 'texto' | 'tele'>('rapido');
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [pidiendoCategoria, setPidiendoCategoria] = useState<string | null>(null);

  const elegir = (c: Concepto) => {
    const cat = categorias.find((k) => k.id === c.categoria_id)!;
    setElegido({ concepto_id: c.id, nombre: c.nombre, categoria: cat, tipo_valor: c.tipo_valor, unidad: c.unidad, cantidad_decidida: c.cantidad_decidida });
  };
  const crear = (nombre: string, cat: Categoria | null = categoria) => {
    if (!cat) return setPidiendoCategoria(nombre);
    setPidiendoCategoria(null);
    setElegido({ nombre, categoria: cat, tipo_valor: cat.tipo_valor, unidad: cat.unidad, cantidad_decidida: false });
  };

  return (
    <div className="hoja" role="dialog" aria-label="Anotar">
      <div className="hoja-cabeza">
        <div className="segmentos">
          <button className={modo === 'rapido' ? 'activa' : ''} onClick={() => setModo('rapido')}>Rápido</button>
          <button className={modo === 'tele' ? 'activa' : ''} onClick={() => setModo('tele')}>📺 Tele</button>
          {sesion?.ia ? <button className={modo === 'texto' ? 'activa' : ''} onClick={() => setModo('texto')}>Contarlo ✨</button> : null}
        </div>
        <button className="btn-icono" onClick={alCerrar} aria-label="Cerrar">✕</button>
      </div>

      {modo === 'texto' ? (
        <TextoLibre persona={persona} alGuardar={alGuardar} />
      ) : modo === 'tele' ? (
        <Tele persona={persona} fecha={fecha} alGuardar={alGuardar} />
      ) : elegido ? (
        <Valor persona={persona} fecha={fecha} elegido={elegido} alVolver={() => setElegido(null)} alGuardar={() => { avisar(`Anotado: ${elegido.nombre}`); alGuardar(); }} />
      ) : (
        <>
          <div className="chips">
            {categorias.map((c) => (
              <button key={c.id} className={`chip ${categoria?.id === c.id ? 'activa' : ''}`} onClick={() => setCategoria(categoria?.id === c.id ? null : c)}>
                {c.icono} {c.nombre}
              </button>
            ))}
          </div>
          {pidiendoCategoria ? (
            <div className="tarjeta">
              <p>¿En qué categoría va «{pidiendoCategoria}»?</p>
              <div className="chips">
                {categorias.map((c) => <button key={c.id} className="chip" onClick={() => crear(pidiendoCategoria, c)}>{c.icono} {c.nombre}</button>)}
              </div>
            </div>
          ) : (
            <Autocompletar categoria={categoria} categorias={categorias} alElegir={elegir} alCrear={(n) => crear(n)} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * La primera vez que se anota algo de comida, bebida o medicación: ¿lleva cantidad, y en qué unidad? ("huevos
 * revueltos": unidades; "coca": vasos o litros). Se responde una vez y queda en el concepto.
 */
function PreguntaCantidad({ elegido, alElegir }: { elegido: Elegido; alElegir(unidad: string | null): void }) {
  const [otra, setOtra] = useState('');
  const unidades = UNIDADES_SUGERIDAS[elegido.categoria.clave] ?? [];
  const verbo = elegido.categoria.clave === 'bebida' ? 'tomaste' : elegido.categoria.clave === 'medicacion' ? 'tomaste' : 'comiste';
  return (
    <div className="tarjeta pregunta-cantidad">
      <p>¿Querés anotar cuánto {verbo} de «{elegido.nombre}»? Te lo pregunto solo esta vez.</p>
      <div className="chips envolver">
        {unidades.map((u) => <button key={u} className="chip" onClick={() => alElegir(u)}>En {u}</button>)}
        <button className="chip" onClick={() => alElegir(null)}>No, solo que {elegido.categoria.clave === 'bebida' ? 'lo tomé' : 'lo comí'}</button>
      </div>
      <label>
        Otra unidad
        <span className="fila">
          <input value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="ej: rodajas, cucharadas" />
          <button className="btn" disabled={!otra.trim()} onClick={() => alElegir(otra.trim().toLowerCase())}>Usar</button>
        </span>
      </label>
    </div>
  );
}

function Valor({ persona, fecha, elegido: inicial, alVolver, alGuardar }: { persona: Persona; fecha: string; elegido: Elegido; alVolver(): void; alGuardar(): void }) {
  const [hora, setHora] = useState(horaAhora(persona.zona_horaria));
  const [intensidad, setIntensidad] = useState<number | null>(null);
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [elegido, setElegido] = useState(inicial);
  /** Lo que se contestó a "¿lleva cantidad?" en esta carga (se guarda en el concepto al anotar). */
  const [decision, setDecision] = useState<{ unidad: string | null } | null>(null);
  const preguntar = !elegido.cantidad_decidida && !decision && elegido.categoria.clave in UNIDADES_SUGERIDAS;
  const t = elegido.tipo_valor;

  const decidir = (unidad: string | null) => {
    setDecision({ unidad });
    setElegido((e) => (unidad ? { ...e, tipo_valor: 'cantidad', unidad } : { ...e, tipo_valor: 'evento', unidad: null }));
  };

  const guardar = async () => {
    if (t === 'intensidad' && intensidad === null) return setError('Elegí la intensidad.');
    setEnviando(true);
    const inicio = instanteDelDia(fecha, hora, persona.zona_horaria);
    try {
      const r = await api<Registro>('POST', '/api/registros', {
        persona_id: persona.id,
        concepto_id: elegido.concepto_id,
        concepto_nombre: elegido.concepto_id ? undefined : elegido.nombre,
        categoria_id: elegido.categoria.id,
        inicio,
        intensidad,
        valor: valor === '' ? null : Number(valor.replace(',', '.')),
        unidad: elegido.unidad,
        nota: nota || null,
      });
      // Lo que se contestó queda para las próximas veces (si es nuevo, recién ahora tiene id).
      if (decision) {
        await api('PUT', `/api/conceptos/${r.concepto_id}`, decision.unidad ? { tipo_valor: 'cantidad', unidad: decision.unidad } : { tipo_valor: 'evento', unidad: null });
      }
      void anotarClima(persona.id, [inicio]);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="valor">
      <button className="volver" onClick={alVolver}>‹ {elegido.categoria.icono} {elegido.nombre}{elegido.concepto_id ? '' : ' (nuevo)'}</button>
      {preguntar ? <PreguntaCantidad elegido={elegido} alElegir={decidir} /> : null}
      {preguntar ? null : t === 'intensidad' ? (
        <fieldset className="escala">
          <legend>Intensidad</legend>
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} className={intensidad === i ? 'activa' : ''} style={{ ['--i' as string]: i }} onClick={() => setIntensidad(i)}>{i}</button>
          ))}
          <div className="escala-pie suave chico"><span>nada</span><span>insoportable</span></div>
        </fieldset>
      ) : null}
      {!preguntar && (t === 'cantidad' || t === 'medida' || t === 'duracion') ? (
        <label>
          {t === 'duracion' ? 'Minutos' : elegido.unidad ? `¿${elegido.unidad.endsWith('os') ? 'Cuántos' : 'Cuántas'} ${elegido.unidad}?` : 'Cantidad'}
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          {t === 'duracion' ? (
            <div className="chips">{[10, 15, 30, 45, 60, 90].map((m) => <button key={m} className="chip" onClick={() => setValor(String(m))}>{m}</button>)}</div>
          ) : t === 'cantidad' ? (
            <div className="chips">{[1, 2, 3, 4, 5].map((m) => <button key={m} className="chip" onClick={() => setValor(String(m))}>{m}</button>)}</div>
          ) : null}
        </label>
      ) : null}
      {preguntar ? null : (
        <>
          <label>{t === 'hora' ? 'Hora' : 'Cuándo'}<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
          <label>Nota (opcional)<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="detalle, lugar, con quién…" /></label>
        </>
      )}
      {error ? <p className="neg">{error}</p> : null}
      {preguntar ? null : <button className="btn primario ancho" onClick={guardar} disabled={enviando}>Anotar</button>}
    </div>
  );
}

function TextoLibre({ persona, alGuardar }: { persona: Persona; alGuardar(): void }) {
  const { categorias, avisar } = useEstado();
  const [texto, setTexto] = useState('');
  const [propuesta, setPropuesta] = useState<Propuesta[] | null>(null);
  const [dudas, setDudas] = useState<string[]>([]);
  const [quitar, setQuitar] = useState<Set<number>>(new Set());
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  const interpretar = async () => {
    setTrabajando(true);
    setError('');
    try {
      const r = await api<{ registros: Propuesta[]; dudas: string[] }>('POST', '/api/registros/interpretar', { persona_id: persona.id, texto });
      setPropuesta(r.registros);
      setDudas(r.dudas);
      setQuitar(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  const guardar = async () => {
    setTrabajando(true);
    try {
      const lista = propuesta!.filter((_, i) => !quitar.has(i)).map((p) => ({ ...p, persona_id: persona.id }));
      await api('POST', '/api/registros/varios', { registros: lista });
      void anotarClima(persona.id, lista.map((p) => p.inicio));
      avisar(`Anotadas ${lista.length} cosas`);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setTrabajando(false);
    }
  };

  if (propuesta) {
    return (
      <div className="valor">
        <p className="suave">Revisá y sacá lo que no va:</p>
        <ul className="lista">
          {propuesta.map((p, i) => {
            const cat = categorias.find((c) => c.id === p.categoria_id);
            return (
              <li key={i} className={quitar.has(i) ? 'tachado' : ''} onClick={() => setQuitar((q) => { const n = new Set(q); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                <span className="hora">{horaEn(p.inicio, persona.zona_horaria)}</span>
                <span className="icono">{cat?.icono}</span>
                <span>
                  {p.concepto_nombre}
                  {p.nuevo ? <span className="etiqueta">nuevo</span> : null}
                  {p.intensidad !== null ? ` · ${p.intensidad}/10` : p.valor !== null ? ` · ${p.valor}${p.unidad ? ' ' + p.unidad : ''}` : ''}
                  {p.nota ? <span className="suave chico"> — {p.nota}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
        {dudas.length ? <div className="nota-ia">{dudas.map((d) => <p key={d}>🤔 {d}</p>)}</div> : null}
        {error ? <p className="neg">{error}</p> : null}
        <div className="fila">
          <button className="btn" onClick={() => setPropuesta(null)}>Volver</button>
          <button className="btn primario" onClick={guardar} disabled={trabajando || quitar.size === propuesta.length}>Anotar {propuesta.length - quitar.size}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="valor">
      <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
        placeholder="Contá tu día como te salga: «me levanté 7:30, desayuné café con tostadas, a las 11 me empezó a doler la cabeza, como un 4…»" />
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" onClick={interpretar} disabled={trabajando || !texto.trim()}>{trabajando ? 'Leyendo…' : 'Ordenarlo'}</button>
    </div>
  );
}
