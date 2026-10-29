// Cuando de un viaje hay pocos puntos (el teléfono no guardó el camino, por ejemplo sin señal en la ruta), el mapita
// dibuja el recorrido más probable por las calles entre esos puntos, en vez de una línea recta. Lo calcula OSRM (el
// servidor público de rutas sobre OpenStreetMap); solo se le mandan esos pocos puntos, y la respuesta queda guardada
// en el teléfono. Si no contesta, queda la línea recta.
import { useEffect, useState } from 'react';
import { distanciaMetros } from 'shared';

type Coord = { lat: number; lon: number };
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
/** Con más puntos que esto el camino ya se ve; tramos más cortos que esto no hace falta adivinarlos. */
const POCOS = 4;
const LEJOS_M = 2000;

const clave = (l: Coord[]) => 'ruta-' + l.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');

/** Si conviene buscar el camino por las calles: pocos puntos y bastante distancia entre ellos. */
export function faltaCamino(camino: Coord[]): boolean {
  if (camino.length < 2 || camino.length > POCOS) return false;
  return camino.slice(1).some((p, i) => distanciaMetros(camino[i], p) > LEJOS_M);
}

export async function caminoPorCalles(camino: Coord[]): Promise<Coord[] | null> {
  const k = clave(camino);
  try {
    const ya = localStorage.getItem(k);
    if (ya) return JSON.parse(ya) as Coord[];
  } catch {
    /* sin almacenamiento */
  }
  try {
    const r = await fetch(`${OSRM}${camino.map((p) => `${p.lon},${p.lat}`).join(';')}?overview=simplified&geometries=geojson`);
    if (!r.ok) return null;
    const d = (await r.json()) as { routes?: Array<{ geometry: { coordinates: Array<[number, number]> } }> };
    const coords = d.routes?.[0]?.geometry.coordinates;
    if (!coords?.length) return null;
    const ruta = coords.map(([lon, lat]) => ({ lat, lon }));
    try {
      localStorage.setItem(k, JSON.stringify(ruta));
    } catch {
      /* sin lugar: no pasa nada */
    }
    return ruta;
  } catch {
    return null;
  }
}

/** El camino para dibujar: el de los puntos, o por las calles si hay pocos puntos y está lejos. */
export function useCaminoParaMapa(camino: Coord[]): Coord[] {
  const [ruta, setRuta] = useState<Coord[]>(camino);
  const k = clave(camino);
  useEffect(() => {
    setRuta(camino);
    if (!faltaCamino(camino)) return;
    let vivo = true;
    void caminoPorCalles(camino).then((r) => {
      if (vivo && r) setRuta(r);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return ruta;
}
