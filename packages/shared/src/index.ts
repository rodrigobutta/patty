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
  { clave: 'lugar', nombre: 'Lugares y salidas', icono: '📍', rol: 'causa', tipo_valor: 'duracion', unidad: 'min', orden: 12 },
  { clave: 'otro', nombre: 'Otro', icono: '📝', rol: 'ambos', tipo_valor: 'evento', unidad: null, orden: 13 },
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

/** Moverse más que esto desde el último punto guardado cuenta como un viaje (y se guarda un punto nuevo). */
export const DISTANCIA_VIAJE_M = 1000;
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
 * DISTANCIA_VIAJE_M, o entró o salió de un lugar con nombre. Así no se guarda un punto cada vez que se abre la app.
 */
export function puntoNuevo<L extends Coordenadas & { id: number; radio_m: number }>(
  anterior: (Coordenadas & { dia: string }) | null,
  p: Coordenadas & { dia: string },
  lugares: L[],
): boolean {
  if (!anterior || anterior.dia !== p.dia) return true;
  if (distanciaMetros(anterior, p) >= DISTANCIA_VIAJE_M) return true;
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
export function dosisTexto(dosis: number | null, unidad: string | null): string {
  if (dosis === null) return unidad ?? '';
  if (!unidad) return String(dosis);
  const plural = dosis !== 1 && /^(comprimido|cápsula|sobre|cucharada|puff)$/.test(unidad) ? 's' : '';
  return `${Number(dosis.toFixed(2))} ${unidad}${plural}`;
}

/** "cada 8 h", "a las 09:00 y 21:00", "cuando haga falta" */
export function frecuenciaTexto(t: Pick<Tratamiento, 'cada_horas' | 'horarios'>): string {
  if (t.cada_horas) return t.cada_horas === 24 ? 'una vez por día' : `cada ${Number(t.cada_horas.toFixed(1))} h`;
  if (t.horarios.length) {
    const h = [...t.horarios].sort();
    return `todos los días a las ${h.length === 1 ? h[0] : h.slice(0, -1).join(', ') + ' y ' + h.at(-1)}`;
  }
  return 'cuando haga falta';
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
export function perfilTexto(p: Pick<Persona, 'nacimiento' | 'sexo' | 'altura_cm' | 'peso_kg' | 'condiciones'>, hoy = new Date()): string {
  const partes: string[] = [];
  if (p.sexo) partes.push(p.sexo === 'femenino' ? 'mujer' : p.sexo === 'masculino' ? 'varón' : 'otro sexo');
  if (p.nacimiento) {
    const n = new Date(p.nacimiento + 'T12:00:00Z');
    let edad = hoy.getUTCFullYear() - n.getUTCFullYear();
    if (hoy.getUTCMonth() < n.getUTCMonth() || (hoy.getUTCMonth() === n.getUTCMonth() && hoy.getUTCDate() < n.getUTCDate())) edad--;
    if (edad >= 0 && edad < 130) partes.push(`${edad} años`);
  }
  if (p.altura_cm) partes.push(`${(p.altura_cm / 100).toFixed(2).replace('.', ',')} m`);
  if (p.peso_kg) partes.push(`${String(Number(p.peso_kg.toFixed(1))).replace('.', ',')} kg`);
  const texto = partes.join(', ');
  const cond = p.condiciones?.length ? `condiciones: ${p.condiciones.join(', ').toLowerCase()}` : '';
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
}

/** Los días en que pasó algo puntual (para el calendario del buscador). */
export interface SerieConcepto {
  concepto: { id: number; nombre: string; tipo_valor: TipoValor; unidad: string | null; categoria_id: number };
  desde: string;
  hasta: string;
  dias: Array<{ fecha: string; veces: number; suma: number | null; intensidad: number | null }>;
}
