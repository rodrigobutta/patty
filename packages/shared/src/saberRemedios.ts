// Lo que Patty sabe de lo que una persona toma: efectos e interacciones de cada remedio (información general, de una tabla
// compartida que llena la IA), las vitaminas y suplementos que carga, cuándo un síntoma coincide con un efecto posible y qué
// cubre o podría faltar. Todo se dice como posibilidad, nunca como diagnóstico, y nunca sugiere dejar, cambiar ni ajustar un
// remedio ni comprar un suplemento: los textos fijos están acá para poder revisarlos todos juntos (ver esTextoSeguro).
import { traducir, type Idioma } from './i18n.js';

export interface EfectoRemedio {
  nombre: string;
  /** Si aparece, conviene consultar pronto. Se destaca sin alarmar. */
  urgente: boolean;
}

export interface InteraccionRemedio {
  con: string;
  detalle: string;
  /** Lo que nombra también está en lo que toma esta persona. */
  tambien_toma: boolean;
}

/**
 * pendiente: todavía no se averiguó (o la IA no está). conocido: hay datos. desconocido: la IA no reconoce ese nombre, y entonces
 * se dice que no se sabe. fallido: se acabaron los intentos (para la persona, igual que no saber).
 */
export type EstadoSaber = 'pendiente' | 'conocido' | 'desconocido' | 'fallido';

/** Un remedio o suplemento que la persona toma ahora, con lo que se está vigilando. */
export interface RemedioVigilado {
  clave: string;
  nombre: string;
  /** Sus tratamientos y suplementos (para mostrarlo en cada renglón). */
  tratamiento_ids: number[];
  suplemento_ids: number[];
  estado: EstadoSaber;
  efectos: EfectoRemedio[];
  interacciones: InteraccionRemedio[];
}

/** Cuando un síntoma anotado coincide con un efecto posible de algo que toma. Se calcula al pedirlo: no queda guardado. */
export interface SenalEfecto {
  registro_id: number;
  concepto_id: number;
  sintoma: string;
  /** El día de Patty del síntoma. */
  fecha: string;
  clave: string;
  remedio: string;
  efecto: string;
  urgente: boolean;
}

/** Lo que se puede contar de un suplemento: las vitaminas y minerales de siempre; lo demás va como "otro", con su nombre. */
export const NUTRIENTES = [
  { clave: 'vitamina_a', nombre: 'Vitamina A' },
  { clave: 'vitamina_b12', nombre: 'Vitamina B12' },
  { clave: 'folato', nombre: 'Ácido fólico' },
  { clave: 'vitamina_c', nombre: 'Vitamina C' },
  { clave: 'vitamina_d', nombre: 'Vitamina D' },
  { clave: 'vitamina_e', nombre: 'Vitamina E' },
  { clave: 'vitamina_k', nombre: 'Vitamina K' },
  { clave: 'calcio', nombre: 'Calcio' },
  { clave: 'hierro', nombre: 'Hierro' },
  { clave: 'magnesio', nombre: 'Magnesio' },
  { clave: 'zinc', nombre: 'Zinc' },
  { clave: 'potasio', nombre: 'Potasio' },
  { clave: 'omega_3', nombre: 'Omega 3' },
] as const;
export type ClaveNutriente = (typeof NUTRIENTES)[number]['clave'];
export const CLAVES_NUTRIENTES = NUTRIENTES.map((n) => n.clave) as string[];
export const nombreNutriente = (clave: string): string | null => NUTRIENTES.find((n) => n.clave === clave)?.nombre ?? null;

export interface ComponenteSuplemento {
  /** Una de NUTRIENTES, u "otro". */
  nutriente: string;
  /** Cómo se llama, si es "otro" (y el que corresponda en los demás). */
  nombre: string;
  /** La cantidad por toma; null si no se sabe. */
  cantidad: number | null;
  unidad: string | null;
}

/**
 * De dónde salió lo que dice que contiene: foto (se leyó del envase), ia (es lo típico de ese nombre), persona (lo cargó o
 * corrigió ella), o sin_dato.
 */
export type FuenteContenido = 'foto' | 'ia' | 'persona' | 'sin_dato';

export interface Suplemento {
  id: number;
  persona_id: number;
  nombre: string;
  clave: string;
  contenido: ComponenteSuplemento[];
  fuente: FuenteContenido;
  /** Salió de la foto (o de la IA) y después se corrigió. */
  corregido: boolean;
  /** Cuándo lo empezó a tomar (ISO). */
  desde: string;
  terminado: string | null;
  activo: boolean;
}

export interface NuevoSuplemento {
  persona_id: number;
  nombre: string;
  /** Sin contenido: se usa lo típico de ese nombre, si la IA lo conoce. */
  contenido?: ComponenteSuplemento[] | null;
  origen?: 'nombre' | 'foto';
  /** Se revisó lo leído de la foto y se cambió algo antes de guardar. */
  corregido?: boolean;
}

/** Lo que se leyó en la foto del envase: una propuesta, no se guarda hasta que la persona la revisa. */
export interface LecturaEnvase {
  reconocido: boolean;
  nombre: string;
  contenido: ComponenteSuplemento[];
}

