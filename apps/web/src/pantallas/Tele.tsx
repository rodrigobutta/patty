// "Miré tele" o "escuché música": cuánto tiempo y qué. En la tele, qué tipo de contenido y en qué canal o plataforma;
// si fue una película, una serie o algo en una plataforma (no un canal de aire), además el género y, si quiere, cuál
// fue (con su tapa, de iTunes); si fueron deportes, cuál y qué equipo. En la música, qué (artista, disco), el género
// y dónde; en un podcast, cuál. Va como un solo registro («Tele», «Escuchar música» o «Podcast») con el detalle en
// `medio`: la API arma con eso lo que entra a los patrones («Tele: Películas», «Tele: Terror», «Tele en Netflix»).
import { useEffect, useState } from 'react';
import {
  CANALES_COMUNES, categoriaDelMedio, conceptoDelMedio, DEPORTES, GENEROS_MUSICA, GENEROS_PANTALLA, llevaTitulo, SERVICIOS_MUSICA, TIPOS_DE_TELE,
  teleEnCanal, tipoMedioDeTele, type Concepto, type Medio, type Persona,
} from 'shared';
import { api } from '../api';
import { idioma, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { anotarClima } from '../lib/clima';
import { horaAhora, instanteDelDia } from '../lib/fechas';
import { BuscarMedio, type Elegido } from '../ui/BuscarMedio';
import { IconoMedio } from '../ui/IconosPatty';

export type QueMedio = 'tele' | 'musica' | 'podcast';

const HORAS = [0.5, 1, 1.5, 2, 3, 4];
const PREFIJO_CANAL = teleEnCanal('');
/** "30 min", "1,5 h" (en inglés, "1.5 h"). */
const horasTexto = (h: number) => (h < 1 ? '30 min' : `${idioma() === 'en' ? String(h) : String(h).replace('.', ',')} h`);
const SIN_ELEGIR: Elegido = { titulo: '', resultado: null };

/** Unos chips para elegir uno (tocar el elegido lo saca). */
function Elegir({ opciones, valor, alCambiar }: { opciones: string[]; valor: string; alCambiar(v: string): void }) {
  return (
    <div className="chips envolver">
      {opciones.map((o) => <button key={o} type="button" className={`chip${valor === o ? ' activa' : ''}`} onClick={() => alCambiar(valor === o ? '' : o)}>{t(o)}</button>)}
    </div>
  );
}

export function Tele({ persona, fecha, alGuardar, inicial = 'tele' }: { persona: Persona; fecha: string; alGuardar(): void; inicial?: QueMedio }) {
  const { categorias, festejar } = useEstado();
  const [que, setQue] = useState<QueMedio>(inicial);
  const [tipo, setTipo] = useState<string | null>(null);
  const [horas, setHoras] = useState<number | null>(null);
  const [canal, setCanal] = useState('');
  const [canales, setCanales] = useState<string[]>(CANALES_COMUNES);
  const [genero, setGenero] = useState('');
  const [titulo, setTitulo] = useState<Elegido>(SIN_ELEGIR);
  const [deporte, setDeporte] = useState('');
  const [equipo, setEquipo] = useState('');
  const [hora, setHora] = useState(horaAhora(persona.zona_horaria));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pantalla = categorias.find((c) => c.clave === 'pantalla');

  // Primero los canales que ya usó, después los comunes.
  useEffect(() => {
    if (!pantalla) return;
    api<Concepto[]>('GET', `/api/conceptos/buscar?categoria=${pantalla.id}&q=${encodeURIComponent(PREFIJO_CANAL.trim())}&limite=30`)
      .then((l) => {
        const propios = l.filter((c) => c.nombre.startsWith(PREFIJO_CANAL)).map((c) => c.nombre.slice(PREFIJO_CANAL.length));
        setCanales([...propios, ...CANALES_COMUNES.filter((c) => !propios.some((p) => p.toLowerCase() === c.toLowerCase()))]);
      })
      .catch(() => {});
  }, [pantalla]);

  const cambiarQue = (q: QueMedio) => {
    setQue(q);
    setTipo(null);
    setCanal('');
    setGenero('');
    setTitulo(SIN_ELEGIR);
    setError('');
  };
  // Al elegir un título, su género (si es uno de los de Patty, o el de la música) queda elegido.
  const elegirTitulo = (e: Elegido) => {
    setTitulo(e);
    const g = e.resultado?.genero;
    if (g && !genero && (que === 'musica' || GENEROS_PANTALLA.includes(g))) setGenero(g);
  };

  const tipoTele = tipoMedioDeTele(tipo);
  const conTitulo = que !== 'tele' || (tipo !== null && llevaTitulo({ tipo: tipoTele, servicio: canal }));
  const buscarComo = que === 'tele' ? (tipoTele === 'pelicula' ? 'pelicula' : 'serie') : que;

  const medio = (): Medio => {
    const r = titulo.resultado;
    const escrito = titulo.titulo.trim() || null;
    const deItunes = r ? { tapa: r.tapa, anio: r.anio, itunes_id: r.itunes_id } : {};
    if (que === 'musica') {
      // Lo que se escribió sin elegir es el artista ("Soda Stereo"); lo elegido es un disco, con su artista.
      return { tipo: 'musica', genero: genero || null, servicio: canal || null, ...(r ? { album: r.titulo, artista: r.artista } : { artista: escrito }), ...deItunes };
    }
    if (que === 'podcast') return { tipo: 'podcast', titulo: escrito, servicio: canal || null, ...deItunes };
    return {
      // Algo en una plataforma que resultó ser una serie o una película: queda como tal.
      tipo: tipoTele === 'tele' && r ? r.tipo : tipoTele,
      contenido: tipoTele === 'tele' ? tipo : null,
      servicio: canal.trim() || null,
      genero: conTitulo ? genero || null : null,
      titulo: conTitulo ? escrito : null,
      deporte: tipoTele === 'deporte' ? deporte || null : null,
      equipo: tipoTele === 'deporte' ? equipo.trim() || null : null,
      ...(conTitulo ? deItunes : {}),
    };
  };

  const guardar = async () => {
    if (que === 'tele' && !tipo) return setError(t('¿Qué miraste?'));
    if (!horas) return setError(t('¿Cuánto tiempo?'));
    const m = medio();
    const cat = categorias.find((c) => c.clave === categoriaDelMedio(m.tipo));
    if (!cat) return setError(t('Para esto hace falta la última versión de la app.'));
    setError('');
    setEnviando(true);
    const inicio = instanteDelDia(fecha, hora, persona.zona_horaria);
    try {
      await api('POST', '/api/registros', {
        persona_id: persona.id,
        concepto_nombre: conceptoDelMedio(m.tipo),
        categoria_id: cat.id,
        inicio,
        valor: Math.round(horas * 60),
        unidad: 'min',
        medio: m,
      });
      void anotarClima(persona.id, [inicio]);
      const nombre = m.titulo ?? m.artista ?? m.album ?? (que === 'tele' ? t(tipo!).toLowerCase() : que === 'musica' ? t('música') : t('podcast'));
      festejar(m.servicio ? t('¡Anotado! {cuanto} de {que} en {canal}', { cuanto: horasTexto(horas), que: nombre, canal: t(m.servicio) }) : t('¡Anotado! {cuanto} de {que}', { cuanto: horasTexto(horas), que: nombre }));
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="tele">
      <div className="segmentos ancho que-medio">
        {(['tele', 'musica', 'podcast'] as const).map((q) => (
          <button key={q} type="button" className={que === q ? 'activa' : ''} onClick={() => cambiarQue(q)}>
            <IconoMedio tipo={q} tamano={20} /> {q === 'tele' ? t('Tele') : q === 'musica' ? t('Música') : t('Podcast')}
          </button>
        ))}
      </div>

      {que === 'tele' ? (
        <>
          <p className="rotulo">{t('¿Qué miraste?')}</p>
          <div className="chips envolver">
            {TIPOS_DE_TELE.filter((x) => x !== 'Música').map((tp) => <button key={tp} className={`chip${tipo === tp ? ' activa' : ''}`} onClick={() => setTipo(tp)}>{t(tp)}</button>)}
          </div>
          <p className="rotulo">{t('¿En qué canal o plataforma?')} <span className="suave chico">{t('(opcional)')}</span></p>
          <Elegir opciones={canales.slice(0, 16)} valor={canal} alCambiar={setCanal} />
          <label>{t('Otro canal')}<input value={canales.includes(canal) ? '' : canal} onChange={(e) => setCanal(e.target.value)} placeholder={t('ej: Encuentro, Paramount+')} /></label>
          {tipoTele === 'deporte' ? (
            <>
              <p className="rotulo">{t('¿Qué deporte?')}</p>
              <Elegir opciones={DEPORTES} valor={deporte} alCambiar={setDeporte} />
              <label>{t('¿Qué equipo o quién jugaba?')} <span className="suave chico">{t('(opcional)')}</span><input value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder={t('ej: River, la Selección')} /></label>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p className="rotulo">{t('¿Dónde lo escuchaste?')} <span className="suave chico">{t('(opcional)')}</span></p>
          <Elegir opciones={SERVICIOS_MUSICA} valor={canal} alCambiar={setCanal} />
        </>
      )}

      {conTitulo ? (
        <>
          {que !== 'podcast' ? (
            <>
              <p className="rotulo">{que === 'musica' ? t('¿Qué tipo de música?') : tipoTele === 'serie' ? t('¿Qué tipo de serie?') : t('¿Qué tipo de película?')}</p>
              <Elegir opciones={que === 'musica' ? GENEROS_MUSICA : GENEROS_PANTALLA} valor={genero} alCambiar={setGenero} />
            </>
          ) : null}
          <p className="rotulo">
            {que === 'musica' ? t('¿Qué escuchaste?') : que === 'podcast' ? t('¿Qué podcast?') : tipoTele === 'pelicula' ? t('¿Qué película?') : t('¿Cuál?')}{' '}
            <span className="suave chico">{t('(opcional)')}</span>
          </p>
          <BuscarMedio key={`${que}-${buscarComo}`} tipo={buscarComo} valor={titulo} alCambiar={elegirTitulo} />
        </>
      ) : null}

      <p className="rotulo">{t('¿Cuánto tiempo?')}</p>
      <div className="chips envolver">
        {HORAS.map((h) => (
          <button key={h} className={`chip${horas === h ? ' activa' : ''}`} onClick={() => setHoras(h)}>
            {horasTexto(h)}
          </button>
        ))}
      </div>
      <label>{t('Cuándo')}<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" disabled={enviando} onClick={() => void guardar()}>{t('Anotar')}</button>
    </div>
  );
}
