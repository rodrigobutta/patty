// Un malestar no es un momento: dura. Los que se anotan en el momento quedan abiertos (registros.datos.abierto) y Patty
// pregunta cada tanto, de día, si siguen: a las 2 horas y después cada 4, con botones en el aviso (ya se me pasó, sigo
// igual, peor). "Ya se me pasó" lo cierra con su hora de fin (así queda cuánto duró). A los 3 días sin cerrar se cierra
// solo, sin fin. Corre cada minuto con los demás trabajos (patrones/noche.ts).
import { sql } from 'drizzle-orm';
import { esIdioma, traducir, type Idioma } from 'shared';
import { filas, type Db } from '../db/client.js';
import { minutosDelDia } from '../lib/fechas.js';
import { hayEnvio } from '../push/firebase.js';
import { avisarUnaVez, dispositivosDe } from '../push/recordatorios.js';

const PRIMERA_MS = 2 * 3600000;
const CADA_MS = 4 * 3600000;
const MAXIMO_MS = 3 * 86400000;
/** Solo se pregunta de día (hora de la persona). */
const DESDE_HORA = 9;
const HASTA_HORA = 22;

export async function seguirMalestares(db: Db, ahora = new Date()): Promise<number> {
  // Los viejos se cierran solos.
  await db.execute(
    sql`UPDATE registros r SET datos = r.datos || '{"abierto": false, "sin_cierre": true}'::jsonb
        FROM conceptos c JOIN categorias k ON k.id = c.categoria_id
        WHERE c.id = r.concepto_id AND k.clave = 'sintoma' AND r.datos->>'abierto' = 'true'
          AND (r.borrado IS NOT NULL OR r.inicio < ${new Date(ahora.getTime() - MAXIMO_MS).toISOString()})`,
  );
  if (!hayEnvio()) return 0;
  const abiertos = await filas<{ id: number; persona_id: number; zona_horaria: string; concepto: string; inicio: string; ultimo: string; preguntas: number }>(
    db,
    sql`SELECT r.id, r.persona_id, p.zona_horaria, c.nombre AS concepto, r.inicio,
               greatest(r.inicio, coalesce((r.datos->>'chequeado')::timestamptz, r.inicio), coalesce((r.datos->>'preguntado')::timestamptz, r.inicio)) AS ultimo,
               coalesce((r.datos->>'preguntas')::int, 0) AS preguntas
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id JOIN personas p ON p.id = r.persona_id
        WHERE r.datos->>'abierto' = 'true' AND r.borrado IS NULL AND k.clave = 'sintoma' ORDER BY r.inicio`,
  );
  let n = 0;
  const yaAvisada = new Set<number>();
  for (const m of abiertos) {
    // De a uno por persona por vez (el más viejo primero), así no llegan varios avisos juntos.
    if (yaAvisada.has(m.persona_id)) continue;
    const hora = minutosDelDia(ahora, m.zona_horaria) / 60;
    if (hora < DESDE_HORA || hora >= HASTA_HORA) continue;
    const espera = m.preguntas === 0 && Date.parse(m.ultimo) === Date.parse(m.inicio) ? PRIMERA_MS : CADA_MS;
    if (ahora.getTime() - Date.parse(m.ultimo) < espera) continue;
    yaAvisada.add(m.persona_id);
    await db.execute(
      sql`UPDATE registros SET datos = datos || jsonb_build_object('preguntado', ${ahora.toISOString()}::timestamptz, 'preguntas', ${m.preguntas + 1}::int) WHERE id = ${m.id}`,
    );
    const desde = new Intl.DateTimeFormat('es-AR', { timeZone: m.zona_horaria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m.inicio));
    for (const d of await dispositivosDe(db, m.persona_id, false)) {
      const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
      const que = traducir(i, m.concepto).toLowerCase();
      const pedido = (estado: string) => [{ ruta: `/api/registros/${m.id}/seguir`, cuerpo: { estado } }];
      const ok = await avisarUnaVez(db, d, `malestar|${m.id}|${m.preguntas + 1}`, {
        titulo: traducir(i, '🦉 ¿Seguís con {que}?', { que }),
        cuerpo: traducir(i, 'Lo anotaste a las {hora}. Contame cómo va.', { hora: desde }),
        datos: { tipo: 'malestar', persona_id: String(m.persona_id), registro_id: String(m.id), cara: 'espera' },
        etiqueta: `malestar|${m.persona_id}`,
        acciones: [
          { titulo: traducir(i, 'Ya se me pasó'), pedidos: pedido('paso'), listo: traducir(i, '¡Qué bueno! Anotado que se te pasó 💜') },
          { titulo: traducir(i, 'Sigo igual'), pedidos: pedido('igual'), listo: traducir(i, 'Anotado. Te pregunto más tarde 💜') },
          { titulo: traducir(i, 'Peor'), pedidos: pedido('peor'), listo: traducir(i, 'Anotado. Si sigue así, consultalo 💜') },
        ],
      });
      if (ok) n++;
    }
  }
  return n;
}
