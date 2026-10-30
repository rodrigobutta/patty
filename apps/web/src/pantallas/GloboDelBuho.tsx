// Si falta contar cómo se siente, el búho de arriba lo pregunta con un globito que le sale de la cara. La primera vez del
// día aparece a los 2 segundos, desplegándose desde el búho; después, enseguida. A los 8 segundos (o al bajar en la
// pantalla) vuelve al búho, para no tapar nada: el búho se sigue pudiendo tocar. Al tocarlo se abre la hoja de "¿cómo te sentís?".
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const CLAVE = 'patty-globo-sentir';
const ESPERA_PRIMERA = 2000;
const SE_VE = 8000;

export function GloboDelBuho({ visible, texto, alTocar }: { visible: boolean; texto: string; alTocar(): void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [abajo, setAbajo] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMostrar(false);
      return;
    }
    const hoy = new Date().toLocaleDateString('en-CA');
    let primera = true;
    try {
      primera = localStorage.getItem(CLAVE) !== hoy;
      localStorage.setItem(CLAVE, hoy);
    } catch {
      /* sin almacenamiento: como si fuera la primera */
    }
    const ubicar = () => {
      const b = document.querySelector('.boton-buho .buho-puntos')?.getBoundingClientRect();
      if (b) setPos({ x: b.left + b.width / 2, y: b.bottom });
    };
    ubicar();
    let guardar = 0;
    const tm = window.setTimeout(() => {
      ubicar();
      setMostrar(true);
      // El búho "habla": un saltito mientras le sale el globito.
      const b = document.querySelector('.boton-buho .buho-puntos');
      b?.classList.add('habla');
      window.setTimeout(() => b?.classList.remove('habla'), 800);
      guardar = window.setTimeout(() => setMostrar(false), SE_VE);
    }, primera ? ESPERA_PRIMERA : 250);
    window.addEventListener('resize', ubicar);
    return () => {
      window.clearTimeout(tm);
      window.clearTimeout(guardar);
      window.removeEventListener('resize', ubicar);
    };
  }, [visible]);

  useEffect(() => {
    const alScroll = () => setAbajo(window.scrollY > 80);
    alScroll();
    window.addEventListener('scroll', alScroll, { passive: true });
    return () => window.removeEventListener('scroll', alScroll);
  }, []);

  if (!pos) return null;
  return createPortal(
    <button
      className={`globo-buho${mostrar && !abajo ? ' visible' : ''}`}
      style={{ right: Math.max(8, window.innerWidth - pos.x - 8), top: pos.y + 4 }}
      onClick={alTocar}
      tabIndex={mostrar && !abajo ? 0 : -1}
      aria-hidden={!(mostrar && !abajo)}
    >
      {texto}
    </button>,
    document.body,
  );
}
