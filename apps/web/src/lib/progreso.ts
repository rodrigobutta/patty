// Cuánto le falta a Patty para poder buscar patrones: lo usan la rueda de la pestaña y la pantalla de Patrones. Se
// vuelve a pedir cada vez que se anota o se borra algo.
import { useEffect, useState } from 'react';
import type { Progreso } from 'shared';
import { api } from '../api';
import { EVENTO_ANOTADO } from '../mascota/cara';

export function useProgreso(personaId: number | undefined): Progreso | null {
  const [p, setP] = useState<Progreso | null>(null);
  useEffect(() => {
    if (!personaId) return;
    let vivo = true;
    const traer = () =>
      api<Progreso>('GET', `/api/progreso?persona=${personaId}`)
        .then((r) => vivo && setP(r))
        .catch(() => {});
    void traer();
    window.addEventListener(EVENTO_ANOTADO, traer);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_ANOTADO, traer);
    };
  }, [personaId]);
  return p;
}
