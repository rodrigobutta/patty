// Cuánto se usa la app: suma el tiempo que está a la vista (por pestaña) y se lo manda al servidor cada minuto, al
// cambiar de pestaña y al irse. Volver después de 5 minutos afuera cuenta como otra apertura. Es para la administración.
import { useEffect, useRef } from 'react';
import { api } from '../api';
import { plataforma } from './nativo';

const NUEVA_APERTURA_MS = 5 * 60000;
const fechaDeHoy = () => new Date().toLocaleDateString('en-CA');

export function useMedirUso(activo: boolean, pantalla: string) {
  const mandarRef = useRef<(() => void) | null>(null);
  const pantallaRef = useRef(pantalla);
  useEffect(() => {
    if (!activo) return;
    let desde: number | null = document.visibilityState === 'visible' ? Date.now() : null;
    let ocultaDesde: number | null = null;
    let abrio = desde !== null;
    const mandar = () => {
      if (desde === null) return;
      const ahora = Date.now();
      const segundos = Math.round((ahora - desde) / 1000);
      desde = ahora;
      if (segundos <= 0 && !abrio) return;
      void api('POST', '/api/uso', { fecha: fechaDeHoy(), segundos, pantalla: pantallaRef.current, abrio, plataforma: plataforma() }).catch(() => {});
      abrio = false;
    };
    mandarRef.current = mandar;
    const alCambiar = () => {
      if (document.visibilityState === 'visible') {
        if (desde !== null) return;
        abrio = ocultaDesde === null || Date.now() - ocultaDesde > NUEVA_APERTURA_MS;
        desde = Date.now();
        mandar();
      } else {
        mandar();
        desde = null;
        ocultaDesde = Date.now();
      }
    };
    if (abrio) mandar();
    const iv = setInterval(mandar, 60000);
    document.addEventListener('visibilitychange', alCambiar);
    return () => {
      mandar();
      clearInterval(iv);
      document.removeEventListener('visibilitychange', alCambiar);
      mandarRef.current = null;
    };
  }, [activo]);
  // Al cambiar de pestaña, lo de la anterior se cuenta para la anterior.
  useEffect(() => {
    mandarRef.current?.();
    pantallaRef.current = pantalla;
  }, [pantalla]);
}
