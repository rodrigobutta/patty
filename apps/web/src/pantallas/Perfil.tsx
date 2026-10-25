// Los datos de la persona (opcionales): fecha de nacimiento, sexo, altura, peso y condiciones crónicas. Patty no es una
// app médica: los usa solo para entender mejor los patrones. Se ofrecen una vez después de la bienvenida (chiquito y
// salteable) y se completan o cambian cuando sea desde Más.
import { useState } from 'react';
import { CONDICIONES_COMUNES, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';

const CLAVE = (id: number) => `perfil-ofrecido-${id}`;

/** Si todavía no se le ofreció completar sus datos a esta persona (y no tiene ninguno cargado). */
export function ofrecerPerfil(p: Persona): boolean {
  if (!p.propia || p.sexo || p.altura_cm || p.peso_kg || p.condiciones?.length) return false;
  try {
    return localStorage.getItem(CLAVE(p.id)) !== 'si';
  } catch {
    return false;
  }
}
const yaOfrecido = (id: number) => {
  try {
    localStorage.setItem(CLAVE(id), 'si');
  } catch {
    /* sin almacenamiento */
  }
};

export function Perfil({ persona, bienvenida = false, alTerminar }: { persona: Persona; bienvenida?: boolean; alTerminar(): void }) {
  const { recargar, avisar } = useEstado();
  const [nacimiento, setNacimiento] = useState(persona.nacimiento ?? '');
  const [sexo, setSexo] = useState(persona.sexo ?? null);
  const [altura, setAltura] = useState(persona.altura_cm ? String(persona.altura_cm) : '');
  const [peso, setPeso] = useState(persona.peso_kg ? String(persona.peso_kg).replace('.', ',') : '');
  const [condiciones, setCondiciones] = useState<string[]>(persona.condiciones ?? []);
  const [otra, setOtra] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const propia = persona.propia;

  const alternar = (c: string) => setCondiciones((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  const agregarOtra = () => {
    const nueva = otra.trim();
    if (nueva && !condiciones.some((c) => c.toLowerCase() === nueva.toLowerCase())) setCondiciones((l) => [...l, nueva[0].toUpperCase() + nueva.slice(1)]);
    setOtra('');
  };

  const salir = () => {
    yaOfrecido(persona.id);
    alTerminar();
  };

  const guardar = async () => {
    setEnviando(true);
    setError('');
    const extra = otra.trim() && !condiciones.includes(otra.trim()) ? [otra.trim()] : [];
    try {
      await api('PUT', `/api/personas/${persona.id}`, {
        nacimiento: nacimiento || null,
        sexo,
        altura_cm: altura.trim() || null,
        peso_kg: peso.trim() || null,
        condiciones: [...condiciones, ...extra],
      });
      await recargar();
      avisar(t('¡Gracias! Lo voy a tener en cuenta'));
      salir();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  const otras = condiciones.filter((c) => !CONDICIONES_COMUNES.includes(c));
  return (
    <div className={bienvenida ? 'perfil perfil-bienvenida' : 'hoja perfil'} role={bienvenida ? undefined : 'dialog'} aria-label={t('Datos de la persona')}>
      <div className="hoja-cabeza">
        <h3>{bienvenida ? t('Un poquito sobre vos') : t('Datos de {nombre}', { nombre: persona.nombre })}</h3>
        {bienvenida ? <button className="enlace" onClick={salir}>{t('Ahora no')}</button> : <button className="btn-icono" onClick={alTerminar} aria-label={t('Cerrar')}>✕</button>}
      </div>
      <p className="suave chico">
        {propia
          ? t('Todo opcional. Patty no es una app médica: lo usa solo para entender mejor tus patrones. Lo podés cambiar cuando quieras desde Más.')
          : t('Todo opcional. Patty no es una app médica: lo usa solo para entender mejor sus patrones. Lo podés cambiar cuando quieras desde Más.')}
      </p>
      <div className="fila-datos">
        <label>{t('Nacimiento')}<input type="date" value={nacimiento} onChange={(e) => setNacimiento(e.target.value)} /></label>
        <label>{t('Altura (cm)')}<input inputMode="numeric" value={altura} onChange={(e) => setAltura(e.target.value)} placeholder="165" /></label>
        <label>{t('Peso (kg)')}<input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="70" /></label>
      </div>
      <div className="segmentos ancho sexo" role="group" aria-label={t('Sexo')}>
        {(['femenino', 'masculino', 'otro'] as const).map((s) => (
          <button key={s} className={sexo === s ? 'activa' : ''} onClick={() => setSexo(sexo === s ? null : s)}>
            {s === 'femenino' ? t('Mujer') : s === 'masculino' ? t('Varón') : t('Otro')}
          </button>
        ))}
      </div>
      <p className="rotulo suave chico">{propia ? t('¿Tenés alguna condición crónica?') : t('¿Tiene alguna condición crónica?')}</p>
      <div className="chips envolver">
        {[...CONDICIONES_COMUNES, ...otras].map((c) => (
          <button key={c} className={`chip chico${condiciones.includes(c) ? ' activa' : ''}`} onClick={() => alternar(c)}>{t(c)}</button>
        ))}
      </div>
      <span className="fila otra-condicion">
        <input value={otra} onChange={(e) => setOtra(e.target.value)} placeholder={t('Otra (escribila)')} onKeyDown={(e) => e.key === 'Enter' && agregarOtra()} />
        <button className="btn" disabled={!otra.trim()} onClick={agregarOtra}>{t('Agregar')}</button>
      </span>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" disabled={enviando} onClick={() => void guardar()}>{enviando ? t('Guardando…') : t('Guardar')}</button>
    </div>
  );
}
