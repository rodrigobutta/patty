// Los mapas de Patty: base de OpenStreetMap (sin claves), teñida con los violetas de la app, clara u oscura según
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

/** Un recorrido: los puntos en orden; `bordes` (del día anterior o siguiente) van punteados. */
export interface Ruta {
  puntos: Array<{ lat: number; lon: number }>;
  antes?: { lat: number; lon: number } | null;
  despues?: { lat: number; lon: number } | null;
}

export function Mapa({ puntos, calor = [], ruta, alto = 180, interactivo = false, etiquetasFijas = false, className = '' }: {
  puntos: PuntoMapa[];
  calor?: Calor[];
  ruta?: Ruta;
  alto?: number;
  /** Arrastrar y hacer zoom (en el mapa grande); el mini queda quieto para no pelear con el scroll. */
  interactivo?: boolean;
  /** Mostrar los nombres siempre (si no, al tocar). */
  etiquetasFijas?: boolean;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const clave = JSON.stringify(puntos) + JSON.stringify(calor) + JSON.stringify(ruta ?? null);
  useEffect(() => {
    if (!caja.current || (!puntos.length && !calor.length && !ruta?.puntos.length)) return;
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
      // OpenStreetMap (sin claves), pasado a grises y teñido con los violetas de Patty por CSS (claro u oscuro).
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
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
      // El recorrido: una línea violeta por los puntos en orden, con el comienzo y el final marcados; lo del día anterior
      // o siguiente, punteado.
      if (ruta?.puntos.length) {
        const ll = ruta.puntos.map((x) => [x.lat, x.lon] as [number, number]);
        const linea = L.polyline(ll, { color: ACENTO, weight: 4, opacity: 0.85, lineJoin: 'round', lineCap: 'round' });
        linea.addTo(mapa);
        capas.push(linea);
        for (const [borde, extremo] of [[ruta.antes, ll[0]], [ruta.despues, ll[ll.length - 1]]] as const) {
          if (!borde) continue;
          const l2 = L.polyline([[borde.lat, borde.lon], extremo], { color: ACENTO, weight: 3, opacity: 0.6, dashArray: '4 7' });
          l2.addTo(mapa);
          capas.push(l2);
        }
        const inicio = L.circleMarker(ll[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#2f9e6a', fillOpacity: 1 });
        const fin = L.circleMarker(ll[ll.length - 1], { radius: 7, color: '#fff', weight: 2, fillColor: '#f2a33a', fillOpacity: 1 });
        inicio.addTo(mapa);
        fin.addTo(mapa);
        capas.push(inicio, fin);
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
      if (puntos.length === 1 && !calor.length && !ruta?.puntos.length) mapa.setView([puntos[0].lat, puntos[0].lon], puntos[0].radio && puntos[0].radio > 400 ? 14 : 16);
      else {
        // Los límites con las coordenadas (no con las capas: los círculos en metros todavía no saben medirse hasta que
        // el mapa tiene vista, y eso dejaba el mapa gris).
        const todos: Array<[number, number]> = [
          ...puntos.map((p) => [p.lat, p.lon] as [number, number]),
          ...calor.map((x) => [x.lat, x.lon] as [number, number]),
          ...(ruta?.puntos ?? []).map((x) => [x.lat, x.lon] as [number, number]),
          ...[ruta?.antes, ruta?.despues].filter((x): x is { lat: number; lon: number } => Boolean(x)).map((x) => [x.lat, x.lon] as [number, number]),
        ];
        const b = L.latLngBounds(todos);
        if (todos.length === 1 || b.getNorthEast().equals(b.getSouthWest())) mapa.setView(todos[0], 15);
        else mapa.fitBounds(b, { padding: [28, 28], maxZoom: 16 });
      }
    })();
    return () => {
      vivo = false;
      mapa?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, interactivo, etiquetasFijas]);
  return <div ref={caja} className={`mapa ${className}`} style={{ height: alto }} />;
}
