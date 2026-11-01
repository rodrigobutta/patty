// Organizar los widgets desde el Día. Mantener apretado uno lo agarra: si se suelta sin moverlo, abren sus opciones; si se
// lo arrastra, se reordena. Antes de agarrarlo, moverse es scroll o cambio de día, y un toque corto abre el detalle como
// siempre. Mientras se arrastra el DOM no cambia de orden (se usa `order` de CSS): mover el nodo le haría perder el dedo.
// Sin arrastre: click derecho o la tecla de menú abren las opciones (con subir y bajar), y Alt + flechas lo mueven.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { moverWidget, type AjustesWidgets, type WidgetId } from 'shared';
import { t } from '../lib/idioma';

/** Cuánto hay que mantener apretado. Antes de los 500 ms en que el teléfono abre su menú. */
export const TIEMPO_AGARRE = 420;
/** Cuánto se puede correr el dedo sin que deje de ser "quieto". */
const TOLERANCIA = 10;
const BORDE_SCROLL = 70;
const BARRA_ABAJO = 90;

interface Gesto {
  id: WidgetId;
  puntero: number;
  celda: HTMLElement;
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** Dónde se lo agarró, respecto de la esquina de la celda. */
  agarreX: number;
  agarreY: number;
  fase: 'esperando' | 'agarrado' | 'arrastrando';
  reloj?: ReturnType<typeof setTimeout>;
}

/** Los que hoy se ven de verdad, en el orden de la pantalla (los que se dibujan solos pueden no tener nada que mostrar). */
export function celdasVisibles(grilla: HTMLElement | null): HTMLElement[] {
  return [...(grilla?.querySelectorAll<HTMLElement>('[data-widget]') ?? [])].filter((c) => c.childElementCount > 0);
}

