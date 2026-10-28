// Reglas y tipos que comparten la API y la web.
import { traducir, type Idioma } from './i18n.js';
export * from './i18n.js';

/**
 * Qué se anota con cada concepto:
 * - evento: solo que pasó (comí tomate, fui al baño)
 * - cantidad: un número con unidad (3 vasos de agua, 5 llamadas)
 * - intensidad: de 0 a 10 (dolor de cabeza 4)
 * - duracion: minutos (caminé 30 min)
 * - hora: un momento del día (me levanté a las 7:10)
 * - medida: un valor medido, en general de un sensor (temperatura 28 °C, 8000 pasos)
 */
export const TIPOS_VALOR = ['evento', 'cantidad', 'intensidad', 'duracion', 'hora', 'medida'] as const;
export type TipoValor = (typeof TIPOS_VALOR)[number];

/**
 * Para el análisis de patrones: una "causa" es algo que se hace o que pasa alrededor (comida, clima, actividad),
 * un "efecto" es cómo se siente la persona (dolores, ánimo). "ambos" se prueba de los dos lados (sueño, baño).
 */
export const ROLES_CATEGORIA = ['causa', 'efecto', 'ambos'] as const;
export type RolCategoria = (typeof ROLES_CATEGORIA)[number];

export interface CategoriaBase {
  clave: string;
  nombre: string;
  icono: string;
  rol: RolCategoria;
  tipo_valor: TipoValor;
  unidad: string | null;
  orden: number;
}

/** Categorías con las que arranca una base nueva (se pueden agregar más). */
export const CATEGORIAS_INICIALES: CategoriaBase[] = [
  { clave: 'sueno', nombre: 'Sueño', icono: '😴', rol: 'ambos', tipo_valor: 'hora', unidad: null, orden: 1 },
  { clave: 'comida', nombre: 'Comida', icono: '🍽️', rol: 'causa', tipo_valor: 'evento', unidad: null, orden: 2 },
  { clave: 'bebida', nombre: 'Bebida', icono: '🥤', rol: 'causa', tipo_valor: 'cantidad', unidad: 'vasos', orden: 3 },
  { clave: 'bano', nombre: 'Baño', icono: '🚽', rol: 'ambos', tipo_valor: 'evento', unidad: null, orden: 4 },
  { clave: 'sintoma', nombre: 'Dolores y molestias', icono: '🤕', rol: 'efecto', tipo_valor: 'intensidad', unidad: null, orden: 5 },
  { clave: 'animo', nombre: 'Ánimo y energía', icono: '🙂', rol: 'efecto', tipo_valor: 'intensidad', unidad: null, orden: 6 },
  { clave: 'actividad', nombre: 'Actividad', icono: '🏃', rol: 'causa', tipo_valor: 'duracion', unidad: 'min', orden: 7 },
  { clave: 'comunicacion', nombre: 'Llamadas y mensajes', icono: '📞', rol: 'causa', tipo_valor: 'cantidad', unidad: null, orden: 8 },
  { clave: 'pantalla', nombre: 'Pantalla y redes', icono: '📱', rol: 'causa', tipo_valor: 'duracion', unidad: 'min', orden: 9 },
  { clave: 'medicacion', nombre: 'Medicación', icono: '💊', rol: 'causa', tipo_valor: 'cantidad', unidad: 'dosis', orden: 10 },
  { clave: 'clima', nombre: 'Clima', icono: '🌤️', rol: 'causa', tipo_valor: 'medida', unidad: null, orden: 11 },
  { clave: 'lugar', nombre: 'Lugares y salidas', icono: '📍', rol: 'causa', tipo_valor: 'duracion', unidad: 'min', orden: 12 },
  { clave: 'otro', nombre: 'Otro', icono: '📝', rol: 'ambos', tipo_valor: 'evento', unidad: null, orden: 13 },
  { clave: 'ciclo', nombre: 'Ciclo menstrual', icono: '🩸', rol: 'ambos', tipo_valor: 'intensidad', unidad: null, orden: 14 },
  { clave: 'gente', nombre: 'Con gente', icono: '👥', rol: 'causa', tipo_valor: 'evento', unidad: null, orden: 15 },
  { clave: 'viaje', nombre: 'Viajes', icono: '🚗', rol: 'causa', tipo_valor: 'duracion', unidad: 'min', orden: 16 },
  { clave: 'trabajo', nombre: 'Trabajo y reuniones', icono: '💼', rol: 'causa', tipo_valor: 'medida', unidad: null, orden: 17 },
];

/** Conceptos que conviene que existan desde el principio (los que van a llenar los relojes y el clima). */
export const CONCEPTOS_INICIALES: Array<{ categoria: string; nombre: string; tipo_valor: TipoValor; unidad: string | null }> = [
  { categoria: 'sueno', nombre: 'Me levanté', tipo_valor: 'hora', unidad: null },
  { categoria: 'sueno', nombre: 'Me acosté', tipo_valor: 'hora', unidad: null },
  { categoria: 'sueno', nombre: 'Siesta', tipo_valor: 'duracion', unidad: 'min' },
  { categoria: 'clima', nombre: 'Temperatura', tipo_valor: 'medida', unidad: '°C' },
  { categoria: 'clima', nombre: 'Humedad', tipo_valor: 'medida', unidad: '%' },
  { categoria: 'clima', nombre: 'Lluvia', tipo_valor: 'medida', unidad: 'mm' },
  { categoria: 'clima', nombre: 'Presión', tipo_valor: 'medida', unidad: 'hPa' },
  { categoria: 'actividad', nombre: 'Pasos', tipo_valor: 'medida', unidad: 'pasos' },
  { categoria: 'comunicacion', nombre: 'Llamadas', tipo_valor: 'cantidad', unidad: null },
  { categoria: 'pantalla', nombre: 'Tiempo de pantalla', tipo_valor: 'medida', unidad: 'min' },
  { categoria: 'lugar', nombre: 'Viajes', tipo_valor: 'medida', unidad: 'viajes' },
  { categoria: 'lugar', nombre: 'Km recorridos', tipo_valor: 'medida', unidad: 'km' },
  { categoria: 'ciclo', nombre: 'Menstruación', tipo_valor: 'intensidad', unidad: null },
];

/**
 * La clave interna de un nombre: sin tildes, en minúsculas y con los espacios normalizados.
 * "  Dolor de CABEZA " y "dolor de cabeza" son el mismo concepto.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%°]+/gu, ' ')
    .trim();
}

/** El nombre tal como se muestra: primera letra en mayúscula, espacios prolijos. */
export function nombreLindo(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t ? t[0].toLocaleUpperCase('es') + t.slice(1) : t;
}

// ---------- Ubicación y lugares ----------

/** Un viaje es de al menos esto (las vueltas cortas no cuentan). */
export const DISTANCIA_VIAJE_M = 1000;
/** Moverse más que esto desde el último punto guardado guarda uno nuevo: así queda el recorrido (una caminata entera). */
export const DISTANCIA_PUNTO_M = 150;
/** El radio con el que se crea un lugar: alcanza para una casa o un súper, con el error del GPS. */
export const RADIO_LUGAR_M = 150;

export interface Coordenadas {
  lat: number;
  lon: number;
}

/** Distancia en metros entre dos puntos (fórmula del haversine; para distancias cortas sobra). */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** El lugar con nombre en el que cae un punto (el más cercano, si caen varios radios), o null. */
export function lugarDe<L extends Coordenadas & { id: number; radio_m: number }>(p: Coordenadas, lugares: L[]): L | null {
  let mejor: L | null = null;
  let dMejor = Infinity;
  for (const l of lugares) {
    const d = distanciaMetros(p, l);
    if (d <= l.radio_m && d < dMejor) [mejor, dMejor] = [l, d];
  }
  return mejor;
}

/**
 * Si vale la pena guardar un punto nuevo, comparado con el último guardado: es el primero del día, se movió más de
 * DISTANCIA_PUNTO_M, o entró o salió de un lugar con nombre. Así no se guarda un punto cada vez que se abre la app.
 */
export function puntoNuevo<L extends Coordenadas & { id: number; radio_m: number }>(
  anterior: (Coordenadas & { dia: string }) | null,
  p: Coordenadas & { dia: string },
  lugares: L[],
): boolean {
  if (!anterior || anterior.dia !== p.dia) return true;
  if (distanciaMetros(anterior, p) >= DISTANCIA_PUNTO_M) return true;
  return lugarDe(anterior, lugares)?.id !== lugarDe(p, lugares)?.id;
}

// ---------- Respuestas de la API ----------

