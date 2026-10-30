// La IA mira los candidatos que encontró el motor y los explica en palabras: cuáles parecen razonables, qué otra cosa
// podría explicarlos (un confusor) y qué convendría anotar o probar para confirmarlos.
import type { Idioma } from 'shared';
import type { Candidato } from '../patrones/motor.js';
import { pedirJson } from './cliente.js';

const ESQUEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string', description: 'Qué se ve en los datos, en 2 a 5 oraciones' },
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indice: { type: 'integer' },
          explicacion: { type: 'string', description: 'Una o dos oraciones claras, sin tecnicismos' },
          plausibilidad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['indice', 'explicacion', 'plausibilidad'],
        additionalProperties: false,
      },
    },
    sugerencias: { type: 'array', items: { type: 'string' }, description: 'Qué anotar mejor o qué probar (hasta 5)' },
  },
  required: ['resumen', 'hallazgos', 'sugerencias'],
  additionalProperties: false,
};

export interface Explicaciones {
  resumen: string;
  hallazgos: Array<{ indice: number; explicacion: string; plausibilidad: 'alta' | 'media' | 'baja' }>;
  sugerencias: string[];
}

export function explicarHallazgos(datos: {
  persona: string;
  /** Lo que la persona contó de sí (edad, sexo, condiciones), si contó algo. */
  perfil?: string;
  desde: string;
  hasta: string;
  diasActivos: number;
  paresEvaluados: number;
  candidatos: Array<Candidato & { causa: string; efecto: string }>;
  frecuentes: Array<{ nombre: string; dias: number }>;
  /** Lo que la persona opinó de patrones anteriores: para aprender qué le sirve y qué no. */
  opiniones?: Array<{ causa: string; efecto: string; opinion: 'le sirvió' | 'ya lo sabía' | 'no tiene sentido' }>;
  /** El idioma de la app: el resumen, las explicaciones y las sugerencias van en ese idioma. */
  idioma?: Idioma;
}): Promise<Explicaciones> {
  const sistema =
    'Sos Patty, el asistente de una app donde una persona anota su día (comidas, sueño, actividad, clima, dolores, ánimo) ' +
    'para descubrir qué cosas se relacionan. Un motor estadístico ya buscó pares "causa → efecto con k días de desfase" y te ' +
    'pasa los candidatos con sus números. Tu trabajo es explicarlos en castellano rioplatense, claro y sin tecnicismos, ' +
    'con prudencia: son correlaciones en pocos datos, no diagnósticos. Marcá como plausibilidad baja lo que probablemente ' +
    'sea azar o se explique por otra cosa (un confusor: por ejemplo, el fin de semana), y alta lo que tiene sentido y está ' +
    'bien sostenido por los números. Algunos candidatos combinan causas con " + " (comida frita + fase menstrual + calor): ' +
    'quiere decir que pasan juntas el mismo día, y que juntas explican el efecto mucho más que cada una sola; contalo así ' +
    '("cuando se juntan…"), que es lo más valioso que puede encontrar Patty. ' +
    'Los marcados PROTEGE son al revés: con la causa el efecto (un malestar) aparece menos; contalo como algo que parece ' +
    'cuidarla ("los días que caminás, al día siguiente te duele menos la cabeza"), sin prometer nada. Una causa con ' +
    '"N o más" / "N o menos" es un umbral: el efecto aparece a partir de esa cantidad ("a partir de 3 cafés"); decilo así. ' +
    'Con 2 o 3 días de desfase decí "a los dos días" / "a los tres días". ' +
    'Los marcados YA NO SE VE se ven en toda la historia pero no en los últimos meses: contalo en pasado ("antes pasaba"). ' +
    '"Alto", "bajo", "tarde" y "temprano" son respecto de lo habitual de la persona. No des indicaciones médicas; si algo parece serio, sugerí consultarlo con un profesional.' +
    (datos.idioma === 'en'
      ? ' La persona usa la app en inglés: escribí el resumen, las explicaciones y las sugerencias en inglés (claro y simple).'
      : '');
  const lineas = [
    ...(datos.perfil ? [`Sobre la persona (lo contó ella; usalo para entender mejor, no para diagnosticar): ${datos.perfil}.`] : []),
    `Persona: ${datos.persona}. Período: ${datos.desde} a ${datos.hasta}, ${datos.diasActivos} días con anotaciones.`,
    `Se probaron ${datos.paresEvaluados} combinaciones (por eso algunas pueden salir por azar: mirá el q).`,
    '',
    'Lo que más se anotó (días): ' + datos.frecuentes.map((f) => `${f.nombre} ${f.dias}`).join(', '),
    ...(datos.opiniones?.length
      ? [
          '',
          'Lo que opinó de patrones anteriores (aprendé de esto: no le expliques como novedad lo que es obvio para ella, y ' +
            'marcá con plausibilidad baja lo que se parezca a lo que dijo que no tiene sentido):',
          ...datos.opiniones.map((o) => `- ${o.causa} → ${o.efecto}: ${o.opinion}`),
        ]
      : []),
    '',
    'Candidatos:',
    ...datos.candidatos.map(
      (c, i) =>
        `${i}. ${c.ya_no ? 'YA NO SE VE: ' : ''}${c.protege ? 'PROTEGE: ' : ''}${c.causa} → ${c.efecto}, ${c.desfase_dias} día(s) después: ` +
        `${c.soporte} de ${c.dias_causa} días con la causa (${Math.round(c.prob_con * 100)}%) vs ${Math.round(c.prob_sin * 100)}% sin la causa; ` +
        `lift ${c.lift.toFixed(2)}, p ${c.p_valor.toPrecision(2)}, q ${c.q_valor.toPrecision(2)}`,
    ),
  ];
  return pedirJson<Explicaciones>({ sistema, texto: lineas.join('\n'), esquema: ESQUEMA, esfuerzo: 'high', maxTokens: 16000 });
}
