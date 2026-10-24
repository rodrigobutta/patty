// Instalar como app (PWA).
interface PedidoInstalar extends Event { prompt(): Promise<void>; userChoice: Promise<unknown> }
let pedido: PedidoInstalar | null = null;
let alInstalar = () => {};
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e as PedidoInstalar; });
  addEventListener('appinstalled', () => { pedido = null; alInstalar(); });
}
export const cuandoSeInstale = (f: () => void) => { alInstalar = f; };
export const instalada = (): boolean =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** Si el navegador ofrece instalar, lo pide y devuelve true; si no, hay que mostrar las instrucciones. */
export async function instalarApp(): Promise<boolean> {
  if (!pedido) return false;
  await pedido.prompt(); await pedido.userChoice; pedido = null;
  return true;
}
export const esIOS = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
