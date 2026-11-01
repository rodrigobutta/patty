// Las alergias que declara cada persona (en Tus datos de salud) y los estados de "¿Algo puntual?" que se arma a su gusto.
// Patty no diagnostica ni recomienda remedios: con esto solo avisa cuando lo que se anota choca con algo declarado, pregunta
// en la temporada de una alergia estacional y se lo cuenta a la IA para que lo tenga en cuenta.
import { estacionDe, normalizar, ESTADOS_PUNTUALES, type Estacion, type Persona } from './index.js';
import { traducir, type Idioma } from './i18n.js';

export type TipoAlergia = 'estacional' | 'alimento' | 'medicamento' | 'animal' | 'otra';
export interface Alergia {
  tipo: TipoAlergia;
  /** Lo que da alergia ("Maní", "Penicilina"). En las estacionales alcanza con la estación: va vacío. */
  nombre: string;
  /** Solo las estacionales: en qué estación molesta. */
  estacion?: Estacion;
}

/** Las estacionales, para elegir con un toque. */
export const ALERGIAS_ESTACIONALES: Array<{ estacion: Estacion; nombre: string; emoji: string }> = [
  { estacion: 'primavera', nombre: 'Primaveral', emoji: '🌸' },
  { estacion: 'verano', nombre: 'De verano', emoji: '☀️' },
  { estacion: 'otono', nombre: 'De otoño', emoji: '🍂' },
  { estacion: 'invierno', nombre: 'De invierno', emoji: '❄️' },
];
/** Las que se escriben: qué tipo y un ejemplo. */
export const ALERGIAS_CON_NOMBRE: Array<{ tipo: Exclude<TipoAlergia, 'estacional'>; nombre: string; emoji: string; ejemplo: string }> = [
  { tipo: 'alimento', nombre: 'A un alimento', emoji: '🍽️', ejemplo: 'ej: maní, mariscos, huevo' },
  { tipo: 'medicamento', nombre: 'A un medicamento', emoji: '💊', ejemplo: 'ej: penicilina, ibuprofeno' },
  { tipo: 'animal', nombre: 'A animales', emoji: '🐈', ejemplo: 'ej: gatos, perros' },
  { tipo: 'otra', nombre: 'Otra', emoji: '✏️', ejemplo: 'ej: ácaros, látex, picaduras' },
];

const TIPOS: TipoAlergia[] = ['estacional', 'alimento', 'medicamento', 'animal', 'otra'];
const ESTACIONES_VALIDAS: Estacion[] = ['verano', 'otono', 'invierno', 'primavera'];

/** Lo que llega del pedido, revisado y sin repetidos. Lo que no se entiende, afuera; null si son demasiadas o muy largas. */
export function limpiarAlergias(x: unknown): Alergia[] | null {
  if (!Array.isArray(x) || x.length > 30) return null;
  const r = new Map<string, Alergia>();
  for (const a of x as Array<Partial<Alergia> | null>) {
    if (!a || !TIPOS.includes(a.tipo as TipoAlergia)) continue;
    const nombre = typeof a.nombre === 'string' ? a.nombre.trim() : '';
    if (nombre.length > 80) return null;
    if (a.tipo === 'estacional') {
      if (!ESTACIONES_VALIDAS.includes(a.estacion as Estacion)) continue;
      r.set(`e|${a.estacion}`, { tipo: 'estacional', nombre: '', estacion: a.estacion });
    } else if (nombre) {
      r.set(`${a.tipo}|${normalizar(nombre)}`, { tipo: a.tipo as TipoAlergia, nombre });
    }
  }
  return [...r.values()];
}

/** Cómo se nombra una alergia: "Primaveral", "Maní". */
export function nombreDeAlergia(a: Alergia, idioma: Idioma = 'es'): string {
  if (a.tipo !== 'estacional') return a.nombre;
  const e = ALERGIAS_ESTACIONALES.find((x) => x.estacion === a.estacion);
  return e ? traducir(idioma, e.nombre) : a.nombre;
}

/** En una frase para la IA y para quien lee los datos: "primaveral, maní (alimento), penicilina (medicamento)". */
export function alergiasTexto(alergias: Alergia[] | undefined, idioma: Idioma = 'es'): string {
  const que: Record<TipoAlergia, string> = {
    estacional: '',
    alimento: idioma === 'en' ? 'food' : 'alimento',
    medicamento: idioma === 'en' ? 'medication' : 'medicamento',
    animal: idioma === 'en' ? 'animal' : 'animal',
    otra: '',
  };
  return (alergias ?? []).map((a) => `${nombreDeAlergia(a, idioma).toLowerCase()}${que[a.tipo] ? ` (${que[a.tipo]})` : ''}`).join(', ');
}

/** Las alergias estacionales que están en su temporada ese día. */
export function alergiasDeTemporada(alergias: Alergia[] | undefined, fecha: string, zona: string): Alergia[] {
  const ahora = estacionDe(fecha, zona);
  return (alergias ?? []).filter((a) => a.tipo === 'estacional' && a.estacion === ahora);
}

