// La dirección aproximada de un punto (calle y barrio), para preguntar "¿qué lugar es?" con algo reconocible. Usa
// Nominatim de OpenStreetMap: sin clave, pero como mucho un pedido por segundo; por eso se guarda lo que ya se preguntó.
const cache = new Map<string, string | null>();
let ultimo = 0;

export async function direccionDe(lat: number, lon: number, idioma: string): Promise<string | null> {
  const clave = `${lat.toFixed(4)},${lon.toFixed(4)},${idioma}`;
  if (cache.has(clave)) return cache.get(clave)!;
  const espera = ultimo + 1100 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimo = Date.now();
  try {
    const q = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lon), zoom: '18', 'accept-language': idioma });
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?${q}`, {
      headers: { 'User-Agent': 'Patty/1.0 (https://patty.today)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null; // no se guarda: la próxima vez se vuelve a intentar
    const j = (await r.json()) as { name?: string; address?: Record<string, string> };
    const a = j.address ?? {};
    const calle = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : null;
    const zona = a.neighbourhood ?? a.suburb ?? a.city_district ?? a.town ?? a.city ?? a.village ?? null;
    const lugar = j.name && j.name !== a.road ? j.name : null;
    const texto = [lugar, calle, zona].filter(Boolean).join(', ') || null;
    if (cache.size > 2000) cache.clear();
    cache.set(clave, texto);
    return texto;
  } catch {
    return null;
  }
}