export function useOrganizarWidgets({ grilla, ajustes, habilitado, alSoltar, alOpciones, alMover }: {
  /** La grilla, si ya está en pantalla (sin datos todavía no está). */
  grilla: HTMLElement | null;
  ajustes: AjustesWidgets;
  habilitado: boolean;
  /** Terminó de arrastrar y quedó en otro orden. */
  alSoltar(a: AjustesWidgets): void;
  alOpciones(id: WidgetId): void;
  alMover(id: WidgetId, delta: -1 | 1): void;
}) {
  const gesto = useRef<Gesto | null>(null);
  /** El orden mientras se arrastra; null si no se está arrastrando. */
  const [vista, setVista] = useState<AjustesWidgets | null>(null);
  const vistaActual = useRef<AjustesWidgets | null>(null);
  const [agarrado, setAgarrado] = useState<WidgetId | null>(null);
  // El click y el touchend que siguen a un agarre no son un toque ni un cambio de día.
  const tragar = useRef(false);
  const scroll = useRef(0);

  const pintar = useCallback(() => {
    const g = gesto.current;
    if (!g || g.fase !== 'arrastrando') return;
    g.celda.style.transform = '';
    const r = g.celda.getBoundingClientRect();
    g.celda.style.transform = `translate(${g.x - g.agarreX - r.left}px, ${g.y - g.agarreY - r.top}px)`;
  }, []);
  useLayoutEffect(pintar, [vista, pintar]);

  const buscarLugar = useCallback(() => {
    const g = gesto.current;
    if (!g || g.fase !== 'arrastrando') return;
    for (const c of celdasVisibles(grilla)) {
      if (c === g.celda) continue;
      const r = c.getBoundingClientRect();
      if (g.x >= r.left && g.x <= r.right && g.y >= r.top && g.y <= r.bottom) {
        const nueva = moverWidget(vistaActual.current ?? ajustes, g.id, c.dataset.widget as WidgetId);
        vistaActual.current = nueva;
        setVista(nueva);
        return;
      }
    }
  }, [ajustes, grilla]);

  const terminar = useCallback(() => {
    const g = gesto.current;
    if (g?.reloj) clearTimeout(g.reloj);
    if (g) g.celda.style.transform = '';
    gesto.current = null;
    cancelAnimationFrame(scroll.current);
    vistaActual.current = null;
    setVista(null);
    setAgarrado(null);
  }, []);
  useEffect(() => terminar, [terminar]);

  // Agarrado, el dedo ya no hace scroll. Tiene que estar puesto desde antes de que empiece el toque y no ser pasivo (los
  // de React lo son): si no, el navegador no deja cancelar el scroll.
  useEffect(() => {
    if (!grilla || !habilitado) return;
    const f = (e: globalThis.TouchEvent) => {
      if (gesto.current && gesto.current.fase !== 'esperando' && e.cancelable) e.preventDefault();
    };
    grilla.addEventListener('touchmove', f, { passive: false });
    return () => grilla.removeEventListener('touchmove', f);
  }, [grilla, habilitado]);

  // Cerca del borde de la pantalla, se corre sola (con pocos widgets por pantalla, si no, no se llega).
  const seguirScroll = useCallback(() => {
    const g = gesto.current;
    if (!g || g.fase !== 'arrastrando') return;
    const d = g.y < BORDE_SCROLL ? -8 : g.y > window.innerHeight - BARRA_ABAJO ? 8 : 0;
    if (d) {
      window.scrollBy(0, d);
      pintar();
      buscarLugar();
    }
    scroll.current = requestAnimationFrame(seguirScroll);
  }, [pintar, buscarLugar]);

  const tragarLoQueSigue = () => {
    tragar.current = true;
    setTimeout(() => (tragar.current = false), 500);
  };
  /** Los portales (las hojas de cada widget) también pasan por acá en React: esos toques no son del widget. */
  const esDeAdentro = (e: { currentTarget: EventTarget; target: EventTarget }) => (e.currentTarget as Node).contains(e.target as Node);

  return {
    vista,
    agarrado,
    celda: (id: WidgetId) => ({
      'data-widget': id,
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (!habilitado || !e.isPrimary || e.button !== 0 || !esDeAdentro(e)) return;
        terminar();
        const celda = e.currentTarget;
        const g: Gesto = { id, puntero: e.pointerId, celda, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, agarreX: 0, agarreY: 0, fase: 'esperando' };
        g.reloj = setTimeout(() => {
          const r = celda.getBoundingClientRect();
          g.agarreX = g.x0 - r.left;
          g.agarreY = g.y0 - r.top;
          g.fase = 'agarrado';
          try {
            celda.setPointerCapture(g.puntero);
            navigator.vibrate?.(15);
          } catch {
            /* sin eso, igual se puede */
          }
          setAgarrado(id);
        }, TIEMPO_AGARRE);
        gesto.current = g;
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const g = gesto.current;
        if (!g || g.id !== id || g.puntero !== e.pointerId) return;
        g.x = e.clientX;
        g.y = e.clientY;
        const lejos = Math.hypot(g.x - g.x0, g.y - g.y0) > TOLERANCIA;
        if (g.fase === 'esperando') {
          if (lejos) terminar(); // Se movió antes de tiempo: es scroll (o cambio de día), no un agarre.
          return;
        }
        if (g.fase === 'agarrado') {
          if (!lejos) return;
          g.fase = 'arrastrando';
          vistaActual.current = ajustes;
          setVista(ajustes);
          scroll.current = requestAnimationFrame(seguirScroll);
        }
        pintar();
        buscarLugar();
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        const g = gesto.current;
        if (!g || g.id !== id || g.puntero !== e.pointerId) return;
        const fase = g.fase;
        const final = vistaActual.current;
        terminar();
        if (fase === 'esperando') return; // Un toque normal: abre el detalle.
        tragarLoQueSigue();
        if (fase === 'agarrado') alOpciones(id);
        else if (final && final !== ajustes) alSoltar(final);
      },
      onPointerCancel: (e: PointerEvent<HTMLElement>) => {
        const g = gesto.current;
        if (!g || g.id !== id || g.puntero !== e.pointerId) return;
        const fase = g.fase;
        terminar();
        // El navegador se quedó con el gesto. Si ya estaba agarrado, que no quede a mitad de camino: las opciones también reordenan.
        if (fase !== 'esperando') {
          tragarLoQueSigue();
          alOpciones(id);
        }
      },
      onPointerLeave: (e: PointerEvent<HTMLElement>) => {
        if (gesto.current?.id === id && gesto.current.fase === 'esperando' && gesto.current.puntero === e.pointerId) terminar();
      },
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        if (!tragar.current || !esDeAdentro(e)) return;
        tragar.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
      // Que el Día no lo tome como "cambiar de día" (como en FilaDeslizable).
      onTouchEnd: (e: TouchEvent<HTMLElement>) => {
        if (tragar.current && esDeAdentro(e)) e.stopPropagation();
      },
      onContextMenu: (e: MouseEvent<HTMLElement>) => {
        if (!habilitado || !esDeAdentro(e)) return;
        e.preventDefault(); // Ni el menú del teléfono al mantener apretado.
        if (!gesto.current) alOpciones(id); // Click derecho o tecla de menú.
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (!habilitado || !e.altKey || !esDeAdentro(e)) return;
        const delta = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
        if (!delta) return;
        e.preventDefault();
        alMover(id, delta);
      },
    }),
  };
}

/** Las opciones de un widget, al mantenerlo apretado: moverlo con botones, ocultarlo o ir a elegir todos. */
export function OpcionesWidget({ nombre, lugar, total, alMover, alOcultar, alElegir, alCerrar }: {
  nombre: string;
  /** Su lugar entre los que se ven, desde 1. */
  lugar: number;
  total: number;
  alMover(delta: -1 | 1): void;
  alOcultar(): void;
  alElegir(): void;
  alCerrar(): void;
}) {
  return createPortal(
    <>
      <div className="velo" onClick={alCerrar} />
      <div className="hoja opciones-widget" role="dialog" aria-label={t('Opciones de {nombre}', { nombre })}>
        <div className="hoja-cabeza">
          <h3>{nombre}</h3>
          <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
        </div>
        <p className="suave chico" role="status">{t('Lugar {n} de {total}. También podés mantenerlo apretado y arrastrarlo.', { n: lugar, total })}</p>
        <div className="fila-mover">
          <button className="btn" disabled={lugar <= 1} onClick={() => alMover(-1)}>↑ {t('Antes')}</button>
          <button className="btn" disabled={lugar >= total} onClick={() => alMover(1)}>↓ {t('Después')}</button>
        </div>
        <button className="btn ancho" onClick={alOcultar}>{t('Ocultar este widget')}</button>
        <button className="btn ancho" onClick={alElegir}>{t('Elegir qué widgets ver')}</button>
      </div>
    </>,
    document.body,
  );
}
