// Acceder con Google (Google Identity Services, botón en ventana emergente).
import { temaOscuro } from './tema';

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode: string }): void;
  renderButton(el: HTMLElement, o: Record<string, string>): void;
}
declare global { interface Window { google?: { accounts?: { id?: GoogleId } } } }

let script: Promise<void> | null = null;
const cargarGoogle = () => script || (script = new Promise<void>((ok, mal) => {
  const sc = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true, onload: () => ok(), onerror: mal });
  document.head.appendChild(sc);
}));

export async function montarGoogle(el: HTMLElement | null, clientId: string, alEntrar: (credencial: string) => void): Promise<void> {
  try { await cargarGoogle(); } catch { return; }
  const g = window.google?.accounts?.id;
  if (!el || !g) return;
  g.initialize({ client_id: clientId, callback: r => alEntrar(r.credential), ux_mode: 'popup' });
  g.renderButton(el, { theme: temaOscuro() ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'es' });
}