export type RolUsuario = 'admin' | 'editor' | 'lector';

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  rol: RolUsuario;
  email: string | null;
  /** La foto de la cuenta de Google (si entró con Google). */
  foto?: string | null;
  /** Cómo le dice Patty: el apodo que eligió o el diminutivo de su nombre. */
  apodo?: string;
  /** El apodo que eligió él mismo (null: se usa el diminutivo automático). */
  apodo_elegido?: string | null;
}

export interface Sesion {
  configurar: boolean;
  usuario: Usuario | null;
  google: string | null;
  ia: boolean;
  /** Si el servidor pasa audio a texto (lo que se dicta); si no, el teléfono usa su propio reconocedor. */
  voz: boolean;
  /** Si el servidor puede mandar avisos push (Firebase configurado). */
  push: boolean;
  /** La última versión publicada de la app de Android y de dónde bajarla (si la administración la cargó). */
  app?: VersionApp | null;
  /** El ID de Google Analytics (G-…) para medir la página de presentación, si está configurado. */
  analytics?: string | null;
}

export interface VersionApp {
  version: string;
  url: string;
}

/** Compara versiones "1.4.0" (negativo si a es más vieja que b). */
export function compararVersiones(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

export interface Persona {
  id: number;
  nombre: string;
  zona_horaria: string;
  nacimiento: string | null;
  sexo?: 'femenino' | 'masculino' | 'otro' | null;
  altura_cm?: number | null;
  peso_kg?: number | null;
  /** Condiciones crónicas ("Hipertensión", "Celiaquía"), si las quiso contar. */
  condiciones?: string[];
  notas: string | null;
  /** Si el usuario es su dueño (es "la suya"): a esa van los datos que junta solo el teléfono. */
  propia?: boolean;
  /** Si la ve porque supervisa a su dueño. */
  supervisada?: boolean;
}

export interface Categoria extends CategoriaBase {
  id: number;
}

/**
 * Cómo se siente la persona: en el momento (botón del Día) o cómo se sintió en el día (la encuesta de la noche).
 * Se guardan como intensidad de 1 a 10 (más alto, mejor) en «Ánimo y energía»: así el motor compara días buenos y
 * malos. Si es mal o muy mal, además se anotan los síntomas con su intensidad.
 */
export const COMO_ME_SIENTO = 'Cómo me siento';
export const COMO_ME_SENTI = 'Cómo me sentí en el día';

export interface EstadoAnimo { clave: 'muy_bien' | 'bien' | 'mal' | 'muy_mal'; nombre: string; emoji: string; intensidad: number }

export const ESTADOS: EstadoAnimo[] = [
  { clave: 'muy_bien', nombre: 'Muy bien', emoji: '😄', intensidad: 10 },
  { clave: 'bien', nombre: 'Bien', emoji: '🙂', intensidad: 7 },
  { clave: 'mal', nombre: 'Mal', emoji: '😕', intensidad: 4 },
  { clave: 'muy_mal', nombre: 'Muy mal', emoji: '😣', intensidad: 1 },
];

/** El estado más cercano a una intensidad anotada (por si se cargó a mano otro número). */
export function estadoDe(intensidad: number): EstadoAnimo {
  return ESTADOS.reduce((a, b) => (Math.abs(b.intensidad - intensidad) < Math.abs(a.intensidad - intensidad) ? b : a));
}

/**
 * "Enfermo/a" va aparte de muy bien … muy mal (no es un ánimo): se anota como una molestia, con los síntomas de estar
 * enfermo (fiebre, vómitos…) y, si se toma, la temperatura. Esos síntomas aparecen solo ahí.
 */
export const ENFERMO = 'Me siento enfermo/a';
export const TEMPERATURA_CORPORAL = 'Temperatura corporal';
export const SINTOMAS_ENFERMO = [
  'Fiebre',
  'Vómitos',
  'Diarrea',
  'Náuseas',
  'Dolor de cabeza',
  'Dolor de garganta',
  'Tos',
  'Congestión',
  'Dolor de panza',
  'Dolor de cuerpo',
  'Escalofríos',
  'Mareo',
  'Cansancio',
];
/** Con "mal" o "muy mal": lo que suele pasar con el ánimo (lo del cuerpo va con "enfermo/a"). */
export const COSAS_DEL_ANIMO = ['Ansiedad', 'Tristeza', 'Estrés', 'Cansancio', 'Preocupación', 'Enojo', 'Desgano', 'Soledad', 'Dolor de cabeza', 'Dolor de espalda'];

/** Lo que más seguido se pregunta cuando alguien se siente mal (se suman los síntomas que ya anotó). */
export const SINTOMAS_COMUNES = [
  'Dolor de cabeza',
  'Dolor de huesos',
  'Dolor de articulaciones',
  'Dolor de panza',
  'Descompuesto',
  'Náuseas',
  'Cansancio',
  'Mareo',
  'Dolor de espalda',
  'Ansiedad',
  'Tristeza',
  'Congestión',
];

/**
 * Cosas puntuales que no son "bien" ni "mal" (después de comer, "tengo sueño"): se anotan al toque en «Ánimo y
 * energía» con cuánto (poco, bastante, mucho), así Patty puede ver qué vino antes.
 */
export const ESTADOS_PUNTUALES: Array<{ nombre: string; emoji: string }> = [
  { nombre: 'Con sueño', emoji: '😴' },
  { nombre: 'Con energía', emoji: '⚡' },
  { nombre: 'Con hambre', emoji: '🍽️' },
  { nombre: 'Con sed', emoji: '💧' },
  { nombre: 'Con pesadez', emoji: '🫃' },
  { nombre: 'Con ansiedad', emoji: '😰' },
  { nombre: 'Con estrés', emoji: '😤' },
  { nombre: 'Con calma', emoji: '😌' },
  { nombre: 'Con desgano', emoji: '🫠' },
  { nombre: 'De mal humor', emoji: '😠' },
  { nombre: 'Con frío', emoji: '🥶' },
  { nombre: 'Con calor', emoji: '🥵' },
];

/**
 * "Con dolor" en «¿Algo puntual?»: qué duele, o qué malestar común es. Se anotan en «Dolores y molestias» (efecto),
 * con cuánto, para que Patty busque qué los causa.
 */
export const DOLORES: Array<{ nombre: string; emoji: string }> = [
  { nombre: 'Dolor de cabeza', emoji: '🤕' },
  { nombre: 'Dolor de garganta', emoji: '🗣️' },
  { nombre: 'Dolor de panza', emoji: '🫃' },
  { nombre: 'Dolor de espalda', emoji: '🔙' },
  { nombre: 'Dolor de cuello', emoji: '🦒' },
  { nombre: 'Dolor de cuerpo', emoji: '🧍' },
  { nombre: 'Dolor de articulaciones', emoji: '🦴' },
  { nombre: 'Dolor de piernas', emoji: '🦵' },
  { nombre: 'Dolor de muelas', emoji: '🦷' },
  { nombre: 'Dolor de oído', emoji: '👂' },
  { nombre: 'Dolor de ojos', emoji: '👁️' },
  { nombre: 'Dolor de pecho', emoji: '💔' },
  { nombre: 'Dolor menstrual', emoji: '🩸' },
];
export const MALESTARES: Array<{ nombre: string; emoji: string }> = [
  { nombre: 'Migraña', emoji: '⚡' },
  { nombre: 'Fiebre', emoji: '🌡️' },
  { nombre: 'Resfrío', emoji: '🤧' },
  { nombre: 'Gripe', emoji: '🤒' },
  { nombre: 'Tos', emoji: '😷' },
  { nombre: 'Congestión', emoji: '👃' },
  { nombre: 'Náuseas', emoji: '🤢' },
  { nombre: 'Diarrea', emoji: '🚽' },
  { nombre: 'Acidez', emoji: '🔥' },
  { nombre: 'Mareo', emoji: '💫' },
  { nombre: 'Alergia', emoji: '🌼' },
  { nombre: 'Contractura', emoji: '💪' },
];

/** Cuánto le pasó cada síntoma: se guarda como intensidad. */
export const CUANTO = [
  { nombre: 'Poco', intensidad: 3 },
  { nombre: 'Bastante', intensidad: 6 },
  { nombre: 'Mucho', intensidad: 9 },
];

/**
 * La tele: cuánto, qué tipo de contenido y en qué canal o plataforma. Se anota como tres duraciones (minutos) en
 * «Pantalla y redes»: «Tele» (el total), «Tele: Noticias» (el tipo) y «Tele en TN» (el canal), para que Patty pueda
 * encontrar cosas como "los días con muchas noticias, a la noche me duele la cabeza".
 */
export const TELE = 'Tele';
export const TIPOS_DE_TELE = ['Noticias', 'Películas', 'Series', 'Deportes', 'Documentales', 'Entretenimiento', 'Política y debates', 'Chimentos', 'Música', 'Infantiles'];
export const CANALES_COMUNES = ['TN', 'C5N', 'LN+', 'A24', 'Crónica', 'Telefe', 'El Trece', 'América', 'TV Pública', 'Netflix', 'YouTube', 'Disney+', 'Max', 'Prime Video', 'ESPN', 'TyC Sports'];
export const teleDeTipo = (tipo: string) => `${TELE}: ${tipo}`;
export const teleEnCanal = (canal: string) => `${TELE} en ${canal}`;

/**
 * El nombre de un dato en el idioma de la app: los del diccionario y los que se arman ("Tele: Noticias", "Tele en TN",
 * "Uso de Instagram"). Lo que escribió la persona queda igual.
 */
export function traducirDato(nombre: string, idioma: Idioma = 'es'): string {
  if (idioma === 'es') return nombre;
  const t = traducir(idioma, nombre);
  if (t !== nombre) return t;
  let m = /^Tele: (.+)$/.exec(nombre);
  if (m) return `${traducir(idioma, TELE)}: ${traducir(idioma, m[1])}`;
  m = /^Tele en (.+)$/.exec(nombre);
  if (m) return traducir(idioma, 'Tele en {canal}', { canal: m[1] });
  m = /^Comida en (.+)$/.exec(nombre);
  if (m) return traducir(idioma, 'Comida en {lugar}', { lugar: m[1] });
  m = /^Uso de (.+)$/.exec(nombre);
  if (m) return traducir(idioma, 'Uso de {app}', { app: m[1] });
  return nombre;
}

/** Lo que llegó solo en un día (teléfono, ubicación, clima, reloj), resumido por fuente y concepto. */
export interface DatoAutomatico {
  fuente: string;
  tipo_fuente: string;
  concepto: string;
  categoria_id: number;
  unidad: string | null;
  /** Cuántas mediciones hubo (el clima, una por hora; los resúmenes del teléfono, una por día). */
  cantidad: number;
  suma: number;
  minimo: number;
  maximo: number;
}

export interface Concepto {
  id: number;
  categoria_id: number;
  nombre: string;
  tipo_valor: TipoValor;
  unidad: string | null;
  /** Si ya se preguntó si lleva cantidad (ver UNIDADES_SUGERIDAS). */
  cantidad_decidida: boolean;
  usos: number;
}

/**
 * En estas categorías, la primera vez que se anota un concepto se pregunta si lleva cantidad y en qué unidad
 * ("huevos revueltos": unidades; "coca": vasos o litros). Lo elegido queda en el concepto para las próximas veces.
 */
export const UNIDADES_SUGERIDAS: Record<string, string[]> = {
  comida: ['unidades', 'porciones', 'platos', 'gramos'],
  bebida: ['vasos', 'tazas', 'latas', 'botellas', 'litros'],
  medicacion: ['pastillas', 'dosis', 'gotas'],
};

/** Una sugerencia del autocompletar: el concepto y por qué coincidió. */
export interface Sugerencia extends Concepto {
  coincide: 'exacto' | 'empieza' | 'parecido' | 'alias';
}

export interface Registro {
  id: number;
  persona_id: number;
  concepto_id: number;
  concepto: string;
  categoria_id: number;
  /** ISO 8601 con zona */
  inicio: string;
  fin: string | null;
  /** AAAA-MM-DD en la zona horaria de la persona */
  fecha: string;
  valor: number | null;
  intensidad: number | null;
  unidad: string | null;
  nota: string | null;
  origen: string;
  /** Solo comidas y bebidas: dónde fue y en qué lugar (si se dijo). */
  donde?: Donde | null;
  lugar?: string | null;
  /** Solo comidas: el tamaño y cómo es el plato (frito, harinas, verdura…). */
  porcion?: Porcion | null;
  tipos?: TipoComida[];
}

/** Dónde fue una comida o bebida: casera, afuera (restaurante, casa de alguien) o pedida. */
export const DONDE_COMIDA = [
  { clave: 'casa', nombre: 'Casera', concepto: 'Comida casera', icono: '🏠' },
  { clave: 'afuera', nombre: 'Afuera', concepto: 'Comida afuera', icono: '🍽️' },
  { clave: 'delivery', nombre: 'Delivery', concepto: 'Comida por delivery', icono: '🛵' },
] as const;
export type Donde = (typeof DONDE_COMIDA)[number]['clave'];
export const esDonde = (x: unknown): x is Donde => DONDE_COMIDA.some((d) => d.clave === x);
/** El concepto con el que entra a los patrones cada lugar donde se comió ("Comida en La Parolaccia"). */
export const comidaEn = (lugar: string) => `Comida en ${lugar}`;

/**
 * Cómo es un plato (lo estima la IA de la foto o del texto, y se puede corregir): cada tipo entra a los patrones como
 * un concepto más del día ("Comida frita", "Con lácteos"), igual que dónde se comió.
 */
export const TIPOS_COMIDA = [
  { clave: 'frito', nombre: 'Frito', concepto: 'Comida frita', icono: '🍟' },
  { clave: 'harinas', nombre: 'Harinas', concepto: 'Con harinas', icono: '🍞' },
  { clave: 'verdura', nombre: 'Verdura', concepto: 'Con verdura', icono: '🥦' },
  { clave: 'proteina', nombre: 'Proteína', concepto: 'Con proteína', icono: '🍗' },
  { clave: 'lacteos', nombre: 'Lácteos', concepto: 'Con lácteos', icono: '🧀' },
  { clave: 'dulce', nombre: 'Dulce', concepto: 'Algo dulce', icono: '🍰' },
  { clave: 'picante', nombre: 'Picante', concepto: 'Comida picante', icono: '🌶️' },
  { clave: 'ultraprocesado', nombre: 'Ultraprocesado', concepto: 'Ultraprocesado', icono: '📦' },
] as const;
export type TipoComida = (typeof TIPOS_COMIDA)[number]['clave'];
export const esTipoComida = (x: unknown): x is TipoComida => TIPOS_COMIDA.some((d) => d.clave === x);
/** El tamaño del plato. La mediana no suma concepto: es lo normal. */
export const PORCIONES = [
  { clave: 'chica', nombre: 'Chica', concepto: 'Porción chica' },
  { clave: 'mediana', nombre: 'Mediana', concepto: null },
  { clave: 'grande', nombre: 'Grande', concepto: 'Porción grande' },
] as const;
export type Porcion = (typeof PORCIONES)[number]['clave'];
export const esPorcion = (x: unknown): x is Porcion => PORCIONES.some((d) => d.clave === x);

export interface NuevoRegistro {
  persona_id: number;
  /** El concepto existente, o un nombre nuevo para crearlo en el momento. */
  concepto_id?: number;
  concepto_nombre?: string;
  categoria_id?: number;
  inicio?: string;
  fin?: string | null;
  valor?: number | null;
  intensidad?: number | null;
  unidad?: string | null;
  nota?: string | null;
  donde?: Donde | null;
  lugar?: string | null;
  porcion?: Porcion | null;
  tipos?: TipoComida[];
}

/** Un lugar con nombre de una persona (Casa, Supermercado, Farmacia). Cada uno es un concepto de «Lugares y salidas». */
export interface Lugar {
  id: number;
  persona_id: number;
  concepto_id: number;
  nombre: string;
  lat: number;
  lon: number;
  radio_m: number;
}

/** Lo que dice la ubicación de un día: cuántos viajes, cuántos km y en qué lugares estuvo. */
export interface DiaUbicacion {
  fecha: string;
  puntos: number;
  viajes: number;
  km: number;
  estadias: Array<{ lugar_id: number; lugar: string; llegada: string; salida: string; minutos: number }>;
}

/** Un lugar sin nombre donde la persona se quedó un buen rato (para preguntarle qué es). */
export interface ParadaSinNombre {
  lat: number;
  lon: number;
  llegada: string;
  salida: string;
  minutos: number;
  /** "Av. Cabildo 2100, Belgrano" (aproximada), si se pudo averiguar. */
  direccion: string | null;
  /** En cuántos otros días del último mes también se quedó ahí. */
  otros_dias: number;
}

/** confirmado: le sirvió; obvio: ya lo sabía; descartado: no tiene sentido. Los dos últimos se apartan y no vuelven a avisarse. */
export type EstadoHallazgo = 'nuevo' | 'confirmado' | 'obvio' | 'descartado';
/** presente = ese día hubo; alto / bajo = ese día el valor estuvo por encima / debajo de lo habitual de la persona */
export type Modo = 'presente' | 'alto' | 'bajo';

/** "Tomate", "Menos energía", "Me acosté tarde": cómo se nombra un rasgo de un día (alto y bajo, respecto de lo habitual). */
export function nombreRasgo(nombre: string, tipo: TipoValor, modo: Modo, idioma: Idioma = 'es'): string {
  if (idioma === 'en') {
    const n = traducirDato(nombre, idioma);
    if (modo === 'presente') return n;
    if (tipo === 'hora') return `${n} ${modo === 'alto' ? 'late' : 'early'}`;
    return `${modo === 'alto' ? 'More' : 'Less'} ${n.toLocaleLowerCase('en')}`;
  }
  if (modo === 'presente') return nombre;
  if (tipo === 'hora') return `${nombre} ${modo === 'alto' ? 'tarde' : 'temprano'}`;
  return `${modo === 'alto' ? 'Más' : 'Menos'} ${nombre.toLocaleLowerCase('es')}`;
}

export interface Hallazgo {
  id: number;
  persona_id: number;
  causa_id: number;
  efecto_id: number;
  causa: string;
  efecto: string;
  causa_modo: Modo;
  efecto_modo: Modo;
  causa_tipo: TipoValor;
  efecto_tipo: TipoValor;
  /** días entre la causa y el efecto (0 = el mismo día) */
  desfase_dias: number;
  /** días en que hubo causa y, desfase días después, efecto */
  soporte: number;
  dias_causa: number;
  dias_evaluados: number;
  prob_con: number;
  prob_sin: number;
  lift: number;
  p_valor: number;
  q_valor: number;
  puntaje: number;
  explicacion: string | null;
  estado: EstadoHallazgo;
  detectado: string;
}

export interface ResultadoAnalisis {
  id: number;
  desde: string;
  hasta: string;
  dias: number;
  pares_evaluados: number;
  hallazgos: Hallazgo[];
  resumen: string | null;
  sugerencias: string[];
}

// ---------- Remedios ----------

/**
 * Un remedio que se toma de forma programada o cuando hace falta. `cada_horas` (cada 8 h desde la primera toma) o
 * `horarios` (todos los días a las 9:00 y 21:00); sin ninguno, es "cuando haga falta" y no tiene recordatorios.
 */
export interface Tratamiento {
  id: number;
  persona_id: number;
  concepto_id: number;
  /** El nombre del remedio (su concepto de medicación). */
  remedio: string;
  dosis: number | null;
  unidad: string | null;
  cada_horas: number | null;
  horarios: string[];
  /** La primera toma (ISO). */
  inicio: string;
  /** Hasta cuándo, sin incluir (ISO); null si no tiene fin. */
  fin: string | null;
  motivo: string | null;
  nota: string | null;
  terminado: string | null;
  /** Calculado: tomas programadas en total (null si no tiene fin o es cuando haga falta), tomadas, y la próxima. */
  total: number | null;
  tomadas: number;
  proxima: string | null;
  activo: boolean;
}

export interface NuevoTratamiento {
  persona_id: number;
  concepto_id?: number | null;
  /** Nombre del remedio, si es nuevo (se crea en Medicación). */
  concepto_nombre?: string;
  dosis?: number | null;
  unidad?: string | null;
  cada_horas?: number | null;
  horarios?: string[];
  inicio: string;
  fin?: string | null;
  motivo?: string | null;
  nota?: string | null;
}

/** Una toma programada y qué pasó con ella (null: todavía nada, o se olvidó). */
export interface Toma {
  tratamiento_id: number;
  persona_id: number;
  remedio: string;
  dosis: number | null;
  unidad: string | null;
  programada: string;
  estado: 'tomada' | 'salteada' | null;
  /** Cuándo se tomó de verdad (el registro), si se tomó. */
  tomada: string | null;
}

/** Las unidades de dosis que se ofrecen al cargar un remedio. */
export const UNIDADES_DOSIS = ['comprimido', 'cápsula', 'mg', 'g', 'ml', 'gotas', 'sobre', 'cucharada', 'puff', 'UI'];

/** Después de esto sin marcar, una toma se da por olvidada (antes está "atrasada": todavía se puede tomar). */
export const HORAS_PARA_OLVIDADA = 3;

/** "1 g", "2 comprimidos", "" */
export function dosisTexto(dosis: number | null, unidad: string | null, idioma: Idioma = 'es'): string {
  if (dosis === null) return unidad ? traducir(idioma, unidad) : '';
  return conUnidad(dosis, unidad, 2, idioma);
}

/** "cada 8 h", "a las 09:00 y 21:00", "cuando haga falta" */
export function frecuenciaTexto(t: Pick<Tratamiento, 'cada_horas' | 'horarios'>, idioma: Idioma = 'es'): string {
  const en = idioma === 'en';
  if (t.cada_horas) {
    if (t.cada_horas === 24) return en ? 'once a day' : 'una vez por día';
    return `${en ? 'every' : 'cada'} ${Number(t.cada_horas.toFixed(1))} h`;
  }
  if (t.horarios.length) {
    const h = [...t.horarios].sort();
    const lista = h.length === 1 ? h[0] : h.slice(0, -1).join(', ') + (en ? ' and ' : ' y ') + h.at(-1);
    return `${en ? 'every day at' : 'todos los días a las'} ${lista}`;
  }
  return en ? 'as needed' : 'cuando haga falta';
}

/**
 * Las tomas programadas de un tratamiento entre dos instantes (incluye `desde`, excluye `hasta`). `localAInstante`
 * convierte una fecha y hora locales de la persona en instante (la API y la web tienen cada una la suya).
 */
export function tomasEntre(
  t: Pick<Tratamiento, 'cada_horas' | 'horarios' | 'inicio' | 'fin' | 'terminado'>,
  desde: Date,
  hasta: Date,
  fechaLocal: (instante: Date) => string,
  localAInstante: (fecha: string, hora: string) => Date,
): Date[] {
  const inicio = new Date(t.inicio).getTime();
  const fines = [hasta.getTime(), t.fin ? new Date(t.fin).getTime() : Infinity, t.terminado ? new Date(t.terminado).getTime() : Infinity];
  const fin = Math.min(...fines);
  const piso = Math.max(desde.getTime(), inicio);
  const salida: Date[] = [];
  if (fin <= piso) return salida;
  if (t.cada_horas && t.cada_horas > 0) {
    const paso = t.cada_horas * 3600000;
    for (let k = Math.max(0, Math.ceil((piso - inicio) / paso)); inicio + k * paso < fin && salida.length < 2000; k++) salida.push(new Date(inicio + k * paso));
    return salida;
  }
  if (!t.horarios.length) return salida;
  const horas = [...t.horarios].sort();
  // Desde el día anterior (por las zonas horarias) hasta el último día del rango.
  let dia = fechaLocal(new Date(piso - 86400000));
  const ultimo = fechaLocal(new Date(fin));
  for (let n = 0; dia <= ultimo && n < 400; n++) {
    for (const h of horas) {
      const x = localAInstante(dia, h).getTime();
      if (x >= piso && x < fin) salida.push(new Date(x));
    }
    const d = new Date(dia + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    dia = d.toISOString().slice(0, 10);
  }
  return salida;
}

// ---------- Supervisión ----------

/** Un supervisor y un supervisado (vistos desde el usuario que pregunta). */
export interface Supervision {
  id: number;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  /** El otro usuario: el supervisado si yo supervisé, el supervisor si me supervisan. */
  otro: { id: number; nombre: string; usuario: string };
  creado: string;
}

export interface MisSupervisiones {
  /** A quiénes superviso (aceptadas y las que mandé y esperan respuesta). */
  supervisas: Supervision[];
  /** Quiénes me supervisan (aceptadas y las invitaciones que tengo que contestar). */
  te_supervisan: Supervision[];
}

/** Avisos rápidos que un supervisor le manda al supervisado. */
export const AVISOS_RAPIDOS = [
  'Acordate de tomar tus remedios 💊',
  '¿Cómo estás? Contale a Patty cómo va tu día',
  'Anotá lo que comiste hoy 🍽️',
  'Te estoy pensando ❤️',
];

// ---------- Perfil ----------

/** Condiciones crónicas comunes, para elegir con un toque (se puede escribir otra). */
export const CONDICIONES_COMUNES = [
  'Hipertensión',
  'Diabetes',
  'Colesterol alto',
  'Hipotiroidismo',
  'Asma',
  'Migraña',
  'Colon irritable',
  'Celiaquía',
  'Gastritis o reflujo',
  'Artrosis',
  'Fibromialgia',
  'Ansiedad',
  'Depresión',
  'Alergias',
];

/**
 * Lo que se sabe de la persona, en una línea para la IA ("mujer, 67 años, 1,60 m, 70 kg; condiciones: hipertensión").
 * Vacío si no cargó nada.
 */
export function perfilTexto(p: Pick<Persona, 'nacimiento' | 'sexo' | 'altura_cm' | 'peso_kg' | 'condiciones'>, hoy = new Date(), idioma: Idioma = 'es'): string {
  const en = idioma === 'en';
  const coma = (x: string) => (en ? x : x.replace('.', ','));
  const partes: string[] = [];
  if (p.sexo) partes.push(en ? (p.sexo === 'femenino' ? 'woman' : p.sexo === 'masculino' ? 'man' : 'other sex') : p.sexo === 'femenino' ? 'mujer' : p.sexo === 'masculino' ? 'varón' : 'otro sexo');
  if (p.nacimiento) {
    const n = new Date(p.nacimiento + 'T12:00:00Z');
    let edad = hoy.getUTCFullYear() - n.getUTCFullYear();
    if (hoy.getUTCMonth() < n.getUTCMonth() || (hoy.getUTCMonth() === n.getUTCMonth() && hoy.getUTCDate() < n.getUTCDate())) edad--;
    if (edad >= 0 && edad < 130) partes.push(en ? `${edad} years old` : `${edad} años`);
  }
  if (p.altura_cm) partes.push(`${coma((p.altura_cm / 100).toFixed(2))} m`);
  if (p.peso_kg) partes.push(`${coma(String(Number(p.peso_kg.toFixed(1))))} kg`);
  const texto = partes.join(', ');
  const lista = (p.condiciones ?? []).map((c) => traducir(idioma, c)).join(', ').toLowerCase();
  const cond = lista ? `${en ? 'conditions' : 'condiciones'}: ${lista}` : '';
  return [texto, cond].filter(Boolean).join('; ');
}

// ---------- Progreso hacia los patrones ----------

/** Cuánto le falta a Patty para poder buscar patrones (y para que sean más firmes). */
export interface Progreso {
  /** Días con algo anotado a mano (últimos 180). */
  dias: number;
  /** De esos, días en que se anotó cómo se sentía o alguna molestia (los "efectos" que se buscan explicar). */
  dias_efecto: number;
  /** Días que hacen falta para empezar a buscar. */
  minimo: number;
  /** Días con efectos que conviene tener para empezar. */
  minimo_efecto: number;
}

/** Los niveles: para empezar, para que los patrones sean más firmes, y para que sean bastante confiables. */
export const NIVELES_PROGRESO = [
  { dias: 14, nombre: 'Primeros patrones' },
  { dias: 30, nombre: 'Patrones más firmes' },
  { dias: 60, nombre: 'Patrones confiables' },
];

/**
 * El avance hacia el próximo nivel, de 0 a 1, y en qué nivel está (0: todavía no puede buscar). Para el primero
 * cuentan los días anotados (70%) y los días con cómo se sintió (30%); después, solo los días.
 */
export function avanceProgreso(p: Progreso): { nivel: number; avance: number; siguiente: (typeof NIVELES_PROGRESO)[number] | null } {
  const primero = Math.min(p.dias / p.minimo, 1) * 0.7 + Math.min(p.dias_efecto / p.minimo_efecto, 1) * 0.3;
  if (primero < 1) return { nivel: 0, avance: primero, siguiente: NIVELES_PROGRESO[0] };
  for (let i = 1; i < NIVELES_PROGRESO.length; i++) {
    const n = NIVELES_PROGRESO[i];
    if (p.dias < n.dias) {
      const antes = NIVELES_PROGRESO[i - 1].dias;
      return { nivel: i, avance: (p.dias - antes) / (n.dias - antes), siguiente: n };
    }
  }
  return { nivel: NIVELES_PROGRESO.length, avance: 1, siguiente: null };
}

// ---------- Estadísticas ----------

export interface Estadisticas {
  desde: string;
  hasta: string;
  dias: number;
  dias_anotados: number;
  /** Cuántas cosas se anotaron cada día (solo los días con algo). */
  actividad: Array<{ fecha: string; n: number }>;
  /** Lo que más se anotó: en cuántos días, cuántas veces y la suma (si tiene cantidad). */
  top: Array<{ concepto_id: number; concepto: string; categoria_id: number; categoria: string; dias: number; veces: number; suma: number | null; unidad: string | null }>;
  /** Las intensidades de "cómo me siento" (para contar caritas). */
  animo: number[];
  dolores: Estadisticas['top'];
  /** Hora promedio (minutos del día). */
  sueno: { acoste: number | null; levante: number | null };
  clima: { dias_con_datos: number; dias_lluvia: number; mm: number; sol_promedio: number | null; temp_media: number | null; temp_max: number | null };
  movimiento: { pasos_promedio: number | null; km: number; pantalla_promedio: number | null; llamadas: number };
  remedios: { programadas: number; tomadas: number };
  /** Comidas y bebidas según dónde fueron, y los lugares donde más se comió. */
  donde: { casa: number; afuera: number; delivery: number; lugares: Array<{ lugar: string; veces: number }> };
}

/** Los días en que pasó algo puntual (para el calendario del buscador). */
export interface SerieConcepto {
  concepto: { id: number; nombre: string; tipo_valor: TipoValor; unidad: string | null; categoria_id: number };
  desde: string;
  hasta: string;
  dias: Array<{ fecha: string; veces: number; suma: number | null; intensidad: number | null }>;
}

// ---------- Unidades en singular o plural ----------

/** Unidades que no cambian: abreviaturas y símbolos ("g", "km/h", "°C"), y palabras iguales en los dos ("dosis"). */
const INVARIABLES = /^(g|mg|kg|ml|l|cc|km|m|cm|mm|h|min|seg|s|ui|°c|%|hpa|aqi|uv|ppm|bpm|kcal|cal|w\/m²|µg\/m³|km\/h|dosis|puff|tele)$/i;

/** "unidad" → "unidades", "vaso" → "vasos", "vez" → "veces", "porción" → "porciones". */
export function plural(palabra: string): string {
  const p = palabra.trim();
  if (!p || INVARIABLES.test(p) || /[^\p{L}]$/u.test(p)) return p;
  if (/[sx]$/i.test(p)) return p; // ya está en plural (o es invariable: "tórax")
  if (/z$/i.test(p)) return p.slice(0, -1) + 'ces';
  if (/ón$/i.test(p)) return p.slice(0, -2) + 'ones';
  if (/[aeiouáéó]$/i.test(p)) return p + 's';
  if (/[íú]$/i.test(p)) return p + 'es';
  return p + 'es';
}

/** "unidades" → "unidad", "vasos" → "vaso", "veces" → "vez", "porciones" → "porción". */
export function singular(palabra: string): string {
  const p = palabra.trim();
  if (!p || INVARIABLES.test(p) || !/s$/i.test(p)) return p;
  if (/ces$/i.test(p)) return p.slice(0, -3) + 'z';
  if (/iones$/i.test(p)) return p.slice(0, -5) + 'ión';
  if (/ones$/i.test(p)) return p.slice(0, -4) + 'ón'; // "limones" → "limón"
  // "unidades", "panes", "flores": vocal + l/n/r/d/j/y + "es" → se saca "es"; "sobres", "tomates", "tazas": solo la s.
  if (/[aeiouáéíóú][lnrdjy]es$/i.test(p)) return p.slice(0, -2);
  return p.slice(0, -1);
}

// En inglés: la unidad se traduce con el diccionario (o queda la que escribió la persona) y se pone en plural con la
// regla del inglés. Las abreviaturas ("mg", "km/h", "°C", "IU") no cambian.
const INVARIABLES_EN = /^(g|mg|kg|ml|l|cc|km|m|cm|mm|h|min|s|sec|iu|°c|%|hpa|aqi|uv|ppm|bpm|kcal|cal|ms)$/i;

function singularIngles(p: string): string {
  if (INVARIABLES_EN.test(p) || /[^\p{L}]/u.test(p) || !/s$/i.test(p) || /ss$/i.test(p)) return p;
  if (/[^aeiou]ies$/i.test(p)) return p.slice(0, -3) + 'y';
  if (/(ss|x|ch|sh)es$/i.test(p)) return p.slice(0, -2);
  return p.slice(0, -1);
}

function pluralIngles(p: string): string {
  if (!p || INVARIABLES_EN.test(p) || /[^\p{L}]/u.test(p)) return p;
  if (/[^aeiou]y$/i.test(p)) return p.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(p)) return p + 'es';
  return p + 's';
}

/** La unidad en inglés y en singular: "vasos" → "glass", "dosis" → "dose", "mg" → "mg", "cups" → "cup". */
function unidadIngles(unidad: string): string {
  const u = unidad.trim();
  const sg = singular(u);
  const t = traducir('en', sg);
  if (t !== sg) return t;
  const tu = traducir('en', u);
  return singularIngles(tu !== u ? tu : u);
}

/** La unidad como corresponde a la cantidad: 1 unidad, 2 unidades, 1 vaso, 3 vasos, 500 mg. */
export function unidadPara(cantidad: number, unidad: string, idioma: Idioma = 'es'): string {
  if (idioma === 'en') {
    const sg = unidadIngles(unidad);
    return Math.abs(cantidad) === 1 ? sg : pluralIngles(sg);
  }
  return Math.abs(cantidad) === 1 ? singular(unidad) : plural(unidad);
}

/** "2 unidades", "1 vaso", "1.5 litros", "500 mg"; sin unidad, solo el número. */
export function conUnidad(cantidad: number, unidad: string | null, decimales = 2, idioma: Idioma = 'es'): string {
  const n = Number(cantidad.toFixed(decimales));
  return unidad ? `${n} ${unidadPara(n, unidad, idioma)}` : String(n);
}

/** Para preguntar: "¿Cuántas unidades?", "¿Cuántos vasos?". */
export function cuantos(unidad: string, idioma: Idioma = 'es'): string {
  if (idioma === 'en') return `How many ${pluralIngles(unidadIngles(unidad))}?`;
  const sg = singular(unidad);
  const femenina = /(a|dad|tad|ión|z|is)$/i.test(sg);
  return `¿${femenina ? 'Cuántas' : 'Cuántos'} ${plural(unidad)}?`;
}

// ---------- Calendario por capas ----------

/** Las capas del calendario de Patrones: qué se pinta en cada día. */
export const CAPAS_CALENDARIO = [
  { clave: 'sueno', nombre: 'Horas de sueño', icono: '😴' },
  { clave: 'animo', nombre: 'Ánimo', icono: '🙂' },
  { clave: 'dolores', nombre: 'Dolores', icono: '🤕' },
  { clave: 'ejercicio', nombre: 'Ejercicio', icono: '🏃' },
  { clave: 'chatarra', nombre: 'Comida chatarra', icono: '🍔' },
  { clave: 'afuera', nombre: 'Comer afuera', icono: '🍽️' },
  { clave: 'clima', nombre: 'Clima', icono: '🌤️' },
  { clave: 'temperatura', nombre: 'Temperatura', icono: '🌡️' },
  { clave: 'pasos', nombre: 'Pasos', icono: '👟' },
  { clave: 'pantalla', nombre: 'Pantalla', icono: '📱' },
  { clave: 'ciclo', nombre: 'Ciclo', icono: '🩸' },
] as const;
export type CapaCalendario = (typeof CAPAS_CALENDARIO)[number]['clave'];

export interface CalendarioCapa {
  capa: CapaCalendario;
  desde: string;
  hasta: string;
  /** Cómo se pinta: por número (de menos a más), con un emoji por día, o sí/no. */
  tipo: 'numero' | 'emoji' | 'si_no';
  unidad: string | null;
  /** Si "más" es mejor (más sueño, más pasos) o peor (más dolor, más chatarra): para elegir los colores. */
  mejor: 'mas' | 'menos' | 'neutro';
  dias: Array<{ fecha: string; valor: number | null; emoji?: string; detalle?: string }>;
  /** Una frase con el resumen del período ("promedio 7 h 10 min", "12 de 30 días con ejercicio"). */
  resumen: string;
}

/** Palabras que hacen que una comida o bebida cuente como chatarra (el nombre normalizado las contiene). */
export const PALABRAS_CHATARRA = [
  'pizza', 'hamburguesa', 'papas fritas', 'papitas', 'pancho', 'hot dog', 'nuggets', 'empanada frita', 'milanesa frita',
  'fritura', 'frito', 'chizito', 'snack', 'palitos', 'galletitas', 'alfajor', 'golosina', 'chocolate', 'caramelo',
  'helado', 'torta', 'factura', 'medialuna', 'donut', 'dona', 'gaseosa', 'coca', 'pepsi', 'sprite', 'fanta', 'energizante',
  'cerveza', 'fernet', 'vino', 'mcdonald', 'burger', 'lomito', 'choripan', 'chori', 'nachos', 'pochoclo',
];

// ---------- Ciclo menstrual ----------

/** El concepto con el que se anota cada día de menstruación (con la intensidad del flujo). */
export const MENSTRUACION = 'Menstruación';
/** Cuánto flujo hubo: se guarda como intensidad. */
export const FLUJO = [
  { nombre: 'Manchado', intensidad: 2 },
  { nombre: 'Poco', intensidad: 4 },
  { nombre: 'Normal', intensidad: 6 },
  { nombre: 'Mucho', intensidad: 9 },
];
/** Síntomas típicos del ciclo, para anotar con un toque (van a «Dolores y molestias»). */
export const SINTOMAS_CICLO = ['Cólicos', 'Hinchazón', 'Sensibilidad en los pechos', 'Antojos', 'Acné', 'Cambios de humor', 'Dolor de cabeza', 'Cansancio'];

export type FaseCiclo = 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea';
export const FASES_CICLO: Record<FaseCiclo, { nombre: string; concepto: string }> = {
  menstrual: { nombre: 'menstrual', concepto: 'Fase menstrual' },
  folicular: { nombre: 'folicular', concepto: 'Fase folicular' },
  ovulatoria: { nombre: 'ovulatoria', concepto: 'Fase ovulatoria' },
  lutea: { nombre: 'lútea', concepto: 'Fase lútea' },
};
/** Los 5 días antes de que venga: aparte de la fase lútea, porque es cuando más síntomas suele haber. */
export const PREMENSTRUAL = 'Días premenstruales';

const diaMs = 86400000;
const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const deFecha = (f: string) => Date.parse(f + 'T00:00:00Z');
const entre = (a: string, b: string) => Math.round((deFecha(b) - deFecha(a)) / diaMs);
const masDias = (f: string, n: number) => aFecha(deFecha(f) + n * diaMs);

export interface Periodo { inicio: string; fin: string; dias: number }

/** Junta los días anotados de menstruación en períodos (un hueco de hasta 2 días es el mismo período). */
export function periodosDe(fechas: string[]): Periodo[] {
  const dias = [...new Set(fechas)].sort();
  const r: Periodo[] = [];
  for (const f of dias) {
    const ultimo = r.at(-1);
    if (ultimo && entre(ultimo.fin, f) <= 3) {
      ultimo.fin = f;
      ultimo.dias = entre(ultimo.inicio, f) + 1;
    } else r.push({ inicio: f, fin: f, dias: 1 });
  }
  return r;
}

export interface ResumenCiclo {
  periodos: Periodo[];
  /** Duración promedio del ciclo (de un inicio al siguiente) y del sangrado, en días. */
  duracion_ciclo: number;
  duracion_periodo: number;
  /** Cuántos ciclos completos se usaron para el promedio (con menos de 2, se usa 28 de referencia). */
  ciclos: number;
  /** Si los ciclos varían poco (menos de 7 días entre el más corto y el más largo). */
  regular: boolean | null;
  /** Hoy: día del ciclo (1 = primer día de menstruación), fase y si está menstruando. */
  dia: number | null;
  fase: FaseCiclo | null;
  en_periodo: boolean;
  /** Lo estimado: próxima menstruación, ovulación y ventana fértil del ciclo actual. */
  proxima: string | null;
  ovulacion: string | null;
  fertil_desde: string | null;
  fertil_hasta: string | null;
  /** Días que faltan para la próxima (negativo: viene con atraso). */
  faltan: number | null;
}

/** La fase de un día dentro de un ciclo de `largo` días (la ovulación, ~14 días antes del próximo). */
export function faseDe(dia: number, largo: number, diasPeriodo: number): FaseCiclo {
  const ovulacion = largo - 14;
  if (dia <= diasPeriodo) return 'menstrual';
  if (Math.abs(dia - ovulacion) <= 1) return 'ovulatoria';
  return dia < ovulacion ? 'folicular' : 'lutea';
}

/** Lo que se puede calcular del ciclo con los días de menstruación anotados, hasta `hoy`. */
export function resumenCiclo(fechas: string[], hoy: string): ResumenCiclo {
  const periodos = periodosDe(fechas.filter((f) => f <= hoy));
  const largos = periodos.slice(1).map((p, i) => entre(periodos[i].inicio, p.inicio)).filter((n) => n >= 15 && n <= 60).slice(-6);
  const duracion_ciclo = largos.length ? Math.round(largos.reduce((a, b) => a + b, 0) / largos.length) : 28;
  const duraciones = periodos.slice(-6).map((p) => p.dias);
  const duracion_periodo = duraciones.length ? Math.max(1, Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length)) : 5;
  const ultimo = periodos.at(-1);
  const vacio = { periodos, duracion_ciclo, duracion_periodo, ciclos: largos.length, regular: null, dia: null, fase: null, en_periodo: false, proxima: null, ovulacion: null, fertil_desde: null, fertil_hasta: null, faltan: null };
  if (!ultimo) return vacio;
  const dia = entre(ultimo.inicio, hoy) + 1;
  const en_periodo = entre(ultimo.fin, hoy) <= 1 && dia <= 10;
  const proxima = masDias(ultimo.inicio, duracion_ciclo);
  const ovulacion = masDias(proxima, -14);
  return {
    ...vacio,
    regular: largos.length >= 2 ? Math.max(...largos) - Math.min(...largos) < 7 : null,
    dia,
    fase: en_periodo ? 'menstrual' : faseDe(dia, duracion_ciclo, ultimo.dias),
    en_periodo,
    proxima,
    ovulacion,
    fertil_desde: masDias(ovulacion, -5),
    fertil_hasta: masDias(ovulacion, 1),
    faltan: entre(hoy, proxima),
  };
}

