// Un mapa chico (OpenStreetMap, sin claves; en el tema oscuro se oscurece con un filtro) para ver dónde queda un lugar o todos los lugares
// frecuentes. Leaflet se carga recién cuando hace falta un mapa, así no pesa en el resto de la app.
import { useEffect, useRef } from 'react';
import { temaOscuro } from '../lib/tema';

export interface PuntoMapa {
  lat: number;
  lon: number;
  /** Radio en metros (un lugar con nombre): se dibuja como círculo. Si no, un punto. */
  radio?: number;
  etiqueta?: string;
  /** De 0 a 1: el tamaño del punto (cuánto tiempo se estuvo ahí, por ejemplo). */
  peso?: number;
  /** Los lugares sin nombre van en otro color. */
  sinNombre?: boolean;
}

const ACENTO = '#6b4fbb';
const SIN_NOMBRE = '#e58bb4';

export function Mapa({ puntos, alto = 180, interactivo = false, etiquetasFijas = false, className = '' }: {
  puntos: PuntoMapa[];
  alto?: number;
  /** Arrastrar y hacer zoom (en el mapa grande); el mini queda quieto para no pelear con el scroll. */
  interactivo?: boolean;
  /** Mostrar los nombres siempre (si no, al tocar). */
  etiquetasFijas?: boolean;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const clave = JSON.stringify(puntos);
  useEffect(() => {
    if (!caja.current || !puntos.length) return;
    let mapa: import('leaflet').Map | null = null;
    let vivo = true;
    void (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (!vivo || !caja.current) return;
      mapa = L.map(caja.current, {
        zoomControl: interactivo,
        dragging: interactivo,
        scrollWheelZoom: false,
        doubleClickZoom: interactivo,
        touchZoom: interactivo,
        boxZoom: false,
        keyboard: false,
        attributionControl: true,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
        className: temaOscuro() ? 'mapa-oscuro' : '',
      }).addTo(mapa);
      const capas: import('leaflet').Layer[] = [];
      for (const p of puntos) {
        const color = p.sinNombre ? SIN_NOMBRE : ACENTO;
        const capa = p.radio
          ? L.circle([p.lat, p.lon], { radius: p.radio, color, weight: 2, fillColor: color, fillOpacity: 0.22 })
          : L.circleMarker([p.lat, p.lon], { radius: 6 + Math.round((p.peso ?? 0.3) * 12), color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 });
        if (p.etiqueta) capa.bindTooltip(p.etiqueta, { permanent: etiquetasFijas, direction: 'top', className: 'etiqueta-mapa' });
        capa.addTo(mapa);
        capas.push(capa);
      }
      if (puntos.length === 1) mapa.setView([puntos[0].lat, puntos[0].lon], puntos[0].radio && puntos[0].radio > 400 ? 14 : 16);
      else mapa.fitBounds(L.featureGroup(capas).getBounds(), { padding: [28, 28], maxZoom: 16 });
    })();
    return () => {
      vivo = false;
      mapa?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, interactivo, etiquetasFijas]);
  return <div ref={caja} className={`mapa ${className}`} style={{ height: alto }} />;
}
