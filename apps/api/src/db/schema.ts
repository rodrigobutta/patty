// Esquema de la base de Patty.
//
// La idea central: todo lo que se anota es un "registro" de un "concepto". El concepto es el catálogo (Tomate, Dolor
// de cabeza, Llamadas, Temperatura) y el registro es cada vez que pasó, con su hora y su valor. El nombre del concepto
// es lo que ve la persona; internamente todo se cruza por id, así las búsquedas de patrones son enteros indexados.
//
// - Los registros manuales van a `registros`; lo que mandan relojes, teléfono o clima va a `mediciones` (mucho más
//   volumen, se carga de a lotes y sin repetir).
// - La vista `serie_diaria` (migración 0001) junta las dos cosas en una fila por persona, día y concepto: es lo que lee
//   el motor de patrones.
// - Las fechas de los registros se guardan como instante (timestamptz) y además como día local de la persona (`fecha`),
//   porque "a los dos días" se cuenta en días de la persona, no en UTC.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => integer('id').primaryKey().generatedByDefaultAsIdentity();
const idGrande = () => bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity();
const instante = (nombre: string) => timestamp(nombre, { withTimezone: true, mode: 'string' });
const creado = () => instante('creado').notNull().defaultNow();

// ---------- Usuarios y acceso ----------

export const usuarios = pgTable(
  'usuarios',
  {
    id: id(),
    usuario: text('usuario').notNull().unique(),
    nombre: text('nombre').notNull(),
    email: text('email'),
    /** La foto de la cuenta de Google (URL), si entró con Google. */
    foto: text('foto'),
    /** Cómo quiere que le diga Patty (si no, el diminutivo de su nombre). */
    apodo: text('apodo'),
    /** Si aparece en el tablero general de puntos (con su apodo y su foto). */
    ranking: boolean('ranking').notNull().default(true),
    /** A qué hora le llega la encuesta de la noche (HH:MM); null si la apagó. La manda el servidor a Android. */
    encuesta_hora: text('encuesta_hora'),
    /**
     * Si cuenta todo su día a la noche (no anota durante el día): el búho no la espera ni le reclama de tarde, y a la
     * noche le propone contar el día entero. null = lo decide Patty mirando a qué hora suele anotar.
     */
    cuenta_de_noche: boolean('cuenta_de_noche'),
    clave: text('clave').notNull(),
    rol: text('rol', { enum: ['admin', 'editor', 'lector'] }).notNull().default('editor'),
    activo: boolean('activo').notNull().default(true),
    /** El idioma en que usa la app (para los avisos que manda el servidor). */
    idioma: text('idioma').notNull().default('es'),
    /** Si quiere el aviso de la tarde cuando no anotó nada en el día ("te extraño"). */
    avisar_sin_anotar: boolean('avisar_sin_anotar').notNull().default(true),
    /** La última vez que usó la app (se actualiza cada tantos minutos, para la administración). */
    ultimo_acceso: instante('ultimo_acceso'),
    creado: creado(),
  },
  (t) => [uniqueIndex('usuarios_email_idx').on(sql`lower(${t.email})`)],
);

export const sesiones = pgTable(
  'sesiones',
  {
    token: text('token').primaryKey(),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    vence: instante('vence').notNull(),
  },
  (t) => [index('sesiones_usuario_idx').on(t.usuario_id)],
);