/**
 * Para los patrones: la fase de cada día del pasado según los períodos anotados (y si es premenstrual). Solo entre dos
 * menstruaciones conocidas, o después de la última hasta su largo promedio.
 */
export function fasesPorDia(fechas: string[], desde: string, hasta: string): Map<string, { fase: FaseCiclo; premenstrual: boolean }> {
  const r = new Map<string, { fase: FaseCiclo; premenstrual: boolean }>();
  const periodos = periodosDe(fechas);
  if (periodos.length < 2) return r;
  const { duracion_ciclo } = resumenCiclo(fechas, hasta);
  periodos.forEach((p, i) => {
    const siguiente = periodos[i + 1]?.inicio ?? masDias(p.inicio, duracion_ciclo);
    const largo = entre(p.inicio, siguiente);
    if (largo < 15 || largo > 60) return;
    for (let k = 0; k < largo; k++) {
      const f = masDias(p.inicio, k);
      if (f < desde || f > hasta) continue;
      r.set(f, { fase: faseDe(k + 1, largo, p.dias), premenstrual: largo - k <= 5 });
    }
  });
  return r;
}

// ---------- Estaciones ----------

export type Estacion = 'verano' | 'otono' | 'invierno' | 'primavera';
export const ESTACIONES: Record<Estacion, { nombre: string; icono: string }> = {
  verano: { nombre: 'Verano', icono: '☀️' },
  otono: { nombre: 'Otoño', icono: '🍂' },
  invierno: { nombre: 'Invierno', icono: '❄️' },
  primavera: { nombre: 'Primavera', icono: '🌸' },
};

