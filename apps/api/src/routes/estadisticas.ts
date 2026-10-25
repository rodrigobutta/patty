// Números para mirar (en Patrones): lo que más se anotó, ánimo, dolores, sueño, clima, movimiento y remedios de los
// últimos días; y, para una cosa puntual ("dolor de cabeza", "huevos"), los días en que pasó, para el calendario.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { CAPAS_CALENDARIO, COMO_ME_SENTI, COMO_ME_SIENTO, estadoDe, normalizar, PALABRAS_CHATARRA, type CalendarioCapa, type CapaCalendario, type Estadisticas, type SerieConcepto } from 'shared';
import { filas, una } from '../db/client.js';
import { persona } from '../lib/acceso.js';
import { ErrorApi } from '../lib/errores.js';
import { diaDePatty, esFecha as esFechaValida, localAInstante, sumarDias } from '../lib/fechas.js';
import { type Env } from '../lib/http.js';
import { COLUMNAS, DESDE, tomasDe, type Fila } from './tratamientos.js';

/** Promedio de horas (en minutos del día); las de la madrugada cuentan como "tarde" (la 1:00 es 25:00). */
function horaPromedio(lista: number[], madrugadaTarde: boolean): number | null {
  if (!lista.length) return null;
  const v = lista.map((m) => (madrugadaTarde && m < 300 ? m + 1440 : m));
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length) % 1440;
}

