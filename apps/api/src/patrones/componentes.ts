// Los rasgos de los componentes de lo que comió una persona ("Días con mucha sal"), como le llegan al motor: igual que el calendario o
// la gente, solo como causa. Las cuentas están en componentes/niveles.ts; acá se junta lo de la base y se nombra.
import { sql } from 'drizzle-orm';
import { filas, una, type Tx } from '../db/client.js';
import { CATEGORIA_COMPONENTE } from '../componentes/lista.js';
import { comidaDe, rasgosDeComidas, type ComidaDia, type RegistroComida } from '../componentes/niveles.js';
import { obtenerOCrearConcepto } from '../routes/conceptos.js';
import type { ConceptoInfo, FilaDiaria } from './motor.js';

/** Las comidas y bebidas de una persona en un período, con lo que se sabe de cada una. */
export async function comidasDePersona(tx: Tx, personaId: number, desde: string, hasta: string): Promise<ComidaDia[]> {
  const lista = await filas<Omit<RegistroComida, 'hora'> & { hora: Date | string | null }>(
    tx,
    sql`SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.inicio AS hora, c.nombre, k.clave AS categoria, r.valor, r.unidad, r.datos->>'porcion' AS porcion, r.datos->'tipos' AS tipos,
               a.estado, a.confianza, a.gramos, a.gramos_unidad, a.componentes
        FROM registros r JOIN conceptos c ON c.id = r.concepto_id JOIN categorias k ON k.id = c.categoria_id LEFT JOIN alimentos a ON a.id = c.alimento_id
        WHERE r.persona_id = ${personaId} AND r.borrado IS NULL AND r.fecha BETWEEN ${desde} AND ${hasta} AND k.clave IN ('comida', 'bebida')`,
  );
  const r: ComidaDia[] = [];
  for (const x of lista) {
    const c = comidaDe({ ...x, hora: x.hora ? new Date(x.hora).getTime() : null });
    if (c) r.push(c);
  }
  return r;
}

export async function rasgosDeComponentes(tx: Tx, personaId: number, desde: string, hasta: string): Promise<{ filas: FilaDiaria[]; conceptos: ConceptoInfo[] }> {
  const rasgos = rasgosDeComidas(await comidasDePersona(tx, personaId, desde, hasta));
  if (!rasgos.length) return { filas: [], conceptos: [] };
  const cat = await una<{ id: number }>(tx, sql`SELECT id FROM categorias WHERE clave = 'otro'`);
  if (!cat) return { filas: [], conceptos: [] };
  const conceptos: ConceptoInfo[] = [];
  const r: FilaDiaria[] = [];
  for (const x of rasgos) {
    const { concepto } = await obtenerOCrearConcepto(tx, { nombre: x.concepto, categoriaId: cat.id, tipoValor: 'evento', unidad: null });
    conceptos.push({
      id: concepto.id,
      nombre: concepto.nombre,
      tipo_valor: concepto.tipo_valor,
      rol: 'causa',
      categoria: CATEGORIA_COMPONENTE,
      universo: x.universo,
      componente: { clave: x.clave, nivel: x.nivel, alimentos: x.alimentos },
    });
    for (const d of x.dias) r.push({ fecha: d.fecha, concepto_id: concepto.id, veces: 1, suma: null, promedio: null, intensidad: null, primera: d.primera, automatica: true });
  }
  return { filas: r, conceptos };
}