/** Si la zona horaria es del hemisferio sur (las estaciones están al revés). */
export function hemisferioSur(zona: string): boolean {
  return /^(America\/(Argentina|Buenos_Aires|Cordoba|Santiago|Montevideo|Asuncion|Sao_Paulo|Rio_Branco|La_Paz|Lima|Punta_Arenas|Campo_Grande|Cuiaba|Porto_Velho|Belem|Fortaleza|Recife|Maceio|Bahia|Araguaina)|Australia\/|Pacific\/(Auckland|Fiji|Chatham|Tongatapu|Apia)|Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi)|Indian\/(Mauritius|Reunion|Antananarivo)|Antarctica\/)/.test(zona);
}

/** La estación de una fecha (AAAA-MM-DD), con los cambios el 21 de marzo, junio, septiembre y diciembre. */
export function estacionDe(fecha: string, zona: string): Estacion {
  const md = fecha.slice(5);
  const norte: Estacion = md >= '12-21' || md < '03-21' ? 'invierno' : md < '06-21' ? 'primavera' : md < '09-21' ? 'verano' : 'otono';
  if (!hemisferioSur(zona)) return norte;
  return ({ invierno: 'verano', primavera: 'otono', verano: 'invierno', otono: 'primavera' } as const)[norte];
}

// ---------- Apodos ----------

