// Carga en texto libre: "desayuné café con tostadas, a las 11 me dolió la cabeza (4)" → registros propuestos.
// No guarda nada: la app los muestra para que la persona los revise y después los manda a /api/registros/varios.
import { sql } from 'drizzle-orm';
import { frecuenciaTexto, normalizar, TIPOS_VALOR, type Categoria } from 'shared';
import { filas, type Tx } from '../db/client.js';
import type { PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { fechaLocal, localAInstante, minutosDelDia } from '../lib/fechas.js';
import { pedirJson } from './cliente.js';

const nulo = (tipo: 'string' | 'number' | 'integer', descripcion: string) => ({ anyOf: [{ type: tipo }, { type: 'null' }], description: descripcion });

const ESQUEMA = {
  type: 'object',
  properties: {
    registros: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          categoria: { type: 'string', description: 'clave de la categoría' },
          concepto: { type: 'string', description: 'Nombre corto y genérico. Si ya existe uno en la lista, exactamente ese nombre.' },
          tipo_valor: { type: 'string', enum: [...TIPOS_VALOR] },
          fecha: { type: 'string', description: 'AAAA-MM-DD' },
          hora: { type: 'string', description: 'HH:MM, 24 horas. Si no se dijo, una hora razonable según el texto.' },
          duracion_min: nulo('integer', 'Duración en minutos, si aplica'),
          valor: nulo('number', 'Cantidad o medida, si aplica'),
          unidad: nulo('string', 'Unidad del valor'),
          intensidad: nulo('integer', 'De 0 a 10, para dolores, molestias y ánimo'),
          nota: nulo('string', 'Detalle que no entra en el concepto (lugar del dolor, con quién, marca)'),
        },
        required: ['categoria', 'concepto', 'tipo_valor', 'fecha', 'hora', 'duracion_min', 'valor', 'unidad', 'intensidad', 'nota'],
        additionalProperties: false,
      },
    },
    tratamientos: {
      type: 'array',
      description: 'Indicaciones de un remedio a tomar de ahora en adelante (para programar recordatorios)',
      items: {
        type: 'object',
        properties: {
          remedio: { type: 'string', description: 'Nombre corto del remedio. Si ya existe en la lista de medicación, exactamente ese.' },
          dosis: nulo('number', 'Cuánto por toma (1, 500, 2)'),
          unidad: nulo('string', 'Unidad de la dosis: comprimido, cápsula, mg, g, ml, gotas, sobre, cucharada, puff, UI'),
          cada_horas: nulo('number', 'Cada cuántas horas (8 para "cada 8 horas", 24 para "una vez por día" sin hora fija)'),
          horarios: { type: 'array', items: { type: 'string' }, description: 'Horas fijas del día, HH:MM ("todos los días a las 9" → ["09:00"]). Vacío si es cada tantas horas o cuando haga falta.' },
          primera_fecha: { type: 'string', description: 'AAAA-MM-DD de la primera toma' },
          primera_hora: { type: 'string', description: 'HH:MM de la primera toma. Si no se dijo, ahora (o la próxima hora fija).' },
          dias: nulo('integer', 'Por cuántos días. null si es crónico o no se dijo hasta cuándo.'),
          motivo: nulo('string', 'Para qué lo toma ("anginas"), si se dijo'),
        },
        required: ['remedio', 'dosis', 'unidad', 'cada_horas', 'horarios', 'primera_fecha', 'primera_hora', 'dias', 'motivo'],
        additionalProperties: false,
      },
    },
    dudas: { type: 'array', items: { type: 'string' }, description: 'Lo que no quedó claro y conviene preguntar' },
  },
  required: ['registros', 'tratamientos', 'dudas'],
  additionalProperties: false,
};

interface Respuesta {
  registros: Array<{
    categoria: string;
    concepto: string;
    tipo_valor: string;
    fecha: string;
    hora: string;
    duracion_min: number | null;
    valor: number | null;
    unidad: string | null;
    intensidad: number | null;
    nota: string | null;
  }>;
  tratamientos: Array<{
    remedio: string;
    dosis: number | null;
    unidad: string | null;
    cada_horas: number | null;
    horarios: string[];
    primera_fecha: string;
    primera_hora: string;
    dias: number | null;
    motivo: string | null;
  }>;
  dudas: string[];
}

