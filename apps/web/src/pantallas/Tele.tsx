// "Miré tele": cuánto tiempo, qué tipo de contenido y en qué canal o plataforma. Va como tres duraciones en «Pantalla
// y redes» (el total, el tipo y el canal; ver TELE en shared), para que los patrones puedan separar, por ejemplo,
// muchas horas de noticias de una película.
import { useEffect, useState } from 'react';
import { CANALES_COMUNES, TELE, TIPOS_DE_TELE, teleDeTipo, teleEnCanal, type Concepto, type Persona } from 'shared';
import { api } from '../api';
import { idioma, t } from '../lib/idioma';
import { useEstado } from '../estado';
import { anotarClima } from '../lib/clima';
import { horaAhora, instanteDelDia } from '../lib/fechas';

const HORAS = [0.5, 1, 1.5, 2, 3, 4];
const PREFIJO_CANAL = teleEnCanal('');
/** "30 min", "1,5 h" (en inglés, "1.5 h"). */
const horasTexto = (h: number) => (h < 1 ? '30 min' : `${idioma() === 'en' ? String(h) : String(h).replace('.', ',')} h`);

export function Tele({ persona, fecha, alGuardar }: { persona: Persona; fecha: string; alGuardar(): void }) {
  const { categorias, festejar } = useEstado();
  const [tipo, setTipo] = useState<string | null>(null);
  const [horas, setHoras] = useState<number | null>(null);
  const [canal, setCanal] = useState('');
  const [canales, setCanales] = useState<string[]>(CANALES_COMUNES);
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

  const guardar = async () => {
    if (!pantalla) return;
    if (!tipo) return setError(t('¿Qué miraste?'));
    if (!horas) return setError(t('¿Cuánto tiempo?'));
    setError('');
    setEnviando(true);
    const inicio = instanteDelDia(fecha, hora, persona.zona_horaria);
    const minutos = Math.round(horas * 60);
    const base = { persona_id: persona.id, categoria_id: pantalla.id, inicio, valor: minutos, unidad: 'min' };
    try {
      await api('POST', '/api/registros/varios', {
        registros: [
          { ...base, concepto_nombre: TELE, nota: [tipo, canal.trim()].filter(Boolean).join(' · ') },
          { ...base, concepto_nombre: teleDeTipo(tipo) },
          ...(canal.trim() ? [{ ...base, concepto_nombre: teleEnCanal(canal.trim()) }] : []),
        ],
      });
      void anotarClima(persona.id, [inicio]);
      const vars = { cuanto: horasTexto(horas), que: t(tipo).toLowerCase(), canal: t(canal.trim()) };
      festejar(canal.trim() ? t('¡Anotado! {cuanto} de {que} en {canal}', vars) : t('¡Anotado! {cuanto} de {que}', vars));
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="tele">
      <p className="rotulo">{t('¿Qué miraste?')}</p>
      <div className="chips envolver">
        {TIPOS_DE_TELE.map((tp) => <button key={tp} className={`chip${tipo === tp ? ' activa' : ''}`} onClick={() => setTipo(tp)}>{t(tp)}</button>)}
      </div>
      <p className="rotulo">{t('¿Cuánto tiempo?')}</p>
      <div className="chips envolver">
        {HORAS.map((h) => (
          <button key={h} className={`chip${horas === h ? ' activa' : ''}`} onClick={() => setHoras(h)}>
            {horasTexto(h)}
          </button>
        ))}
      </div>
      <p className="rotulo">{t('¿En qué canal o plataforma?')} <span className="suave chico">{t('(opcional)')}</span></p>
      <div className="chips envolver">
        {canales.slice(0, 16).map((c) => <button key={c} className={`chip${canal === c ? ' activa' : ''}`} onClick={() => setCanal(canal === c ? '' : c)}>{t(c)}</button>)}
      </div>
      <label>{t('Otro canal')}<input value={canales.includes(canal) ? '' : canal} onChange={(e) => setCanal(e.target.value)} placeholder={t('ej: Encuentro, Paramount+')} /></label>
      <label>{t('Cuándo')}<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" disabled={enviando} onClick={() => void guardar()}>{t('Anotar')}</button>
    </div>
  );
}
