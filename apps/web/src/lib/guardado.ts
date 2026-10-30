// Lo último que trajo la app de cada pantalla, guardado en el teléfono: así al abrir Patty se ve enseguida lo que ya
// sabía (el día, el ánimo de la semana, lo que sonó…) y se actualiza por detrás cuando contesta el servidor, en vez de
// arrancar en blanco esperando la red. Se guardan las últimas MAXIMO lecturas; las más viejas se van.
const CLAVE = 'guardado-api';
const MAXIMO = 40;

type Guardado = Record<string, { t: number; d: unknown }>;
let memoria: Guardado | null = null;

function todo(): Guardado {
  if (memoria) return memoria;
  try {
    memoria = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Guardado;
  } catch {
    memoria = {};
  }
  return memoria;
}

let pendiente: ReturnType<typeof setTimeout> | null = null;
function escribir(): void {
  if (pendiente) return;
  // Se escribe un rato después (varias lecturas juntas, una sola escritura).
  pendiente = setTimeout(() => {
    pendiente = null;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(todo()));
    } catch {
      // Lleno o sin almacenamiento: se vacía la mitad más vieja y se reintenta la próxima vez.
      const g = todo();
      Object.entries(g)
        .sort((a, b) => a[1].t - b[1].t)
        .slice(0, Math.ceil(Object.keys(g).length / 2))
        .forEach(([k]) => delete g[k]);
    }
  }, 500);
}

/** Lo último guardado de esa lectura (`ruta` del GET), o undefined. */
export function guardado<T>(ruta: string): T | undefined {
  return todo()[ruta]?.d as T | undefined;
}

/** Guarda lo que contestó el servidor para esa lectura. */
export function guardar(ruta: string, d: unknown): void {
  const g = todo();
  g[ruta] = { t: Date.now(), d };
  const claves = Object.keys(g);
  if (claves.length > MAXIMO) {
    claves
      .sort((a, b) => g[a].t - g[b].t)
      .slice(0, claves.length - MAXIMO)
      .forEach((k) => delete g[k]);
  }
  escribir();
}

/** Al salir de la cuenta: nada de lo de otro usuario queda en el teléfono. */
export function olvidarGuardado(): void {
  memoria = {};
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}
