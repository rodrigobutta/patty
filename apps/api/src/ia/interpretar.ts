// Carga en texto libre: "desayuné café con tostadas, a las 11 me dolió la cabeza (4)" → registros propuestos.
// No guarda nada: la app los muestra para que la persona los revise y después los manda a /api/registros/varios.
import { sql } from 'drizzle-orm';
import { esPorcion, esTipoComida, frecuenciaTexto, normalizar, PORCIONES, TIPOS_COMIDA, TIPOS_VALOR, type Categoria, type Idioma } from 'shared';
import { filas, type Tx } from '../db/client.js';
import type { PersonaAcceso } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, fechaLocal, localAInstante, minutosDelDia } from '../lib/fechas.js';
import { pedirJson } from './cliente.js';
import { lineaDelDia } from '../ubicacion/linea.js';
import { nombresDeGente } from '../routes/gente.js';
import { preguntasDe } from '../routes/preguntasConcepto.js';

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
          donde: { anyOf: [{ type: 'string', enum: ['casa', 'afuera', 'delivery'] }, { type: 'null' }], description: 'Solo comidas y bebidas: casera, afuera o pedida' },
          lugar: nulo('string', 'Solo comidas y bebidas de afuera o delivery: el restaurante, bar, casa de alguien o de dónde se pidió'),
          porcion: { anyOf: [{ type: 'string', enum: PORCIONES.map((x) => x.clave) }, { type: 'null' }], description: 'Solo comidas: el tamaño del plato, si se ve o se dijo' },
          tipos: { type: 'array', items: { type: 'string', enum: TIPOS_COMIDA.map((x) => x.clave) }, description: 'Solo comidas: cómo es (vacío si no aplica o no se sabe)' },
          para_malestar: nulo('string', 'Solo medicación: para cuál de los malestares abiertos la tomó, con su nombre exacto de esa lista (si se dijo o se aclaró)'),
          detalles: {
            type: 'array',
            description: 'Respuestas a las preguntas que la persona configuró para esta cosa (vacío si no tiene o no se sabe todavía)',
            items: {
              type: 'object',
              properties: { pregunta: { type: 'string' }, respuestas: { type: 'array', items: { type: 'string' } } },
              required: ['pregunta', 'respuestas'],
              additionalProperties: false,
            },
          },
        },
        required: ['categoria', 'concepto', 'tipo_valor', 'fecha', 'hora', 'duracion_min', 'valor', 'unidad', 'intensidad', 'nota', 'donde', 'lugar', 'porcion', 'tipos', 'para_malestar', 'detalles'],
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
    dudas: {
      type: 'array',
      description: 'Lo que no quedó claro y conviene preguntar',
      items: {
        type: 'object',
        properties: {
          pregunta: { type: 'string', description: 'Una pregunta corta, sobre una sola cosa' },
          opciones: {
            type: 'array',
            items: { type: 'string' },
            description: 'De 2 a 5 respuestas posibles, muy cortas (1 a 4 palabras), para contestar con un toque ("Sí", "No"; "30 min", "1 hora", "2 horas"; "Casera", "Afuera"). Vacío si la respuesta es libre (un nombre, por ejemplo).',
          },
          varias: { type: 'boolean', description: 'true si se puede elegir más de una opción a la vez (con quién estuvo, qué comió, qué le dolió); false si es una sola (sí o no, cuánto tiempo).' },
        },
        required: ['pregunta', 'opciones', 'varias'],
        additionalProperties: false,
      },
    },
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
    donde?: 'casa' | 'afuera' | 'delivery' | null;
    lugar?: string | null;
    porcion?: string | null;
    tipos?: string[];
    detalles?: Array<{ pregunta: string; respuestas: string[] }>;
    para_malestar?: string | null;
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
  dudas: Array<{ pregunta: string; opciones: string[]; varias?: boolean } | string>;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** El día de la semana de una fecha AAAA-MM-DD, en castellano (para que entienda "el sábado"). */
const diaDeLaSemana = (fecha: string) =>
  new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));

/**
 * `referencia`: el día que la persona estaba mirando en la app al contarlo (AAAA-MM-DD). Si no dice cuándo pasó, es
 * ese día; si dice "ayer", "el sábado", "anoche", se cuenta desde hoy.
 */
