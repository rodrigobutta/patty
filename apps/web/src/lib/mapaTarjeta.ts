// El mapita de las imágenes para compartir (una actividad, un viaje): el recorrido dibujado en el canvas sobre los
// cuadraditos de OpenStreetMap (los mismos del mapa de la app, que dejan dibujarse en un canvas sin "ensuciarlo"),
// teñidos con los violetas de Patty. Si los cuadraditos no llegan a tiempo (sin conexión, o el servidor no contesta),
// queda el recorrido solo, sobre un fondo lila con puntitos.

export type Coord = { lat: number; lon: number };

const TESELA = 256;
const URL_TESELA = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ZOOM_MAX = 16;
const ESPERA_MS = 5000;

const ACENTO = '#6b4fbb';
const INICIO = '#2f9e6a';
const FIN = '#f2a33a';

/** Dónde cae un punto en el mapa del mundo a ese zoom, en píxeles (Web Mercator, como Leaflet). */
export function aPixel(p: Coord, z: number): { x: number; y: number } {
  const lado = TESELA * 2 ** z;
  const sen = Math.sin((Math.max(-85, Math.min(85, p.lat)) * Math.PI) / 180);
  return { x: ((p.lon + 180) / 360) * lado, y: (0.5 - Math.log((1 + sen) / (1 - sen)) / (4 * Math.PI)) * lado };
}

/**
 * El encuadre: el zoom de los cuadraditos (`z`), cuánto se achican (`f`, entre 0,5 y 1: así el recorrido llena el
 * recuadro y las calles se ven nítidas) y la esquina de arriba a la izquierda del recuadro, en píxeles ya achicados.
 */
export function encuadre(camino: Coord[], ancho: number, alto: number, margen = 50): { z: number; f: number; x0: number; y0: number } {
  const ps = camino.map((p) => aPixel(p, ZOOM_MAX));
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // A qué escala del zoom máximo entra todo con el margen (sin acercarse más que el zoom máximo).
  const escala = Math.min(1, (ancho - margen * 2) / Math.max(1, maxX - minX), (alto - margen * 2) / Math.max(1, maxY - minY));
  const zoom = Math.max(2, ZOOM_MAX + Math.log2(escala));
  const z = Math.min(ZOOM_MAX, Math.ceil(zoom - 1e-9));
  const f = 2 ** (zoom - z);
  const total = f * 2 ** (z - ZOOM_MAX);
  return { z, f, x0: ((minX + maxX) / 2) * total - ancho / 2, y0: ((minY + maxY) / 2) * total - alto / 2 };
}

/** Dónde cae un punto dentro del recuadro de ese encuadre. */
export function enRecuadro(p: Coord, e: { z: number; f: number; x0: number; y0: number }): { x: number; y: number } {
  const q = aPixel(p, e.z);
  return { x: q.x * e.f - e.x0, y: q.y * e.f - e.y0 };
}

export interface MapaListo {
  z: number;
  f: number;
  x0: number;
  y0: number;
  /** Los cuadraditos con su lugar dentro del recuadro, o null si no llegaron (se dibuja el fondo lila). */
  teselas: Array<{ img: CanvasImageSource; dx: number; dy: number }> | null;
}

function cargarTesela(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error('tesela'));
    img.src = src;
  });
}

/** Calcula el encuadre y trae los cuadraditos que hacen falta (todos o ninguno, con un tiempo máximo); con `cargar` null, ninguno. */
export async function prepararMapa(camino: Coord[], ancho: number, alto: number, cargar: ((src: string) => Promise<CanvasImageSource>) | null = cargarTesela): Promise<MapaListo> {
  const e = encuadre(camino, ancho, alto);
  if (!cargar) return { ...e, teselas: null };
  const { z, f, x0, y0 } = e;
  const n = 2 ** z;
  const lado = TESELA * f;
  const pedidos: Array<Promise<{ img: CanvasImageSource; dx: number; dy: number }>> = [];
  for (let tx = Math.floor(x0 / lado); tx * lado < x0 + ancho; tx++) {
    for (let ty = Math.floor(y0 / lado); ty * lado < y0 + alto; ty++) {
      if (ty < 0 || ty >= n) continue;
      const src = URL_TESELA.replace('{z}', String(z)).replace('{x}', String(((tx % n) + n) % n)).replace('{y}', String(ty));
      pedidos.push(cargar(src).then((img) => ({ img, dx: tx * lado - x0, dy: ty * lado - y0 })));
    }
  }
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<null>((ok) => (reloj = setTimeout(() => ok(null), ESPERA_MS)));
  const teselas = await Promise.race([Promise.all(pedidos), tarde]).catch(() => null);
  clearTimeout(reloj);
  return { ...e, teselas };
}

/** Un rectángulo con las esquinas redondeadas (roundRect no está en todos los teléfonos). */
export function redondeado(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Dibuja el mapa con el recorrido en el recuadro (x, y, ancho, alto), con las esquinas redondeadas. */
export function dibujarMapa(c: CanvasRenderingContext2D, m: MapaListo, camino: Coord[], x: number, y: number, ancho: number, alto: number, radio = 32) {
  c.save();
  redondeado(c, x, y, ancho, alto, radio);
  c.clip();
  if (m.teselas) {
    c.fillStyle = '#ece7f6';
    c.fillRect(x, y, ancho, alto);
    // Igual que en el mapa de la app: en grises y teñido de violeta.
    c.filter = 'grayscale(1) sepia(0.3) hue-rotate(215deg) saturate(1.6) brightness(1.04) contrast(0.92)';
    // Medio píxel de más para que no se vean las uniones entre cuadraditos achicados.
    const lado = TESELA * m.f;
    for (const t of m.teselas) c.drawImage(t.img, x + t.dx, y + t.dy, lado + 0.5, lado + 0.5);
    c.filter = 'none';
  } else {
    const g = c.createLinearGradient(x, y, x + ancho, y + alto);
    g.addColorStop(0, '#f3effd');
    g.addColorStop(1, '#e7dffb');
    c.fillStyle = g;
    c.fillRect(x, y, ancho, alto);
    c.fillStyle = 'rgba(107,79,187,0.13)';
    for (let px = x + 18; px < x + ancho; px += 36) {
      for (let py = y + 18; py < y + alto; py += 36) {
        c.beginPath();
        c.arc(px, py, 2.5, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  const ps = camino.map((p) => {
    const q = enRecuadro(p, m);
    return { x: x + q.x, y: y + q.y };
  });
  const trazar = () => {
    c.beginPath();
    ps.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  trazar();
  c.strokeStyle = '#ffffff';
  c.lineWidth = 16;
  c.stroke();
  trazar();
  c.strokeStyle = ACENTO;
  c.lineWidth = 9;
  c.stroke();
  for (const [p, color, r] of [[ps[0], INICIO, 13], [ps[ps.length - 1], FIN, 15]] as const) {
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#ffffff';
    c.stroke();
  }
  if (m.teselas) {
    // El crédito de OpenStreetMap, como pide su licencia.
    c.font = '500 20px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    const credito = '© OpenStreetMap';
    const w = c.measureText(credito).width + 20;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    redondeado(c, x + ancho - w - 12, y + alto - 40, w, 30, 10);
    c.fill();
    c.fillStyle = '#5a5470';
    c.textBaseline = 'alphabetic';
    c.fillText(credito, x + ancho - w - 2, y + alto - 18);
  }
  c.restore();
}