/** Diminutivos y apodos comunes en castellano (rioplatense) de los nombres más usados. */
const APODOS: Record<string, string> = {
  agustin: 'Agus', agustina: 'Agus', alejandro: 'Ale', alejandra: 'Ale', alexis: 'Alex', alberto: 'Beto', andres: 'Andy', andrea: 'Andre',
  antonio: 'Toni', antonella: 'Anto', barbara: 'Barbi', beatriz: 'Bea', bernardo: 'Berni', carolina: 'Caro', catalina: 'Cata',
  cecilia: 'Ceci', claudio: 'Clau', claudia: 'Clau', constanza: 'Coni', cristian: 'Cris', cristina: 'Cris', daniel: 'Dani', daniela: 'Dani',
  eduardo: 'Edu', emiliano: 'Emi', emilia: 'Emi', enrique: 'Quique', esteban: 'Teban', eugenia: 'Euge', ezequiel: 'Eze', federico: 'Fede',
  fernando: 'Fer', fernanda: 'Fer', florencia: 'Flor', francisco: 'Fran', francisca: 'Fran', franco: 'Fran', gabriel: 'Gabi', gabriela: 'Gabi',
  gonzalo: 'Gonza', graciela: 'Graci', guadalupe: 'Guada', guillermo: 'Guille', gustavo: 'Gus', ignacio: 'Nacho', ines: 'Ine', isabel: 'Isa',
  jacinto: 'Jacho', javier: 'Javi', jeronimo: 'Jero', joaquin: 'Joaco', jorge: 'Coco', jose: 'Pepe', josefina: 'Jose', juan: 'Juan',
  juliana: 'Juli', julian: 'Juli', julieta: 'Juli', leandro: 'Lea', leonardo: 'Leo', lorena: 'Lore', lucas: 'Luqui', lucia: 'Lu',
  luciana: 'Lu', luciano: 'Lucho', luis: 'Lucho', magdalena: 'Magui', manuel: 'Manu', manuela: 'Manu', marcelo: 'Marce', marcela: 'Marce',
  margarita: 'Marga', maria: 'Mari', mariana: 'Marian', martin: 'Tincho', martina: 'Tini', matias: 'Mati', mercedes: 'Meche', micaela: 'Mica',
  miguel: 'Migue', milagros: 'Mili', natalia: 'Nati', nicolas: 'Nico', nicole: 'Nico', norberto: 'Beto', pablo: 'Pablito', patricia: 'Pato',
  patricio: 'Pato', paula: 'Pau', pilar: 'Pili', rafael: 'Rafa', ramiro: 'Rama', ricardo: 'Richard', roberto: 'Beto', rocio: 'Ro',
  rodrigo: 'Rodri', rosario: 'Charo', santiago: 'Santi', sebastian: 'Seba', sergio: 'Checho', sofia: 'Sofi', soledad: 'Sole',
  susana: 'Su', teresa: 'Tere', tomas: 'Tomi', valentin: 'Valen', valentina: 'Valen', valeria: 'Vale', veronica: 'Vero', victoria: 'Vicky',
  ximena: 'Xime', jimena: 'Jime', yamila: 'Yami', camila: 'Cami', camilo: 'Cami', facundo: 'Facu', maximiliano: 'Maxi', maximo: 'Maxi',
  bautista: 'Bauti', benjamin: 'Benja', gregorio: 'Goyo', dolores: 'Lola', consuelo: 'Chelo', ana: 'Anita', sara: 'Sari',
  elizabeth: 'Eli', elena: 'Ele', silvina: 'Silvi', silvia: 'Silvi', laura: 'Lau', lautaro: 'Lauti', luana: 'Lua', mateo: 'Mateo',
  michael: 'Mike', william: 'Will', robert: 'Rob', richard: 'Rich', katherine: 'Kate', jennifer: 'Jen', christopher: 'Chris',
  matthew: 'Matt', anthony: 'Tony', joseph: 'Joe', james: 'Jim', thomas: 'Tom', nicholas: 'Nick', alexander: 'Alex', samuel: 'Sam',
  samantha: 'Sam', jonathan: 'Jon', rebecca: 'Becky', margaret: 'Maggie', patrick: 'Pat',
};

