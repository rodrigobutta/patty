// Los mapas de Patty: base de CARTO (de OpenStreetMap, sin claves), teñida con los violetas de la app, clara u oscura según
// el tema. Para ver dónde queda un lugar, los lugares frecuentes o el mapa de calor de dónde estuviste. Leaflet se carga
// recién cuando hace falta un mapa, así no pesa en el resto de la app.
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

/** Un cuadradito del mapa de calor: dónde y cuántos puntos hay ahí. */
export interface Calor {
  lat: number;
  lon: number;
  n: number;
}

/** Del menos al más usado: violeta suave, violeta, rosa, ámbar. */
function colorCalor(w: number): string {
  return w < 0.25 ? '#b4a0f0' : w < 0.5 ? '#8f78d6' : w < 0.8 ? '#e58bb4' : '#f2a33a';
}

export function Mapa({ puntos, calor = [], alto = 180, interactivo = false, etiquetasFijas = false, className = '' }: {
  puntos: PuntoMapa[];
  calor?: Calor[];
  alto?: number;
  /** Arrastrar y hacer zoom (en el mapa grande); el mini queda quieto para no pelear con el scroll. */
  interactivo?: boolean;
  /** Mostrar los nombres siempre (si no, al tocar). */
  etiquetasFijas?: boolean;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const clave = JSON.stringify(puntos) + JSON.stringify(calor);
  useEffect(() => {
    if (!caja.current || (!puntos.length && !calor.length)) return;
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
      const oscuro = temaOscuro();
      L.tileLayer(`https://{s}.basemaps.cartocdn.com/${oscuro ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '© OpenStreetMap · © CARTO',
        className: oscuro ? 'mapa-patty oscuro' : 'mapa-patty',
      }).addTo(mapa);
      const capas: import('leaflet').Layer[] = [];
      // El calor primero (abajo de todo): manchas sin borde, más grandes y fuertes donde hay más puntos.
      const maxCalor = Math.max(1, ...calor.map((x) => x.n));
      for (const x of calor) {
        const w = Math.sqrt(x.n / maxCalor);
        const capa = L.circle([x.lat, x.lon], { radius: 70 + 110 * w, stroke: false, fillColor: colorCalor(w), fillOpacity: 0.18 + 0.45 * w, interactive: false });
        capa.addTo(mapa);
        capas.push(capa);
      }
      for (const p of puntos) {
        const color = p.sinNombre ? SIN_NOMBRE : ACENTO;
        const capa = p.radio
          ? L.circle([p.lat, p.lon], { radius: p.radio, color, weight: 2, fillColor: color, fillOpacity: 0.22 })
          : L.circleMarker([p.lat, p.lon], { radius: 6 + Math.round((p.peso ?? 0.3) * 12), color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 });
        if (p.etiqueta) capa.bindTooltip(p.etiqueta, { permanent: etiquetasFijas, direction: 'top', className: 'etiqueta-mapa' });
        capa.addTo(mapa);
        capas.push(capa);
      }
      if (puntos.length === 1 && !calor.length) mapa.setView([puntos[0].lat, puntos[0].lon], puntos[0].radio && puntos[0].radio > 400 ? 14 : 16);
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
