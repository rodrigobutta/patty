// Los objetivos de la persona ("dormir mejor", "comer menos grasas" o lo que escriba): duran hasta que los cumple, pausa o
// borra, y cada uno tiene su plan. En el código se llaman "metas" porque `objetivos` ya son los suaves de una semana que propone
// el resumen del domingo (ver lib/objetivos.ts en la API); en la interfaz, los dos son objetivos.
//
// Acá van las sugerencias listas, con el plan que se usa si no hay IA, y cómo reconocer un objetivo que suena médico. Todo el
// texto es la clave de traducción (ver i18n/en/metas.ts).
import { traducir, type Idioma } from './i18n.js';

const COMPONENTES_GRASA = 'Días con mucha grasa';
const COMO_ME_SIENTO_META = 'Cómo me siento';

export type EstadoMeta = 'activa' | 'pausada' | 'cumplida';
export const ESTADOS_META: EstadoMeta[] = ['activa', 'pausada', 'cumplida'];

export interface PasoPlan {
  texto: string;
  /** El dato de Patty que lo mide (un concepto), o vacío si ninguno. */
  mide: string;
}

export interface PlanMeta {
  resumen: string;
  pasos: PasoPlan[];
  /** Para el Día, si no hay IA o falla: preguntas de sí o no, y consejos. */
  preguntas: string[];
  consejos: string[];
  /** De dónde salió: la IA, o el plan de base. */
  origen: 'ia' | 'base';
  creado: string;
}

/** Cómo viene un dato: esta semana (los últimos 7 días) contra la anterior. */
export interface MedidaMeta {
  nombre: string;
  /** promedio: por día con datos. dias: cuántos días de los 7 apareció. */
  como: 'promedio' | 'dias';
  unidad: string | null;
  ahora: number | null;
  antes: number | null;
}

export interface Meta {
  id: number;
  persona_id: number;
  texto: string;
  emoji: string;
  clave: string | null;
  estado: EstadoMeta;
  plan: PlanMeta;
  /** Suena médico: Patty solo da consejos generales, y se lo aclara. */
  medico: boolean;
  medidas: MedidaMeta[];
}

export type RespuestaConsejo = 'si' | 'mas_o_menos' | 'no';

/** El seguimiento del objetivo en el Día: un consejo o una pregunta, uno solo por día. */
export interface ConsejoDelDia {
  id: number;
  meta_id: number;
  fecha: string;
  tipo: 'consejo' | 'pregunta';
  texto: string;
  estado: 'nuevo' | 'visto' | 'gusta' | 'respondido';
  respuesta: RespuestaConsejo | null;
  objetivo: string;
  emoji: string;
  medida: MedidaMeta | null;
  /** Cuántos objetivos activos más tiene. */
  otros: number;
}

/**
 * Los datos de Patty que sirven para medir un objetivo. Lo que no está acá también se puede medir (cualquier cosa que la persona
 * anote), contando en cuántos días apareció.
 */
export const MEDIDAS_META: Array<{ nombre: string; como: 'promedio' | 'dias'; de?: 'suma' | 'veces' | 'intensidad'; unidad?: string }> = [
  { nombre: 'Horas de sueño', como: 'promedio', de: 'suma', unidad: 'h' },
  { nombre: 'Calidad del sueño', como: 'promedio', de: 'suma', unidad: '/10' },
  { nombre: 'Pasos', como: 'promedio', de: 'suma' },
  { nombre: 'Minutos de ejercicio', como: 'promedio', de: 'suma', unidad: 'min' },
  { nombre: 'Tiempo de pantalla', como: 'promedio', de: 'suma', unidad: 'min' },
  { nombre: 'Vaso de agua', como: 'promedio', de: 'veces' },
  { nombre: COMO_ME_SIENTO_META, como: 'promedio', de: 'intensidad', unidad: '/10' },
  { nombre: 'Caminata', como: 'dias' },
  { nombre: 'Con verdura', como: 'dias' },
  { nombre: COMPONENTES_GRASA, como: 'dias' },
  { nombre: 'Días con mucha azúcar', como: 'dias' },
  { nombre: 'Días con mucha sal', como: 'dias' },
  { nombre: 'Días con mucha fibra', como: 'dias' },
];

interface PlantillaMeta {
  clave: string;
  texto: string;
  emoji: string;
  /** Palabras (normalizadas) que hacen que un texto libre use este plan. */
  palabras: string[];
  resumen: string;
  pasos: PasoPlan[];
  preguntas: string[];
  consejos: string[];
}