/**
 * Cómo le dice Patty a una persona: el apodo que eligió o, si no, el diminutivo de su primer nombre ("Rodrigo Butta" →
 * "Rodri", "María José" → "Majo"). Si no se conoce un diminutivo, el primer nombre tal cual.
 */
export function apodoDe(nombre: string, elegido?: string | null): string {
  if (elegido?.trim()) return elegido.trim();
  const limpio = nombre.includes('@') ? nombre.split('@')[0].replace(/[._\d]+/g, ' ') : nombre;
  const partes = limpio.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dos = partes.slice(0, 2).map(norm).join(' ');
  const compuestos: Record<string, string> = { 'maria jose': 'Majo', 'maria laura': 'Malu', 'maria luz': 'Malu', 'maria eugenia': 'Euge', 'maria florencia': 'Flor', 'maria paz': 'Mapi', 'juan pablo': 'Juampi', 'juan manuel': 'Juanma', 'juan martin': 'Juanma', 'juan cruz': 'Juancho', 'juan ignacio': 'Juani', 'maria belen': 'Belu', 'ana paula': 'Anapau' };
  if (compuestos[dos]) return compuestos[dos];
  const primero = partes[0];
  const apodo = APODOS[norm(primero)];
  return apodo ?? primero.charAt(0).toUpperCase() + primero.slice(1);
}

