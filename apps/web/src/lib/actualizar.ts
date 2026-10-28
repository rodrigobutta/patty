// Las versiones nuevas de la app (la web, que es también la del teléfono): en vez de recargar de golpe mientras se usa,
// se aplican en un momento que no molesta. Recién abierta (los primeros segundos), enseguida; si no, al pasar la app a
// segundo plano; y mientras tanto un cartel ofrece actualizar con un toque.
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

const EVENTO = 'patty-version-nueva';
const ARRANQUE_MS = 4000;
let pendiente = false;
let aplicar: ((recargar?: boolean) => Promise<void>) | null = null;
const abierta = Date.now();

export function prepararActualizaciones(): void {
  aplicar = registerSW({
    immediate: true,
    onNeedRefresh() {
      pendiente = true;
      // Recién abierta, todavía no se está usando: se actualiza ya.
      if (Date.now() - abierta < ARRANQUE_MS) return void actualizarAhora();
      window.dispatchEvent(new Event(EVENTO));
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const buscar = () => {
        if (navigator.onLine) reg.update().catch(() => {});
      };
      setInterval(buscar, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') buscar();
        // Pasó a segundo plano con una versión esperando: se aplica ahora, sin que se note.
        else if (pendiente) void actualizarAhora();
      });
    },
  });
}

export function actualizarAhora(): Promise<void> {
  return aplicar ? aplicar(true) : Promise.resolve(location.reload());
}

/** Si hay una versión nueva esperando (para el cartel). */
export function useVersionNueva(): boolean {
  const [hay, setHay] = useState(pendiente);
  useEffect(() => {
    const f = () => setHay(true);
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, []);
  return hay;
}
