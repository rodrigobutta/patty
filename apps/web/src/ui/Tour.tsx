// El tour de la primera vez: el búho va mostrando, una por una, las partes de la app (iluminadas, con lo demás
// oscurecido) y explica para qué sirve cada una. Se puede saltear, y volver a ver desde Más → Tu cuenta.
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { medir } from '../lib/analytics';
import { t } from '../lib/idioma';
import { Mascota } from '../mascota/Mascota';

const CLAVE = 'tour-visto';
const EVENTO = 'patty-tour';
const PASOS: Array<{ sel: string; titulo: string; texto: string }> = [
  { sel: '.buho-puntos', titulo: '¡Hola! Soy Patty 🦉', texto: 'Tocame cuando quieras contarme cómo te sentís. Mi cara cambia según cuánto me contás.' },
  { sel: '.contale', titulo: 'Contame tu día', texto: 'Hablame o escribime como te salga: "desayuné café con tostadas y a la tarde salí a caminar". Yo lo ordeno, con la hora de cada cosa.' },
  { sel: '.camara-flotante', titulo: 'Una foto del plato', texto: 'Sacale una foto a tu comida y reconozco qué es, la porción y si es frito o tiene verdura.' },
  { sel: '.fab', titulo: 'Anotar con un toque', texto: 'Con el + anotás algo puntual, o con un toque: pis, agua, dientes, ducha…' },
  { sel: '.widgets-auto', titulo: 'Lo que junto sola', texto: 'Acá aparece lo que llega solo: el sueño y los pasos del reloj, los viajes, el clima y el uso del teléfono.' },
  { sel: 'nav.pestanas button:nth-child(2)', titulo: 'Descubrir', texto: 'Con unas semanas de datos te muestro qué cosas van juntas en tu vida, el mapa y el resumen de la semana.' },
  { sel: 'nav.pestanas button:nth-child(3)', titulo: 'Más', texto: 'Los permisos, los seguimientos para cuando estás enfermo, mis preguntas y tu cuenta.' },
];

export const tourVisto = () => {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return true;
  }
};
/** Volver a ver el tour (desde Más): queda pedido hasta que el Día esté a la vista. */
let pedido = false;
export const verTour = () => {
  pedido = true;
  window.dispatchEvent(new Event(EVENTO));
};

export function Tour({ listo }: { listo: boolean }) {
  const [paso, setPaso] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // La primera vez, un ratito después de que el Día está listo; o cuando se pide verlo.
  useEffect(() => {
    if (!listo) return;
    const ver = () => {
      pedido = false;
      setPaso(0);
    };
    window.addEventListener(EVENTO, ver);
    let tm = 0;
    if (pedido || !tourVisto()) tm = window.setTimeout(ver, pedido ? 600 : 1500);
    return () => {
      window.removeEventListener(EVENTO, ver);
      window.clearTimeout(tm);
    };
  }, [listo]);

  // Lo que se ilumina: si no está en pantalla (por ejemplo, no hay widgets), se saltea.
  useLayoutEffect(() => {
    if (paso === null) return;
    const el = document.querySelector(PASOS[paso].sel);
    if (!el) {
      if (paso < PASOS.length - 1) setPaso(paso + 1);
      else terminar();
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const medir = () => setRect(el.getBoundingClientRect());
    const tm = window.setTimeout(medir, 350);
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, { passive: true });
    return () => {
      window.clearTimeout(tm);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  const terminar = (salteado = false) => {
    try {
      localStorage.setItem(CLAVE, 'si');
    } catch {
      /* sin almacenamiento */
    }
    medir(salteado ? 'tour_salteado' : 'tour_terminado', { paso: paso ?? 0 });
    setPaso(null);
    setRect(null);
  };

  if (paso === null || !rect) return null;
  const p = PASOS[paso];
  const margen = 8;
  const abajo = rect.top + rect.height / 2 < window.innerHeight / 2;
  const ultimo = paso === PASOS.length - 1;
  return createPortal(
    <div className="tour" role="dialog" aria-label={t(p.titulo)}>
      <div
        className="tour-foco"
        style={{ top: rect.top - margen, left: rect.left - margen, width: rect.width + margen * 2, height: rect.height + margen * 2 }}
      />
      <div className={`tour-globo ${abajo ? 'abajo' : 'arriba'}`} style={abajo ? { top: Math.min(rect.bottom + 18, window.innerHeight - 220) } : { bottom: Math.min(window.innerHeight - rect.top + 18, window.innerHeight - 220) }} key={paso}>
        <div className="tour-cabeza">
          <Mascota cara="feliz" tamano={40} className="saluda" />
          <strong>{t(p.titulo)}</strong>
        </div>
        <p>{t(p.texto)}</p>
        <div className="tour-pie">
          <span className="tour-puntos" aria-hidden>
            {PASOS.map((_, i) => <i key={i} className={i === paso ? 'activo' : ''} />)}
          </span>
          {!ultimo ? <button className="enlace chico" onClick={() => terminar(true)}>{t('Saltear')}</button> : null}
          <button className="btn primario chico" onClick={() => (ultimo ? terminar() : setPaso(paso + 1))}>{ultimo ? t('¡Empezar!') : t('Siguiente')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
