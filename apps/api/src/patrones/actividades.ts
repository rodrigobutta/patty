// Las actividades que duran (caminar, fútbol, gimnasio) anotadas en el momento quedan en curso (datos.abierto). Con la
// ubicación del teléfono se ve cuándo terminaron: el último punto en movimiento, si después no se movió por un rato (y
// mejor si llegó a un lugar suyo, como Casa). Ahí Patty sugiere cerrarla ("¿Terminaste? Parece que a las 18:42") con
// botones; sin ubicación, pregunta a la hora y media. A las 6 horas se cierra sola, sin fin. Corre cada minuto.
import { sql } from 'drizzle-orm';
import { distanciaMetros, esIdioma, lugarDe, traducir, type Idioma } from 'shared';
import { filas, type Db } from '../db/client.js';
import { hayEnvio } from '../push/firebase.js';
import { avisarUnaVez, dispositivosDe } from '../push/recordatorios.js';

/** Quieto este rato después del último punto: la actividad terminó ahí. */
const QUIETO_MS = 12 * 60000;
const MAXIMO_MS = 6 * 3600000;
const SIN_UBICACION_MS = 90 * 60000;
const DE_NUEVO_MS = 2 * 3600000;

/**
 * Cuándo parece que terminó, por los puntos desde que empezó: el último punto, si hubo movimiento (más de 200 m) y
 * después nada por un rato. Devuelve el instante y el lugar al que llegó (si es uno suyo), o null.
 */
export function finPorUbicacion(
  inicio: number,
  puntos: Array<{ instante: number; lat: number; lon: number }>,
  lugares: Array<{ id: number; nombre: string; lat: number; lon: number; radio_m: number }>,
  ahora: number,
): { fin: number; lugar: string | null } | null {
  const desde = puntos.filter((p) => p.instante >= inicio - 5 * 60000).sort((a, b) => a.instante - b.instante);
  if (desde.length < 2) return null;
  const ultimo = desde[desde.length - 1];
  const lejos = Math.max(...desde.map((p) => distanciaMetros(desde[0], p)));
  if (lejos < 200 || ultimo.instante < inicio + 5 * 60000 || ahora - ultimo.instante < QUIETO_MS) return null;
  return { fin: ultimo.instante, lugar: lugarDe(ultimo, lugares)?.nombre ?? null };
}

export async function sugerirFinDeActividades(db: Db, ahora = new Date()): Promise<number> {
  await db.execute(
    sql`UPDATE registros r SET datos = r.datos || '{"abierto": false, "sin_cierre": true}'::jsonb
        FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
        WHERE c.id = r.concepto_id AND k.clave = 'actividad' AND r.datos->>'abierto' = 'true'
          AND (r.borrado IS NOT NULL OR r.inicio < ${new Date(ahora.getTime() - MAXIMO_MS).toISOString()})`,
  );
  if (!hayEnvio()) return 0;
  const abiertas = await filas<{ id: number; persona_id: number; zona_horaria: string; concepto: string; inicio: string; preguntado: string | null; sugerido: string | null }>(
    db,
    sql`SELECT r.id, r.persona_id, p.zona_horaria, c.nombre AS concepto, r.inicio, r.datos->>'preguntado' AS preguntado, r.datos->>'fin_sugerido' AS sugerido
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id JOIN personas p ON p.id = r.persona_id
        WHERE k.clave = 'actividad' AND r.datos->>'abierto' = 'true' AND r.borrado IS NULL`,
  );
  let n = 0;
  for (const a of abiertas) {
    const inicio = Date.parse(a.inicio);
    const puntos = (await filas<{ instante: string; lat: number; lon: number }>(
      db,
      sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${a.persona_id} AND instante >= ${new Date(inicio - 5 * 60000).toISOString()} ORDER BY instante`,
    )).map((p) => ({ instante: Date.parse(p.instante), lat: p.lat, lon: p.lon }));
    const lugares = await filas<{ id: number; nombre: string; lat: number; lon: number; radio_m: number }>(
      db,
      sql`SELECT l.id, c.nombre, l.lat, l.lon, l.radio_m FROM lugares l JOIN conceptos c ON c.id = l.concepto_id WHERE l.persona_id = ${a.persona_id}`,
    );
    const fin = finPorUbicacion(inicio, puntos, lugares, ahora.getTime());
    const ultimaPregunta = a.preguntado ? Date.parse(a.preguntado) : 0;
    // Con ubicación: cuando aparece un fin nuevo. Sin: a la hora y media, y después cada dos horas.
    const sugerir = fin && (!a.sugerido || Math.abs(Date.parse(a.sugerido) - fin.fin) > 5 * 60000);
    const preguntar = !fin && !puntos.length && ahora.getTime() - Math.max(inicio + SIN_UBICACION_MS - DE_NUEVO_MS, ultimaPregunta) >= DE_NUEVO_MS;
    if (!sugerir && !preguntar) continue;
    await db.execute(
      sql`UPDATE registros SET datos = datos || jsonb_build_object('preguntado', ${ahora.toISOString()}::timestamptz)
          || ${fin ? sql`jsonb_build_object('fin_sugerido', ${new Date(fin.fin).toISOString()}::timestamptz)` : sql`'{}'::jsonb`} WHERE id = ${a.id}`,
    );
    const hora = (ms: number) => new Intl.DateTimeFormat('es-AR', { timeZone: a.zona_horaria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
    for (const d of await dispositivosDe(db, a.persona_id, false)) {
      const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
      const que = traducir(i, a.concepto).toLowerCase();
      const pedido = (estado: string, cuando?: number) => [{ ruta: `/api/registros/${a.id}/seguir`, cuerpo: { estado, ...(cuando ? { fin: new Date(cuando).toISOString() } : {}) } }];
      const ok = await avisarUnaVez(db, d, `actividad|${a.id}|${fin ? Math.round(fin.fin / 60000) : Math.round(ahora.getTime() / 3600000)}`, {
        titulo: fin ? traducir(i, '🦉 ¿Terminaste ({que})?', { que }) : traducir(i, '🦉 ¿Seguís con {que}?', { que }),
        cuerpo: fin
          ? fin.lugar
            ? traducir(i, 'Parece que a las {hora} llegaste a {lugar}. ¿La cierro ahí?', { hora: hora(fin.fin), lugar: fin.lugar })
            : traducir(i, 'Parece que dejaste de moverte a las {hora}. ¿La cierro ahí?', { hora: hora(fin.fin) })
          : traducir(i, 'La empezaste a las {hora}. Contame si ya terminaste.', { hora: hora(inicio) }),
        datos: { tipo: 'actividad', persona_id: String(a.persona_id), registro_id: String(a.id), cara: 'feliz' },
        etiqueta: `actividad|${a.persona_id}`,
        acciones: fin
          ? [
              { titulo: traducir(i, 'Sí, a las {hora}', { hora: hora(fin.fin) }), pedidos: pedido('paso', fin.fin), listo: traducir(i, '¡Listo! Anotado hasta las {hora} 💪', { hora: hora(fin.fin) }) },
              { titulo: traducir(i, 'Sigo'), pedidos: pedido('igual'), listo: traducir(i, '¡Dale! Te pregunto después 💪') },
            ]
          : [
              { titulo: traducir(i, 'Ya terminé'), pedidos: pedido('paso'), listo: traducir(i, '¡Listo! Anotado 💪') },
              { titulo: traducir(i, 'Sigo'), pedidos: pedido('igual'), listo: traducir(i, '¡Dale! Te pregunto después 💪') },
            ],
      });
      if (ok) n++;
    }
  }
  return n;
}
