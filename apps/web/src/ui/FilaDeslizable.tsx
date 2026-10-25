// Un renglón que se desliza a la izquierda para borrarlo (como en el correo del teléfono): mientras se arrastra aparece
// atrás el rojo con el tacho; si se suelta pasado un tercio, se va y se borra. El gesto es solo de este renglón (no
// cambia de día) y solo hacia la izquierda; un toque normal sigue abriendo el registro.
import { useRef, type ReactNode } from 'react';

const UMBRAL = 0.33;

export function FilaDeslizable({ className, style, alTocar, alBorrar, children }: {
  className?: string;
  style?: React.CSSProperties;
  alTocar(): void;
  alBorrar(): void;
  children: ReactNode;
}) {
  const fila = useRef<HTMLLIElement>(null);
  const frente = useRef<HTMLDivElement>(null);
  const inicio = useRef<{ x: number; y: number; t: number } | null>(null);
  /** null: todavía no se sabe; true: se está deslizando el renglón; false: es un scroll vertical. */
  const deslizando = useRef<boolean | null>(null);
  const dx = useRef(0);

  const mover = (x: number, animado: boolean) => {
    const f = frente.current;
    if (!f) return;
    f.style.transition = animado ? 'transform 0.25s cubic-bezier(.2, .8, .3, 1)' : 'none';
    f.style.transform = x ? `translateX(${x}px)` : '';
    fila.current?.style.setProperty('--arrastre', String(Math.min(1, Math.abs(x) / ((fila.current?.clientWidth ?? 300) * UMBRAL))));
  };

  return (
    <li
      ref={fila}
      className={`fila-deslizable ${className ?? ''}`}
      style={style}
      onTouchStart={(e) => {
        inicio.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
        deslizando.current = null;
        dx.current = 0;
      }}
      onTouchMove={(e) => {
        const i = inicio.current;
        if (!i) return;
        const x = e.touches[0].clientX - i.x;
        const y = e.touches[0].clientY - i.y;
        if (deslizando.current === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) deslizando.current = Math.abs(x) > Math.abs(y) && x < 0;
        if (!deslizando.current) return;
        dx.current = Math.min(0, x);
        mover(dx.current, false);
      }}
      onTouchEnd={(e) => {
        const ancho = fila.current?.clientWidth ?? 300;
        if (deslizando.current) {
          // Que el Día no lo tome como "cambiar de día".
          e.stopPropagation();
          if (-dx.current > ancho * UMBRAL) {
            mover(-ancho, true);
            fila.current?.classList.add('saliendo');
            setTimeout(alBorrar, 220);
          } else mover(0, true);
        }
        inicio.current = null;
        deslizando.current = null;
      }}
    >
      <div className="fondo-borrar" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
        Borrar
      </div>
      <div ref={frente} className="frente-fila" onClick={() => dx.current === 0 && alTocar()}>
        {children}
      </div>
    </li>
  );
}