/** La persona de la que se anota el día (uno mismo, un hijo, la abuela...). */
export const personas = pgTable('personas', {
  id: id(),
  nombre: text('nombre').notNull(),
  zona_horaria: text('zona_horaria').notNull().default('America/Argentina/Buenos_Aires'),
  nacimiento: date('nacimiento', { mode: 'string' }),
  /**
   * Datos opcionales para que Patty entienda mejor los patrones (no es una app médica): sexo, altura, peso y
   * condiciones crónicas ("Hipertensión", "Celiaquía"). Se cargan en la bienvenida o después, en Más.
   */
  sexo: text('sexo', { enum: ['femenino', 'masculino', 'otro'] }),
  altura_cm: smallint('altura_cm'),
  peso_kg: doublePrecision('peso_kg'),
  condiciones: text('condiciones').array().notNull().default(sql`'{}'::text[]`),
  notas: text('notas'),
  creado_por: integer('creado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  creado: creado(),
});

/** Qué usuarios pueden ver y anotar a cada persona. */
export const personaUsuarios = pgTable(
  'persona_usuarios',
  {
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    rol: text('rol', { enum: ['dueno', 'editor', 'lector'] }).notNull().default('editor'),
  },
  (t) => [primaryKey({ columns: [t.persona_id, t.usuario_id] }), index('persona_usuarios_usuario_idx').on(t.usuario_id)],
);

// ---------- Catálogo ----------

export const categorias = pgTable('categorias', {
  id: id(),
  clave: text('clave').notNull().unique(),
  nombre: text('nombre').notNull(),
  icono: text('icono').notNull().default('📝'),
  rol: text('rol', { enum: ['causa', 'efecto', 'ambos'] }).notNull().default('ambos'),
  tipo_valor: text('tipo_valor', { enum: ['evento', 'cantidad', 'intensidad', 'duracion', 'hora', 'medida'] }).notNull().default('evento'),
  unidad: text('unidad'),
  orden: integer('orden').notNull().default(0),
});

/**
 * Cada cosa que se puede anotar. `nombre` es lo que se ve; `nombre_norm` (sin tildes, minúsculas) es la clave única
 * dentro de la categoría y lo que usa el autocompletar (índice de trigramas, así "tomat" o "tomates" encuentran "Tomate").
 */
export const conceptos = pgTable(
  'conceptos',
  {
    id: id(),
    categoria_id: integer('categoria_id')
      .notNull()
      .references(() => categorias.id),
    nombre: text('nombre').notNull(),
    nombre_norm: text('nombre_norm').notNull(),
    tipo_valor: text('tipo_valor', { enum: ['evento', 'cantidad', 'intensidad', 'duracion', 'hora', 'medida'] }).notNull(),
    unidad: text('unidad'),
    /**
     * Si ya se le preguntó a la persona si este concepto lleva cantidad ("¿cuántos huevos?", "¿cuántos vasos?"). Se
     * pregunta una vez, la primera vez que se anota algo de comida, bebida o medicación.
     */
    cantidad_decidida: boolean('cantidad_decidida').notNull().default(false),
    /** Para agrupar: "Tomate" dentro de "Verduras". El análisis puede mirar el grupo además del concepto. */
    padre_id: integer('padre_id'),
    /** Si se unió con otro (dos nombres para lo mismo), a cuál. Sus registros pasan al otro. */
    unido_a: integer('unido_a'),
    usos: integer('usos').notNull().default(0),
    ultimo_uso: instante('ultimo_uso'),
    creado_por: integer('creado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    creado: creado(),
  },
  (t) => [
    uniqueIndex('conceptos_nombre_idx').on(t.categoria_id, t.nombre_norm).where(sql`${t.unido_a} IS NULL`),
    index('conceptos_trgm_idx').using('gin', sql`${t.nombre_norm} gin_trgm_ops`),
    index('conceptos_usos_idx').on(t.usos.desc()),
  ],
);

/** Otros nombres de un concepto (sinónimos, plurales, el nombre viejo de uno que se unió). */
export const conceptoAlias = pgTable(
  'concepto_alias',
  {
    id: id(),
    concepto_id: integer('concepto_id')
      .notNull()
      .references(() => conceptos.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    alias_norm: text('alias_norm').notNull(),
  },
  (t) => [
    uniqueIndex('concepto_alias_norm_idx').on(t.alias_norm, t.concepto_id),
    index('concepto_alias_trgm_idx').using('gin', sql`${t.alias_norm} gin_trgm_ops`),
  ],
);

// ---------- Lo que se anota ----------

export const registros = pgTable(
  'registros',
  {
    id: idGrande(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    concepto_id: integer('concepto_id')
      .notNull()
      .references(() => conceptos.id),
    inicio: instante('inicio').notNull(),
    fin: instante('fin'),
    /** Día de la persona (en su zona horaria, de 5 a 5: lo de la madrugada cuenta para la noche anterior). */
    fecha: date('fecha', { mode: 'string' }).notNull(),
    valor: doublePrecision('valor'),
    intensidad: smallint('intensidad'),
    unidad: text('unidad'),
    nota: text('nota'),
    /** manual, ia (texto libre interpretado), importado... */
    origen: text('origen').notNull().default('manual'),
    /** Datos extra que todavía no tienen columna propia (escala de Bristol, lugar del dolor, etc.). */
    datos: jsonb('datos'),
    creado_por: integer('creado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    creado: creado(),
    borrado: instante('borrado'),
  },
  (t) => [
    index('registros_persona_fecha_idx').on(t.persona_id, t.fecha),
    index('registros_persona_concepto_idx').on(t.persona_id, t.concepto_id, t.inicio),
  ],
);

/** De dónde llegan las mediciones automáticas: un reloj, el teléfono, un servicio de clima. Cada una con su token. */
export const fuentes = pgTable('fuentes', {
  id: id(),
  persona_id: integer('persona_id')
    .notNull()
    .references(() => personas.id, { onDelete: 'cascade' }),
  tipo: text('tipo', { enum: ['reloj', 'telefono', 'clima', 'ubicacion', 'otro'] }).notNull(),
  nombre: text('nombre').notNull(),
  /** sha256 del token; el token se muestra una sola vez, al crear la fuente. */
  token_hash: text('token_hash').notNull().unique(),
  activo: boolean('activo').notNull().default(true),
  ultimo_uso: instante('ultimo_uso'),
  creado: creado(),
});

/** Valores medidos (pasos, pulso, horas de pantalla, temperatura...). Un mismo dato no se carga dos veces. */
export const mediciones = pgTable(
  'mediciones',
  {
    id: idGrande(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    concepto_id: integer('concepto_id')
      .notNull()
      .references(() => conceptos.id),
    fuente_id: integer('fuente_id')
      .notNull()
      .references(() => fuentes.id, { onDelete: 'cascade' }),
    inicio: instante('inicio').notNull(),
    fin: instante('fin'),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    valor: doublePrecision('valor').notNull(),
    unidad: text('unidad'),
    creado: creado(),
  },
  (t) => [
    uniqueIndex('mediciones_unica_idx').on(t.persona_id, t.concepto_id, t.inicio, t.fuente_id),
    index('mediciones_persona_fecha_idx').on(t.persona_id, t.fecha),
  ],
);

// ---------- Ubicación ----------

/**
 * Lugares con nombre de una persona (Casa, lo de mamá, Supermercado). Cada uno tiene su concepto en «Lugares y salidas»:
 * las estadías se guardan como mediciones de ese concepto y así entran al análisis como cualquier causa.
 */
export const lugares = pgTable(
  'lugares',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    concepto_id: integer('concepto_id')
      .notNull()
      .references(() => conceptos.id),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    radio_m: integer('radio_m').notNull().default(150),
    creado: creado(),
  },
  (t) => [index('lugares_persona_idx').on(t.persona_id), uniqueIndex('lugares_concepto_idx').on(t.persona_id, t.concepto_id)],
);

/**
 * Por dónde anduvo la persona: un punto cada vez que se movió más de 1 km o entró o salió de un lugar. Es lo único que
 * guarda coordenadas, redondeadas a ~10 m, y se borra solo a los 90 días; lo que queda son los resúmenes (mediciones).
 */
export const puntos = pgTable(
  'puntos',
  {
    id: idGrande(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    instante: instante('instante').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    precision_m: integer('precision_m'),
    creado: creado(),
  },
  (t) => [uniqueIndex('puntos_persona_instante_idx').on(t.persona_id, t.instante), index('puntos_persona_fecha_idx').on(t.persona_id, t.fecha)],
);

// ---------- Remedios ----------

/**
 * Un remedio que la persona toma de forma programada ("paracetamol 1 g cada 8 horas por 5 días", "vitamina D todos
 * los días a las 9") o cuando hace falta. De acá salen las tomas que se recuerdan con avisos del teléfono:
 * - `cada_horas`: cada tantas horas desde `inicio` (la primera toma).
 * - si no, `horarios`: todos los días a esas horas locales ("09:00", "21:00"), desde el día de `inicio`.
 * - sin ninguno de los dos: cuando haga falta (no se recuerda; se anota con un toque).
 * Cada toma tomada es un registro de medicación, así entra a los patrones como cualquier otra cosa.
 */
export const tratamientos = pgTable(
  'tratamientos',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    concepto_id: integer('concepto_id')
      .notNull()
      .references(() => conceptos.id),
    dosis: doublePrecision('dosis'),
    unidad: text('unidad'),
    cada_horas: doublePrecision('cada_horas'),
    horarios: text('horarios').array().notNull().default(sql`'{}'::text[]`),
    inicio: instante('inicio').notNull(),
    /** Hasta cuándo (sin incluir). Sin fin: crónico, hasta que se termine a mano. */
    fin: instante('fin'),
    /** Por qué lo toma ("anginas"), si se dijo. */
    motivo: text('motivo'),
    nota: text('nota'),
    /** Si se terminó antes (o se dejó, en los crónicos): desde ahí no hay más tomas. */
    terminado: instante('terminado'),
    creado_por: integer('creado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    creado: creado(),
    borrado: instante('borrado'),
  },
  (t) => [index('tratamientos_persona_idx').on(t.persona_id)],
);

/**
 * Lo que pasó con cada toma programada: se tomó (con su registro de medicación) o se salteó a propósito. Las que no
 * tienen fila y ya pasaron son las olvidadas.
 */
export const tomas = pgTable(
  'tomas',
  {
    id: idGrande(),
    tratamiento_id: integer('tratamiento_id')
      .notNull()
      .references(() => tratamientos.id, { onDelete: 'cascade' }),
    programada: instante('programada').notNull(),
    estado: text('estado', { enum: ['tomada', 'salteada'] }).notNull(),
    registro_id: bigint('registro_id', { mode: 'number' }).references(() => registros.id, { onDelete: 'set null' }),
    creado: creado(),
  },
  (t) => [uniqueIndex('tomas_unica_idx').on(t.tratamiento_id, t.programada), index('tomas_registro_idx').on(t.registro_id)],
);

// ---------- Avisos push ----------

/**
 * Los teléfonos con la app instalada, para mandarles avisos push (Firebase). `avisos_hasta`: hasta cuándo ese teléfono
 * ya tiene programados por su cuenta los recordatorios de remedios; después de eso, los manda el servidor.
 */
export const dispositivos = pgTable(
  'dispositivos',
  {
    id: id(),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    plataforma: text('plataforma').notNull(),
    avisos_hasta: instante('avisos_hasta'),
    creado: creado(),
    actualizado: instante('actualizado').notNull().defaultNow(),
  },
  (t) => [index('dispositivos_usuario_idx').on(t.usuario_id)],
);

/** Los avisos que ya mandó el servidor (para no mandar dos veces el mismo). Se limpian solos a los 30 días. */
export const avisosEnviados = pgTable('avisos_enviados', {
  clave: text('clave').primaryKey(),
  enviado: creado(),
});

/** Lo que se le mandó por push a cada usuario (para que la administración vea qué le dice Patty a cada uno). */
export const avisosHistorial = pgTable(
  'avisos_historial',
  {
    id: id(),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    persona_id: integer('persona_id'),
    /** El `tipo` de los datos del aviso (toma, encuesta, hallazgo, admin…). */
    tipo: text('tipo'),
    titulo: text('titulo').notNull(),
    cuerpo: text('cuerpo').notNull(),
    /** ok, invalido (el teléfono ya no está) o error. */
    resultado: text('resultado').notNull(),
    creado: creado(),
  },
  (t) => [index('avisos_historial_usuario_idx').on(t.usuario_id, t.creado)],
);

/**
 * Cómo está cada instalación de la app (teléfono o navegador): qué permisos dio y qué tiene prendido. La manda la app
 * al abrirse; la mira la administración para saber si cada uno pudo configurar todo.
 */
export const instalaciones = pgTable(
  'instalaciones',
  {
    id: text('id').primaryKey(),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    plataforma: text('plataforma').notNull(),
    estado: jsonb('estado').notNull(),
    creado: creado(),
    actualizado: instante('actualizado').notNull().defaultNow(),
  },
  (t) => [index('instalaciones_usuario_idx').on(t.usuario_id)],
);

// ---------- Supervisión ----------

/**
 * Un usuario que supervisa a otro (un hijo a su mamá, por ejemplo): lo pide el supervisor y el supervisado lo acepta.
 * Aceptada, el supervisor ve y anota en las personas del supervisado (las que tiene como dueño), recibe avisos si se
 * olvida una toma o pasa el día sin anotar, y le puede mandar avisos. Cualquiera de los dos la puede terminar.
 * La vista `accesos` (migración 0006) junta esto con `persona_usuarios`: es lo que se usa para saber quién ve a quién.
 */
export const supervisiones = pgTable(
  'supervisiones',
  {
    id: id(),
    supervisor_id: integer('supervisor_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    supervisado_id: integer('supervisado_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    estado: text('estado', { enum: ['pendiente', 'aceptada', 'rechazada'] }).notNull().default('pendiente'),
    creado: creado(),
    respondido: instante('respondido'),
  },
  (t) => [uniqueIndex('supervisiones_par_idx').on(t.supervisor_id, t.supervisado_id), index('supervisiones_supervisado_idx').on(t.supervisado_id)],
);

/**
 * Un código corto que muestra en pantalla quien quiere ser supervisado: el supervisor lo escribe y la supervisión queda
 * aceptada, sin invitación. Vence a los 15 minutos y sirve una sola vez.
 */
export const codigosSupervision = pgTable('codigos_supervision', {
  codigo: text('codigo').primaryKey(),
  usuario_id: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  vence: instante('vence').notNull(),
});

// ---------- Patrones ----------

/** Cada vez que se corre el análisis de una persona. */
export const analisis = pgTable(
  'analisis',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    desde: date('desde', { mode: 'string' }).notNull(),
    hasta: date('hasta', { mode: 'string' }).notNull(),
    dias: integer('dias').notNull(),
    pares_evaluados: integer('pares_evaluados').notNull(),
    resumen: text('resumen'),
    sugerencias: jsonb('sugerencias').$type<string[]>(),
    /** manual = la persona tocó "Buscar patrones"; noche = lo corrió solo el servidor de madrugada. */
    origen: text('origen', { enum: ['manual', 'noche'] }).notNull().default('manual'),
    /** Los hallazgos que aparecieron por primera vez en este análisis (los que se avisan a la mañana). */
    nuevos: jsonb('nuevos').$type<number[]>().notNull().default([]),
    creado: creado(),
  },
  (t) => [index('analisis_persona_idx').on(t.persona_id, t.creado)],
);

/**
 * Una relación encontrada: "cuando hay <causa>, <desfase> días después hay <efecto> más seguido que cuando no".
 * Se guarda la estadística (para poder ordenarlas y volver a calcularlas) y la explicación de la IA.
 * La persona puede confirmarla o descartarla; eso queda aunque se vuelva a correr el análisis.
 */
export const hallazgos = pgTable(
  'hallazgos',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    causa_id: integer('causa_id')
      .notNull()
      .references(() => conceptos.id),
    efecto_id: integer('efecto_id')
      .notNull()
      .references(() => conceptos.id),
    /** presente = ese día hubo; alto / bajo = ese día el valor estuvo por encima / debajo de lo habitual de la persona */
    causa_modo: text('causa_modo', { enum: ['presente', 'alto', 'bajo'] }).notNull().default('presente'),
    efecto_modo: text('efecto_modo', { enum: ['presente', 'alto', 'bajo'] }).notNull().default('presente'),
    desfase_dias: smallint('desfase_dias').notNull(),
    soporte: integer('soporte').notNull(),
    dias_causa: integer('dias_causa').notNull(),
    dias_evaluados: integer('dias_evaluados').notNull(),
    prob_con: doublePrecision('prob_con').notNull(),
    prob_sin: doublePrecision('prob_sin').notNull(),
    lift: doublePrecision('lift').notNull(),
    p_valor: doublePrecision('p_valor').notNull(),
    q_valor: doublePrecision('q_valor').notNull(),
    puntaje: doublePrecision('puntaje').notNull(),
    explicacion: text('explicacion'),
    estado: text('estado', { enum: ['nuevo', 'confirmado', 'obvio', 'descartado'] }).notNull().default('nuevo'),
    analisis_id: integer('analisis_id').references(() => analisis.id, { onDelete: 'set null' }),
    detectado: instante('detectado').notNull().defaultNow(),
    actualizado: instante('actualizado').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('hallazgos_par_idx').on(t.persona_id, t.causa_id, t.causa_modo, t.efecto_id, t.efecto_modo, t.desfase_dias),
    index('hallazgos_persona_idx').on(t.persona_id, t.puntaje.desc()),
  ],
);

/** Ajustes de toda la app que maneja la administración (por ejemplo, la última versión de la app de Android). */
export const ajustes = pgTable('ajustes', {
  clave: text('clave').primaryKey(),
  valor: jsonb('valor').notNull(),
  /** Cuándo se cambió por última vez. */
  creado: creado(),
});

/**
 * La gente de cada persona (familia, amigos, compañeros): con quién estuvo se anota con estos nombres, que son conceptos
 * de la categoría "Con gente" (así entran en los patrones: "cuando estás con Juan, te sentís mejor"). La lista es de
 * cada persona: los nombres de una no se le sugieren a otra.
 */
export const gente = pgTable(
  'gente',
  {
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    concepto_id: integer('concepto_id')
      .notNull()
      .references(() => conceptos.id, { onDelete: 'cascade' }),
    /** Sacado de la lista (lo anotado con esa persona queda, pero ya no se ofrece). */
    oculta: boolean('oculta').notNull().default(false),
    creado: creado(),
  },
  (t) => [primaryKey({ columns: [t.persona_id, t.concepto_id] })],
);

/** Lo que cada usuario le preguntó a Patty sobre sus datos y lo que le contestó (la administración lo puede ver). */
export const preguntas = pgTable(
  'preguntas',
  {
    id: id(),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    pregunta: text('pregunta').notNull(),
    respuesta: text('respuesta').notNull(),
    fechas: jsonb('fechas').$type<string[]>().notNull().default([]),
    creado: creado(),
  },
  (t) => [index('preguntas_usuario_idx').on(t.usuario_id, t.creado)],
);

/**
 * Cuánto se usó la app cada día (en el día del teléfono): la app suma el tiempo que está a la vista y lo manda cada
 * minuto. `pantallas`: segundos por pestaña (hoy, patrones, mas, admin).
 */
export const usoDiario = pgTable(
  'uso_diario',
  {
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    segundos: integer('segundos').notNull().default(0),
    aperturas: integer('aperturas').notNull().default(0),
    pantallas: jsonb('pantallas').$type<Record<string, number>>().notNull().default({}),
    plataforma: text('plataforma'),
    actualizado: instante('actualizado').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.usuario_id, t.fecha] })],
);

/**
 * Lo que Patty le comenta a la persona sobre lo que va anotando ("¡qué bien que comas huevo seguido!"), para que vea
 * desde el primer día que tiene en cuenta lo que cuenta, mucho antes de que haya patrones. Unos pocos por día.
 */
export const comentarios = pgTable(
  'comentarios',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    /** El día de Patty en que se le muestra. */
    fecha: date('fecha', { mode: 'string' }).notNull(),
    emoji: text('emoji').notNull().default('🦉'),
    texto: text('texto').notNull(),
    /** nuevo, visto (lo cerró), gusta (le gustó). */
    estado: text('estado', { enum: ['nuevo', 'visto', 'gusta'] }).notNull().default('nuevo'),
    creado: creado(),
  },
  (t) => [index('comentarios_persona_idx').on(t.persona_id, t.fecha)],
);

/**
 * Las etapas de cada noche con su hora (del reloj, por Health Connect o Salud): despierto, ligero, profundo, REM (o
 * "dormido" si el reloj no las distingue). `noche` es el día en que uno se despierta, como el resto del sueño. Sirven
 * para el gráfico de la noche y para notar despertares que se repiten a la misma hora.
 */
export const suenoEtapas = pgTable(
  'sueno_etapas',
  {
    id: idGrande(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    noche: date('noche', { mode: 'string' }).notNull(),
    inicio: instante('inicio').notNull(),
    fin: instante('fin').notNull(),
    etapa: text('etapa', { enum: ['despierto', 'ligero', 'profundo', 'rem', 'dormido'] }).notNull(),
  },
  (t) => [index('sueno_etapas_noche_idx').on(t.persona_id, t.noche)],
);

/**
 * Cómo fue cada noche según la IA (mirando las etapas, las horas y lo que se anotó la tarde anterior y a la mañana):
 * un resumen corto y una nota de calidad de 1 a 10, que además entra en los patrones como "Calidad del sueño".
 */
export const resumenNoche = pgTable(
  'resumen_noche',
  {
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    noche: date('noche', { mode: 'string' }).notNull(),
    texto: text('texto').notNull(),
    calidad: integer('calidad').notNull(),
    creado: creado(),
  },
  (t) => [primaryKey({ columns: [t.persona_id, t.noche] })],
);

/**
 * El resumen de cada semana (de lunes a domingo) que arma Patty el domingo a la noche: un título, unas líneas, lo que
 * se destacó y 1 o 2 cosas para probar, más los números de la semana (para comparar y para los gráficos).
 */
export const resumenSemana = pgTable(
  'resumen_semana',
  {
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    /** El lunes de esa semana. */
    semana: date('semana', { mode: 'string' }).notNull(),
    titulo: text('titulo').notNull(),
    texto: text('texto').notNull(),
    destacados: jsonb('destacados').$type<Array<{ emoji: string; texto: string }>>().notNull().default([]),
    sugerencias: jsonb('sugerencias').$type<string[]>().notNull().default([]),
    numeros: jsonb('numeros').$type<Record<string, number | null>>().notNull().default({}),
    creado: creado(),
  },
  (t) => [primaryKey({ columns: [t.persona_id, t.semana] })],
);

/**
 * "¿Qué pasó antes?": para un dolor, una molestia o un mal momento anotado, lo de las 72 horas previas (comidas, sueño,
 * clima, movimiento, lugares) y unas líneas de la IA. Lo arma un job al rato de anotarlo; se ve al abrir el registro.
 */
export const contextoRegistro = pgTable('contexto_registro', {
  registro_id: bigint('registro_id', { mode: 'number' })
    .primaryKey()
    .references(() => registros.id, { onDelete: 'cascade' }),
  persona_id: integer('persona_id')
    .notNull()
    .references(() => personas.id, { onDelete: 'cascade' }),
  texto: text('texto'),
  items: jsonb('items').$type<Array<{ cuando: string; emoji: string; texto: string }>>().notNull().default([]),
  creado: creado(),
});

/**
 * Cuando algo se sale de lo normal de la persona (patrones/fueraDeLoNormal.ts): varias noches durmiendo menos, una
 * molestia que se repite más que de costumbre, el ánimo más bajo, menos pasos, más pantalla. Lo revisa un job a la
 * mañana; cada `clave` se avisa a lo sumo una vez por semana.
 */
export const fueraDeLoNormal = pgTable(
  'fuera_de_lo_normal',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    /** El día de Patty en que se detectó. */
    fecha: date('fecha', { mode: 'string' }).notNull(),
    /** Qué se salió: sueno, pasos, pantalla, animo, sintoma:<concepto_id>. */
    clave: text('clave').notNull(),
    emoji: text('emoji').notNull(),
    texto: text('texto').notNull(),
    /** Los números con los que se decidió (lo reciente y lo habitual). */
    datos: jsonb('datos').$type<Record<string, number | string | null>>().notNull().default({}),
    estado: text('estado', { enum: ['nuevo', 'visto'] }).notNull().default('nuevo'),
    creado: creado(),
  },
  (t) => [uniqueIndex('fuera_de_lo_normal_idx').on(t.persona_id, t.clave, t.fecha)],
);

/**
 * Los objetivos suaves de una semana (lunes a domingo) que propone el resumen del domingo ("caminar 3 días", "dormir
 * 7 horas o más 4 noches"). La persona los acepta o no; Patty cuenta solo cuántos días se cumplieron y el resumen
 * siguiente lo comenta. Un día cumple según `tipo`: concepto (se anotó ese concepto, o "Caminata", etc.), sin_concepto
 * (no se anotó), y las mediciones del día con un mínimo o máximo (sueno_min en horas, pasos_min, pantalla_max en minutos).
 */
export const objetivos = pgTable(
  'objetivos',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    /** El lunes de la semana del objetivo. */
    semana: date('semana', { mode: 'string' }).notNull(),
    texto: text('texto').notNull(),
    emoji: text('emoji').notNull().default('🎯'),
    tipo: text('tipo', { enum: ['concepto', 'sin_concepto', 'sueno_min', 'pasos_min', 'pantalla_max'] }).notNull(),
    concepto: text('concepto'),
    valor: doublePrecision('valor'),
    /** Cuántos días de los 7. */
    meta_dias: smallint('meta_dias').notNull(),
    estado: text('estado', { enum: ['propuesto', 'aceptado', 'descartado'] }).notNull().default('propuesto'),
    /** Al cerrar la semana: cuántos días se cumplió. */
    logrados: smallint('logrados'),
    creado: creado(),
  },
  (t) => [index('objetivos_persona_idx').on(t.persona_id, t.semana)],
);

