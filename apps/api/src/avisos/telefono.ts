// Lo que avisan las apps del teléfono (la app de Android con el acceso a las notificaciones; ver AvisosTelefono.java).
// - Conteos por hora y app (nunca el texto): con ellos se recalculan, por día, «Notificaciones», «Notificaciones de
//   noche» (las que sonaron de 23 a 7, que pueden despertar; van al día en que termina la noche) y «Mensajes
//   recibidos». Mandar de nuevo la misma hora la reemplaza.
// - Eventos de pedidos, viajes y ejercicio (lo que el teléfono entendió de un aviso): los del mismo pedido o viaje se
//   juntan en una fila de avisos_detectados. El ejercicio se anota solo, salvo que ya esté anotado; los pedidos y los
//   viajes que no se pueden unir con algo ya anotado quedan para que Patty pregunte en el Día.
import { sql } from 'drizzle-orm';
import {
  APPS_AVISO,
  DEPORTES_AVISO,
  ETAPAS_AVISO,
  esHoraDeNoche,
  MENSAJES_RECIBIDOS,
  NOCHE_DESDE,
  NOMBRES_MENSAJERIA,
  nombreAppAviso,
  NOTIFICACIONES,
  NOTIFICACIONES_NOCHE,
  TIPOS_AVISO,
  CONCEPTOS_AVISOS,
  type AvisoPendiente,
  type AvisosDelDia,
  type ConteoAvisos,
  type EventoAviso,
  type LlamadasDeUnaHora,
  type TipoAviso,
} from 'shared';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { registros } from '../db/schema.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, fechaLocal, localAInstante, minutosDelDia, sumarDias } from '../lib/fechas.js';
import { texto } from '../lib/http.js';
import { obtenerOCrearConcepto } from '../routes/conceptos.js';
import { conceptoMedido, type Fuente } from '../routes/ingesta.js';
import { viajesDelDia, type LugarZona } from '../ubicacion/resumen.js';

const DIAS_GUARDADOS = 90;
const MIN = 60000;
const HORA = 60 * MIN;
/** Hasta cuánto se juntan los avisos del mismo pedido, viaje o entrenamiento. */
const VENTANA: Record<TipoAviso, number> = { pedido: 2 * HORA, viaje: 90 * MIN, ejercicio: 30 * MIN };

