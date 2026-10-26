// Los recordatorios de remedios que manda el servidor. El teléfono programa los suyos para la semana siguiente cada vez
// que se abre la app (con botones para contestar sin abrirla) y avisa hasta cuándo los tiene (`avisos_hasta`). Lo que
// queda después de eso (un crónico y una semana sin abrir Patty) lo manda el servidor por push: a la hora de la toma y,
// si no se marcó, a la media hora. En Android con push, el teléfono no programa nada y los manda todos el servidor, que
// sabe qué se marcó: así junta en un solo aviso las tomas olvidadas. Corre cada minuto.
import { sql } from 'drizzle-orm';
import { apodoDe, COMO_ME_SENTI, dosisTexto, ESTADOS, esIdioma, ITEMS_PUNTOS, traducir, type Idioma, type Toma } from 'shared';
import { puntosDe } from '../routes/puntos.js';
import { filas, una, type Db } from '../db/client.js';
import { diaDePatty, fechaLocal, localAInstante } from '../lib/fechas.js';
import { COLUMNAS, DESDE, tomasDe, type Fila } from '../routes/tratamientos.js';
import { pushDisponible, type Aviso } from './firebase.js';
import { mandarAviso } from './mandar.js';

const INSISTIR_MIN = 30;
/** A la hora sin marcar, se les avisa a quienes supervisan. */
const AVISAR_SUPERVISOR_MIN = 60;
/** A esta hora (de la persona), si no anotó nada en el día, se les avisa a quienes supervisan. */
const HORA_SIN_ANOTAR = '21:00';
/** Hasta cuánto tarde se manda un aviso que no se pudo mandar a tiempo (el servidor se reinició, por ejemplo). */
const TOLERANCIA_MIN = 10;

interface Dispositivo {
  id: number;
  token: string;
  avisos_hasta: string | null;
  /** El idioma de la app de su usuario: los avisos van en ese idioma. */
  idioma?: string;
}

const idiomaDe = (d: { idioma?: string | null }): Idioma => (esIdioma(d.idioma) ? d.idioma : 'es');

/**
 * Los teléfonos de quienes anotan a la persona (los recordatorios) o de quienes la supervisan (los avisos de que algo
 * se olvidó). Los administradores ven todo, pero solo reciben avisos de las personas que son suyas.
 */
export function dispositivosDe(db: Db, personaId: number, supervisores: boolean) {
  return filas<Dispositivo>(
    db,
    sql`SELECT d.id, d.token, d.avisos_hasta, u.idioma FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id
        WHERE u.activo AND EXISTS (SELECT 1 FROM accesos pu WHERE pu.persona_id = ${personaId} AND pu.usuario_id = u.id
                                   AND pu.por_supervision = ${supervisores})`,
  );
}

/**
 * Manda un aviso a un teléfono una sola vez por `clave` (aunque haya varios servidores o se revise dos veces). Con
 * `claves`, se manda si alguna todavía no se mandó (un aviso que junta varias tomas).
 */
export async function avisarUnaVez(db: Db, d: Dispositivo, clave: string, a: Aviso, claves: string[] = [clave]): Promise<boolean> {
  let nueva = false;
  for (const k of claves) {
    if (await una(db, sql`INSERT INTO avisos_enviados (clave) VALUES (${`${k}|${d.id}`}) ON CONFLICT DO NOTHING RETURNING clave`)) nueva = true;
  }
  if (!nueva) return false;
  return (await mandarAviso(db, d, a)) === 'ok';
}