export const SUGERENCIAS_META: PlantillaMeta[] = [
  {
    clave: 'dormir_mejor',
    texto: 'Dormir mejor',
    emoji: '😴',
    palabras: ['dormir', 'duermo', 'sueno', 'descansar', 'insomnio', 'sleep', 'rest'],
    resumen: 'Un horario más parejo y una noche con menos estímulos, de a un cambio por vez.',
    pasos: [
      { texto: 'Acostarte y levantarte a una hora parecida, también el fin de semana.', mide: 'Horas de sueño' },
      { texto: 'Dejar la pantalla un rato antes de acostarte.', mide: 'Tiempo de pantalla' },
      { texto: 'Cortar el café después del mediodía y ver cómo amanecés.', mide: 'Calidad del sueño' },
    ],
    preguntas: ['¿Te acostaste a una hora parecida a la de siempre?', '¿Dejaste el teléfono un rato antes de dormir?'],
    consejos: ['Hoy probá dejar el teléfono lejos de la cama.', 'Un rato de luz natural a la mañana ayuda a tener sueño a la noche.'],
  },
  {
    clave: 'menos_grasas',
    texto: 'Comer menos grasas',
    emoji: '🥗',
    palabras: ['grasa', 'grasas', 'frito', 'fritos', 'fritura', 'frituras', 'fat', 'fats', 'fried'],
    resumen: 'Cambios chicos en lo que ya comés, sin prohibir nada: primero ver qué días se carga más.',
    pasos: [
      { texto: 'Cambiar una fritura de la semana por algo al horno o a la plancha.', mide: COMPONENTES_GRASA },
      { texto: 'Anotar lo que comés para ver qué días se carga más.', mide: '' },
      { texto: 'Sumar verdura al plato en una comida del día.', mide: 'Con verdura' },
    ],
    preguntas: ['¿Hoy elegiste algo al horno o a la plancha en vez de frito?', '¿Sumaste verdura en alguna comida?'],
    consejos: ['Hoy probá cambiar lo frito por algo al horno.', 'Fijate cuánto queso o fiambre se suma sin darte cuenta: es fácil de achicar.'],
  },
  {
    clave: 'moverme_mas',
    texto: 'Moverme más',
    emoji: '🚶',
    palabras: ['moverme', 'mover', 'caminar', 'camino', 'ejercicio', 'actividad', 'deporte', 'gimnasio', 'correr', 'pasos', 'move', 'walk', 'exercise', 'gym', 'run'],
    resumen: 'Sumar movimiento a lo que ya hacés, sin exigirte de golpe.',
    pasos: [
      { texto: 'Sumar una caminata corta en un momento fijo del día.', mide: 'Caminata' },
      { texto: 'Mirar tus pasos y apuntar a un poco más que tu semana pasada.', mide: 'Pasos' },
      { texto: 'Elegir algo que te guste para hacer una vez por semana.', mide: 'Minutos de ejercicio' },
    ],
    preguntas: ['¿Saliste a caminar un rato hoy?', '¿Te moviste un poco más que ayer?'],
    consejos: ['Hoy probá con 10 minutos de caminata después de comer.', 'Las escaleras o bajarte una parada antes también cuentan.'],
  },
  {
    clave: 'menos_pantalla',
    texto: 'Menos pantalla',
    emoji: '📵',
    palabras: ['pantalla', 'pantallas', 'celular', 'telefono', 'redes', 'screen', 'phone', 'social'],
    resumen: 'Darte cuenta de cuándo agarrás el teléfono sin querer y recortar justo ahí.',
    pasos: [
      { texto: 'Elegir un momento del día sin teléfono, como la comida.', mide: 'Tiempo de pantalla' },
      { texto: 'Silenciar los avisos de una app que te distraiga.', mide: '' },
      { texto: 'Dejar el teléfono fuera de la pieza a la noche.', mide: 'Horas de sueño' },
    ],
    preguntas: ['¿Comiste sin mirar el teléfono?', '¿Tuviste un rato sin pantalla hoy?'],
    consejos: ['Hoy probá comer con el teléfono en otra habitación.', 'Sacar una app de la pantalla de inicio ayuda a abrirla menos.'],
  },
  {
    clave: 'mas_agua',
    texto: 'Tomar más agua',
    emoji: '💧',
    palabras: ['agua', 'hidratar', 'hidratarme', 'water', 'hydrate'],
    resumen: 'Tener el agua a mano y atarla a cosas que ya hacés.',
    pasos: [
      { texto: 'Tener una botella a la vista donde pasás el día.', mide: 'Vaso de agua' },
      { texto: 'Tomar un vaso con cada comida.', mide: 'Vaso de agua' },
      { texto: 'Anotar cada vaso con el atajo de Anotar, para ver cuánto tomás.', mide: '' },
    ],
    preguntas: ['¿Tomaste agua con las comidas?', '¿Tuviste una botella cerca hoy?'],
    consejos: ['Hoy arrancá el día con un vaso de agua.', 'Dejá un vaso a la vista: se toma más lo que se ve.'],
  },
  {
    clave: 'mas_verdura',
    texto: 'Comer más verdura y fruta',
    emoji: '🥦',
    palabras: ['verdura', 'verduras', 'fruta', 'frutas', 'ensalada', 'vegetable', 'vegetables', 'fruit', 'veggies'],
    resumen: 'Sumar antes que sacar: un poco más de color en lo que ya comés.',
    pasos: [
      { texto: 'Sumar una verdura a una comida del día.', mide: 'Con verdura' },
      { texto: 'Tener fruta a mano para cuando pica el hambre.', mide: 'Días con mucha fibra' },
      { texto: 'Probar una verdura que no comas seguido.', mide: '' },
    ],
    preguntas: ['¿Comiste verdura hoy?', '¿Comiste alguna fruta?'],
    consejos: ['Hoy probá sumar algo verde al almuerzo.', 'Dejá la fruta a la vista: se come más que la de la heladera.'],
  },
  {
    clave: 'menos_azucar',
    texto: 'Comer menos azúcar',
    emoji: '🍬',
    palabras: ['azucar', 'dulce', 'dulces', 'golosinas', 'gaseosa', 'gaseosas', 'postre', 'postres', 'sugar', 'sweets', 'soda'],
    resumen: 'Ver dónde aparece el azúcar y bajarla de a poco, sin prohibirte nada.',
    pasos: [
      { texto: 'Cambiar una bebida azucarada por agua o algo sin azúcar.', mide: 'Días con mucha azúcar' },
      { texto: 'Dejar el postre para algunos días de la semana.', mide: '' },
      { texto: 'Ponerle un poco menos de azúcar al café o al mate.', mide: '' },
    ],
    preguntas: ['¿Hoy tomaste algo sin azúcar en vez de gaseosa?', '¿Te salteaste algo dulce que comés por costumbre?'],
    consejos: ['Hoy probá con una fruta en vez de algo dulce.', 'Bajar el azúcar de a poco hace que casi no se note.'],
  },
  {
    clave: 'menos_estres',
    texto: 'Estar más tranquilo',
    emoji: '🧘',
    palabras: ['estres', 'estresado', 'estresada', 'tranquilo', 'tranquila', 'relajar', 'relajarme', 'calma', 'stress', 'calm', 'relax'],
    resumen: 'Ratos cortos para bajar un cambio y ver qué días te sentís mejor.',
    pasos: [
      { texto: 'Anotar cómo te sentís, para ver qué días estás mejor.', mide: COMO_ME_SIENTO_META },
      { texto: 'Hacer una pausa corta sin pantalla en el medio del día.', mide: 'Tiempo de pantalla' },
      { texto: 'Salir a caminar un rato cuando estés cargado.', mide: 'Caminata' },
    ],
    preguntas: ['¿Tuviste un rato para vos hoy?', '¿Pudiste hacer una pausa en el medio del día?'],
    consejos: ['Hoy probá con cinco respiraciones lentas antes de empezar algo.', 'Un rato al aire libre ayuda a bajar un cambio.'],
  },
];

