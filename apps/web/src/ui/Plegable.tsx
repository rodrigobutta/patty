// Un bloque que se pliega, animado, en un botón chico (y se despliega al tocarlo): el contenido se desvanece mientras
// el alto baja hasta el del botón, y el botón aparece con un pulso. Así se ve a dónde fue lo que estaba y que tocando
// ahí vuelve.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const DURACION = 450;

export function Plegable({ plegado, boton, children, className }: { plegado: boolean; boton: ReactNode; children: ReactNode; className?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  /** Lo que se muestra: el bloque, o el botón; durante la animación, el que se va. */
  const [muestra, setMuestra] = useState<'bloque' | 'boton'>(plegado ? 'boton' : 'bloque');
  const [fase, setFase] = useState<'' | 'plegando' | 'desplegando' | 'recien'>('');
  const anterior = useRef(plegado);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el || anterior.current === plegado) return;
    anterior.current = plegado;
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducir) {
      setMuestra(plegado ? 'boton' : 'bloque');
      return;
    }
    let fin: number;
    if (plegado) {
      // Del alto del bloque al de un botón, con el contenido desvaneciéndose; recién al final se cambia por el botón.
      el.style.height = `${el.scrollHeight}px`;
      void el.offsetHeight;
      setFase('plegando');
      el.style.height = '48px';
      fin = window.setTimeout(() => {
        setMuestra('boton');
        setFase('recien');
        el.style.height = '';
        window.setTimeout(() => setFase(''), 900);
      }, DURACION);
    } else {
      // Al revés: se pone el bloque con el alto del botón y crece hasta el suyo.
      el.style.height = `${el.offsetHeight}px`;
      setMuestra('bloque');
      setFase('desplegando');
      requestAnimationFrame(() => {
        el.style.height = `${el.scrollHeight}px`;
      });
      fin = window.setTimeout(() => {
        el.style.height = '';
        setFase('');
      }, DURACION);
    }
    return () => window.clearTimeout(fin);
  }, [plegado]);

  return (
    <div ref={caja} className={`plegable ${fase} ${className ?? ''}`}>
      {muestra === 'bloque' ? <div className="plegable-bloque">{children}</div> : boton}
    </div>
  );
}
