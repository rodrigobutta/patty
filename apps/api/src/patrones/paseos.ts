// Las vueltas a pie que se ven en la ubicación (salir de casa, caminar unas cuadras y volver) se sugieren para anotar:
// "Saliste a caminar 15 min, ¿qué fue?", con lo que la persona suele contestar ("Paseo con los perros"). Cuando una
// respuesta ya se repite (3 veces o más, y 7 de cada 10), Patty pregunta directo: "¿Paseo con los perros?". Corre cada
// minuto con los demás trabajos (patrones/noche.ts); la vuelta se sugiere a los 10 minutos de haber terminado.
import { sql } from 'drizzle-orm';
import { esIdioma, traducir, type Idioma } from 'shared';
import { filas, una, type Db, type Tx } from '../db/client.js';
import { hayEnvio } from '../push/firebase.js';
import { avisarUnaVez, dispositivosDe } from '../push/recordatorios.js';
import { paseosDelDia } from '../ubicacion/resumen.js';

const ESPERA_MS = 10 * 60000;
const HASTA_MS = 3 * 3600000;
export const ETIQUETAS_PASEO = ['Paseo con los perros', 'Caminata', 'Mandados'];

/** Cómo llamó la persona a sus paseos (lo más usado primero) y si ya hay uno que se repite tanto como para preguntar directo. */
export async function etiquetasDePaseos(db: Db | Tx, personaId: number): Promise<{ lista: string[]; directa: string | null }> {
  const usadas = await filas<{ nombre: string; veces: number }>(
    db,
    sql`SELECT c.nombre, count(*)::int AS veces FROM paseos_detectados p JOIN registros r ON r.id = p.registro_id JOIN conceptos c ON c.id = r.concepto_id
        WHERE p.persona_id = ${personaId} AND p.estado = 'anotado' AND r.borrado IS NULL AND p.inicio > now() - interval '60 days'
        GROUP BY c.nombre ORDER BY veces DESC`,
  );
  const total = usadas.reduce((s, x) => s + x.veces, 0);
  const directa = usadas[0] && usadas[0].veces >= 3 && usadas[0].veces / total >= 0.7 ? usadas[0].nombre : null;
  return { lista: [...new Set([...usadas.map((x) => x.nombre), ...ETIQUETAS_PASEO])], directa };
}

export async function sugerirPaseos(db: Db, ahora = new Date()): Promise<number> {
  const personas = await filas<{ id: number; zona_horaria: string }>(
    db,
    sql`SELECT p.id, p.zona_horaria FROM personas p
        WHERE EXISTS (SELECT 1 FROM puntos x WHERE x.persona_id = p.id AND x.instante > ${new Date(ahora.getTime() - HASTA_MS).toISOString()})`,
  );
  let n = 0;
  for (const p of personas) {
    const puntos = (await filas<{ instante: string; lat: number; lon: number }>(
      db,
      sql`SELECT instante, lat, lon FROM puntos WHERE persona_id = ${p.id} AND instante > ${new Date(ahora.getTime() - HASTA_MS - 3600000).toISOString()} ORDER BY instante`,
    )).map((x) => ({ instante: Date.parse(x.instante), lat: x.lat, lon: x.lon }));
    const lugares = await filas<{ id: number; lat: number; lon: number; radio_m: number }>(
      db,
      sql`SELECT id, lat, lon, radio_m FROM lugares WHERE persona_id = ${p.id}`,
    );
    for (const v of paseosDelDia(puntos, lugares)) {
      if (ahora.getTime() - v.fin < ESPERA_MS || ahora.getTime() - v.fin > HASTA_MS) continue;
      // Si ya anotó una actividad en ese rato (a mano o contándolo), no se sugiere.
      const ya = await una(
        db,
        sql`SELECT 1 FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
            WHERE r.persona_id = ${p.id} AND r.borrado IS NULL AND k.clave = 'actividad'
              AND r.inicio BETWEEN ${new Date(v.inicio - 20 * 60000).toISOString()} AND ${new Date(v.fin + 20 * 60000).toISOString()}`,
      );
      if (ya) continue;
      const nuevo = await una<{ id: number }>(
        db,
        sql`INSERT INTO paseos_detectados (persona_id, inicio, fin, metros) VALUES (${p.id}, ${new Date(v.inicio).toISOString()}, ${new Date(v.fin).toISOString()}, ${Math.round(v.metros)})
            ON CONFLICT (persona_id, inicio) DO NOTHING RETURNING id`,
      );
      if (!nuevo || !hayEnvio()) continue;
      const { lista, directa } = await etiquetasDePaseos(db, p.id);
      const hora = (ms: number) => new Intl.DateTimeFormat('es-AR', { timeZone: p.zona_horaria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
      const min = Math.round((v.fin - v.inicio) / 60000);
      const km = (Math.round(v.metros / 100) / 10).toLocaleString('es-AR');
      for (const d of await dispositivosDe(db, p.id, false)) {
        const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
        const pedido = (cuerpo: Record<string, unknown>) => [{ ruta: `/api/paseos/${nuevo.id}`, cuerpo }];
        const boton = (nombre: string) => ({ titulo: traducir(i, nombre), pedidos: pedido({ concepto: nombre }), listo: traducir(i, '¡Anotado! {que}, {n} min 💪', { que: traducir(i, nombre), n: min }) });
        const no = { titulo: traducir(i, 'No anotar'), pedidos: pedido({ descartar: true }), listo: traducir(i, 'Listo, no lo anoto') };
        const ok = await avisarUnaVez(db, d, `paseo|${nuevo.id}`, {
          titulo: directa ? traducir(i, '🦉 ¿{que}?', { que: traducir(i, directa) }) : traducir(i, '🦉 Saliste a caminar {n} min', { n: min }),
          cuerpo: directa
            ? traducir(i, 'Saliste de {desde} a {hasta} ({km} km).', { desde: hora(v.inicio), hasta: hora(v.fin), km })
            : traducir(i, 'De {desde} a {hasta} ({km} km). ¿Qué fue?', { desde: hora(v.inicio), hasta: hora(v.fin), km }),
          datos: { tipo: 'paseo', persona_id: String(p.id), cara: 'feliz' },
          etiqueta: `paseo|${p.id}`,
          conApodo: true,
          acciones: directa ? [{ ...boton(directa), titulo: traducir(i, 'Sí') }, ...lista.filter((x) => x !== directa).slice(0, 1).map(boton), no] : [...lista.slice(0, 2).map(boton), no],
        });
        if (ok) n++;
      }
    }
  }
  return n;
}