/** Para un objetivo que suena médico: hábitos generales y la consulta. Nunca cambia un tratamiento. */
const PLAN_MEDICO: Pick<PlantillaMeta, 'emoji' | 'resumen' | 'pasos' | 'preguntas' | 'consejos'> = {
  emoji: '🩺',
  resumen: 'Te acompaño con hábitos generales y con lo que anotás. Por cualquier cambio en un tratamiento, hablalo con tu médico.',
  pasos: [
    { texto: 'Anotar cómo te sentís y lo que te llame la atención, para llevarlo a la consulta.', mide: COMO_ME_SIENTO_META },
    { texto: 'Sumar de a poco hábitos generales: dormir parejo, moverte y comer variado.', mide: 'Pasos' },
    { texto: 'Usar el Informe para el médico cuando tengas una consulta.', mide: '' },
  ],
  preguntas: ['¿Anotaste hoy cómo te sentís?', '¿Tenés anotado lo que querés contarle a tu médico?'],
  consejos: ['Si algo te preocupa, anotalo: en la consulta sirve tenerlo a mano.', 'Dormir parejo y moverte un poco ayudan en casi todo.'],
};

/** Para un objetivo libre que no se parece a ninguna sugerencia. */
const PLAN_GENERAL: Pick<PlantillaMeta, 'emoji' | 'resumen' | 'pasos' | 'preguntas' | 'consejos'> = {
  emoji: '🎯',
  resumen: 'Empezar por algo chico y ver en tus datos cómo te va.',
  pasos: [
    { texto: 'Elegir una acción chica que puedas hacer hoy mismo.', mide: '' },
    { texto: 'Anotarla cada vez que la hagas, así Patty la puede seguir.', mide: '' },
    { texto: 'Mirar al final de la semana qué te ayudó y qué no.', mide: '' },
  ],
  preguntas: ['¿Hiciste hoy algo por este objetivo?', '¿Te resultó fácil hoy?'],
  consejos: ['Hoy elegí una sola cosa chica para este objetivo.', 'Hacerlo siempre en el mismo momento del día ayuda a que quede.'],
};