const hhmm = (iso: string, zona: string) => new Intl.DateTimeFormat('es-AR', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** Las tomas sin marcar de hasta este tiempo atrás entran en el aviso que las junta ("tenés 3 tomas sin marcar"). */
const PENDIENTES_HORAS = 12;

type Momento = 'hora' | 'insistir' | 'supervisor';

/** El pedido a la API que marca una toma (lo hace el teléfono al tocar el botón del aviso). */
const pedidoToma = (t: Toma, estado: 'tomada' | 'salteada') => ({ ruta: `/api/tratamientos/${t.tratamiento_id}/tomas`, cuerpo: { programada: t.programada, estado } });

/** "Paracetamol 500 mg de las 06:03 y 12:03; Ibuprofeno de las 08:00" (por remedio, en orden). */
function listaDeTomas(tomas: Toma[], zona: string, i: Idioma): string {
  const porRemedio = new Map<string, string[]>();
  for (const t of [...tomas].sort((a, b) => a.programada.localeCompare(b.programada))) {
    const que = `${t.remedio}${t.dosis !== null || t.unidad ? ' ' + dosisTexto(t.dosis, t.unidad, i) : ''}`;
    porRemedio.set(que, [...(porRemedio.get(que) ?? []), hhmm(t.programada, zona)]);
  }
  const y = i === 'en' ? ' and ' : ' y ';
  const unir = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')}${y}${l.at(-1)}` : l[0]);
  return [...porRemedio].map(([que, horas]) => traducir(i, '{que} de las {horas}', { que, horas: unir(horas) })).join('; ');
}

/**
 * El aviso de una persona en este momento. Con una sola toma sin marcar, el de siempre ("es la hora", "¿la tomaste?");
 * con varias, uno solo que las junta. Va con una etiqueta fija por persona: en el teléfono cada aviso nuevo reemplaza al
 * anterior en vez de apilarse.
 */
export function avisoDeTomas(
  pendientes: Toma[],
  momento: Momento,
  v: { apodo: string; nombre: string; zona: string },
  i: Idioma,
): Aviso {
  const etiqueta = `${momento === 'supervisor' ? 'remedios-sup' : 'remedios'}|${pendientes[0].persona_id}`;
  const datos: Record<string, string> = {
    tipo: 'toma',
    persona_id: String(pendientes[0].persona_id),
    tomas: JSON.stringify(pendientes.map((t) => ({ tratamiento_id: t.tratamiento_id, programada: t.programada }))),
    // La cara del búho al costado: esperando la toma; con varias olvidadas, enojada.
    cara: pendientes.length > 1 && momento !== 'supervisor' ? 'enojada' : 'espera',
    ...(momento === 'supervisor'
      ? { supervision: 'si' }
      : { boton_tomada: pendientes.length === 1 ? traducir(i, 'La tomé') : traducir(i, 'Las tomé todas'), boton_salteada: traducir(i, 'No la tomo') }),
  };
  const ultima = [...pendientes].sort((a, b) => b.programada.localeCompare(a.programada))[0];
  if (pendientes.length === 1) {
    const t = ultima;
    const x = { hora: hhmm(t.programada, v.zona), remedio: t.remedio, nombre: v.nombre, apodo: v.apodo };
    const que = `${t.remedio}${t.dosis !== null || t.unidad ? ' ' + dosisTexto(t.dosis, t.unidad, i) : ''}`;
    Object.assign(datos, { tratamiento_id: String(t.tratamiento_id), programada: t.programada });
    const textos =
      momento === 'hora'
        ? { titulo: `💊 ${que}`, cuerpo: v.apodo ? traducir(i, '{apodo}, es la hora de la toma de las {hora}.', x) : traducir(i, 'Es la hora de la toma de las {hora}.', x) }
        : momento === 'insistir'
          ? { titulo: v.apodo ? traducir(i, '{apodo}, ¿tomaste {remedio}?', x) : traducir(i, '¿Tomaste {remedio}?', x), cuerpo: traducir(i, 'La de las {hora} todavía no está marcada.', x) }
          : { titulo: traducir(i, '💊 {nombre} no marcó {remedio}', x), cuerpo: traducir(i, 'La toma de las {hora} sigue sin marcar. Podés mandarle un aviso desde Patty.', x) };
    const acciones: Aviso['acciones'] =
      momento === 'supervisor'
        ? undefined
        : [
            { titulo: traducir(i, 'La tomé'), pedidos: [pedidoToma(t, 'tomada')], listo: traducir(i, '✓ Anotado: {remedio} tomado 💊', x) },
            { titulo: traducir(i, 'No la tomo'), pedidos: [pedidoToma(t, 'salteada')], listo: traducir(i, 'Anotado que no tomaste {remedio} 😤', x) },
          ];
    return { ...textos, datos, canal: 'remedios', etiqueta, acciones };
  }
  const x = { n: pendientes.length, apodo: v.apodo, nombre: v.nombre, lista: listaDeTomas(pendientes, v.zona, i) };
  if (momento === 'supervisor') {
    return { titulo: traducir(i, '💊 {nombre} tiene {n} tomas sin marcar', x), cuerpo: traducir(i, '{lista}. Podés mandarle un aviso desde Patty.', x), datos, canal: 'remedios', etiqueta };
  }
  return {
    titulo: v.apodo ? traducir(i, '{apodo}, te estás olvidando {n} tomas', x) : traducir(i, 'Te estás olvidando {n} tomas', x),
    cuerpo: traducir(i, '{lista}. Marcalas cuando las tomes.', x),
    datos,
    canal: 'remedios',
    etiqueta,
    acciones: [{ titulo: traducir(i, 'Las tomé todas'), pedidos: pendientes.map((t) => pedidoToma(t, 'tomada')), listo: traducir(i, '✓ Anotadas {n} tomas 💊', x) }],
  };
}

/**
 * Revisa las tomas de los últimos minutos y manda los avisos que falten: a la hora de la toma, a la media hora si no
 * se marcó y, a la hora, a quienes supervisan. Si en un mismo momento tocan varias (o quedaron otras sin marcar), va
 * un solo aviso por persona que las junta. Devuelve cuántos mandó.
 */
export async function revisarTomas(db: Db, ahora = new Date()): Promise<number> {
  const desde = new Date(ahora.getTime() - Math.max(PENDIENTES_HORAS * 60, AVISAR_SUPERVISOR_MIN + TOLERANCIA_MIN) * 60000);
  const lista = await filas<Fila>(
    db,
    sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.borrado IS NULL AND t.terminado IS NULL AND (t.fin IS NULL OR t.fin > ${desde.toISOString()})
        AND (cardinality(t.horarios) > 0 OR t.cada_horas IS NOT NULL)
        AND EXISTS (SELECT 1 FROM dispositivos)`,
  );
  if (!lista.length) return 0;
  const porId = new Map(lista.map((t) => [t.id, t]));
  const pendientes = (await tomasDe(db, lista, desde, new Date(ahora.getTime() + 1000))).filter((t) => t.estado === null);
  // El apodo de la dueña o el dueño de cada persona, para que el aviso le hable por su nombre.
  const apodos = new Map(
    (await filas<{ persona_id: number; nombre: string; apodo: string | null }>(
      db,
      sql`SELECT pu.persona_id, u.nombre, u.apodo FROM persona_usuarios pu JOIN usuarios u ON u.id = pu.usuario_id WHERE pu.rol = 'dueno'`,
    )).map((f) => [f.persona_id, apodoDe(f.nombre, f.apodo)]),
  );

  // Lo que toca ahora, por persona y momento (con el margen por si el servidor estuvo caído un rato).
  const eventos = new Map<string, { persona: number; momento: Momento; cuando: number[]; claves: string[] }>();
  for (const t of pendientes) {
    const programada = Date.parse(t.programada);
    const momentos: Array<[Momento, number]> = [
      ['hora', programada],
      ['insistir', programada + INSISTIR_MIN * 60000],
      ['supervisor', programada + AVISAR_SUPERVISOR_MIN * 60000],
    ];
    for (const [momento, cuando] of momentos) {
      if (cuando > ahora.getTime() || cuando < ahora.getTime() - TOLERANCIA_MIN * 60000) continue;
      const k = `${t.persona_id}|${momento}`;
      const e = eventos.get(k) ?? { persona: t.persona_id, momento, cuando: [], claves: [] };
      e.cuando.push(cuando);
      e.claves.push(`toma|${t.tratamiento_id}|${t.programada}|${momento}`);
      eventos.set(k, e);
    }
  }

  let enviados = 0;
  for (const e of eventos.values()) {
    const supervisores = e.momento === 'supervisor';
    // En el aviso van todas las que siguen sin marcar (a quien supervisa, las que ya pasaron la hora de aviso).
    const suyas = pendientes.filter(
      (t) => t.persona_id === e.persona && Date.parse(t.programada) <= ahora.getTime() - (supervisores ? AVISAR_SUPERVISOR_MIN * 60000 - TOLERANCIA_MIN * 60000 : 0),
    );
    if (!suyas.length) continue;
    const tr = porId.get(suyas[0].tratamiento_id)!;
    for (const d of await dispositivosDe(db, e.persona, supervisores)) {
      // Si el teléfono ya lo tiene programado por su cuenta, no se repite.
      if (!supervisores && d.avisos_hasta && e.cuando.every((c) => Date.parse(d.avisos_hasta!) >= c)) continue;
      const aviso = avisoDeTomas(suyas, e.momento, { apodo: supervisores ? '' : apodos.get(e.persona) ?? '', nombre: tr.persona_nombre, zona: tr.zona }, idiomaDe(d));
      if (await avisarUnaVez(db, d, e.claves.join('+'), aviso, e.claves)) enviados++;
    }
  }
  return enviados;
}

/** A la noche, a quienes supervisan: si la persona no anotó nada en todo el día. Devuelve cuántos avisos mandó. */
export async function revisarDiasSinAnotar(db: Db, ahora = new Date()): Promise<number> {
  const personas = await filas<{ id: number; nombre: string; zona: string }>(
    db,
    sql`SELECT DISTINCT p.id, p.nombre, p.zona_horaria AS zona FROM personas p JOIN accesos a ON a.persona_id = p.id AND a.por_supervision`,
  );
  let enviados = 0;
  for (const p of personas) {
    const hoy = fechaLocal(ahora, p.zona);
    const desde = localAInstante(hoy, HORA_SIN_ANOTAR, p.zona).getTime();
    if (ahora.getTime() < desde || ahora.getTime() > desde + TOLERANCIA_MIN * 60000) continue;
    const dia = diaDePatty(ahora, p.zona);
    if (await una(db, sql`SELECT 1 AS x FROM registros WHERE persona_id = ${p.id} AND fecha = ${dia} AND borrado IS NULL LIMIT 1`)) continue;
    for (const d of await dispositivosDe(db, p.id, true)) {
      const i = idiomaDe(d);
      const aviso = {
        titulo: traducir(i, '📝 {nombre} no anotó nada hoy', { nombre: p.nombre }),
        cuerpo: traducir(i, 'Quizás le venga bien un aviso para que le cuente a Patty cómo fue su día.'),
        datos: { tipo: 'sin_anotar', persona_id: String(p.id), cara: 'espera' },
      };
      if (await avisarUnaVez(db, d, `sinanotar|${p.id}|${dia}`, aviso)) enviados++;
    }
  }
  return enviados;
}

/** A esta hora (de la persona), si no anotó nada en el día, Patty le pide que le cuente (con la cara triste). */
const HORA_TE_EXTRANO = '19:00';

/** Lo que dice el aviso según cuántos días lleva sin anotar (y su apodo, para que suene a Patty). */
export function avisoTeExtrano(nombre: string, diasSin: number | null, idioma: Idioma = 'es'): { titulo: string; cuerpo: string } {
  const v = { pila: nombre, n: diasSin ?? 0 };
  const t = (titulo: string, cuerpo: string) => ({ titulo: traducir(idioma, titulo, v), cuerpo: traducir(idioma, cuerpo, v) });
  if (diasSin === null) return t('😢 ¿Arrancamos?', '{pila}, todavía no me contaste nada. Empezá por algo fácil: ¿a qué hora te levantaste hoy?');
  if (diasSin <= 1) return t('😢 Hoy no me contaste nada', '{pila}, ¿qué comiste, cómo dormiste, cómo te sentís? Con un toque alcanza.');
  if (diasSin <= 3) return t('😢 Hace {n} días que no sé de vos', '¿Me contás cómo venís? Aunque sea una cosa, así no pierdo el hilo.');
  return t('😢 Te extraño', 'Hace {n} días que no anotás nada. Cuando quieras, contale a Patty cómo estás.');
}

/**
 * A la tarde, a quien no anotó nada en el día: un aviso con la cara triste del búho para que cuente algo. Los primeros
 * días, todos los días; después de una semana sin anotar, uno por semana (para no cansar).
 */
export async function revisarTeExtrano(db: Db, ahora = new Date()): Promise<number> {
  const personas = await filas<{ id: number; nombre: string; zona: string; usuario_id: number; idioma: string; ultima: string | null; creado: string; u_nombre: string; apodo: string | null }>(
    db,
    sql`SELECT p.id, p.nombre, p.zona_horaria AS zona, pu.usuario_id, u.idioma, p.creado, u.nombre AS u_nombre, u.apodo,
               (SELECT to_char(max(r.fecha), 'YYYY-MM-DD') FROM registros r WHERE r.persona_id = p.id AND r.borrado IS NULL) AS ultima
        FROM personas p JOIN persona_usuarios pu ON pu.persona_id = p.id AND pu.rol = 'dueno'
        JOIN usuarios u ON u.id = pu.usuario_id AND u.activo AND u.avisar_sin_anotar
        WHERE EXISTS (SELECT 1 FROM dispositivos d WHERE d.usuario_id = pu.usuario_id)`,
  );
  let enviados = 0;
  for (const p of personas) {
    const hoy = fechaLocal(ahora, p.zona);
    const desde = localAInstante(hoy, HORA_TE_EXTRANO, p.zona).getTime();
    if (ahora.getTime() < desde || ahora.getTime() > desde + TOLERANCIA_MIN * 60000) continue;
    const dia = diaDePatty(ahora, p.zona);
    if (p.ultima && p.ultima >= dia) continue;
    const diasSin = p.ultima ? Math.round((Date.parse(dia) - Date.parse(p.ultima)) / 86400000) : null;
    // Recién creada (hoy) y sin nada: todavía no molestamos.
    if (diasSin === null && Date.now() - Date.parse(p.creado) < 12 * 3600000) continue;
    if (diasSin !== null && diasSin > 7 && diasSin % 7 !== 0) continue;
    const { titulo, cuerpo } = avisoTeExtrano(apodoDe(p.u_nombre, p.apodo), diasSin, idiomaDe(p));
    const lista = await filas<Dispositivo>(db, sql`SELECT id, token, avisos_hasta FROM dispositivos WHERE usuario_id = ${p.usuario_id}`);
    for (const d of lista) {
      if (await avisarUnaVez(db, d, `teextrano|${p.id}|${dia}`, { titulo, cuerpo, datos: { tipo: 'te_extrano', cara: 'triste', persona_id: String(p.id) } })) enviados++;
    }
  }
  return enviados;
}

/**
 * La encuesta de la noche ("¿cómo te sentiste hoy?") para los Android con push, a la hora que eligió cada uno y si no la
 * contestó todavía: con botones para contestar desde el aviso sin abrir la app. En iPhone la programa el teléfono.
 */
export async function revisarEncuesta(db: Db, ahora = new Date()): Promise<number> {
  const animo = await una<{ id: number }>(db, sql`SELECT id FROM categorias WHERE clave = 'animo'`);
  if (!animo) return 0;
  const personas = await filas<{ id: number; zona: string; usuario_id: number; idioma: string; nombre: string; apodo: string | null; hora: string }>(
    db,
    sql`SELECT p.id, p.zona_horaria AS zona, pu.usuario_id, u.idioma, u.nombre, u.apodo, u.encuesta_hora AS hora
        FROM personas p JOIN persona_usuarios pu ON pu.persona_id = p.id AND pu.rol = 'dueno'
        JOIN usuarios u ON u.id = pu.usuario_id AND u.activo AND u.encuesta_hora IS NOT NULL
        WHERE EXISTS (SELECT 1 FROM dispositivos d WHERE d.usuario_id = pu.usuario_id AND d.plataforma = 'android')`,
  );
  let enviados = 0;
  for (const p of personas) {
    const desde = localAInstante(fechaLocal(ahora, p.zona), p.hora, p.zona).getTime();
    if (ahora.getTime() < desde || ahora.getTime() > desde + TOLERANCIA_MIN * 60000) continue;
    const dia = diaDePatty(ahora, p.zona);
    const ya = await una(
      db,
      sql`SELECT 1 AS x FROM registros r JOIN conceptos c ON c.id = r.concepto_id
          WHERE r.persona_id = ${p.id} AND r.fecha = ${dia} AND r.borrado IS NULL AND c.nombre = ${COMO_ME_SENTI} LIMIT 1`,
    );
    if (ya) continue;
    const i = idiomaDe(p);
    const apodo = apodoDe(p.nombre, p.apodo);
    const boton = (e: (typeof ESTADOS)[number], luego?: string) => ({
      titulo: `${e.emoji} ${traducir(i, e.nombre)}`,
      pedidos: [{ ruta: '/api/registros', cuerpo: { persona_id: p.id, concepto_nombre: COMO_ME_SENTI, categoria_id: animo.id, intensidad: e.intensidad } }],
      listo: traducir(i, '✓ Anotado: {estado}. ¡Gracias!', { estado: traducir(i, e.nombre).toLowerCase() }),
      ...(luego ? { luego } : {}),
    });
    const [muyBien, bien, mal] = ESTADOS;
    const aviso: Aviso = {
      titulo: 'Patty',
      cuerpo: traducir(i, '{apodo}, ¿cómo te sentiste hoy?', { apodo }),
      datos: { tipo: 'encuesta', persona_id: String(p.id), cara: 'espera' },
      etiqueta: `encuesta|${p.id}`,
      acciones: [boton(muyBien), boton(bien), boton(mal, traducir(i, 'Anotado: mal 😕 ¿Qué te pasó? Tocá para contarme.'))],
    };
    const lista = await filas<Dispositivo>(db, sql`SELECT id, token, avisos_hasta FROM dispositivos WHERE usuario_id = ${p.usuario_id} AND plataforma = 'android'`);
    for (const d of lista) if (await avisarUnaVez(db, d, `encuesta|${p.id}|${dia}`, aviso)) enviados++;
  }
  return enviados;
}

/** A esta hora, si anotó algo pero le faltan puntos para la meta del día, un empujón con lo que falta. */
const HORA_PUNTOS = '21:00';
const META_PUNTOS = 60;

/**
 * A las 21 de cada uno: si ya anotó algo en el día pero no llega a la meta, un aviso con lo que más suma y falta
 * ("Te faltan 25 puntos: la cena y cómo te sentís"). Con el mismo permiso que el de "te extraño".
 */
export async function revisarPuntos(db: Db, ahora = new Date()): Promise<number> {
  const personas = await filas<{ id: number; zona: string; usuario_id: number; idioma: string; nombre: string; apodo: string | null }>(
    db,
    sql`SELECT p.id, p.zona_horaria AS zona, pu.usuario_id, u.idioma, u.nombre, u.apodo
        FROM personas p JOIN persona_usuarios pu ON pu.persona_id = p.id AND pu.rol = 'dueno'
        JOIN usuarios u ON u.id = pu.usuario_id AND u.activo AND u.avisar_sin_anotar
        WHERE EXISTS (SELECT 1 FROM dispositivos d WHERE d.usuario_id = pu.usuario_id)`,
  );
  let enviados = 0;
  for (const p of personas) {
    const desde = localAInstante(fechaLocal(ahora, p.zona), HORA_PUNTOS, p.zona).getTime();
    if (ahora.getTime() < desde || ahora.getTime() > desde + TOLERANCIA_MIN * 60000) continue;
    const dia = diaDePatty(ahora, p.zona);
    const [hoy] = await puntosDe(db, { id: p.id, zona_horaria: p.zona }, dia, dia);
    // Sin nada anotado se encarga "te extraño"; con la meta cumplida, nada.
    if (!hoy.items.some((i) => i.puntos > 0 && i.clave !== 'sueno' && i.clave !== 'movimiento') || hoy.puntos >= META_PUNTOS) continue;
    const i = idiomaDe(p);
    const faltan = hoy.items
      .filter((x) => x.puntos < x.maximo && x.clave !== 'extras')
      .sort((a, b) => b.maximo - b.puntos - (a.maximo - a.puntos))
      .slice(0, 3)
      .map((x) => traducir(i, ITEMS_PUNTOS[x.clave].nombre).toLowerCase());
    const y = i === 'en' ? ' and ' : ' y ';
    const lista = faltan.length > 1 ? `${faltan.slice(0, -1).join(', ')}${y}${faltan.at(-1)}` : faltan[0] ?? '';
    const v = { apodo: apodoDe(p.nombre, p.apodo), n: META_PUNTOS - hoy.puntos, puntos: hoy.puntos, lista };
    const aviso = {
      titulo: traducir(i, '⭐ {apodo}, vas {puntos} puntos hoy', v),
      cuerpo: traducir(i, 'Te faltan {n} para la meta del día. Lo que más suma: {lista}.', v),
      datos: { tipo: 'puntos', persona_id: String(p.id), cara: 'espera' },
    };
    const lista2 = await filas<Dispositivo>(db, sql`SELECT id, token, avisos_hasta FROM dispositivos WHERE usuario_id = ${p.usuario_id}`);
    for (const d of lista2) if (await avisarUnaVez(db, d, `puntos|${p.id}|${dia}`, aviso)) enviados++;
  }
  return enviados;
}

/** A esta hora (de la persona) se avisa, como mucho uno por día, de un permiso que falta. */
const HORA_PERMISOS = '12:00';
/** Cada permiso se recuerda como mucho estas veces (en 30 días) y con estos días entre uno y otro. */
const PERMISO_VECES = 3;
const PERMISO_CADA_DIAS = 3;

export type PermisoFaltante = 'ubicacion' | 'telefono' | 'salud';

/** Qué le falta a un teléfono, en orden de importancia, según lo que la app contó de él (ver lib/estadoTelefono). */
export function permisosFaltantes(plataforma: string, p: Record<string, unknown>): PermisoFaltante[] {
  if (plataforma !== 'android' && plataforma !== 'ios') return [];
  const r: PermisoFaltante[] = [];
  if (p.ubicacion && p.ubicacion !== 'siempre') r.push('ubicacion');
  if (plataforma === 'android' && (p.uso_apps === 'no' || p.llamadas === 'no')) r.push('telefono');
  if (p.salud === 0) r.push('salud');
  return r;
}

export function avisoDePermiso(permiso: PermisoFaltante, apodo: string, i: Idioma): Aviso {
  const v = { apodo };
  const textos: Record<PermisoFaltante, [string, string]> = {
    ubicacion: ['📍 Activá la ubicación «siempre»', apodo ? '{apodo}, así anoto el clima y tus lugares sola, aunque no abras la app. Tocá y te explico cómo.' : 'Así anoto el clima y tus lugares sola, aunque no abras la app. Tocá y te explico cómo.'],
    telefono: ['📱 Falta el acceso al uso del teléfono', 'Para contar cuánto usás cada app y las llamadas (nunca números ni nombres). Tocá y te digo cómo.'],
    salud: ['⌚ Conectá el reloj o la salud del teléfono', 'Para sumar tu sueño, pasos y pulso solos. Tocá y te muestro cómo.'],
  };
  const [titulo, cuerpo] = textos[permiso];
  return { titulo: traducir(i, titulo, v), cuerpo: traducir(i, cuerpo, v), datos: { tipo: 'permiso', permiso, cara: 'espera' } };
}

/**
 * A las 12 de cada uno: si a un teléfono le falta un permiso (ubicación "siempre", uso del teléfono, salud), un aviso
 * que al tocarlo explica cómo darlo en ese teléfono. Uno por día como mucho, y cada permiso a lo sumo 3 veces.
 */
export async function revisarPermisos(db: Db, ahora = new Date()): Promise<number> {
  const lista = await filas<{
    instalacion: string; plataforma: string; permisos: Record<string, unknown>; dispositivo: number; token: string; avisos_hasta: string | null;
    idioma: string; nombre: string; apodo: string | null; zona: string | null;
  }>(
    db,
    sql`SELECT i.id AS instalacion, i.plataforma, i.estado->'permisos' AS permisos, d.id AS dispositivo, d.token, d.avisos_hasta,
               u.idioma, u.nombre, u.apodo,
               (SELECT p.zona_horaria FROM personas p JOIN persona_usuarios pu ON pu.persona_id = p.id AND pu.rol = 'dueno'
                WHERE pu.usuario_id = u.id ORDER BY p.id LIMIT 1) AS zona
        FROM instalaciones i JOIN dispositivos d ON d.token = i.estado->>'token' AND d.usuario_id = i.usuario_id
        JOIN usuarios u ON u.id = i.usuario_id AND u.activo
        WHERE i.actualizado > now() - interval '14 days'`,
  );
  let enviados = 0;
  for (const x of lista) {
    const zona = x.zona ?? 'America/Argentina/Buenos_Aires';
    const desde = localAInstante(fechaLocal(ahora, zona), HORA_PERMISOS, zona).getTime();
    if (ahora.getTime() < desde || ahora.getTime() > desde + TOLERANCIA_MIN * 60000) continue;
    const dia = fechaLocal(ahora, zona);
    if (await una(db, sql`SELECT 1 AS x FROM avisos_enviados WHERE clave LIKE ${`permiso|${x.instalacion}|%|${dia}|%`} LIMIT 1`)) continue;
    for (const permiso of permisosFaltantes(x.plataforma, x.permisos ?? {})) {
      const previos = await filas<{ enviado: string }>(
        db,
        sql`SELECT creado AS enviado FROM avisos_enviados WHERE clave LIKE ${`permiso|${x.instalacion}|${permiso}|%`} ORDER BY creado DESC`,
      );
      if (previos.length >= PERMISO_VECES) continue;
      if (previos.length && ahora.getTime() - Date.parse(previos[0].enviado) < (PERMISO_CADA_DIAS - 0.5) * 86400000) continue;
      const d = { id: x.dispositivo, token: x.token, avisos_hasta: x.avisos_hasta };
      if (await avisarUnaVez(db, d, `permiso|${x.instalacion}|${permiso}|${dia}`, avisoDePermiso(permiso, apodoDe(x.nombre, x.apodo), idiomaDe(x)))) enviados++;
      break; // uno por día
    }
  }
  return enviados;
}

/** Arranca la revisión de cada minuto (si hay Firebase configurado). */
export function arrancarRecordatorios(db: Db): void {
  if (!pushDisponible()) {
    console.log('Sin FIREBASE_SERVICE_ACCOUNT: el servidor no manda avisos push.');
    return;
  }
  let vueltas = 0;
  const revisar = async () => {
    try {
      await revisarTomas(db);
      await revisarDiasSinAnotar(db);
      await revisarTeExtrano(db);
      await revisarPermisos(db);
      await revisarPuntos(db);
      await revisarEncuesta(db);
      // Una vez por día, lo viejo se borra.
      if (vueltas++ % 1440 === 0) {
        await db.execute(sql`DELETE FROM avisos_enviados WHERE creado < now() - interval '30 days'`);
        await db.execute(sql`DELETE FROM avisos_historial WHERE creado < now() - interval '90 days'`);
      }
    } catch (e) {
      console.error('Error revisando recordatorios:', e);
    }
  };
  setInterval(revisar, 60000).unref();
  void revisar();
}