// ---------- Puntos del día ----------

/** Lo que suma puntos en un día: lo esencial (comidas, cómo te sentís, sueño) vale más. La meta es 100; cada cosa más suma 2 (se puede pasar). */
export type ItemPuntos = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'animo' | 'sueno' | 'remedios' | 'movimiento' | 'bebida' | 'extras';

export const ITEMS_PUNTOS: Record<ItemPuntos, { nombre: string; icono: string; puntos: number }> = {
  desayuno: { nombre: 'Desayuno', icono: '☕', puntos: 10 },
  almuerzo: { nombre: 'Almuerzo', icono: '🍝', puntos: 10 },
  merienda: { nombre: 'Merienda', icono: '🧉', puntos: 10 },
  cena: { nombre: 'Cena', icono: '🍽️', puntos: 10 },
  animo: { nombre: 'Cómo te sentís', icono: '🙂', puntos: 15 },
  sueno: { nombre: 'Cómo dormiste', icono: '😴', puntos: 15 },
  remedios: { nombre: 'Remedios al día', icono: '💊', puntos: 10 },
  movimiento: { nombre: 'Movimiento', icono: '🏃', puntos: 5 },
  bebida: { nombre: 'Qué tomaste', icono: '🥤', puntos: 5 },
  extras: { nombre: 'Algo más', icono: '✨', puntos: 2 },
};