const normalizado = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const MEDICO =
  /\b(presion|hipertens\w*|diabet\w*|glucemia|glucosa|insulina|colesterol|trigliceridos|tiroides|cancer|tumor\w*|remedios?|medicacion|medicamentos?|medicina|pastillas?|dosis|tratamientos?|depresion|ansiedad|migran\w*|asma|cardiac\w*|corazon|embaraz\w*|enfermedad\w*|dolor\w*|operacion|cirugia|quimio\w*|antidepresiv\w*|sintomas?|diagnostic\w*|blood pressure|diabetes|cholesterol|medication|medicine|pills?|dose|treatment|depression|anxiety|migraines?|asthma|heart|pregnan\w*|disease|illness|pain|surgery|symptoms?)\b/;

/** Si el objetivo suena médico ("bajar la presión", "dejar la pastilla"). */
export const pareceMedico = (texto: string): boolean => MEDICO.test(normalizado(texto));

const TRATAMIENTO =
  /\b(dosis|dose|diagnostic\w*|diagnos\w*|suspend\w*|mg|miligramos?|insulina|insulin)\b|\b(dej\w*|sac\w*|baj\w*|reduc\w*|aument\w*|cambi\w*|stop\w*|chang\w*|increas\w*)\b[^.]{0,30}\b(remedios?|medicacion|medicamentos?|pastillas?|tratamientos?|medication|medicine|pills?|treatment)\b|\b(tenes|sufris|you have)\b[^.]{0,20}\b(diabetes|hipertension|depresion|ansiedad|anxiety|depression|hypertension)\b/;
const DERIVA = /\b(medic[oa]s?|doctor\w*|doctora|profesional\w*|consulta\w*)\b/;

/**
 * Si un texto de la IA se mete con un tratamiento o diagnostica ("bajá la dosis", "tenés diabetes"). Decir que eso se habla con
 * el médico está bien. Es la última red: la regla principal está en lo que se le pide a la IA.
 */
export function tocaTratamiento(texto: string): boolean {
  const n = normalizado(texto);
  return TRATAMIENTO.test(n) && !DERIVA.test(n);
}

/** Qué plantilla le toca a un objetivo: la elegida, o la que se parece a su texto. Lo médico siempre va por la general médica. */
function plantillaDe(texto: string, clave?: string | null) {
  if (pareceMedico(texto)) return PLAN_MEDICO;
  const elegida = SUGERENCIAS_META.find((s) => s.clave === clave);
  if (elegida) return elegida;
  const palabras = new Set(normalizado(texto).split(' '));
  return SUGERENCIAS_META.find((s) => s.palabras.some((p) => palabras.has(p))) ?? PLAN_GENERAL;
}

export const emojiDeMeta = (texto: string, clave?: string | null): string => plantillaDe(texto, clave).emoji;

/** El plan sin IA: el de la sugerencia parecida, o uno general. */
export function planBase(texto: string, clave: string | null | undefined, idioma: Idioma, ahora = new Date()): PlanMeta {
  const x = plantillaDe(texto, clave);
  const tr = (s: string) => traducir(idioma, s);
  return {
    resumen: tr(x.resumen),
    pasos: x.pasos.map((p) => ({ texto: tr(p.texto), mide: p.mide })),
    preguntas: x.preguntas.map(tr),
    consejos: x.consejos.map(tr),
    origen: 'base',
    creado: ahora.toISOString(),
  };
}