export async function interpretarTexto(
  tx: Tx,
  p: PersonaAcceso,
  texto: string,
  referencia?: string,
  imagen?: { tipo: 'image/jpeg' | 'image/png' | 'image/webp'; datos: string },
  idioma: Idioma = 'es',
  /** Qué eligió anotar antes de contarlo ("la merienda", desde los puntos): para no preguntarlo. */
  pista = '',
  /** Cuándo se contó, si fue antes (sin señal): "hoy", "ayer" y las horas se cuentan desde ahí. */
  momento?: Date,
) {
  if (!texto && !imagen) throw new ErrorApi('Escribí qué pasó.');
  if (texto.length > 4000) throw new ErrorApi('El texto es muy largo (máximo 4000 letras).');
  const cats = await filas<Categoria>(tx, sql`SELECT * FROM categorias ORDER BY orden`);
  const conocidos = await filas<{ id: number; categoria_id: number; nombre: string; nombre_norm: string }>(
    tx,
    sql`SELECT id, categoria_id, nombre, nombre_norm FROM conceptos WHERE unido_a IS NULL ORDER BY usos DESC, id LIMIT 300`,
  );
  // Dónde estuvo ese día (lugares con nombre y paradas largas), para proponer el lugar de una comida de afuera.
  const diaHoy = diaDePatty(momento ?? new Date(), p.zona_horaria);
  const diaVisto = referencia ?? diaHoy;
  const donde = await lineaDelDia(tx, p, diaVisto, diaHoy, idioma).catch(() => []);
  const gente = await nombresDeGente(tx, p.id);
  const preguntas = await preguntasDe(tx, p.id);
  // Los lugares donde ya comió, para preguntar "¿de dónde?" con opciones conocidas.
  const lugaresComida = (
    await filas<{ lugar: string; donde: string }>(
      tx,
      sql`SELECT datos->>'lugar' AS lugar, max(datos->>'donde') AS donde FROM registros
          WHERE persona_id = ${p.id} AND borrado IS NULL AND datos->>'lugar' IS NOT NULL
          GROUP BY datos->>'lugar' ORDER BY count(*) DESC, max(inicio) DESC LIMIT 15`,
    )
  ).map((x) => `${x.lugar} (${x.donde === 'delivery' ? 'delivery' : 'afuera'})`);
  const activos = await filas<{ remedio: string; cada_horas: number | null; horarios: string[] }>(
    tx,
    sql`SELECT c.nombre AS remedio, t.cada_horas, t.horarios FROM tratamientos t JOIN conceptos c ON c.id = t.concepto_id
        WHERE t.persona_id = ${p.id} AND t.borrado IS NULL AND t.terminado IS NULL AND (t.fin IS NULL OR t.fin > now())`,
  );
  // Los malestares que siguen abiertos: un remedio que se toma ahora seguramente es para alguno de ellos.
  const malestares = await filas<{ id: number; concepto: string; inicio: string }>(
    tx,
    sql`SELECT r.id, c.nombre AS concepto, r.inicio FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND k.clave = 'sintoma' AND r.datos->>'abierto' = 'true' ORDER BY r.inicio DESC`,
  );
  const ahora = momento ?? new Date();
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
    'Muchas veces cuentan el día entero de una vez, a la noche ("me levanté a las 7, desayuné café con tostadas, fui a ' +
    'trabajar, almorcé una milanesa, a la tarde me dolió la cabeza…"): desglosalo en un registro por cada cosa, en orden, ' +
    'cada una con su hora aproximada según lo que cuenta y el orden del relato (levantarse 7:00, desayuno 8:00, media ' +
    'mañana 11:00, almuerzo 13:00, merienda 17:00, cena 21:00; "después" es un rato después de lo anterior). Si dice ' +
    'cuándo se acostó o se levantó, eso también va. No preguntes la hora de cada cosa: alcanza con una aproximada. ' +
    'Si la persona cuenta una indicación de un remedio para adelante ("el médico me dijo paracetamol 1 g cada 8 horas por ' +
    '5 días", "tomo vitamina D todos los días a las 9", "ibuprofeno si me duele"), va en tratamientos (así Patty le ' +
    'recuerda cada toma). Si además dice que ya tomó una, también va como registro de medicación a esa hora, y la ' +
    'primera toma del tratamiento es esa. Lo que tiene (anginas, gripe) puede ir como registro de molestia. No des ' +
    'consejos médicos ni cambies dosis: anotá lo que dice. Si falta algo importante para recordarle (la dosis, cada ' +
    'cuánto), preguntalo en dudas. ' +
    'En comidas y bebidas, si se sabe dónde fue: donde = casa si fue casera o en casa; afuera si fue en un ' +
    'restaurante, bar, la oficina o la casa de otra persona; delivery si se pidió. En lugar, el nombre si se dijo ' +
    '("Mostaza", "lo de mi vieja", "Sushi Club", "PedidosYa"), no en la nota. Si no se dice nada, null en los dos. ' +
    'Si una comida no es casera (afuera o delivery) y no se dijo de dónde, preguntá en dudas de dónde era, con los ' +
    'lugares donde ya comió como opciones (los más probables para esa comida y ese momento) y alguno nuevo típico si ' +
    'cuadra; así se van guardando los lugares, que pueden explicar cosas. Una sola pregunta por todas esas comidas. ' +
    'Si cuenta un viaje o traslado ("fui en colectivo a la oficina, una hora, mucho tráfico"), en la categoría viaje: ' +
    '"Viaje en auto", "Viaje en colectivo", "Viaje en tren o subte", "Viaje en bici", "Viaje caminando" o "Viaje en taxi", ' +
    'con duracion_min y la intensidad de cuánto pesó (2 tranquilo, 5 normal, 8 pesado); si fue pesado (tráfico, lleno, ' +
    'demoras), además un registro "Viaje pesado" en viaje. ' +
    'Si cuenta que estuvo con alguien ("comí con mi hermana", "vino Juan", "salí con amigos"), un registro en la ' +
    'categoría gente por cada persona, con su nombre corto (si ya está en "Su gente", exactamente ese nombre); para un ' +
    'grupo sin nombres, "Amigos", "Familia", "Compañeros de trabajo". ' +
    'Si se sabe dónde estuvo a la hora de esa comida (ver "Dónde estuvo"), y no fue delivery, proponé ese lugar como ' +
    'primera opción: con su nombre si lo tiene, o la calle si es un lugar sin nombre (para el delivery no sirve). ' +
    'Si cuenta que fue al baño, en la categoría bano: "Pis" o "Caca" (si dice cómo fue, en la nota). Lavarse los dientes, ' +
    'el enjuague bucal o bañarse van en higiene: "Me lavé los dientes", "Enjuague bucal", "Me bañé". Si vomitó, "Vómitos" ' +
    'en sintoma. ' +
    'Si cuenta que le vino o que está menstruando ("me vino", "estoy indispuesta", "me bajó"), va en la categoría ciclo, ' +
    'concepto "Menstruación", con intensidad según el flujo (manchado 2, poco 4, normal 6, mucho 9; si no dice, 6). Los ' +
    'cólicos y otras molestias del ciclo van como sintoma. ' +
    'Si viene una foto, mirá qué se ve y anotalo: en un plato de comida, cada comida o ingrediente principal que se ' +
    'reconozca (con una cantidad estimada si se puede, por ejemplo 2 empanadas, 1 vaso), una bebida, la caja de un ' +
    'remedio (su nombre). En cada comida (de la foto o del texto), además, la porción (chica, mediana, grande; null si no ' +
    'se puede saber) y los tipos que tenga: frito, harinas (pan, pasta, masa, arroz), verdura, proteina (carne, pollo, ' +
    'pescado, huevo, legumbres), lacteos, dulce, picante, ultraprocesado (snacks, gaseosas, embutidos, comida de paquete); ' +
    'solo los que se vean o se digan, sin inventar. En lo que no es comida, porcion null y tipos vacío. ' +
    'La hora es ahora, salvo que el texto diga otra cosa. Si no se distingue bien qué es, ' +
    'preguntalo en dudas en vez de inventar; si la foto no tiene nada para anotar, no propongas registros y decilo en dudas. ' +
    'Si al final hay aclaraciones (respuestas a tus preguntas), usalas para completar o corregir los registros: no los ' +
    'repitas, y no vuelvas a preguntar lo que ya se aclaró. Si alguna pregunta anterior quedó sin contestar, volvé a ' +
    'preguntarla mientras siga faltando algo que importa (sobre todo en remedios: dosis y cada cuánto o a qué hora; y ' +
    'cantidades que se pidieron); lo que es solo un detalle, dejalo pasar sin insistir. Preguntá todo lo que falta de ' +
    'una vez, en preguntas cortas, cada una sobre una sola cosa, y con las respuestas más probables como opciones para ' +
    'tocar (si se puede).' +
    (idioma === 'en'
      ? ' La persona usa la app en inglés: escribí las dudas en inglés. Los conceptos nuevos van en el idioma en que ' +
        'escribe la persona (si escribe en inglés, "Tomato", "Headache"); los que ya existen, con su nombre exacto de la lista.'
      : '');
  const consigna = [
    `Hoy es ${diaDeLaSemana(hoy)} ${hoy} y son las ${String(Math.floor(hora / 60)).padStart(2, '0')}:${String(hora % 60).padStart(2, '0')} para ${p.nombre}.`,
    ...(referencia && referencia !== hoy
      ? [`La persona está mirando el día ${diaDeLaSemana(referencia)} ${referencia} en la app: si no dice cuándo pasó algo, es ese día.`]
      : []),
    'Categorías (clave: nombre, tipo de valor habitual):',
    ...cats.map((c) => `- ${c.clave}: ${c.nombre}, ${c.tipo_valor}`),
    'Conceptos que ya existen (categoría: nombre):',
    ...conocidos.map((c) => `- ${porCat.get(c.categoria_id)}: ${c.nombre}`),
    ...(donde.length ? [`Dónde estuvo el ${diaVisto} (según la ubicación del teléfono):`, ...donde.map((x) => `- ${x}`)] : []),
    ...(gente.length ? [`Su gente: ${gente.join(', ')}`] : []),
    ...(preguntas.length
      ? [
          'Preguntas que la persona quiere que le hagas cuando anota estas cosas (si no dijo la respuesta, preguntala en dudas con esas ' +
            'opciones exactas y "varias" como dice; si ya se sabe, por el texto o una aclaración, ponela en detalles de ese registro, con ' +
            'la pregunta tal cual y las respuestas elegidas entre las opciones):',
          ...preguntas.map((q) => `- ${q.concepto}: ${q.pregunta} Opciones: ${q.opciones.join(', ')}${q.varias ? ' (puede elegir varias)' : ' (una sola)'}`),
        ]
      : []),
    ...(lugaresComida.length ? ['Lugares donde ya comió (los más frecuentes primero):', ...lugaresComida.map((l) => `- ${l}`)] : []),
    ...(activos.length ? ['Remedios que ya tiene programados:', ...activos.map((t) => `- ${t.remedio}, ${frecuenciaTexto(t)}`)] : []),
    ...(malestares.length
      ? [
          'Malestares que tiene abiertos ahora (siguen sin pasarse):',
          ...malestares.map((m) => `- ${m.concepto}, desde las ${hhmm(minutosDelDia(new Date(m.inicio), p.zona_horaria))}`),
          'Si anota un remedio que tomó y no dice para qué, preguntá primero si fue para alguno de esos malestares ("¿Lo ' +
            'tomaste para el dolor de cabeza?"), con esos malestares como primeras opciones (con el nombre exacto) y después otras ' +
            'razones probables; "varias" en true si hay más de uno. Si ya se sabe para cuál (por el texto o una aclaración), ponelo ' +
            'en para_malestar de ese registro de medicación, con el nombre exacto de la lista, y no lo preguntes. Si fue para otra ' +
            'cosa, para_malestar va en null.',
        ]
      : []),
    '',
    ...(imagen ? ['La persona mandó una foto (arriba) para anotar.'] : []),
    ...(pista ? [`La persona eligió anotar esto: ${pista}. Es eso: no preguntes qué comida o momento fue.`] : []),
    'Texto de la persona:',
    texto || '(sin texto: solo la foto)',
  ].join('\n');
  const r = await pedirJson<Respuesta>({ sistema, texto: consigna, esquema: ESQUEMA, esfuerzo: 'low', maxTokens: 8000, imagenes: imagen ? [imagen] : undefined });
  const idCat = new Map(cats.map((c) => [c.clave, c.id]));
  const medicacion = idCat.get('medicacion');
  return {
    // Cada duda con sus respuestas posibles, para contestar con un toque (también acepta texto suelto, por las dudas).
    dudas: (r.dudas ?? []).map((d) =>
      typeof d === 'string'
        ? { pregunta: d, opciones: [], varias: false }
        : { pregunta: d.pregunta, opciones: (d.opciones ?? []).filter((o) => o.trim()).slice(0, 5), varias: Boolean(d.varias) },
    ),
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
          donde: x.donde ?? null,
          lugar: x.lugar ?? null,
          ...(x.categoria === 'medicacion' && x.para_malestar
            ? { para_registro_id: malestares.find((m) => normalizar(m.concepto) === normalizar(x.para_malestar!))?.id ?? null, para: x.para_malestar }
            : {}),
          ...(x.detalles?.length
            ? { detalles: x.detalles.map((d) => ({ pregunta: d.pregunta, respuestas: d.respuestas.filter((r) => r.trim()) })).filter((d) => d.respuestas.length) }
            : {}),
          ...(x.categoria === 'comida' ? { porcion: esPorcion(x.porcion) ? x.porcion : null, tipos: [...new Set((x.tipos ?? []).filter(esTipoComida))] } : {}),
        };
      }),
  };
}