/** Identifica una temporada ("2026-primavera"): el verano o el invierno que cruza el año sigue siendo el mismo. */
export function claveDeTemporada(fecha: string, zona: string): string {
  const anio = Number(fecha.slice(0, 4));
  return `${fecha.slice(5) < '03-21' ? anio - 1 : anio}-${estacionDe(fecha, zona)}`;
}

/** Lo que la IA tiene que saber de las alergias de la persona. Vacío si no declaró ninguna. */
export function alergiasParaIa(alergias: Alergia[] | undefined, fecha: string, zona: string): string {
  const lista = alergiasTexto(alergias);
  if (!lista) return '';
  const temporada = alergiasDeTemporada(alergias, fecha, zona);
  return (
    `Alergias que declaró la persona: ${lista}.` +
    (temporada.length ? ` Hoy es temporada de su alergia ${alergiasTexto(temporada)}: tenelo en cuenta como una posibilidad más, sin afirmarlo.` : '')
  );
}

// ---------- Si lo anotado choca con una alergia ----------

/** "Huevos" y "huevo", "camarones" y "camarón", "nueces" y "nuez" tienen que dar lo mismo. */
function raiz(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith('ces')) return `${palabra.slice(0, -3)}z`;
  if (palabra.length > 4 && /[lnrd]es$/.test(palabra)) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith('s')) return palabra.slice(0, -1);
  return palabra;
}
const SOBRAN = new Set(['a', 'al', 'el', 'la', 'los', 'las', 'de', 'del', 'y', 'e', 'o', 'con']);
const palabras = (t: string) => normalizar(t).split(' ').filter((x) => x && !SOBRAN.has(x)).map(raiz);
/** Las palabras de lo anotado, sin lo que dice que no tiene ("pizza sin gluten", "sin tacc"). */
const palabrasDe = (texto: string) => palabras(normalizar(texto).replace(/\bsin (?:\p{L}+ de )?\p{L}+/gu, ' '));

/**
 * Lo más común que trae adentro una alergia conocida, para no quedarse solo con el nombre ("Penicilina" y "Amoxidal",
 * "Mariscos" y "Rabas"). Es una ayuda corta, no una lista completa: lo demás lo marca la IA al ordenar lo contado.
 */
const FAMILIAS: Array<{ nombres: string[]; contiene: string[] }> = [
  { nombres: ['leche', 'lactosa', 'lacteo', 'caseina'], contiene: ['leche', 'queso', 'yogur', 'yogurt', 'manteca', 'crema', 'ricota', 'muzzarella', 'mozzarella', 'helado', 'flan'] },
  { nombres: ['huevo'], contiene: ['huevo', 'omelette', 'mayonesa', 'merengue', 'flan'] },
  { nombres: ['gluten', 'trigo', 'harina', 'tacc'], contiene: ['pan', 'pizza', 'fideo', 'pasta', 'noqui', 'empanada', 'galletita', 'galleta', 'milanesa', 'factura', 'medialuna', 'torta', 'tarta', 'tostada', 'sandwich', 'raviol', 'cerveza'] },
  { nombres: ['fruto seco', 'nuez'], contiene: ['nuez', 'almendra', 'avellana', 'castana', 'pistacho', 'caju'] },
  { nombres: ['marisco', 'crustaceo', 'molusco'], contiene: ['marisco', 'camaron', 'langostino', 'mejillon', 'calamar', 'pulpo', 'almeja', 'ostra', 'raba', 'cangrejo', 'langosta', 'paella'] },
  { nombres: ['pescado'], contiene: ['pescado', 'atun', 'salmon', 'merluza', 'sardina', 'trucha', 'sushi', 'anchoa', 'caballa', 'pejerrey'] },
  { nombres: ['soja'], contiene: ['soja', 'tofu', 'edamame'] },
  { nombres: ['penicilina', 'amoxicilina'], contiene: ['penicilina', 'amoxicilina', 'ampicilina', 'amoxidal'] },
  { nombres: ['aspirina'], contiene: ['aspirina', 'acetilsalicilico', 'bayaspirina'] },
  { nombres: ['ibuprofeno'], contiene: ['ibuprofeno', 'ibupirac', 'actron'] },
  { nombres: ['paracetamol'], contiene: ['paracetamol', 'tafirol', 'acetaminofen'] },
  { nombres: ['dipirona', 'metamizol'], contiene: ['dipirona', 'metamizol', 'novalgina'] },
  { nombres: ['diclofenac'], contiene: ['diclofenac', 'voltaren'] },
  { nombres: ['antiinflamatorio', 'aine'], contiene: ['antiinflamatorio', 'ibuprofeno', 'ibupirac', 'actron', 'diclofenac', 'voltaren', 'naproxeno', 'ketorolac', 'meloxicam', 'aspirina', 'bayaspirina'] },
  { nombres: ['sulfa', 'sulfamida'], contiene: ['sulfa', 'sulfamida', 'trimetoprima', 'cotrimoxazol', 'bactrim'] },
];

