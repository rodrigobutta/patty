// La tabla de ingredientes: una foto chica de USDA FoodData Central (datos/ingredientes.json, se regenera con
// scripts/tablaAlimentos.ts) con los nutrientes por 100 g. Vive en la memoria del proceso que resuelve comidas y se carga recién
// cuando hace falta. La IA nunca la ve entera: se busca acá y se le muestra una lista corta para que elija.
import { normalizar } from 'shared';
import { CLAVES_TABLA, claveAlimento, type Componentes } from './lista.js';

export interface Ingrediente {
  id: number;
  en: string;
  es: string[];
  por100: Componentes;
  /** Palabras para buscar. */
  palabras: Set<string>;
}

export interface Tabla {
  filas: Ingrediente[];
  porId: Map<number, Ingrediente>;
  /** Por nombre en castellano (clave de claveAlimento). */
  porNombre: Map<string, Ingrediente>;
}

const palabrasDe = (t: string) => normalizar(t).split(/[^a-z0-9ñ]+/).filter((p) => p.length > 1);

let cache: Promise<Tabla> | null = null;

/** La tabla (la primera vez la lee). */
export function tablaIngredientes(): Promise<Tabla> {
  if (!cache) cache = cargar();
  return cache;
}

async function cargar(): Promise<Tabla> {
  const crudo = (await import('./datos/ingredientes.json', { with: { type: 'json' } })).default as unknown as { columnas: string[]; filas: Array<Array<number | string>> };
  const filas = crudo.filas.map((f) => {
    const es = String(f[2]) ? String(f[2]).split('|') : [];
    const por100: Componentes = {};
    CLAVES_TABLA.forEach((c) => {
      const v = Number(f[crudo.columnas.indexOf(c)]);
      if (v) por100[c] = v;
    });
    return { id: Number(f[0]), en: String(f[1]), es, por100, palabras: new Set([...palabrasDe(String(f[1])), ...es.flatMap(palabrasDe)]) };
  });
  const porNombre = new Map<string, Ingrediente>();
  for (const x of filas) for (const n of x.es) porNombre.set(claveAlimento(n), x);
  return { filas, porId: new Map(filas.map((x) => [x.id, x])), porNombre };
}

/** Los ingredientes que más se parecen a lo buscado (en inglés o en castellano): lo que se le muestra a la IA para elegir. */
export function buscarIngrediente(t: Tabla, texto: string, limite = 8): Ingrediente[] {
  const buscadas = [...new Set(palabrasDe(texto).flatMap((p) => [p, p.endsWith('s') ? p.slice(0, -1) : `${p}s`]))];
  if (!buscadas.length) return [];
  const conPuntaje: Array<{ x: Ingrediente; p: number }> = [];
  for (const x of t.filas) {
    let p = 0;
    for (const b of buscadas) if (x.palabras.has(b)) p += 1;
    if (!p) continue;
    // A igual cantidad de palabras, los nombres cortos (lo más común) y lo que ya tiene nombre en castellano.
    conPuntaje.push({ x, p: p + (x.es.length ? 0.5 : 0) - x.en.length / 500 });
  }
  return conPuntaje.sort((a, b) => b.p - a.p).slice(0, limite).map((c) => c.x);
}
