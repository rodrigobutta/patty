// Acceder con Google. En la web, con Google Identity Services (botón en ventana emergente). En la app nativa ese botón
// no anda (Google no deja iniciar sesión dentro de una vista web), así que se usa el inicio de sesión del teléfono
// (plugin de Capgo, con el mismo ID de cliente web): devuelve el mismo tipo de credencial y la API la verifica igual.
import { SocialLogin } from '@capgo/capacitor-social-login';
import { esNativa } from './nativo';
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

export const googleNativo = () => esNativa();

let iniciado: string | null = null;
/** En la app nativa: abre la elección de cuenta de Google del teléfono y devuelve la credencial (ID token). */
export async function entrarConGoogleNativo(clientId: string): Promise<string> {
  if (iniciado !== clientId) {
    await SocialLogin.initialize({ google: { webClientId: clientId } });
    iniciado = clientId;
  }
  // Sin pedir scopes: con eso ya devuelve el ID token con el mail (pedir scopes extra en Android exige tocar la MainActivity).
  const r = await SocialLogin.login({ provider: 'google', options: {} });
  const token = (r.result as { idToken?: string | null }).idToken;
  if (!token) throw new Error('Google no devolvió la cuenta. Probá de nuevo.');
  return token;
}