export const rutasEstadisticas = new Hono<Env>()
  .get('/', async (c) => {
    // ?persona=1&dias=30
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(c.req.query('persona')), false);
    const dias = Math.min(Math.max(Number(c.req.query('dias')) || 30, 7), 365);
    const hasta = diaDePatty(new Date(), p.zona_horaria);
    const desde = sumarDias(hasta, -(dias - 1));
    const enRango = sql`r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hasta}`;

    const actividad = await filas<{ fecha: string; n: number }>(
      db,
      sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, count(*)::int AS n FROM registros r WHERE ${enRango} GROUP BY r.fecha ORDER BY r.fecha`,
    );
    const top = await filas<Estadisticas['top'][number]>(
      db,
      sql`SELECT c.id AS concepto_id, c.nombre AS concepto, c.categoria_id, k.clave AS categoria, count(DISTINCT r.fecha)::int AS dias,
                 count(*)::int AS veces, sum(r.valor)::float AS suma, max(r.unidad) AS unidad
          FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE ${enRango} AND c.nombre NOT IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI})
          GROUP BY c.id, c.nombre, c.categoria_id, k.clave ORDER BY count(DISTINCT r.fecha) DESC, count(*) DESC LIMIT 40`,
    );
    const animo = await filas<{ intensidad: number }>(
      db,
      sql`SELECT r.intensidad FROM registros r JOIN conceptos c ON c.id = r.concepto_id
          WHERE ${enRango} AND c.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI}) AND r.intensidad IS NOT NULL`,
    );
    const sueno = await filas<{ nombre: string; valor: number }>(
      db,
      sql`SELECT c.nombre, r.valor FROM registros r JOIN conceptos c ON c.id = r.concepto_id
          WHERE ${enRango} AND c.nombre IN ('Me acosté', 'Me levanté') AND r.valor IS NOT NULL`,
    );
    // De lo automático: el resumen del día del clima y lo que mide el teléfono.
    const auto = await filas<{ nombre: string; fecha: string; suma: number; promedio: number }>(
      db,
      sql`SELECT c.nombre, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.suma::float AS suma, s.promedio::float AS promedio
          FROM serie_diaria s JOIN conceptos c ON c.id = s.concepto_id
          WHERE s.persona_id = ${p.id} AND s.fecha BETWEEN ${desde} AND ${hasta}
            AND c.nombre IN ('Lluvia del día', 'Horas de sol', 'Temperatura media', 'Temperatura máxima', 'Pasos', 'Km recorridos', 'Tiempo de pantalla', 'Llamadas')`,
    );
    const de = (n: string) => auto.filter((a) => a.nombre === n);
    const prom = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
    const lluvia = de('Lluvia del día');

    // Remedios: tomas programadas del período y cuántas se tomaron.
    const desdeI = localAInstante(desde, '05:00', p.zona_horaria);
    const hastaI = new Date(Math.min(Date.now(), localAInstante(sumarDias(hasta, 1), '05:00', p.zona_horaria).getTime()));
    const trat = await filas<Fila>(db, sql`SELECT ${COLUMNAS} ${DESDE} WHERE t.persona_id = ${p.id} AND t.borrado IS NULL`);
    const tomas = await tomasDe(db, trat, desdeI, hastaI);

    const r: Estadisticas = {
      desde,
      hasta,
      dias,
      dias_anotados: actividad.length,
      actividad,
      top,
      animo: animo.map((a) => a.intensidad),
      dolores: top.filter((t) => t.categoria === 'sintoma'),
      sueno: {
        acoste: horaPromedio(sueno.filter((s) => s.nombre === 'Me acosté').map((s) => s.valor), true),
        levante: horaPromedio(sueno.filter((s) => s.nombre === 'Me levanté').map((s) => s.valor), false),
      },
      clima: {
        dias_con_datos: lluvia.length,
        dias_lluvia: lluvia.filter((l) => l.suma >= 0.5).length,
        mm: lluvia.reduce((a, l) => a + (l.suma ?? 0), 0),
        sol_promedio: prom(de('Horas de sol').map((l) => l.suma)),
        temp_media: prom(de('Temperatura media').map((l) => l.promedio)),
        temp_max: de('Temperatura máxima').reduce<number | null>((a, l) => (a === null || l.suma > a ? l.suma : a), null),
      },
      movimiento: {
        pasos_promedio: prom(de('Pasos').map((l) => l.suma)),
        km: de('Km recorridos').reduce((a, l) => a + (l.suma ?? 0), 0),
        pantalla_promedio: prom(de('Tiempo de pantalla').map((l) => l.suma)),
        llamadas: de('Llamadas').reduce((a, l) => a + (l.suma ?? 0), 0),
      },
      remedios: { programadas: tomas.length, tomadas: tomas.filter((t) => t.estado === 'tomada').length },
    };
    return c.json(r);
  })
  .get('/calendario', async (c) => {
    // ?persona=1&capa=sueno&desde=AAAA-MM-DD&hasta=AAAA-MM-DD: qué pintar en cada día del calendario.
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(c.req.query('persona')), false);
    const capa = c.req.query('capa') as CapaCalendario;
    if (!CAPAS_CALENDARIO.some((k) => k.clave === capa)) throw new ErrorApi('Capa desconocida.');
    const hoy = diaDePatty(new Date(), p.zona_horaria);
    const hasta = esFechaValida(c.req.query('hasta')) ? c.req.query('hasta')! : hoy;
    const desde = esFechaValida(c.req.query('desde')) ? c.req.query('desde')! : sumarDias(hasta, -89);
    if (desde > hasta || desde < sumarDias(hasta, -400)) throw new ErrorApi('Rango de fechas inválido.');
    const enRango = sql`fecha BETWEEN ${desde} AND ${hasta}`;
    /** Una fila por día de la serie de un concepto (de lo anotado o medido). */
    const serie = (nombres: string[], campo: 'suma' | 'promedio' | 'intensidad_max' = 'suma') =>
      filas<{ fecha: string; valor: number }>(
        db,
        sql`SELECT to_char(s.fecha, 'YYYY-MM-DD') AS fecha, max(s.${sql.raw(campo)})::float AS valor FROM serie_diaria s JOIN conceptos k ON k.id = s.concepto_id
            WHERE s.persona_id = ${p.id} AND s.${enRango} AND k.nombre IN (${sql.join(nombres.map((n) => sql`${n}`), sql`, `)}) GROUP BY s.fecha`,
      );
    const prom = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
    const hm = (h: number) => `${Math.floor(h)} h${Math.round((h % 1) * 60) ? ` ${Math.round((h % 1) * 60)} min` : ''}`;
    let r: Omit<CalendarioCapa, 'capa' | 'desde' | 'hasta'>;

    if (capa === 'sueno') {
      // Del reloj si hay; si no, de "me acosté" (la noche anterior) y "me levanté".
      const reloj = new Map((await serie(['Horas de sueño'])).map((d) => [d.fecha, d.valor]));
      const manual = await filas<{ fecha: string; nombre: string; valor: number }>(
        db,
        sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, k.nombre, max(r.valor)::float AS valor FROM registros r JOIN conceptos k ON k.id = r.concepto_id
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.fecha BETWEEN ${sumarDias(desde, -1)} AND ${hasta}
              AND k.nombre IN ('Me acosté', 'Me levanté') AND r.valor IS NOT NULL GROUP BY r.fecha, k.nombre`,
      );
      const acoste = new Map(manual.filter((m) => m.nombre === 'Me acosté').map((m) => [m.fecha, m.valor]));
      const dias: CalendarioCapa['dias'] = [];
      for (const m of manual.filter((x) => x.nombre === 'Me levanté' && x.fecha >= desde)) {
        const a = acoste.get(sumarDias(m.fecha, -1));
        if (a !== undefined && !reloj.has(m.fecha)) reloj.set(m.fecha, ((m.valor - a + 1440) % 1440) / 60);
      }
      for (const [fecha, h] of reloj) if (h > 0 && h < 16) dias.push({ fecha, valor: Math.round(h * 10) / 10, detalle: hm(h) });
      const pr = prom(dias.map((d) => d.valor!));
      r = { tipo: 'numero', unidad: 'h', mejor: 'mas', dias, resumen: pr === null ? 'Todavía no hay horas de sueño: anotá a qué hora te acostás y te levantás, o conectá un reloj.' : `Dormiste ${hm(pr)} en promedio (${dias.length} noches).` };
    } else if (capa === 'animo') {
      const l = await filas<{ fecha: string; valor: number }>(
        db,
        sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, avg(r.intensidad)::float AS valor FROM registros r JOIN conceptos k ON k.id = r.concepto_id
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.${enRango} AND k.nombre IN (${COMO_ME_SIENTO}, ${COMO_ME_SENTI}) AND r.intensidad IS NOT NULL GROUP BY r.fecha`,
      );
      const dias = l.map((d) => ({ fecha: d.fecha, valor: d.valor, emoji: estadoDe(Math.round(d.valor)).emoji, detalle: estadoDe(Math.round(d.valor)).nombre }));
      const buenos = dias.filter((d) => d.valor >= 6).length;
      r = { tipo: 'emoji', unidad: null, mejor: 'mas', dias, resumen: dias.length ? `${buenos} de ${dias.length} días te sentiste bien o muy bien.` : 'Todavía no contaste cómo te sentís.' };
    } else if (capa === 'dolores') {
      const l = await filas<{ fecha: string; valor: number; detalle: string }>(
        db,
        sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, max(r.intensidad)::float AS valor, string_agg(DISTINCT k.nombre, ', ') AS detalle
            FROM registros r JOIN conceptos k ON k.id = r.concepto_id JOIN categorias g ON g.id = k.categoria_id
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.${enRango} AND g.clave = 'sintoma' GROUP BY r.fecha`,
      );
      r = { tipo: 'numero', unidad: '/10', mejor: 'menos', dias: l.map((d) => ({ ...d, valor: d.valor ?? 5 })), resumen: l.length ? `${l.length} días con algún dolor o molestia.` : 'Ningún dolor anotado en el período. ¡Bien!' };
    } else if (capa === 'ejercicio') {
      const l = await filas<{ fecha: string; valor: number; detalle: string }>(
        db,
        sql`SELECT to_char(s.fecha, 'YYYY-MM-DD') AS fecha, sum(CASE WHEN k.nombre = 'Pasos' THEN 0 ELSE coalesce(s.suma, 30) END)::float AS valor,
                   string_agg(DISTINCT k.nombre, ', ') FILTER (WHERE k.nombre <> 'Pasos') AS detalle
            FROM serie_diaria s JOIN conceptos k ON k.id = s.concepto_id JOIN categorias g ON g.id = k.categoria_id
            WHERE s.persona_id = ${p.id} AND s.${enRango} AND g.clave = 'actividad' AND k.nombre NOT IN ('Km caminados', 'Calorías activas', 'Calorías totales', 'Entrenamientos')
            GROUP BY s.fecha`,
      );
      const dias = l.filter((d) => d.valor > 0).map((d) => ({ ...d, detalle: `${Math.round(d.valor)} min${d.detalle ? ` · ${d.detalle}` : ''}` }));
      const total = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
      r = { tipo: 'numero', unidad: 'min', mejor: 'mas', dias, resumen: `${dias.length} de ${total} días con ejercicio.` };
    } else if (capa === 'chatarra') {
      const l = await filas<{ fecha: string; nombre: string; veces: number }>(
        db,
        sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, k.nombre, count(*)::int AS veces FROM registros r JOIN conceptos k ON k.id = r.concepto_id
            JOIN categorias g ON g.id = k.categoria_id
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND r.${enRango} AND g.clave IN ('comida', 'bebida') GROUP BY r.fecha, k.nombre`,
      );
      const porDia = new Map<string, { valor: number; nombres: string[] }>();
      for (const x of l) {
        const n = normalizar(x.nombre);
        if (!PALABRAS_CHATARRA.some((w) => n.includes(normalizar(w)))) continue;
        const d = porDia.get(x.fecha) ?? { valor: 0, nombres: [] };
        d.valor += x.veces;
        d.nombres.push(x.nombre);
        porDia.set(x.fecha, d);
      }
      const dias = [...porDia].map(([fecha, d]) => ({ fecha, valor: d.valor, detalle: d.nombres.join(', ') }));
      r = { tipo: 'numero', unidad: null, mejor: 'menos', dias, resumen: dias.length ? `${dias.length} días con comida chatarra (pizza, gaseosa, golosinas…).` : 'Nada de comida chatarra en el período.' };
    } else if (capa === 'clima') {
      const lluvia = new Map((await serie(['Lluvia del día'])).map((d) => [d.fecha, d.valor]));
      const sol = new Map((await serie(['Horas de sol'])).map((d) => [d.fecha, d.valor]));
      const temp = new Map((await serie(['Temperatura media'], 'promedio')).map((d) => [d.fecha, d.valor]));
      const fechas = [...new Set([...lluvia.keys(), ...sol.keys()])].sort();
      const dias = fechas.map((fecha) => {
        const mm = lluvia.get(fecha) ?? 0;
        const h = sol.get(fecha) ?? null;
        const emoji = mm >= 5 ? '🌧️' : mm >= 0.5 ? '🌦️' : h === null ? '🌤️' : h >= 8 ? '☀️' : h >= 4 ? '⛅' : '☁️';
        const t = temp.get(fecha);
        return { fecha, valor: mm, emoji, detalle: [mm >= 0.5 ? `${Math.round(mm * 10) / 10} mm de lluvia` : 'sin lluvia', h !== null ? `${Math.round(h * 10) / 10} h de sol` : '', t !== undefined ? `${Math.round(t)} °C` : ''].filter(Boolean).join(' · ') };
      });
      r = { tipo: 'emoji', unidad: null, mejor: 'neutro', dias, resumen: dias.length ? `${dias.filter((d) => d.valor >= 0.5).length} días de lluvia y ${dias.filter((d) => d.emoji === '☀️').length} de sol pleno.` : 'Todavía no hay clima: prendelo en Más.' };
    } else if (capa === 'temperatura') {
      const l = await serie(['Temperatura media'], 'promedio');
      const max = new Map((await serie(['Temperatura máxima'])).map((d) => [d.fecha, d.valor]));
      const dias = l.map((d) => ({ fecha: d.fecha, valor: Math.round(d.valor * 10) / 10, detalle: `media ${Math.round(d.valor)} °C${max.has(d.fecha) ? `, máxima ${Math.round(max.get(d.fecha)!)} °C` : ''}` }));
      const pr = prom(dias.map((d) => d.valor));
      r = { tipo: 'numero', unidad: '°C', mejor: 'neutro', dias, resumen: pr === null ? 'Todavía no hay clima: prendelo en Más.' : `${Math.round(pr)} °C de promedio.` };
    } else if (capa === 'pasos') {
      const l = await serie(['Pasos']);
      const pr = prom(l.map((d) => d.valor));
      r = { tipo: 'numero', unidad: 'pasos', mejor: 'mas', dias: l, resumen: pr === null ? 'Todavía no hay pasos: conectá el reloj o la salud del teléfono.' : `${Math.round(pr).toLocaleString('es-AR')} pasos por día en promedio.` };
    } else {
      const l = await serie(['Tiempo de pantalla']);
      const pr = prom(l.map((d) => d.valor));
      r = { tipo: 'numero', unidad: 'min', mejor: 'menos', dias: l, resumen: pr === null ? 'Todavía no hay tiempo de pantalla: activalo en Más (Android).' : `${hm(pr / 60)} de pantalla por día en promedio.` };
    }
    const res: CalendarioCapa = { capa, desde, hasta, ...r, dias: r.dias.filter((d) => d.fecha >= desde && d.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)) };
    return c.json(res);
  })
  .get('/concepto', async (c) => {
    // ?persona=1&concepto=ID&dias=180: los días en que pasó (con cuántas veces, cuánto o qué intensidad).
    const db = c.var.db;
    const p = await persona(db, c.var.usuario, Number(c.req.query('persona')), false);
    const dias = Math.min(Math.max(Number(c.req.query('dias')) || 180, 7), 730);
    const hasta = diaDePatty(new Date(), p.zona_horaria);
    const desde = sumarDias(hasta, -(dias - 1));
    const concepto = await una<SerieConcepto['concepto']>(
      db,
      sql`SELECT c.id, c.nombre, c.tipo_valor, c.unidad, c.categoria_id FROM conceptos c WHERE c.id = ${Number(c.req.query('concepto')) || 0}`,
    );
    if (!concepto) throw new ErrorApi('No existe.', 404);
    const serie = await filas<SerieConcepto['dias'][number]>(
      db,
      sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, sum(veces)::int AS veces, sum(suma)::float AS suma, max(intensidad_max)::int AS intensidad
          FROM serie_diaria WHERE persona_id = ${p.id} AND concepto_id = ${concepto.id} AND fecha BETWEEN ${desde} AND ${hasta}
          GROUP BY fecha ORDER BY fecha`,
    );
    const r: SerieConcepto = { concepto, desde, hasta, dias: serie };
    return c.json(r);
  });