/** Si un texto (lo que se comió o se tomó) nombra lo que da alergia, o algo de lo que lo suele traer. */
export function chocaConAlergia(texto: string, alergia: Alergia): boolean {
  const pedido = palabras(alergia.nombre);
  if (!pedido.length) return false;
  const hay = new Set(palabrasDe(texto));
  if (pedido.every((x) => hay.has(x))) return true;
  const nombre = pedido.join(' ');
  const familia = FAMILIAS.find((f) => f.nombres.some((n) => palabras(n).join(' ') === nombre));
  if (!familia) return false;
  // "Pizza sin gluten", "sin TACC": dice que justo eso no tiene.
  const sinEso = [...normalizar(texto).matchAll(/\bsin ((?:\p{L}+ de )?\p{L}+)/gu)].map((m) => palabras(m[1]).join(' '));
  if (familia.nombres.some((n) => sinEso.includes(palabras(n).join(' ')))) return false;
  return familia.contiene.some((c) => hay.has(raiz(c)));
}

/** Con qué alergias choca algo de una categoría: lo que se come, con las de alimentos; un remedio, con las de medicamentos. */
export function alergiasQueChocan(texto: string, alergias: Alergia[] | undefined, categoria: string): Alergia[] {
  const tipos: TipoAlergia[] =
    categoria === 'comida' || categoria === 'bebida' ? ['alimento', 'otra'] : categoria === 'medicacion' ? ['medicamento', 'otra'] : [];
  return (alergias ?? []).filter((a) => tipos.includes(a.tipo) && chocaConAlergia(texto, a));
}

/** Lo que el servidor le contesta a la app cuando lo anotado choca con una alergia: `avisos_alergia` en la respuesta. */
export interface AvisoAlergia {
  que: string;
  alergia: string;
}

// ---------- Los estados de "¿Algo puntual?" ----------

export interface EstadoPropio {
  nombre: string;
  emoji: string;
}
/** Los que la persona agregó, y los que trae Patty que no quiere ver. */
export interface AjustesEstados {
  propios?: EstadoPropio[];
  ocultos?: string[];
}

export const EMOJI_ESTADO_PROPIO = '✨';

/** Lo que llega del pedido, revisado. Null si son demasiados o muy largos. */
export function limpiarEstados(x: unknown): AjustesEstados | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const d = x as { propios?: unknown; ocultos?: unknown };
  const propios = new Map<string, EstadoPropio>();
  const lista = Array.isArray(d.propios) ? (d.propios as Array<Partial<EstadoPropio> | null>) : [];
  if (lista.length > 30) return null;
  for (const e of lista) {
    const nombre = typeof e?.nombre === 'string' ? e.nombre.trim() : '';
    if (!nombre) continue;
    if (nombre.length > 40) return null;
    const clave = normalizar(nombre);
    if (ESTADOS_PUNTUALES.some((p) => normalizar(p.nombre) === clave)) continue;
    propios.set(clave, { nombre, emoji: (typeof e?.emoji === 'string' && e.emoji.trim().slice(0, 8)) || EMOJI_ESTADO_PROPIO });
  }
  const ocultos = (Array.isArray(d.ocultos) ? d.ocultos : []).filter((n): n is string => ESTADOS_PUNTUALES.some((p) => p.nombre === n));
  return { propios: [...propios.values()], ocultos: [...new Set(ocultos)] };
}

/** Los chips de esta persona: los de Patty que no sacó, y después los suyos. */
export function estadosDe(p: Pick<Persona, 'estados_puntuales'>): typeof ESTADOS_PUNTUALES {
  const a = p.estados_puntuales ?? {};
  return [...ESTADOS_PUNTUALES.filter((e) => !a.ocultos?.includes(e.nombre)), ...(a.propios ?? [])];
}

/** "Con sueño" y compañía (también los propios): se anotan con poco, bastante o mucho. */
export function esEstadoPuntual(nombre: string, p: Pick<Persona, 'estados_puntuales'>): boolean {
  return ESTADOS_PUNTUALES.some((e) => e.nombre === nombre) || Boolean(p.estados_puntuales?.propios?.some((e) => e.nombre === nombre));
}

/** Lo que se escribe al agregar uno: si arranca con un emoji, ese es el suyo ("🤧 Con mocos"). */
export function estadoEscrito(texto: string): EstadoPropio {
  const m = /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}\u{FE0F}\u{200D}]*)\s*(.*)$/u.exec(texto.trim());
  const nombre = (m ? m[2] : texto).trim();
  return { nombre: nombre ? nombre[0].toUpperCase() + nombre.slice(1) : '', emoji: m?.[1] ?? EMOJI_ESTADO_PROPIO };
}
