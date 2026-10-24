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
    clave: text('clave').notNull(),
    rol: text('rol', { enum: ['admin', 'editor', 'lector'] }).notNull().default('editor'),
    activo: boolean('activo').notNull().default(true),
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
    estado: text('estado', { enum: ['nuevo', 'confirmado', 'descartado'] }).notNull().default('nuevo'),
    analisis_id: integer('analisis_id').references(() => analisis.id, { onDelete: 'set null' }),
    detectado: instante('detectado').notNull().defaultNow(),
    actualizado: instante('actualizado').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('hallazgos_par_idx').on(t.persona_id, t.causa_id, t.causa_modo, t.efecto_id, t.efecto_modo, t.desfase_dias),
    index('hallazgos_persona_idx').on(t.persona_id, t.puntaje.desc()),
  ],
);
