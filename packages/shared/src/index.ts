// Reglas y tipos que comparten la API y la web.

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
  { clave: 'otro', nombre: 'Otro', icono: '📝', rol: 'ambos', tipo_valor: 'evento', unidad: null, orden: 12 },
];

/** Conceptos que conviene que existan desde el principio (los que van a llenar los relojes y el clima). */
export const CONCEPTOS_INICIALES: Array<{ categoria: string; nombre: string; tipo_valor: TipoValor; unidad: string | null }> = [
  { categoria: 'sueno', nombre: 'Me levanté', tipo_valor: 'hora', unidad: null },
  { categoria: 'sueno', nombre: 'Me acosté', tipo_valor: 'hora', unidad: null },
  { categoria: 'sueno', nombre: 'Siesta', tipo_valor: 'duracion', unidad: 'min' },
  { categoria: 'clima', nombre: 'Temperatura', tipo_valor: 'medida', unidad: '°C' },
  { categoria: 'clima', nombre: 'Humedad', tipo_valor: 'medida', unidad: '%' },
  { categoria: 'actividad', nombre: 'Pasos', tipo_valor: 'medida', unidad: 'pasos' },
  { categoria: 'comunicacion', nombre: 'Llamadas', tipo_valor: 'cantidad', unidad: null },
  { categoria: 'pantalla', nombre: 'Tiempo de pantalla', tipo_valor: 'medida', unidad: 'min' },
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

// ---------- Respuestas de la API ----------

export type RolUsuario = 'admin' | 'editor' | 'lector';

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  rol: RolUsuario;
  email: string | null;
}

export interface Sesion {
  configurar: boolean;
  usuario: Usuario | null;
  google: string | null;
  ia: boolean;
}

export interface Persona {
  id: number;
  nombre: string;
  zona_horaria: string;
  nacimiento: string | null;
  notas: string | null;
}

export interface Categoria extends CategoriaBase {
  id: number;
}

export interface Concepto {
  id: number;
  categoria_id: number;
  nombre: string;
  tipo_valor: TipoValor;
  unidad: string | null;
  usos: number;
}

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
}

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
}

export type EstadoHallazgo = 'nuevo' | 'confirmado' | 'descartado';
/** presente = ese día hubo; alto / bajo = ese día el valor estuvo por encima / debajo de lo habitual de la persona */
export type Modo = 'presente' | 'alto' | 'bajo';

/** "Tomate", "Menos energía", "Me acosté tarde": cómo se nombra un rasgo de un día (alto y bajo, respecto de lo habitual). */
export function nombreRasgo(nombre: string, tipo: TipoValor, modo: Modo): string {
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
