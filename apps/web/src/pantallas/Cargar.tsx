// Anotar algo, en tres toques: categoría (opcional), qué fue (sugerido o nuevo) y su valor. O contarlo en texto libre.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { conUnidad, cuantos, dosisTexto, frecuenciaTexto, unidadPara, UNIDADES_SUGERIDAS, type Categoria, type Concepto, type Persona, type Registro, type TipoValor, type Donde } from 'shared';
import { api } from '../api';
import { idioma, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { anotarClima } from '../lib/clima';
import { horaAhora, horaEn, hoyEn, instanteDelDia, nombreDia } from '../lib/fechas';
import { Autocompletar } from '../ui/Autocompletar';
import { sacarFoto, type Foto } from '../lib/foto';
import { escuchar, hayVoz, type Escucha } from '../lib/voz';
import { tomasCambiaron } from '../lib/remedios';
import { resumenTomas } from './Remedios';
import { Tele } from './Tele';
import { DondeComida, etiquetaDonde } from '../ui/DondeComida';
import { IconoCamara, IconoGaleria, IconoMicrofono } from '../ui/Iconos';
import { OndaVoz } from '../ui/OndaVoz';

interface Elegido {
  concepto_id?: number;
  nombre: string;
  categoria: Categoria;
  tipo_valor: TipoValor;
  unidad: string | null;
  /** Si ya se preguntó si lleva cantidad (los nuevos, todavía no). */
  cantidad_decidida: boolean;
}

/** Un remedio para adelante que propone la IA ("paracetamol cada 8 h por 5 días"): se guarda como tratamiento. */
interface TratamientoPropuesto {
  concepto_id: number | null;
  concepto_nombre: string;
  nuevo: boolean;
  dosis: number | null;
  unidad: string | null;
  cada_horas: number | null;
  horarios: string[];
  inicio: string;
  fin: string | null;
  motivo: string | null;
  dias: number | null;
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
  donde?: Donde | null;
  lugar?: string | null;
}

export function Cargar({ persona, fecha, alGuardar, alCerrar, contar = false, foto = false }: {
  persona: Persona;
  fecha: string;
  /** `fechaGuardada`: si lo anotado quedó todo en otro día (contado en texto: "ayer a la noche…"), cuál. */
  alGuardar(fechaGuardada?: string): void;
  alCerrar(): void;
  /** Abrir directo en "Contarlo" y, si se puede, empezar a escuchar (el botón grande del Día). */
  contar?: boolean;
  /** Abrir directo en "Contarlo" con la cámara (el botón de la foto del Día). */
  foto?: boolean;
}) {
  const { categorias, sesion, festejar } = useEstado();
  const [modo, setModo] = useState<'rapido' | 'texto' | 'tele'>(contar || foto ? 'texto' : 'rapido');
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
    <div className="hoja" role="dialog" aria-label={t('Anotar')}>
      <div className="hoja-cabeza">
        <div className="segmentos">
          <button className={modo === 'rapido' ? 'activa' : ''} onClick={() => setModo('rapido')}>{t('Rápido')}</button>
          <button className={modo === 'tele' ? 'activa' : ''} onClick={() => setModo('tele')}>{t('📺 Tele')}</button>
          {sesion?.ia ? <button className={modo === 'texto' ? 'activa' : ''} onClick={() => setModo('texto')}>{t('Contarlo ✨')}</button> : null}
        </div>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>

      {modo === 'texto' ? (
        <TextoLibre persona={persona} fecha={fecha} alGuardar={alGuardar} dictarAlAbrir={contar && !foto} fotoAlAbrir={foto} />
      ) : modo === 'tele' ? (
        <Tele persona={persona} fecha={fecha} alGuardar={alGuardar} />
      ) : elegido ? (
        <Valor persona={persona} fecha={fecha} elegido={elegido} alVolver={() => setElegido(null)} alGuardar={() => { festejar(t('¡Anotado! {que}', { que: t(elegido.nombre) })); alGuardar(); }} />
      ) : (
        <>
          <div className="chips">
            {categorias.map((c) => (
              <button key={c.id} className={`chip ${categoria?.id === c.id ? 'activa' : ''}`} onClick={() => setCategoria(categoria?.id === c.id ? null : c)}>
                {c.icono} {t(c.nombre)}
              </button>
            ))}
          </div>
          {pidiendoCategoria ? (
            <div className="tarjeta">
              <p>{t('¿En qué categoría va «{que}»?', { que: pidiendoCategoria })}</p>
              <div className="chips">
                {categorias.map((c) => <button key={c.id} className="chip" onClick={() => crear(pidiendoCategoria, c)}>{c.icono} {t(c.nombre)}</button>)}
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
  const tomado = elegido.categoria.clave === 'bebida' || elegido.categoria.clave === 'medicacion';
  const nombre = t(elegido.nombre);
  return (
    <div className="tarjeta pregunta-cantidad">
      <p>
        {tomado
          ? t('¿Querés anotar cuánto tomaste de «{que}»? Te lo pregunto solo esta vez.', { que: nombre })
          : t('¿Querés anotar cuánto comiste de «{que}»? Te lo pregunto solo esta vez.', { que: nombre })}
      </p>
      <div className="chips envolver">
        {unidades.map((u) => <button key={u} className="chip" onClick={() => alElegir(u)}>{t('En {u}', { u: unidadPara(2, u, idioma()) })}</button>)}
        <button className="chip" onClick={() => alElegir(null)}>{elegido.categoria.clave === 'bebida' ? t('No, solo que lo tomé') : t('No, solo que lo comí')}</button>
      </div>
      <label>
        {t('Otra unidad')}
        <span className="fila">
          <input value={otra} onChange={(e) => setOtra(e.target.value)} placeholder={t('ej: rodajas, cucharadas')} />
          <button className="btn" disabled={!otra.trim()} onClick={() => alElegir(otra.trim().toLowerCase())}>{t('Usar')}</button>
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
  /** Comidas y bebidas: dónde fue. */
  const esComida = ['comida', 'bebida'].includes(inicial.categoria.clave);
  const [donde, setDonde] = useState<Donde | null>(null);
  const [lugar, setLugar] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [elegido, setElegido] = useState(inicial);
  /** Lo que se contestó a "¿lleva cantidad?" en esta carga (se guarda en el concepto al anotar). */
  const [decision, setDecision] = useState<{ unidad: string | null } | null>(null);
  const preguntar = !elegido.cantidad_decidida && !decision && elegido.categoria.clave in UNIDADES_SUGERIDAS;
  const tv = elegido.tipo_valor;

  const decidir = (unidad: string | null) => {
    setDecision({ unidad });
    setElegido((e) => (unidad ? { ...e, tipo_valor: 'cantidad', unidad } : { ...e, tipo_valor: 'evento', unidad: null }));
  };

  const guardar = async () => {
    if (tv === 'intensidad' && intensidad === null) return setError(t('Elegí la intensidad.'));
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
        ...(esComida ? { donde, lugar: lugar.trim() || null } : {}),
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
      <button className="volver" onClick={alVolver}>‹ {elegido.categoria.icono} {t(elegido.nombre)}{elegido.concepto_id ? '' : ' ' + t('(nuevo)')}</button>
      {preguntar ? <PreguntaCantidad elegido={elegido} alElegir={decidir} /> : null}
      {preguntar ? null : tv === 'intensidad' ? (
        <fieldset className="escala">
          <legend>{t('Intensidad')}</legend>
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} className={intensidad === i ? 'activa' : ''} style={{ ['--i' as string]: i }} onClick={() => setIntensidad(i)}>{i}</button>
          ))}
          <div className="escala-pie suave chico"><span>{t('nada')}</span><span>{t('insoportable')}</span></div>
        </fieldset>
      ) : null}
      {!preguntar && (tv === 'cantidad' || tv === 'medida' || tv === 'duracion') ? (
        <label>
          {tv === 'duracion' ? t('Minutos') : elegido.unidad ? cuantos(elegido.unidad, idioma()) : t('Cantidad')}
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          {tv === 'duracion' ? (
            <div className="chips">{[10, 15, 30, 45, 60, 90].map((m) => <button key={m} className="chip" onClick={() => setValor(String(m))}>{m}</button>)}</div>
          ) : tv === 'cantidad' ? (
            <div className="chips">{[1, 2, 3, 4, 5].map((m) => <button key={m} className="chip" onClick={() => setValor(String(m))}>{m}</button>)}</div>
          ) : null}
        </label>
      ) : null}
      {preguntar ? null : (
        <>
          <label>{tv === 'hora' ? t('Hora') : t('Cuándo')}<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
          {esComida ? <DondeComida personaId={persona.id} donde={donde} lugar={lugar} alCambiar={(d, l) => { setDonde(d); setLugar(l); }} /> : null}
          <label>{t('Nota (opcional)')}<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={t('detalle, lugar, con quién…')} /></label>
        </>
      )}
      {error ? <p className="neg">{error}</p> : null}
      {preguntar ? null : <button className="btn primario ancho" onClick={guardar} disabled={enviando}>{t('Anotar')}</button>}
    </div>
  );
}

/**
 * "Contarlo": hablarle (o escribirle) a Patty cómo fue el día y que lo ordene en registros para revisar. Con micrófono
 * solo se ve el botón grande y lo que se escuchó; para escribir hay un enlace. Si Patty tiene dudas ("¿cuántas
 * porciones?"), se le contesta igual, hablando o escribiendo, y vuelve a ordenar todo con la aclaración.
 */
function TextoLibre({ persona, fecha, alGuardar, dictarAlAbrir = false, fotoAlAbrir = false }: {
  persona: Persona;
  /** El día que se estaba mirando: si no se dice cuándo pasó, es ese. */
  fecha: string;
  alGuardar(fechaGuardada?: string): void;
  dictarAlAbrir?: boolean;
  fotoAlAbrir?: boolean;
}) {
  const { categorias, festejar, sesion } = useEstado();
  const vozServidor = Boolean(sesion?.voz);
  const conVoz = hayVoz(vozServidor);
  const [modo, setModo] = useState<'voz' | 'escribir'>(conVoz ? 'voz' : 'escribir');
  /** Todo lo contado hasta ahora (con las aclaraciones): es lo que se manda a ordenar. */
  const [texto, setTexto] = useState('');
  /** Lo que se está escuchando ahora (en vivo si el teléfono lo da). */
  const [oido, setOido] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [propuesta, setPropuesta] = useState<Propuesta[] | null>(null);
  const [dudas, setDudas] = useState<string[]>([]);
  const [quitar, setQuitar] = useState<Set<number>>(new Set());
  const [remedios, setRemedios] = useState<TratamientoPropuesto[]>([]);
  const [quitarRemedio, setQuitarRemedio] = useState<Set<number>>(new Set());
  const [estado, setEstado] = useState<'quieto' | 'escuchando' | 'transcribiendo' | 'ordenando' | 'guardando'>('quieto');
  const [error, setError] = useState('');
  const escucha = useRef<Escucha | null>(null);
  /** Lo que capta el micrófono, para la onda de fondo. */
  const [onda, setOnda] = useState<AnalyserNode | undefined>(undefined);

  /** La foto que se mandó (se manda de nuevo con cada aclaración). */
  const [foto, setFoto] = useState<Foto | null>(null);
  const fotoRef = useRef<Foto | null>(null);
  /** Primero se elige de dónde (cámara o galería), con botones grandes; después se saca o se elige. */
  const [eligiendoFoto, setEligiendoFoto] = useState(false);
  const tomarFoto = () => {
    setError('');
    setEligiendoFoto(true);
  };
  const fotoDe = async (origen: 'camara' | 'galeria') => {
    setEligiendoFoto(false);
    setError('');
    try {
      const f = await sacarFoto(origen);
      if (!f) return;
      fotoRef.current = f;
      setFoto(f);
      await interpretar(texto.trim(), f);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const interpretar = async (contado: string, fotoNueva?: Foto) => {
    const foto = fotoNueva ?? fotoRef.current;
    setEstado('ordenando');
    setError('');
    try {
      // Con foto, va la foto con lo que se haya contado (y las aclaraciones); si no, solo el texto.
      const r = await api<{ registros: Propuesta[]; tratamientos?: TratamientoPropuesto[]; dudas: string[] }>(
        'POST',
        foto ? '/api/registros/foto' : '/api/registros/interpretar',
        foto ? { persona_id: persona.id, texto: contado, fecha, imagen: foto.datos, tipo: foto.tipo } : { persona_id: persona.id, texto: contado, fecha },
      );
      setTexto(contado);
      setPropuesta(r.registros);
      setRemedios(r.tratamientos ?? []);
      setDudas(r.dudas);
      setQuitar(new Set());
      setQuitarRemedio(new Set());
      setRespuesta('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstado('quieto');
    }
  };

  /** Lo nuevo que se cuenta: si ya había propuesta con dudas, va como respuesta a esas dudas; si no, es el relato. */
  const contar = (nuevo: string) => {
    const n = nuevo.trim();
    if (!n) return;
    if (propuesta) {
      const preguntas = dudas.length ? ` (a tus preguntas: ${dudas.join(' / ')})` : '';
      void interpretar(`${texto}\n\nAclaración${preguntas}: ${n}`);
    } else void interpretar(n);
  };

  const escucharAhora = async () => {
    if (estado === 'escuchando') return escucha.current?.parar();
    setError('');
    setOido('');
    let dicho = '';
    setEstado('escuchando');
    escucha.current = await escuchar(
      (txt) => {
        dicho = txt;
        setOido(txt);
      },
      (err) => {
        escucha.current = null;
        if (err) {
          setEstado('quieto');
          setError(err);
        } else if (dicho.trim()) contar(dicho);
        else setEstado('quieto');
      },
      { servidor: vozServidor, alTranscribir: () => setEstado('transcribiendo') },
    );
    setOnda(escucha.current?.onda);
  };

  // Desde el botón de la cámara del Día: se abre la cámara apenas se abre.
  const fotoPedida = useRef(false);
  useEffect(() => {
    if (!fotoAlAbrir || fotoPedida.current) return;
    fotoPedida.current = true;
    void tomarFoto();
  });

  // Desde el botón grande del Día: se empieza a escuchar apenas se abre.
  const empezado = useRef(false);
  useEffect(() => {
    if (!dictarAlAbrir || empezado.current || !conVoz) return;
    empezado.current = true;
    void escucharAhora();
  });

  /** El día de Patty (de 5 a 5) de un instante, para mostrar si lo propuesto va a otro día. */
  const diaDe = (inicio: string) => hoyEn(persona.zona_horaria, new Date(inicio));

  const guardar = async () => {
    setEstado('guardando');
    try {
      // Primero los remedios: así, si dijo que ya tomó la primera, el registro cuenta como esa toma.
      const nuevos = remedios.filter((_, i) => !quitarRemedio.has(i));
      for (const tr of nuevos) await api('POST', '/api/tratamientos', { ...tr, persona_id: persona.id });
      if (nuevos.length) tomasCambiaron();
      const lista = propuesta!.filter((_, i) => !quitar.has(i)).map((p) => ({ ...p, persona_id: persona.id }));
      const hechos = lista.length ? await api<Registro[]>('POST', '/api/registros/varios', { registros: lista }) : [];
      void anotarClima(persona.id, lista.map((p) => p.inicio));
      const dias = [...new Set(hechos.map((h) => h.fecha))];
      const otroDia = dias.length === 1 && dias[0] !== fecha ? dias[0] : undefined;
      const nombres = nuevos.map((tr) => t(tr.concepto_nombre)).join(idioma() === 'en' ? ' and ' : ' y ');
      const recordar = nuevos.length ? ' ' + t('Te aviso cada toma de {que} ⏰', { que: nombres }) : '';
      festejar(
        (!lista.length
          ? t('¡Listo!')
          : otroDia
            ? t('¡Anotadas {n} cosas en {dia}!', { n: lista.length, dia: nombreDia(otroDia, persona.zona_horaria).toLowerCase() })
            : t('¡Anotadas {n} cosas!', { n: lista.length })) + recordar,
      );
      alGuardar(otroDia);
    } catch (e) {
      setError((e as Error).message);
      setEstado('quieto');
    }
  };

  const ocupado = estado !== 'quieto' && estado !== 'escuchando';
  const leyenda = {
    quieto: propuesta ? t('Tocá y contestale') : t('Tocá y contale'),
    escuchando: t('Te escucho… tocá para terminar'),
    transcribiendo: t('Pasando a texto…'),
    ordenando: t('Ordenando…'),
    guardando: t('Guardando…'),
  }[estado];

  /** El micrófono grande (o, escribiendo, el cuadro de texto), para contar o para contestar. */
  const entrada = (paraResponder: boolean) =>
    modo === 'voz' ? (
      <div className={`voz${paraResponder ? ' chica' : ''}`}>
        <span className="centro-voz">
        <OndaVoz analizador={onda} activa={estado === 'escuchando'} />
        <button className={`boton-voz ${estado}`} onClick={() => void escucharAhora()} disabled={ocupado} aria-label={leyenda}>
          {ocupado ? <span aria-hidden>⏳</span> : <IconoMicrofono tamano={paraResponder ? 30 : 48} />}
        </button>
        </span>
        <p className="leyenda-voz">{leyenda}</p>
        {oido && (estado === 'escuchando' || estado === 'transcribiendo' || estado === 'ordenando') ? <blockquote className="oido">{oido}</blockquote> : null}
        {!paraResponder ? (
          <button className="btn foto-boton" onClick={() => void tomarFoto()} disabled={ocupado || estado === 'escuchando'}><IconoCamara tamano={20} /> {t('O mandale una foto (de tu plato, por ejemplo)')}</button>
        ) : null}
        <button className="enlace" onClick={() => setModo('escribir')} disabled={estado === 'escuchando'}>{t('✍️ Prefiero escribir')}</button>
      </div>
    ) : paraResponder ? (
      <div className="responder">
        <input value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder={t('Ej: dos porciones, era de mi primo')} onKeyDown={(e) => e.key === 'Enter' && contar(respuesta)} />
        <button className="btn primario" disabled={ocupado || !respuesta.trim()} onClick={() => contar(respuesta)}>{estado === 'ordenando' ? t('Ordenando…') : t('Responder')}</button>
        {conVoz ? <button className="enlace" onClick={() => setModo('voz')}>{t('🎙️ Prefiero hablar')}</button> : null}
      </div>
    ) : (
      <>
        <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
          placeholder={t('Contá tu día como te salga: «me levanté 7:30, desayuné café con tostadas, a las 11 me empezó a doler la cabeza, como un 4…»')} />
        <button className="btn primario ancho" onClick={() => contar(texto)} disabled={ocupado || !texto.trim()}>{estado === 'ordenando' ? t('Ordenando…') : t('Ordenarlo')}</button>
        <button className="btn ancho foto-boton" onClick={() => void tomarFoto()} disabled={ocupado}><IconoCamara tamano={20} /> {texto.trim() ? t('Ordenarlo con una foto') : t('Mandale una foto')}</button>
        {conVoz ? <button className="enlace" onClick={() => setModo('voz')}>{t('🎙️ Prefiero hablar')}</button> : null}
      </>
    );

  if (propuesta) {
    return (
      <div className="valor">
        {foto ? <img className="foto-mandada" src={foto.url} alt={t('La foto que mandaste')} /> : null}
        <p className="suave">{t('Revisá y sacá lo que no va:')}</p>
        <ul className="lista">
          {propuesta.map((p, i) => {
            const cat = categorias.find((c) => c.id === p.categoria_id);
            return (
              <li key={i} className={`entra${quitar.has(i) ? ' tachado' : ''}`} style={{ ['--n' as string]: i }} onClick={() => setQuitar((q) => { const n = new Set(q); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                <span className="hora">
                  {diaDe(p.inicio) !== fecha ? <span className="dia-propuesta">{nombreDia(diaDe(p.inicio), persona.zona_horaria)}</span> : null}
                  {horaEn(p.inicio, persona.zona_horaria)}
                </span>
                <span className="icono">{cat?.icono}</span>
                <span>
                  {t(p.concepto_nombre)}
                  {p.nuevo ? <span className="etiqueta">{t('nuevo')}</span> : null}
                  {p.intensidad !== null ? ` · ${p.intensidad}/10` : p.valor !== null ? ` · ${conUnidad(p.valor, p.unidad, 2, idioma())}` : ''}
                  {etiquetaDonde(p.donde, p.lugar) ? <span className="etiqueta-donde">{etiquetaDonde(p.donde, p.lugar)}</span> : null}
                  {p.nota ? <span className="suave chico"> — {p.nota}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
        {remedios.length ? (
          <>
            <p className="suave chico">{t('Recordatorios para programar:')}</p>
            <ul className="lista">
              {remedios.map((tr, i) => (
                <li key={i} className={`remedio-propuesto entra${quitarRemedio.has(i) ? ' tachado' : ''}`} style={{ ['--n' as string]: propuesta.length + i }}
                  onClick={() => setQuitarRemedio((q) => { const n = new Set(q); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                  <span className="icono">⏰</span>
                  <span>
                    <strong>{t(tr.concepto_nombre)}</strong>
                    {tr.dosis !== null || tr.unidad ? ` ${dosisTexto(tr.dosis, tr.unidad, idioma())}` : ''} · {frecuenciaTexto(tr, idioma())}
                    {tr.dias ? ' ' + (tr.dias === 1 ? t('por 1 día') : t('por {n} días', { n: tr.dias })) : tr.cada_horas || tr.horarios.length ? t(', sin fecha de fin') : ''}
                    {tr.nuevo ? <span className="etiqueta">{t('nuevo')}</span> : null}
                    <span className="suave chico renglon-sub">{resumenTomas(tr, persona.zona_horaria)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {dudas.length ? (
          <div className="nota-ia">
            {dudas.map((d) => <p key={d}>🤔 {d}</p>)}
            <p className="suave chico">{t('Si querés, contestale y lo suma a lo anterior; si no, anotá así.')}</p>
            {entrada(true)}
          </div>
        ) : null}
        {error ? <p className="neg">{error}</p> : null}
        <div className="fila">
          <button className="btn" onClick={() => { setPropuesta(null); setRemedios([]); setDudas([]); }} disabled={ocupado}>{t('Volver')}</button>
          <button className="btn confirmar" onClick={guardar} disabled={ocupado || estado === 'escuchando' || quitar.size + quitarRemedio.size === propuesta.length + remedios.length}>
            {estado === 'guardando' ? t('Guardando…') : t('¡Perfecto!')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="valor">
      {foto && estado === 'ordenando' ? (
        <div className="mirando-foto">
          <img className="foto-mandada" src={foto.url} alt={t('La foto que mandaste')} />
          <p className="suave">{t('👀 Mirando la foto…')}</p>
        </div>
      ) : null}
      {entrada(false)}
      {error ? <p className="neg">{error}</p> : null}
      {eligiendoFoto
        ? createPortal(
            <>
              <div className="velo" onClick={() => setEligiendoFoto(false)} />
              <div className="hoja modal-cuanto elegir-foto" role="dialog" aria-label={t('Foto para Patty')}>
                <p className="pregunta-cuanto">{t('Foto para Patty')}</p>
                <button className="btn primario grande-foto" onClick={() => void fotoDe('camara')}>
                  <IconoCamara tamano={28} /> {t('Sacar una foto')}
                </button>
                <button className="btn grande-foto" onClick={() => void fotoDe('galeria')}>
                  <IconoGaleria tamano={28} /> {t('Elegir de la galería')}
                </button>
                <button className="enlace chico cancelar-cuanto" onClick={() => setEligiendoFoto(false)}>{t('Cancelar')}</button>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