/** El día de la semana de una fecha AAAA-MM-DD, en castellano (para que entienda "el sábado"). */
const diaDeLaSemana = (fecha: string) =>
  new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));

/**
 * `referencia`: el día que la persona estaba mirando en la app al contarlo (AAAA-MM-DD). Si no dice cuándo pasó, es
 * ese día; si dice "ayer", "el sábado", "anoche", se cuenta desde hoy.
 */
export async function interpretarTexto(tx: Tx, p: PersonaAcceso, texto: string, referencia?: string, imagen?: { tipo: 'image/jpeg' | 'image/png' | 'image/webp'; datos: string }) {
  if (!texto && !imagen) throw new ErrorApi('Escribí qué pasó.');
  if (texto.length > 4000) throw new ErrorApi('El texto es muy largo (máximo 4000 letras).');
  const cats = await filas<Categoria>(tx, sql`SELECT * FROM categorias ORDER BY orden`);
  const conocidos = await filas<{ id: number; categoria_id: number; nombre: string; nombre_norm: string }>(
    tx,
    sql`SELECT id, categoria_id, nombre, nombre_norm FROM conceptos WHERE unido_a IS NULL ORDER BY usos DESC, id LIMIT 300`,
  );
  const activos = await filas<{ remedio: string; cada_horas: number | null; horarios: string[] }>(
    tx,
    sql`SELECT c.nombre AS remedio, t.cada_horas, t.horarios FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id
        WHERE t.persona_id = ${p.id} AND t.borrado IS NULL AND t.terminado IS NULL AND (t.fin IS NULL OR t.fin > now())`,
  );
  const ahora = new Date();
  const hoy = fechaLocal(ahora, p.zona_horaria);
  const hora = minutosDelDia(ahora, p.zona_horaria);
  const porCat = new Map(cats.map((c) => [c.id, c.clave]));
  const sistema =
    'Sos Patty, una app donde una persona anota su día para encontrar patrones (comidas, sueño, actividad, dolores, ánimo). ' +
    'Convertís lo que la persona escribe, en castellano rioplatense, en registros tipificados. ' +
    'Reusá los conceptos existentes cuando correspondan (mismo nombre exacto) y creá nombres nuevos cortos y genéricos ' +
    '("Tomate", no "un tomate en la ensalada"; el detalle va en la nota). Un registro por cada cosa: "café con tostadas" son dos. ' +
    'No inventes cosas que no se dijeron. ' +
    'Cada registro va en el día y la hora en que pasó, aunque se cuente después: "ayer", "anteayer", "el sábado", ' +
    '"anoche", "el lunes a la mañana" se calculan desde hoy. Si no se dice la hora, usá una razonable según el momento: ' +
    'a la mañana 9:00, al mediodía 13:00, a la tarde 17:00, a la noche 21:00. Lo de la madrugada ("anoche a las 2") va con ' +
    'la fecha del calendario en que pasó (la del día siguiente). Si algo duró ("estuvimos 3 horas"), poné duracion_min en ' +
    'el registro de esa actividad o evento. ' +
    'Si la persona cuenta una indicación de un remedio para adelante ("el médico me dijo paracetamol 1 g cada 8 horas por ' +
    '5 días", "tomo vitamina D todos los días a las 9", "ibuprofeno si me duele"), va en tratamientos (así Patty le ' +
    'recuerda cada toma). Si además dice que ya tomó una, también va como registro de medicación a esa hora, y la ' +
    'primera toma del tratamiento es esa. Lo que tiene (anginas, gripe) puede ir como registro de molestia. No des ' +
    'consejos médicos ni cambies dosis: anotá lo que dice. Si falta algo importante para recordarle (la dosis, cada ' +
    'cuánto), preguntalo en dudas. ' +
    'Si viene una foto, mirá qué se ve y anotalo: en un plato de comida, cada comida o ingrediente principal que se ' +
    'reconozca (con una cantidad estimada si se puede, por ejemplo 2 empanadas, 1 vaso), una bebida, la caja de un ' +
    'remedio (su nombre). La hora es ahora, salvo que el texto diga otra cosa. Si no se distingue bien qué es, ' +
    'preguntalo en dudas en vez de inventar; si la foto no tiene nada para anotar, no propongas registros y decilo en dudas. ' +
    'Si al final hay aclaraciones (respuestas a tus preguntas), usalas para completar o corregir los registros: no los ' +
    'repitas, y no vuelvas a preguntar lo que ya se aclaró. Si alguna pregunta anterior quedó sin contestar, volvé a ' +
    'preguntarla mientras siga faltando algo que importa (sobre todo en remedios: dosis y cada cuánto o a qué hora; y ' +
    'cantidades que se pidieron); lo que es solo un detalle, dejalo pasar sin insistir. Preguntá todo lo que falta de ' +
    'una vez, en preguntas cortas, cada una sobre una sola cosa.';
  const consigna = [
    `Hoy es ${diaDeLaSemana(hoy)} ${hoy} y son las ${String(Math.floor(hora / 60)).padStart(2, '0')}:${String(hora % 60).padStart(2, '0')} para ${p.nombre}.`,
    ...(referencia && referencia !== hoy
      ? [`La persona está mirando el día ${diaDeLaSemana(referencia)} ${referencia} en la app: si no dice cuándo pasó algo, es ese día.`]
      : []),
    'Categorías (clave: nombre, tipo de valor habitual):',
    ...cats.map((c) => `- ${c.clave}: ${c.nombre}, ${c.tipo_valor}`),
    'Conceptos que ya existen (categoría: nombre):',
    ...conocidos.map((c) => `- ${porCat.get(c.categoria_id)}: ${c.nombre}`),
    ...(activos.length ? ['Remedios que ya tiene programados:', ...activos.map((t) => `- ${t.remedio}, ${frecuenciaTexto(t)}`)] : []),
    '',
    ...(imagen ? ['La persona mandó una foto (arriba) para anotar.'] : []),
    'Texto de la persona:',
    texto || '(sin texto: solo la foto)',
  ].join('\n');
  const r = await pedirJson<Respuesta>({ sistema, texto: consigna, esquema: ESQUEMA, esfuerzo: 'low', maxTokens: 8000, imagenes: imagen ? [imagen] : undefined });
  const idCat = new Map(cats.map((c) => [c.clave, c.id]));
  const medicacion = idCat.get('medicacion');
  return {
    dudas: r.dudas,
    tratamientos: (r.tratamientos ?? [])
      .filter((x) => x.remedio.trim() && /^\d{4}-\d{2}-\d{2}$/.test(x.primera_fecha) && /^\d{1,2}:\d{2}$/.test(x.primera_hora))
      .map((x) => {
        const existente = conocidos.find((c) => c.categoria_id === medicacion && c.nombre_norm === normalizar(x.remedio));
        const inicio = localAInstante(x.primera_fecha, x.primera_hora.padStart(5, '0'), p.zona_horaria);
        const horarios = x.cada_horas ? [] : x.horarios.filter((h) => /^\d{1,2}:\d{2}$/.test(h)).map((h) => h.padStart(5, '0'));
        return {
          persona_id: p.id,
          concepto_id: existente?.id ?? null,
          concepto_nombre: existente?.nombre ?? x.remedio.trim(),
          nuevo: !existente,
          dosis: x.dosis,
          unidad: x.unidad,
          cada_horas: x.cada_horas && x.cada_horas > 0 ? x.cada_horas : null,
          horarios,
          inicio: inicio.toISOString(),
          fin: x.dias && x.dias > 0 ? new Date(inicio.getTime() + x.dias * 86400000).toISOString() : null,
          motivo: x.motivo,
          dias: x.dias,
        };
      }),
    registros: r.registros
      .filter((x) => idCat.has(x.categoria) && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) && /^\d{1,2}:\d{2}$/.test(x.hora))
      .map((x) => {
        const categoria_id = idCat.get(x.categoria)!;
        const existente = conocidos.find((c) => c.categoria_id === categoria_id && c.nombre_norm === normalizar(x.concepto));
        const inicio = localAInstante(x.fecha, x.hora, p.zona_horaria);
        return {
          persona_id: p.id,
          categoria_id,
          concepto_id: existente?.id ?? null,
          concepto_nombre: existente?.nombre ?? x.concepto,
          nuevo: !existente,
          inicio: inicio.toISOString(),
          fin: x.duracion_min ? new Date(inicio.getTime() + x.duracion_min * 60000).toISOString() : null,
          valor: x.valor ?? x.duracion_min,
          unidad: x.unidad,
          intensidad: x.intensidad === null ? null : Math.max(0, Math.min(10, Math.round(x.intensidad))),
          nota: x.nota,
        };
      }),
  };
}