const entero = (v: unknown, max: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

/** Valida un conteo que llega del teléfono. Los que no sirven se saltean. */
export function leerConteo(x: unknown, ahora = Date.now()): ConteoAvisos | null {
  const d = x as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const paquete = texto(d.paquete).slice(0, 120);
  const h = Number(d.hora);
  if (!paquete || !Number.isFinite(h)) return null;
  const hora = h - (h % HORA);
  if (hora < ahora - DIAS_GUARDADOS * 86400000 || hora > ahora + HORA) return null;
  const c = { paquete, app: texto(d.app).slice(0, 60) || paquete, hora, n: entero(d.n, 5000), sonoras: entero(d.sonoras, 5000), apagada: entero(d.apagada, 5000), mensajes: entero(d.mensajes, 5000) };
  if (!c.n && !c.mensajes) return null;
  return { ...c, sonoras: Math.min(c.sonoras, c.n), apagada: Math.min(c.apagada, c.n) };
}

/** Valida un evento que llega del teléfono (tipo, app y etapa conocidos; el deporte, la distancia y los minutos, razonables). */
export function leerEvento(x: unknown, ahora = Date.now()): EventoAviso | null {
  const d = x as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const tipo = d.tipo as TipoAviso;
  if (!TIPOS_AVISO.includes(tipo)) return null;
  const app = texto(d.app);
  const evento = texto(d.evento);
  const instante = Number(d.instante);
  if (!APPS_AVISO[tipo][app] || !ETAPAS_AVISO[tipo].includes(evento) || !Number.isFinite(instante)) return null;
  if (instante < ahora - DIAS_GUARDADOS * 86400000 || instante > ahora + HORA) return null;
  const e: EventoAviso = { tipo, app, evento, instante };
  if (tipo === 'ejercicio') {
    e.deporte = DEPORTES_AVISO[texto(d.deporte)] ? texto(d.deporte) : 'ejercicio';
    const km = Number(d.km);
    if (Number.isFinite(km) && km > 0 && km <= 300) e.km = Math.round(km * 100) / 100;
    const m = Math.round(Number(d.minutos));
    if (Number.isFinite(m) && m >= 1 && m <= 600) e.minutos = m;
  }
  return e;
}

const horaLocal = (ms: number, zona: string) => Math.floor(minutosDelDia(new Date(ms), zona) / 60);

/** La noche a la que pertenece una hora (el día en que termina: la de 23 a 7 del 24 al 25 es la del 25), o null. */
export function nocheDe(ms: number, zona: string): string | null {
  const h = horaLocal(ms, zona);
  if (!esHoraDeNoche(h)) return null;
  return fechaLocal(new Date(ms + (h >= NOCHE_DESDE ? (24 - h) * HORA : 0)), zona);
}

export async function guardarAvisos(tx: Tx, f: Fuente, conteos: unknown[], eventos: unknown[]): Promise<{ conteos: number; eventos: number; anotados: number }> {
  if (conteos.length > 5000 || eventos.length > 500) throw new ErrorApi('Mandá hasta 5000 "conteos" y 500 "eventos" por vez.');
  const ahora = Date.now();
  const cs = conteos.map((x) => leerConteo(x, ahora)).filter((x): x is ConteoAvisos => x !== null);
  const fechas = new Set<string>();
  const noches = new Set<string>();
  for (const c of cs) {
    const fecha = diaDePatty(new Date(c.hora), f.zona_horaria);
    fechas.add(fecha);
    const noche = nocheDe(c.hora, f.zona_horaria);
    if (noche) noches.add(noche);
    await tx.execute(sql`
      INSERT INTO avisos_conteos (persona_id, fuente_id, paquete, app, hora, fecha, n, sonoras, apagada, mensajes)
      VALUES (${f.persona_id}, ${f.id}, ${c.paquete}, ${c.app}, ${new Date(c.hora).toISOString()}, ${fecha}, ${c.n}, ${c.sonoras}, ${c.apagada}, ${c.mensajes})
      ON CONFLICT (persona_id, paquete, hora) DO UPDATE SET n = excluded.n, sonoras = excluded.sonoras, apagada = excluded.apagada,
        mensajes = excluded.mensajes, app = excluded.app, fuente_id = excluded.fuente_id`);
  }
  if (cs.length) await recalcularAvisos(tx, f, [...fechas], [...noches]);
  let anotados = 0;
  const es = eventos.map((x) => leerEvento(x, ahora)).filter((x): x is EventoAviso => x !== null).sort((a, b) => a.instante - b.instante);
  for (const e of es) if (await registrarEvento(tx, f, e)) anotados++;
  await tx.execute(sql`DELETE FROM avisos_conteos WHERE persona_id = ${f.persona_id} AND hora < now() - make_interval(days => ${DIAS_GUARDADOS})`);
  await tx.execute(sql`DELETE FROM avisos_detectados WHERE persona_id = ${f.persona_id} AND inicio < now() - make_interval(days => ${DIAS_GUARDADOS})`);
  await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${f.id}`);
  return { conteos: cs.length, eventos: es.length, anotados };
}

interface FilaConteo {
  paquete: string;
  app: string;
  hora: number;
  fecha: string;
  n: number;
  sonoras: number;
  apagada: number;
  mensajes: number;
}

async function conteosEntre(db: Db | Tx, personaId: number, desde: string, hasta: string, fuenteId?: number): Promise<FilaConteo[]> {
  const l = await filas<Omit<FilaConteo, 'hora'> & { hora: string }>(
    db,
    sql`SELECT paquete, app, hora, to_char(fecha, 'YYYY-MM-DD') AS fecha, n, sonoras, apagada, mensajes FROM avisos_conteos
        WHERE persona_id = ${personaId} AND fecha BETWEEN ${desde} AND ${hasta} ${fuenteId ? sql`AND fuente_id = ${fuenteId}` : sql``}`,
  );
  return l.map((x) => ({ ...x, hora: new Date(x.hora).getTime() }));
}

/** Rehace las mediciones de esos días (y esas noches) de la fuente. */
export async function recalcularAvisos(tx: Tx, f: Fuente, fechas: string[], noches: string[]): Promise<void> {
  const todas = [...fechas, ...noches].sort();
  if (!todas.length) return;
  const cache = new Map<string, number>();
  const idN = await conceptoMedido(tx, f, NOTIFICACIONES, 'pantalla', 'avisos', cache);
  const idNoche = await conceptoMedido(tx, f, NOTIFICACIONES_NOCHE, 'pantalla', 'avisos', cache);
  const idM = await conceptoMedido(tx, f, MENSAJES_RECIBIDOS, 'comunicacion', 'mensajes', cache);
  const filasC = await conteosEntre(tx, f.persona_id, sumarDias(todas[0], -1), todas[todas.length - 1], f.id);
  const poner = async (concepto: number, fecha: string, inicio: Date, valor: number | null, unidad: string) => {
    await tx.execute(sql`DELETE FROM mediciones WHERE persona_id = ${f.persona_id} AND fuente_id = ${f.id} AND concepto_id = ${concepto} AND fecha = ${fecha}`);
    if (valor === null) return;
    await tx.execute(sql`
      INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fecha, valor, unidad)
      VALUES (${f.persona_id}, ${concepto}, ${f.id}, ${inicio.toISOString()}, ${fecha}, ${valor}, ${unidad})
      ON CONFLICT (persona_id, concepto_id, inicio, fuente_id) DO UPDATE SET valor = excluded.valor, fecha = excluded.fecha`);
  };
  for (const fecha of fechas) {
    const del = filasC.filter((x) => x.fecha === fecha);
    const n = del.reduce((t, x) => t + x.n, 0);
    const m = del.reduce((t, x) => t + x.mensajes, 0);
    const inicio = localAInstante(fecha, '05:00', f.zona_horaria);
    await poner(idN, fecha, inicio, n || null, 'avisos');
    await poner(idM, fecha, inicio, m || null, 'mensajes');
  }
  for (const noche of noches) {
    const de = filasC.filter((x) => nocheDe(x.hora, f.zona_horaria) === noche);
    // Una noche sin ningún aviso contado no se sabe (quizás estaba apagado): solo se anota si llegó algo.
    const hubo = de.some((x) => x.n > 0);
    const sonoras = de.reduce((t, x) => t + x.sonoras, 0);
    await poner(idNoche, noche, localAInstante(sumarDias(noche, -1), `${NOCHE_DESDE}:00`, f.zona_horaria), hubo ? sonoras : null, 'avisos');
  }
}

/** El detalle de un día: por hora, por app, la noche y los mensajes. */
export async function avisosDelDia(db: Db, personaId: number, fecha: string, zona: string): Promise<AvisosDelDia> {
  const l = await conteosEntre(db, personaId, sumarDias(fecha, -1), fecha);
  const delDia = l.filter((x) => x.fecha === fecha);
  const sumar = (xs: FilaConteo[], k: 'n' | 'sonoras' | 'apagada' | 'mensajes') => xs.reduce((t, x) => t + x[k], 0);
  const porApp = (xs: FilaConteo[], k: 'n' | 'mensajes', nombre: (x: FilaConteo) => string) => {
    const m = new Map<string, { n: number; paquete: string }>();
    for (const x of xs) if (x[k]) m.set(nombre(x), { n: (m.get(nombre(x))?.n ?? 0) + x[k], paquete: m.get(nombre(x))?.paquete ?? x.paquete });
    return [...m.entries()].map(([app, v]) => ({ app, n: v.n, paquete: v.paquete })).sort((a, b) => b.n - a.n).slice(0, 8);
  };
  const total = sumar(delDia, 'n');
  const deNoche = l.filter((x) => nocheDe(x.hora, zona) === fecha);
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const x of delDia) porHora[horaLocal(x.hora, zona)] += x.n;
  const mensajes = sumar(delDia, 'mensajes');
  return {
    notificaciones: total
      ? {
          total,
          sonoras: sumar(delDia, 'sonoras'),
          apagada: sumar(delDia, 'apagada'),
          por_hora: porHora,
          apps: porApp(delDia, 'n', (x) => x.app),
          noche: deNoche.some((x) => x.n) ? { total: sumar(deNoche, 'n'), sonoras: sumar(deNoche, 'sonoras'), apagada: sumar(deNoche, 'apagada') } : null,
        }
      : null,
    mensajes: mensajes ? { total: mensajes, apps: porApp(delDia, 'mensajes', (x) => NOMBRES_MENSAJERIA[x.paquete] ?? x.app) } : null,
    llamadas_por_hora: await llamadasPorHora(db, personaId, fecha, zona),
  };
}

// ---------- Llamadas por hora ----------

/** Valida lo que manda el teléfono de una hora de llamadas. Lo que no sirve se saltea. */
export function leerHoraLlamadas(x: unknown, ahora = Date.now()): LlamadasDeUnaHora | null {
  const d = x as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const h = Number(d.hora);
  const n = Math.round(Number(d.n));
  if (!Number.isFinite(h) || !Number.isFinite(n) || n < 0) return null;
  const hora = h - (h % HORA);
  if (hora < ahora - DIAS_GUARDADOS * 86400000 || hora > ahora + 26 * HORA) return null;
  return { hora, n: Math.min(n, 500) };
}

/** Guarda cuántas llamadas hubo en cada hora (la misma hora de nuevo se reemplaza). */
export async function guardarLlamadasPorHora(tx: Tx, f: Fuente, horas: unknown[]): Promise<number> {
  if (horas.length > 5000) throw new ErrorApi('Mandá hasta 5000 "horas" por vez.');
  const ahora = Date.now();
  const hs = horas.map((x) => leerHoraLlamadas(x, ahora)).filter((x): x is LlamadasDeUnaHora => x !== null);
  for (const h of hs) {
    await tx.execute(sql`
      INSERT INTO llamadas_horas (persona_id, fuente_id, hora, fecha, n)
      VALUES (${f.persona_id}, ${f.id}, ${new Date(h.hora).toISOString()}, ${diaDePatty(new Date(h.hora), f.zona_horaria)}, ${h.n})
      ON CONFLICT (persona_id, hora) DO UPDATE SET n = excluded.n, fuente_id = excluded.fuente_id`);
  }
  await tx.execute(sql`DELETE FROM llamadas_horas WHERE persona_id = ${f.persona_id} AND hora < now() - make_interval(days => ${DIAS_GUARDADOS})`);
  await tx.execute(sql`UPDATE fuentes SET ultimo_uso = now() WHERE id = ${f.id}`);
  return hs.length;
}

/** Las 24 horas de un día de la persona (de 0 a 23), o null si el teléfono no mandó nada de ese día. */
async function llamadasPorHora(db: Db, personaId: number, fecha: string, zona: string): Promise<number[] | null> {
  const l = await filas<{ hora: string; n: number }>(db, sql`SELECT hora, n FROM llamadas_horas WHERE persona_id = ${personaId} AND fecha = ${fecha}`);
  if (!l.length) return null;
  const r = Array.from({ length: 24 }, () => 0);
  for (const x of l) r[horaLocal(new Date(x.hora).getTime(), zona)] += Number(x.n);
  return r;
}

// ---------- Pedidos, viajes y ejercicio ----------

interface Detectado {
  id: number;
  tipo: TipoAviso;
  app: string;
  evento: string;
  inicio: string;
  fin: string;
  datos: { etapas?: Record<string, number>; deporte?: string; km?: number; minutos?: number; duplicado?: unknown };
  estado: string;
  registro_id: number | null;
}

/** Junta un evento con el pedido, viaje o entrenamiento al que pertenece, o crea uno nuevo. Devuelve si anotó algo. */
async function registrarEvento(tx: Tx, f: Fuente, e: EventoAviso): Promise<boolean> {
  const t = new Date(e.instante).toISOString();
  const v = VENTANA[e.tipo] / MIN;
  const ya = await una<Detectado>(
    tx,
    sql`SELECT id, tipo, app, evento, inicio, fin, datos, estado, registro_id FROM avisos_detectados
        WHERE persona_id = ${f.persona_id} AND tipo = ${e.tipo} AND app = ${e.app}
          AND inicio <= ${t}::timestamptz + make_interval(mins => ${v}) AND fin >= ${t}::timestamptz - make_interval(mins => ${v})
        ORDER BY abs(extract(epoch FROM inicio - ${t}::timestamptz)) LIMIT 1 FOR UPDATE`,
  );
  if (ya) {
    const etapas = { ...(ya.datos.etapas ?? {}) };
    etapas[e.evento] = Math.min(etapas[e.evento] ?? e.instante, e.instante);
    const orden = ETAPAS_AVISO[e.tipo];
    const evento = orden.indexOf(e.evento) > orden.indexOf(ya.evento) ? e.evento : ya.evento;
    const datos = { ...ya.datos, etapas, ...(e.km && !ya.datos.km ? { km: e.km } : {}), ...(e.minutos && !ya.datos.minutos ? { minutos: e.minutos } : {}) };
    await tx.execute(sql`UPDATE avisos_detectados SET evento = ${evento}, datos = ${JSON.stringify(datos)}::jsonb,
                         inicio = least(inicio, ${t}::timestamptz), fin = greatest(fin, ${t}::timestamptz) WHERE id = ${ya.id}`);
    // Un entrenamiento ya anotado sin los minutos: si un aviso nuevo los trae, se completan.
    if (e.tipo === 'ejercicio' && e.minutos && !ya.datos.minutos && ya.registro_id) {
      await tx.execute(sql`UPDATE registros SET valor = ${e.minutos}, inicio = fin - make_interval(mins => ${e.minutos})
                           WHERE id = ${ya.registro_id} AND valor IS NULL AND fin IS NOT NULL`);
    }
    return false;
  }
  const datos = { etapas: { [e.evento]: e.instante }, ...(e.deporte ? { deporte: e.deporte } : {}), ...(e.km ? { km: e.km } : {}), ...(e.minutos ? { minutos: e.minutos } : {}) };
  const nuevo = await una<{ id: number }>(
    tx,
    sql`INSERT INTO avisos_detectados (persona_id, fuente_id, tipo, app, evento, inicio, fin, fecha, datos)
        VALUES (${f.persona_id}, ${f.id}, ${e.tipo}, ${e.app}, ${e.evento}, ${t}, ${t}, ${diaDePatty(new Date(e.instante), f.zona_horaria)}, ${JSON.stringify(datos)}::jsonb)
        RETURNING id`,
  );
  if (e.tipo !== 'ejercicio') return false;
  return anotarEjercicio(tx, f, nuevo!.id, e);
}

/**
 * Un entrenamiento terminado se anota como actividad (Correr, Bici, Caminata…), con los minutos y los km si el aviso
 * los traía. Si a esa hora ya hay una actividad anotada (a mano, desde una vuelta detectada o la caminata que se ve en
 * los pasos del reloj), no se anota otra vez.
 */
async function anotarEjercicio(tx: Tx, f: Fuente, id: number, e: EventoAviso): Promise<boolean> {
  const fin = e.instante;
  const inicio = e.minutos ? fin - e.minutos * MIN : fin;
  const desde = new Date(inicio - 20 * MIN).toISOString();
  const hasta = new Date(fin + 20 * MIN).toISOString();
  const otro = await una<{ id: number }>(
    tx,
    sql`SELECT r.id FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${f.persona_id} AND r.borrado IS NULL AND k.clave = 'actividad'
          AND r.inicio <= ${hasta}::timestamptz
          AND coalesce(r.fin, r.inicio + make_interval(mins => coalesce(r.valor, 0)::int)) >= ${desde}::timestamptz
        LIMIT 1`,
  );
  const caminata =
    !otro && e.deporte === 'caminata'
      ? await una<{ id: number }>(
          tx,
          sql`SELECT m.id FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id
              WHERE m.persona_id = ${f.persona_id} AND c.nombre = 'Caminata'
                AND m.inicio <= ${hasta}::timestamptz AND coalesce(m.fin, m.inicio) >= ${desde}::timestamptz LIMIT 1`,
        )
      : null;
  if (otro || caminata) {
    await tx.execute(sql`UPDATE avisos_detectados SET estado = 'descartado',
                         datos = datos || ${JSON.stringify({ duplicado: otro ? { registro_id: otro.id } : 'caminata' })}::jsonb WHERE id = ${id}`);
    return false;
  }
  const cat = (await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'actividad'`))!.id;
  const concepto = (await obtenerOCrearConcepto(tx, { nombre: DEPORTES_AVISO[e.deporte ?? 'ejercicio'], categoriaId: cat, tipoValor: 'duracion', unidad: 'min' })).concepto;
  const nota = [e.km ? `${String(e.km).replace('.', ',')} km` : '', nombreAppAviso('ejercicio', e.app)].filter(Boolean).join(' · ');
  const [r] = await tx
    .insert(registros)
    .values({
      persona_id: f.persona_id,
      concepto_id: concepto.id,
      inicio: new Date(inicio).toISOString(),
      fin: e.minutos ? new Date(fin).toISOString() : null,
      fecha: diaDePatty(new Date(inicio), f.zona_horaria),
      valor: e.minutos ?? null,
      unidad: 'min',
      nota,
      origen: 'aviso',
      creado_por: null,
    })
    .returning({ id: registros.id });
  await tx.execute(sql`UPDATE conceptos SET usos = usos + 1, ultimo_uso = now() WHERE id = ${concepto.id}`);
  await tx.execute(sql`UPDATE avisos_detectados SET estado = 'anotado', registro_id = ${r.id} WHERE id = ${id}`);
  return true;
}

