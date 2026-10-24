// Carga en texto libre: "desayuné café con tostadas, a las 11 me dolió la cabeza (4)" → registros propuestos.
// No guarda nada: la app los muestra para que la persona los revise y después los manda a /api/registros/varios.
import { sql } from 'drizzle-orm';
import { normalizar, TIPOS_VALOR, type Categoria } from 'shared';
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
    dudas: { type: 'array', items: { type: 'string' }, description: 'Lo que no quedó claro y conviene preguntar' },
  },
  required: ['registros', 'dudas'],
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
  dudas: string[];
}

export async function interpretarTexto(tx: Tx, p: PersonaAcceso, texto: string) {
  if (!texto) throw new ErrorApi('Escribí qué pasó.');
  if (texto.length > 4000) throw new ErrorApi('El texto es muy largo (máximo 4000 letras).');
  const cats = await filas<Categoria>(tx, sql`SELECT * FROM categorias ORDER BY orden`);
  const conocidos = await filas<{ id: number; categoria_id: number; nombre: string; nombre_norm: string }>(
    tx,
    sql`SELECT id, categoria_id, nombre, nombre_norm FROM conceptos WHERE unido_a IS NULL ORDER BY usos DESC, id LIMIT 300`,
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
    'No inventes cosas que no se dijeron.';
  const consigna = [
    `Hoy es ${hoy} y son las ${String(Math.floor(hora / 60)).padStart(2, '0')}:${String(hora % 60).padStart(2, '0')} para ${p.nombre}.`,
    'Categorías (clave: nombre, tipo de valor habitual):',
    ...cats.map((c) => `- ${c.clave}: ${c.nombre}, ${c.tipo_valor}`),
    'Conceptos que ya existen (categoría: nombre):',
    ...conocidos.map((c) => `- ${porCat.get(c.categoria_id)}: ${c.nombre}`),
    '',
    'Texto de la persona:',
    texto,
  ].join('\n');
  const r = await pedirJson<Respuesta>({ sistema, texto: consigna, esquema: ESQUEMA, esfuerzo: 'low', maxTokens: 8000 });
  const idCat = new Map(cats.map((c) => [c.clave, c.id]));
  return {
    dudas: r.dudas,
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
