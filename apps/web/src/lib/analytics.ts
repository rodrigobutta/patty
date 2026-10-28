// Google Analytics, solo en la página de presentación (la app no se mide): visitas, de dónde llegan y qué tocan
// (Empezar, los videos, hasta dónde bajan). Se carga si el servidor tiene GA_MEASUREMENT_ID; sin señales de publicidad
// ni datos de la persona.
type Gtag = (...a: unknown[]) => void;
let id: string | null = null;

export function iniciarAnalytics(medicion: string | null | undefined): void {
  if (!medicion || !/^G-[A-Z0-9]+$/.test(medicion) || id) return;
  id = medicion;
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  w.gtag('js', new Date());
  w.gtag('config', medicion, { allow_google_signals: false, allow_ad_personalization_signals: false, page_title: 'Presentación' });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${medicion}`;
  document.head.appendChild(s);
}

/** Un evento ("empezar", "ver_video"), con datos opcionales. No hace nada si Analytics no está cargado. */
export function medir(evento: string, datos: Record<string, string | number> = {}): void {
  if (!id) return;
  (window as unknown as { gtag?: Gtag }).gtag?.('event', evento, datos);
}
