// Los avisos de los seguimientos activos: a cada hora elegida (hora de la persona), Patty pregunta cómo sigue y qué le
// falta anotar de hoy ("Te falta: almuerzo, temperatura"). Corre cada minuto con los demás trabajos (patrones/noche.ts).
import { sql } from 'drizzle-orm';
import { esIdioma, inicioDeVentana, ITEMS_SEGUIMIENTO, itemsHechos, traducir, type Idioma } from 'shared';
import { filas, type Db } from '../db/client.js';
import { diaDePatty, minutosDelDia } from '../lib/fechas.js';
import { hayEnvio } from '../push/firebase.js';
import { avisarUnaVez, dispositivosDe } from '../push/recordatorios.js';

/**
 * Lo que falta (sin los opcionales, como vómitos): lo de una vez al día, si no está hoy; lo de cada vez (la fiebre), si
 * no está desde el horario anterior a ahora.
 */
export async function faltanHoy(db: Db, personaId: number, zona: string, items: string[], horarios: string[], ahora = new Date()): Promise<string[]> {
  const hoy = diaDePatty(ahora, zona);
  const anotado = await filas<{ concepto: string; categoria: string; hora: number }>(
    db,
    sql`SELECT c.nombre AS concepto, k.clave AS categoria,
               extract(hour FROM r.inicio AT TIME ZONE ${zona})::float + extract(minute FROM r.inicio AT TIME ZONE ${zona})::float / 60 AS hora
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND r.fecha = ${hoy}`,
  );
  const hora = minutosDelDia(ahora, zona) / 60;
  // El horario de ahora no cuenta como comienzo: lo que se anotó desde el anterior ya vale.
  const hechos = itemsHechos(items, anotado, inicioDeVentana(horarios, hora - 1 / 60));
  return items.filter((clave) => {
    const it = ITEMS_SEGUIMIENTO.find((i) => i.clave === clave);
    // Las comidas que todavía no llegaron (la cena, a la mañana) no faltan.
    return it && !it.opcional && !hechos.has(clave) && !(it.tipo === 'comida' && (hora < 5 ? hora + 24 : hora) < (it.desde ?? 0));
  });
}

export async function avisarSeguimientos(db: Db, ahora = new Date()): Promise<number> {
  if (!hayEnvio()) return 0;
  const activos = await filas<{ id: number; persona_id: number; zona_horaria: string; nombre: string; emoji: string; items: string[]; horarios: string[] }>(
    db,
    sql`SELECT s.id, s.persona_id, p.zona_horaria, s.nombre, s.emoji, s.items, s.horarios
        FROM seguimientos s JOIN personas p ON p.id = s.persona_id WHERE s.desde <= ${ahora.toISOString()} AND s.hasta > ${ahora.toISOString()}`,
  );
  let n = 0;
  for (const s of activos) {
    const m = minutosDelDia(ahora, s.zona_horaria);
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (!s.horarios.includes(hhmm)) continue;
    const faltan = await faltanHoy(db, s.persona_id, s.zona_horaria, s.items, s.horarios, ahora);
    const dia = diaDePatty(ahora, s.zona_horaria);
    for (const d of await dispositivosDe(db, s.persona_id, false)) {
      const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
      const nombres = faltan.map((c) => traducir(i, ITEMS_SEGUIMIENTO.find((x) => x.clave === c)!.nombre).toLowerCase());
      const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} ${traducir(i, 'y')} ${nombres.at(-1)}` : nombres[0];
      const ok = await avisarUnaVez(db, d, `seguimiento|${s.id}|${dia}|${hhmm}`, {
        titulo: `${s.emoji} ${traducir(i, '¿Cómo seguís?')}`,
        cuerpo: faltan.length ? traducir(i, 'Contame cómo te sentís. Te falta anotar: {lista}.', { lista }) : traducir(i, '¡Vas bien con todo lo de hoy! Contame cómo te sentís.'),
        datos: { tipo: 'seguimiento', persona_id: String(s.persona_id), cara: 'espera' },
        etiqueta: `seguimiento|${s.persona_id}`,
      });
      if (ok) n++;
    }
  }
  return n;
}
