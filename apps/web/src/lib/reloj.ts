// Para que lo que depende de la hora se vea al día con la pantalla abierta: un "tic" por minuto (al cambiar el minuto)
// mientras la app está a la vista, y otro apenas vuelve a estar a la vista.
import { useEffect, useState } from 'react';

export function useMinuto(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    let t = 0;
    const programar = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (document.visibilityState === 'visible') setAhora(Date.now());
        programar();
      }, 60000 - (Date.now() % 60000) + 50);
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') setAhora(Date.now());
    };
    programar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);
  return ahora;
}

/** Llama a `f` cada `ms` mientras la app está a la vista (no si está en segundo plano). */
export function useCadaTanto(f: () => void, ms: number, activo = true): void {
  useEffect(() => {
    if (!activo) return;
    const i = window.setInterval(() => document.visibilityState === 'visible' && f(), ms);
    return () => window.clearInterval(i);
  }, [f, ms, activo]);
}