export interface PuntosDia {
  fecha: string;
  puntos: number;
  /** Cada cosa que suma, con cuánto sumó y cuánto puede sumar (para mostrar lo que falta). */
  items: Array<{ clave: ItemPuntos; puntos: number; maximo: number }>;
}

/** En qué comida cae una hora (minutos desde las 0, hora local): desayuno 5–11, almuerzo 11–16, merienda 16–19:30. */
export function comidaDeLaHora(minutos: number): 'desayuno' | 'almuerzo' | 'merienda' | 'cena' {
  if (minutos >= 300 && minutos < 660) return 'desayuno';
  if (minutos >= 660 && minutos < 960) return 'almuerzo';
  if (minutos >= 960 && minutos < 1170) return 'merienda';
  return 'cena';
}

/**
 * Los puntos de un día con lo anotado (categoría y hora local de cada registro), las categorías que llegaron solas
 * (sueño o pasos del reloj) y las tomas de remedios del día. Cada anotación de más suma 2, sin tope.
 */
export function calcularPuntos(o: {
  fecha: string;
  registros: Array<{ categoria: string; minutos: number; concepto?: string }>;
  medidas: string[];
  tomas: { total: number; marcadas: number };
}): PuntosDia {
  const cats = new Set(o.registros.map((r) => r.categoria));
  // Una comida cuenta en la franja de su hora; una bebida también (dos cafés a la tarde son la merienda), menos el agua.
  const esAgua = (c?: string) => Boolean(c && normalizar(c).startsWith('agua'));
  const comidas = new Set(
    o.registros.filter((r) => r.categoria === 'comida' || (r.categoria === 'bebida' && !esAgua(r.concepto))).map((r) => comidaDeLaHora(r.minutos)),
  );
  const conRemedios = o.tomas.total > 0;
  const items: PuntosDia['items'] = [];
  const poner = (clave: ItemPuntos, si: boolean | number, maximo = ITEMS_PUNTOS[clave].puntos) =>
    items.push({ clave, maximo, puntos: typeof si === 'number' ? Math.min(maximo, Math.round(si)) : si ? maximo : 0 });
  for (const c of ['desayuno', 'almuerzo', 'merienda', 'cena'] as const) poner(c, comidas.has(c));
  poner('animo', cats.has('animo'));
  poner('sueno', cats.has('sueno') || o.medidas.includes('sueno'));
  if (conRemedios) poner('remedios', (o.tomas.marcadas / o.tomas.total) * ITEMS_PUNTOS.remedios.puntos);
  poner('movimiento', cats.has('actividad') || o.medidas.includes('actividad'));
  poner('bebida', cats.has('bebida'));
  // Todo lo demás suma 2 por cada cosa, sin tope (otra vez cómo te sentís, más actividades, dolores, baño…): así cada
  // anotación se nota. Las tomas de remedios no, porque ya cuentan en "remedios al día".
  const usadas =
    comidas.size + Number(cats.has('animo')) + Number(cats.has('sueno')) + Number(cats.has('actividad')) + Number(cats.has('bebida'));
  const otras = Math.max(0, o.registros.filter((r) => r.categoria !== 'medicacion').length - usadas);
  items.push({ clave: 'extras', puntos: otras * 2, maximo: otras * 2 });
  return { fecha: o.fecha, puntos: items.reduce((a, b) => a + b.puntos, 0), items };
}

/** Desde cuántos puntos un día cuenta para la racha. */
export const PUNTOS_RACHA = 50;

// ---------- Viajes ----------

export type ModoViaje = 'caminando' | 'bici' | 'auto' | 'colectivo' | 'tren' | 'taxi';
export const MODOS_VIAJE: Record<ModoViaje, { nombre: string; icono: string; concepto: string }> = {
  caminando: { nombre: 'Caminando', icono: '🚶', concepto: 'Viaje caminando' },
  bici: { nombre: 'Bici', icono: '🚲', concepto: 'Viaje en bici' },
  auto: { nombre: 'Auto', icono: '🚗', concepto: 'Viaje en auto' },
  colectivo: { nombre: 'Colectivo', icono: '🚌', concepto: 'Viaje en colectivo' },
  tren: { nombre: 'Tren o subte', icono: '🚆', concepto: 'Viaje en tren o subte' },
  taxi: { nombre: 'Taxi o Uber', icono: '🚕', concepto: 'Viaje en taxi' },
};
/** Cómo fue el viaje: se guarda como intensidad (cuánto pesó) y, si fue pesado, además como "Viaje pesado". */
export const COMO_VIAJE = [
  { clave: 'tranquilo', nombre: 'Tranquilo', icono: '😌', intensidad: 2 },
  { clave: 'normal', nombre: 'Normal', icono: '😐', intensidad: 5 },
  { clave: 'pesado', nombre: 'Pesado', icono: '😩', intensidad: 8 },
] as const;
export const VIAJE_PESADO = 'Viaje pesado';

/** Un viaje detectado con la ubicación, con lo que se adivina (en qué fue y si fue pesado) y si ya se contó. */
export interface ViajeDelDia {
  inicio: string;
  fin: string;
  minutos: number;
  km: number;
  /** km/h promedio */
  velocidad: number;
  modo: ModoViaje;
  /** Lo que se deduce en palabras ("Lento para ir en auto: ¿tráfico?"). */
  pista: string;
  pesado: boolean;
  /** Si ya se contó cómo fue (hay un registro de viaje a esa hora). */
  contado: boolean;
}

/** Qué se adivina de un viaje por su velocidad y largo: en qué fue y si parece pesado (tráfico, mucho tiempo). */
export function adivinarViaje(km: number, minutos: number): { modo: ModoViaje; pista: string; pesado: boolean } {
  const v = km / Math.max(minutos / 60, 1 / 60);
  if (v < 6) return { modo: 'caminando', pista: 'A paso de caminata', pesado: minutos >= 50 };
  if (v < 16)
    return km >= 6
      ? { modo: 'auto', pista: 'Lento para ir en auto o colectivo: ¿tráfico?', pesado: true }
      : { modo: 'bici', pista: 'A velocidad de bici (o con tráfico)', pesado: minutos >= 45 };
  if (v < 40) return { modo: 'auto', pista: 'Velocidad de ciudad', pesado: minutos >= 50 };
  return { modo: 'auto', pista: 'Rápido: ruta, autopista o tren', pesado: minutos >= 90 };
}