/**
 * Preguntas que la persona configura para una cosa que anota ("Café" → "¿Con qué?": azúcar, edulcorante, leche):
 * Patty las hace al anotarla (contándolo, con el toque rápido o un atajo) y la respuesta queda en el registro como
 * detalle, que entra a los patrones como un concepto más ("Café · Azúcar"). `concepto_norm` es el nombre normalizado,
 * así sirve aunque el concepto todavía no exista.
 */
export const preguntasConcepto = pgTable(
  'preguntas_concepto',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    concepto: text('concepto').notNull(),
    concepto_norm: text('concepto_norm').notNull(),
    pregunta: text('pregunta').notNull(),
    opciones: text('opciones').array().notNull().default(sql`'{}'::text[]`),
    varias: boolean('varias').notNull().default(false),
    activa: boolean('activa').notNull().default(true),
    creado: creado(),
  },
  (t) => [index('preguntas_concepto_idx').on(t.persona_id, t.concepto_norm)],
);

/** Plantillas de seguimiento propias de una persona (las de siempre están en shared: PLANTILLAS_SEGUIMIENTO). */
export const plantillasSeguimiento = pgTable('plantillas_seguimiento', {
  id: id(),
  persona_id: integer('persona_id')
    .notNull()
    .references(() => personas.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  emoji: text('emoji').notNull().default('🩺'),
  items: text('items').array().notNull(),
  horarios: text('horarios').array().notNull(),
  dias: smallint('dias').notNull().default(5),
  creado: creado(),
});

/**
 * Un seguimiento activado (una copia de la plantilla, así cambiarla después no lo toca): de `desde` a `hasta`. Lo puede
 * activar la persona o alguien de su familia (activado_por). Ver patrones/seguimientos.ts para los avisos.
 */
export const seguimientos = pgTable(
  'seguimientos',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    emoji: text('emoji').notNull().default('🩺'),
    items: text('items').array().notNull(),
    horarios: text('horarios').array().notNull(),
    dias: smallint('dias').notNull(),
    desde: instante('desde').notNull(),
    hasta: instante('hasta').notNull(),
    activado_por: integer('activado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    creado: creado(),
  },
  (t) => [index('seguimientos_persona_idx').on(t.persona_id, t.hasta)],
);

/**
 * Las vueltas a pie que detectó la ubicación (sacar a los perros, dar una vuelta) para sugerir anotarlas: pendiente
 * hasta que se anota (registro_id) o se descarta. Lo anotado enseña cómo se llaman (patrones/paseos.ts).
 */
export const paseosDetectados = pgTable(
  'paseos_detectados',
  {
    id: id(),
    persona_id: integer('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    inicio: instante('inicio').notNull(),
    fin: instante('fin').notNull(),
    metros: integer('metros').notNull(),
    estado: text('estado', { enum: ['pendiente', 'anotado', 'descartado'] }).notNull().default('pendiente'),
    registro_id: bigint('registro_id', { mode: 'number' }).references(() => registros.id, { onDelete: 'set null' }),
    creado: creado(),
  },
  (t) => [uniqueIndex('paseos_detectados_idx').on(t.persona_id, t.inicio)],
);
