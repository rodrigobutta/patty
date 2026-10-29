// Los dibujos de Patty (IconosPatty, IconosWidget) como SVG suelto, para pintarlos en el canvas de las imágenes para
// compartir: se dibujan una vez fuera de la pantalla y se cambian los colores del tema (el del texto y los --icono-*)
// por los fijos del modo claro, que es como se ve la tarjeta blanca.
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

const COLORES: Array<[RegExp, string]> = [
  [/currentColor/g, '#2a2440'],
  [/var\(--icono-1\)/g, '#c9bcf2'],
  [/var\(--icono-2\)/g, '#ffd166'],
];

export function iconoParaTarjeta(icono: ReactElement): string | undefined {
  try {
    const caja = document.createElement('div');
    const raiz = createRoot(caja);
    flushSync(() => raiz.render(icono));
    let svg = caja.querySelector('svg')?.outerHTML;
    raiz.unmount();
    if (!svg) return undefined;
    for (const [de, a] of COLORES) svg = svg.replace(de, a);
    return svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  } catch {
    return undefined;
  }
}