const ms = (v: string | number) => (typeof v === 'number' ? v : new Date(v).getTime());

/** Cuándo llegó un pedido: el aviso de entregado o, si no, un rato después de que salió. */
export function horaDelPedido(d: Pick<Detectado, 'datos' | 'fin'>): number {
  const e = d.datos.etapas ?? {};
  return e.entregado ?? (e.en_camino ? e.en_camino + 20 * MIN : ms(d.fin));
}

/** De cuándo a cuándo fue un viaje en app (el fin, si se vio que terminó). */
export function tramoDelViaje(d: Pick<Detectado, 'datos' | 'inicio'>): { inicio: number; fin: number | null } {
  const e = d.datos.etapas ?? {};
  return { inicio: e.llegando ?? e.en_viaje ?? e.terminado ?? ms(d.inicio), fin: e.terminado ?? null };
}

/** Los viajes en app de un rato (para el Día): de cuándo a cuándo y en qué app. */
export async function viajesEnApps(db: Db | Tx, personaId: number, desde: number, hasta: number): Promise<Array<{ inicio: number; fin: number; app: string }>> {
  const l = await filas<Pick<Detectado, 'app' | 'inicio' | 'fin' | 'datos'>>(
    db,
    sql`SELECT app, inicio, fin, datos FROM avisos_detectados WHERE persona_id = ${personaId} AND tipo = 'viaje' AND estado <> 'descartado'
          AND inicio <= ${new Date(hasta + 30 * MIN).toISOString()} AND fin >= ${new Date(desde - 2 * HORA).toISOString()}`,
  );
  return l.map((x) => {
    const t = tramoDelViaje(x);
    return { inicio: t.inicio, fin: t.fin ?? Math.max(t.inicio, ms(x.fin)), app: nombreAppAviso('viaje', x.app) };
  });
}

