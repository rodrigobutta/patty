// Quién cuenta todo a la noche: los que no anotan nada durante el día y a la noche cuentan su día entero. Lo puede
// elegir cada uno (usuarios.cuenta_de_noche); si no eligió, se mira a qué hora anotó lo primero de cada día en las
// últimas dos semanas: si la mayoría de los días fue de noche, es de los que cuentan todo a la noche.
import { sql } from 'drizzle-orm';
import { una, type Tx } from '../db/client.js';
import { HORA_INICIO_DIA } from './fechas.js';

/** Desde esta hora (de la persona) se considera "a la noche". */
export const HORA_DE_NOCHE = 18;
const DIAS_MIRADOS = 14;
const DIAS_MINIMOS = 5;
const PROPORCION = 0.7;

/** Si lo detecta solo (sin mirar lo que eligió). */
export async function cuentaDeNocheSegunUso(tx: Tx, usuarioId: number): Promise<boolean> {
  const r = await una<{ dias: number; de_noche: number }>(
    tx,
    // El día de Patty empieza a las 5: las horas se corren para que lo de la madrugada cuente como lo último del día.
    sql`SELECT count(*)::int AS dias, count(*) FILTER (WHERE primera >= ${HORA_DE_NOCHE - HORA_INICIO_DIA})::int AS de_noche FROM (
          SELECT r.fecha, min(mod(extract(hour FROM r.creado AT TIME ZONE p.zona_horaria)::int - ${HORA_INICIO_DIA} + 24, 24)) AS primera
          FROM registros r JOIN personas p ON p.id = r.persona_id
          WHERE r.creado_por = ${usuarioId} AND r.borrado IS NULL AND r.origen IN ('manual', 'ia')
            AND r.creado > now() - make_interval(days => ${DIAS_MIRADOS})
          GROUP BY r.fecha) x`,
  );
  return !!r && r.dias >= DIAS_MINIMOS && r.de_noche / r.dias >= PROPORCION;
}

/** Lo que eligió, o si no eligió, lo que se ve en cómo anota. */
export async function cuentaDeNoche(tx: Tx, usuarioId: number): Promise<boolean> {
  const u = await una<{ cuenta_de_noche: boolean | null }>(tx, sql`SELECT cuenta_de_noche FROM usuarios WHERE id = ${usuarioId}`);
  return u?.cuenta_de_noche ?? (await cuentaDeNocheSegunUso(tx, usuarioId));
}
