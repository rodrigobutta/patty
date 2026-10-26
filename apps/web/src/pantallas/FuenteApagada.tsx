// Los widgets del Día de lo que llegaría solo (ubicación, uso del teléfono, reloj y salud) cuando falta el permiso: se
// ven grises, y al tocarlos una hoja muestra qué trae cada uno (con un ejemplo de cómo se vería), para qué le sirve a
// Patty y cómo activarlo, con los pasos de la marca del teléfono.
import { useEffect, useState, type ReactNode } from 'react';
import type { Persona } from 'shared';
import { leerEstado, type EstadoTelefono } from '../lib/estadoTelefono';
import { averiguarMarca, marcaDelTelefono, NOMBRE_MARCA, pasosPara } from '../lib/guiasPermisos';
import { t } from '../lib/idioma';
import { plataforma } from '../lib/nativo';
import { Mascota } from '../mascota/Mascota';
import { activarPermiso, permisoListo, type Paso } from './Permisos';
import { IconoCelular, IconoLugar, IconoSueno } from '../ui/IconosWidget';

export type Fuente = Exclude<Paso, 'avisos'>;

interface Info {
  icono: string;
  titulo: string;
  /** Cómo se vería el widget con datos (de ejemplo). */
  muestra: string;
  /** Lo que trae, con su emoji. */
  trae: Array<[string, string]>;
  ejemplo: string;
}

const INFO = (): Record<Fuente, Info> => ({
  ubicacion: {
    icono: '📍',
    titulo: t('Ubicación'),
    muestra: t('3 viajes · 12 km'),
    trae: [
      ['🚗', t('Tus viajes y cuánto tardaste')],
      ['🏠', t('Los lugares a los que vas')],
      ['🌤️', t('El clima de cada momento')],
      ['⏱️', t('Cuánto estuviste en cada lugar')],
    ],
    ejemplo: t('💡 Patty puede descubrir cosas como «los días que vas a la oficina dormís peor», y cruzar el calor, la humedad o la presión con tus dolores.'),
  },
  telefono: {
    icono: '📱',
    titulo: t('Uso del teléfono'),
    muestra: t('2 h 40 min de pantalla · 3 llamadas'),
    trae: [
      ['📲', t('Cuánto usás cada app')],
      ['🌙', t('Si usaste el teléfono de noche')],
      ['📞', t('Cuántas llamadas (nunca números ni nombres)')],
    ],
    ejemplo: t('💡 Por ejemplo: «los días con más de 4 h de pantalla te cuesta dormir» o «cuando hablás más con gente, te sentís mejor».'),
  },
  salud: {
    icono: '⌚',
    titulo: plataforma() === 'ios' ? t('Salud') : t('Reloj y salud'),
    muestra: t('7 h 10 min de sueño · 8.400 pasos'),
    trae: [
      ['😴', t('Cuánto y cómo dormiste')],
      ['👟', t('Tus pasos y tu actividad')],
      ['❤️', t('Tu pulso')],
    ],
    ejemplo: t('💡 Sin anotar nada, cómo dormiste y cuánto te moviste se cruzan con tu ánimo, tus dolores y lo que comiste.'),
  },
});

/** Los tipos de fuente (de los datos que llegan) que trae cada permiso. */
export const TIPOS_DE: Record<Fuente, string[]> = { ubicacion: ['ubicacion', 'clima'], telefono: ['telefono'], salud: ['reloj'] };

/** El estado de los permisos de este teléfono; se vuelve a mirar al volver de los ajustes. */
export function useEstadoPermisos(activo: boolean): [EstadoTelefono | null, () => void] {
  const [estado, setEstado] = useState<EstadoTelefono | null>(null);
  const mirar = () => void leerEstado().then(setEstado).catch(() => {});
  useEffect(() => {
    if (!activo) return;
    mirar();
    const f = () => document.visibilityState === 'visible' && mirar();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [activo]);
  return [estado, mirar];
}

export const fuenteApagada = (f: Fuente, e: EstadoTelefono | null) => Boolean(e) && !permisoListo(f, e);

/** El ícono dibujado de cada fuente (el mismo de los widgets con datos). */
export const ICONO_FUENTE: Record<Fuente, () => ReactNode> = {
  ubicacion: () => <IconoLugar />,
  telefono: () => <IconoCelular />,
  salud: () => <IconoSueno />,
};

export function WidgetApagado({ fuente, alTocar }: { fuente: Fuente; alTocar(): void }) {
  const i = INFO()[fuente];
  return (
    <button className="widget-auto apagado" onClick={alTocar} aria-label={`${i.titulo}: ${t('Tocá para activar')}`}>
      {ICONO_FUENTE[fuente]()}
      <span className="widget-linea">🔒 {i.titulo}</span>
      <span className="widget-sub">{t('Tocá para activar')}</span>
    </button>
  );
}

export function HojaActivar({ fuente, persona, alCerrar, alActivar }: { fuente: Fuente; persona: Persona; alCerrar(): void; alActivar(): void }) {
  const i = INFO()[fuente];
  const [marca, setMarca] = useState(marcaDelTelefono());
  useEffect(() => void averiguarMarca().then(setMarca), []);
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState('');
  const [listo, setListo] = useState(false);
  const pasos = pasosPara(fuente, marca);

  const activar = async () => {
    setOcupado(true);
    setNota('');
    try {
      const n = await activarPermiso(fuente, persona);
      if (n) setNota(n);
      const e = await leerEstado();
      if (permisoListo(fuente, e)) setListo(true);
      alActivar();
    } catch (e) {
      setNota((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="hoja hoja-activar" role="dialog" aria-label={i.titulo}>
      <div className="hoja-cabeza">
        <h3>{i.icono} {i.titulo}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>
      {/* El antes y después: el widget gris de hoy y cómo se va a ver con el permiso dado. */}
      <div className="activar-antes-despues" aria-hidden="true">
        <span className="widget-auto apagado">{ICONO_FUENTE[fuente]()}<span className="widget-linea">🔒</span></span>
        <span className="flecha-activar">➜</span>
        <span className="widget-auto ejemplo">{ICONO_FUENTE[fuente]()}<span className="widget-sub">{i.muestra}</span></span>
      </div>
      <p className="suave chico">{t('Lo trae solo, sin que anotes nada:')}</p>
      <ul className="trae-lista">
        {i.trae.map(([e, x]) => (
          <li key={x}><span className="icono">{e}</span>{x}</li>
        ))}
      </ul>
      <div className="activar-ejemplo">
        <Mascota cara="feliz" tamano={40} />
        <p className="chico">{i.ejemplo}</p>
      </div>
      {listo ? (
        <p className="activado-ok">✓ {t('¡Listo! Desde ahora llega solo.')}</p>
      ) : (
        <button className="btn primario ancho" disabled={ocupado} onClick={() => void activar()}>{ocupado ? '…' : t('Activar')}</button>
      )}
      {nota ? <p className="chico nota-permiso">{nota}</p> : null}
      {pasos.length && !listo ? (
        <details className="guia-permiso" open={Boolean(nota)}>
          <summary className="chico">{t('¿Cómo lo activo en tu {marca}?', { marca: NOMBRE_MARCA[marca] })}</summary>
          <ol>{pasos.map((x) => <li key={x}>{x}</li>)}</ol>
        </details>
      ) : null}
    </div>
  );
}
