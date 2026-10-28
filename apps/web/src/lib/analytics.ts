// Google Analytics (si el servidor tiene GA_MEASUREMENT_ID), sin señales de publicidad. En la página de presentación:
// visitas, de dónde llegan y qué tocan. En la app: qué pantallas se usan y cómo se anota (con la voz, una foto, un
// toque…), con un identificador anónimo por usuario. Nunca se manda nada de lo anotado (textos, nombres, valores).
type Gtag = (...a: unknown[]) => void;
let id: string | null = null;
/** Lo que hay que esperar antes de mandar algo (el usuario anónimo, que se calcula aparte). */
let preparado: Promise<void> = Promise.resolve();

export function iniciarAnalytics(medicion: string | null | undefined, app = false): void {
  if (!medicion || !/^G-[A-Z0-9]+$/.test(medicion) || id) return;
  id = medicion;
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  w.gtag('js', new Date());
  // En la app, las pantallas se mandan a mano (es una sola página: ver paginaVista).
  w.gtag('config', medicion, { allow_google_signals: false, allow_ad_personalization_signals: false, ...(app ? { send_page_view: false } : { page_title: 'Presentación' }) });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${medicion}`;
  document.head.appendChild(s);
}

/** Un evento ("empezar", "ver_video"), con datos opcionales. No hace nada si Analytics no está cargado. */
export function medir(evento: string, datos: Record<string, string | number> = {}): void {
  if (!id) return;
  void preparado.then(() => (window as unknown as { gtag?: Gtag }).gtag?.('event', evento, datos));
}

/** Una pantalla de la app ("/dia", "/descubrir/mapa"), como si fuera una página. */
export function paginaVista(ruta: string, titulo: string): void {
  medir('page_view', { page_location: `${location.origin}/app${ruta}`, page_path: `/app${ruta}`, page_title: titulo });
}

/** Quién usa la app, anónimo (un hash del id, para contar a la misma persona en varios teléfonos), y desde dónde. */
export function usuarioAnalytics(usuarioId: number, datos: Record<string, string>): void {
  if (!id) return;
  preparado = (async () => {
    const g = (window as unknown as { gtag?: Gtag }).gtag;
    try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`patty|${usuarioId}`));
      const anonimo = [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
      g?.('set', { user_id: anonimo });
    } catch {
      // sin cómo hacerlo anónimo, va sin usuario
    }
    g?.('set', 'user_properties', datos);
  })();
}