/**
 * La app de un viaje detectado con la ubicación: la del viaje en app que se le cruza (con 15 min de margen: el aviso
 * de que llega el auto es antes de subir). Si se cruzan dos de apps distintas, no se sabe: null.
 */
export function appDelViaje(v: { inicio: number; fin: number }, enApps: Array<{ inicio: number; fin: number; app: string }>): string | null {
  const apps = new Set(enApps.filter((a) => a.inicio <= v.fin + 15 * MIN && a.fin >= v.inicio - 15 * MIN).map((a) => a.app));
  return apps.size === 1 ? [...apps][0] : null;
}

/** Los viajes que vio la ubicación en un día (sin lo que se adivina). */
async function viajesDetectados(db: Db | Tx, personaId: number, fecha: string): Promise<Array<{ inicio: number; fin: number }>> {
  const ps = await filas<{ instante: string; lat: number; lon: number }>(db, sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${personaId} AND fecha = ${fecha}`);
  if (ps.length < 2) return [];
  const lugares = await filas<LugarZona>(db, sql`SELECT id, lat, lon, radio_m FROM lugares WHERE persona_id = ${personaId}`);
  return viajesDelDia(ps.map((x) => ({ instante: new Date(x.instante).getTime(), lat: x.lat, lon: x.lon })), lugares);
}

/**
 * Lo que Patty pregunta en el Día (de los últimos dos días): los pedidos que llegaron y no se anotaron como comida
 * pedida, y los viajes en app que no se cruzan con un viaje anotado ni con uno que vio la ubicación (esos se preguntan
 * en «¿Cómo fue tu viaje?», ya marcados en la app).
 */
export async function avisosPendientes(db: Db, personaId: number, zona: string): Promise<{ pendientes: AvisoPendiente[]; comidas: string[] }> {
  const ahora = Date.now();
  const l = await filas<Detectado>(
    db,
    sql`SELECT id, tipo, app, evento, inicio, fin, datos, estado, registro_id FROM avisos_detectados
        WHERE persona_id = ${personaId} AND estado = 'pendiente' AND tipo IN ('pedido', 'viaje') AND inicio > now() - interval '2 days'
        ORDER BY inicio`,
  );
  const r: AvisoPendiente[] = [];
  const detectados = new Map<string, Array<{ inicio: number; fin: number }>>();
  for (const d of l) {
    if (d.tipo === 'pedido') {
      const etapas = d.datos.etapas ?? {};
      // Hasta que llega (o pasó un rato desde que salió), todavía no.
      if (!etapas.entregado && ms(d.fin) > ahora - 30 * MIN) continue;
      const t = horaDelPedido(d);
      const ya = await una(
        db,
        sql`SELECT 1 AS x FROM registros WHERE persona_id = ${personaId} AND borrado IS NULL AND datos->>'donde' = 'delivery'
              AND inicio BETWEEN ${new Date(t - 90 * MIN).toISOString()} AND ${new Date(t + 2 * HORA).toISOString()} LIMIT 1`,
      );
      if (ya) continue;
      r.push({ id: d.id, tipo: 'pedido', app: nombreAppAviso('pedido', d.app), inicio: new Date(Math.min(t, ahora)).toISOString(), fin: null, minutos: null });
    } else {
      const { inicio, fin } = tramoDelViaje(d);
      if (!fin && ms(d.fin) > ahora - 45 * MIN) continue;
      const hasta = fin ?? inicio;
      const ya = await una(
        db,
        sql`SELECT 1 AS x FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
            WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND k.clave = 'viaje'
              AND r.inicio <= ${new Date(hasta + 15 * MIN).toISOString()} AND coalesce(r.fin, r.inicio) >= ${new Date(inicio - 15 * MIN).toISOString()} LIMIT 1`,
      );
      if (ya) continue;
      const fecha = diaDePatty(new Date(inicio), zona);
      if (!detectados.has(fecha)) detectados.set(fecha, await viajesDetectados(db, personaId, fecha));
      if (detectados.get(fecha)!.some((v) => v.inicio <= hasta + 15 * MIN && v.fin >= inicio - 15 * MIN)) continue;
      r.push({
        id: d.id,
        tipo: 'viaje',
        app: nombreAppAviso('viaje', d.app),
        inicio: new Date(inicio).toISOString(),
        fin: fin ? new Date(fin).toISOString() : null,
        minutos: fin ? Math.max(1, Math.round((fin - inicio) / MIN)) : null,
      });
    }
  }
  // Lo que más pide (para contestar con un toque).
  const comidas = r.some((x) => x.tipo === 'pedido')
    ? (
        await filas<{ nombre: string }>(
          db,
          sql`SELECT c.nombre FROM registros r JOIN conceptos c ON c.id = r.concepto_id
              WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND r.datos->>'donde' = 'delivery' AND r.inicio > now() - interval '120 days'
              GROUP BY c.nombre ORDER BY count(*) DESC, max(r.inicio) DESC LIMIT 4`,
        )
      ).map((x) => x.nombre)
    : [];
  return { pendientes: r, comidas };
}

export async function detectado(tx: Tx, id: number): Promise<(Detectado & { persona_id: number }) | null> {
  return una<Detectado & { persona_id: number }>(
    tx,
    sql`SELECT id, persona_id, tipo, app, evento, inicio, fin, datos, estado, registro_id FROM avisos_detectados WHERE id = ${id} FOR UPDATE`,
  );
}

/** Borra todo lo que llegó de los avisos de una persona (los conteos, lo detectado y lo calculado; lo anotado queda). */
export async function borrarAvisos(tx: Tx, personaId: number): Promise<void> {
  await tx.execute(sql`DELETE FROM avisos_conteos WHERE persona_id = ${personaId}`);
  await tx.execute(sql`DELETE FROM avisos_detectados WHERE persona_id = ${personaId}`);
  await tx.execute(sql`DELETE FROM mediciones m USING conceptos c WHERE m.persona_id = ${personaId} AND c.id = m.concepto_id
                       AND c.nombre IN ${CONCEPTOS_AVISOS} AND m.fuente_id IN (SELECT id FROM fuentes WHERE persona_id = ${personaId} AND tipo = 'telefono')`);
}