/**
 * toma: lo tiene en algo que toma. comida: aparece en lo que anotó que come. poco: aparece poco en lo anotado (no quiere decir que
 * falte). sin_dato: todavía no hay suficiente anotado para decir algo.
 */
export type EstadoNutriente = 'toma' | 'comida' | 'poco' | 'sin_dato';

export interface NutrienteCubierto {
  clave: ClaveNutriente;
  estado: EstadoNutriente;
  /** Lo que toma y lo tiene, con la cantidad si se sabe. */
  toma: Array<{ nombre: string; cantidad: number | null; unidad: string | null; fuente: FuenteContenido }>;
  /** Lo anotado que lo suele tener, de lo que más aparece a lo que menos. */
  alimentos: string[];
  /** En cuántos de los días con comidas anotadas apareció. */
  dias: number;
}

export interface Cobertura {
  desde: string;
  hasta: string;
  /** Cuántos días tienen comidas anotadas. */
  dias_con_comida: number;
  /** Si alcanza para decir algo de la comida. */
  suficiente: boolean;
  nutrientes: NutrienteCubierto[];
}

// ---------- Los textos ----------

export const AVISO_INFORMACION_GENERAL = 'Información general generada con IA: puede tener errores. Es una posibilidad, no un diagnóstico.';
export const AVISO_DECIDE_EL_MEDICO = 'Cualquier cambio en lo que tomás lo decide tu médico.';
export const NO_SE_DE_ESTE_REMEDIO = 'No tengo información sobre este remedio y prefiero no inventar. Tu médico o farmacéutico te pueden contar.';
export const TODAVIA_AVERIGUANDO = 'Todavía no tengo información sobre este: lo voy a averiguar en cuanto pueda.';
export const AVISO_URGENTE = 'Esto conviene consultarlo pronto, sobre todo si es fuerte o aparece de golpe. Si no podés hablar con tu médico, andá a una guardia.';
export const PODRIA_REVISAR = 'Aparece poco en lo que anotaste, y eso no quiere decir que te falte. Podría valer la pena revisar con tu médico.';
export const INTERACCION_TAMBIEN_TOMAS = 'También lo tenés entre lo que tomás: hablalo con tu médico o farmacéutico.';
export const AVISO_COBERTURA = 'Es una estimación con lo que anotaste, no un análisis ni una recomendación.';
export const FOTO_NO_LEIDA = 'No pude leer bien el envase. Cargá el nombre a mano o probá con otra foto.';

/** Lo que Patty le dice a la persona cuando lo que anotó coincide con un efecto posible de algo que toma. */
export function textoSenal(s: Pick<SenalEfecto, 'remedio' | 'efecto' | 'urgente'>, idioma: Idioma = 'es'): string {
  return s.urgente
    ? traducir(idioma, '«{efecto}» está entre lo que conviene consultar pronto si aparece mientras tomás {remedio}. Puede no tener nada que ver, y lo tengo en cuenta. {urgente}', { efecto: s.efecto, remedio: s.remedio, urgente: traducir(idioma, AVISO_URGENTE) })
    : traducir(idioma, 'Esto puede tener relación con {remedio}: «{efecto}» figura entre sus efectos posibles. Lo tengo en cuenta. Si se repite o te preocupa, hablalo con tu médico.', { efecto: s.efecto, remedio: s.remedio });
}

/** Lo que Patty nunca dice, en castellano y en inglés: que deje, cambie o ajuste un remedio o su dosis, o que compre un suplemento. */
const PROHIBIDO = [
  /\bdej\w* de (tomar\w*|usar\w*)\b/,
  /\bdej[aá] (el|la|los|las|ese|esa|este|esta) \w*/,
  /\bsuspend\w*/,
  /\binterrump\w*/,
  /\bdiscontinu\w*/,
  /\bno (lo|la|los|las) tomes\b/,
  /\b(baj|sub|reduc|disminu|aument|ajust|modific|cambi|duplic)\w* (de |la |el |tu |su |los |las )*(dosis|remedio|remedios|medicacion|medicamento|medicamentos|tratamiento)\b/,
  /\b(compra|compre|compres|compran|compralo|comprala|comprar)\b/,
  /\b(toma|tomate|sumale|agregale|agrega|empeza a tomar) (un|una|el|la) (suplemento|multivitaminico)\b/,
  /\b(stop|quit|skip) (taking|using)\b/,
  /\b(stop|discontinue|pause) (the|your|this) (medication|medicine|drug|treatment|dose)\b/,
  /\b(reduce|lower|raise|increase|adjust|change|double) (the|your|this) (dose|dosage|medication|medicine|treatment)\b/,
  /\bdose (reduction|adjustment|change)\b/,
  /\b(buy|purchase) /,
  /\b(tenes|padeces|sufris) (un|una|el|la)\b.*\b(diagnostico|enfermedad)\b/,
];

const sinTildes = (x: string) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Si un texto respeta los límites. Con esto se revisa lo que devuelve la IA antes de guardarlo, y los textos fijos en las pruebas. */
export function esTextoSeguro(texto: string): boolean {
  const t = sinTildes(texto);
  return !PROHIBIDO.some((r) => r.test(t));
}
