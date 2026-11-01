// Las alergias que declaró cada persona, del lado del servidor: lo que choca con lo que se anota y lo que se le cuenta a la IA.
import { sql } from 'drizzle-orm';
import { alergiasParaIa, alergiasQueChocan, nombreDeAlergia, type Alergia, type AvisoAlergia, type Idioma, type Registro } from 'shared';
import { filas, una, type Db, type Tx } from '../db/client.js';

export async function alergiasDe(db: Db | Tx, personaId: number): Promise<Alergia[]> {
  return (await una<{ alergias: Alergia[] }>(db, sql`SELECT alergias FROM personas WHERE id = ${personaId}`))?.alergias ?? [];
}

/** La línea para la IA: qué alergias declaró y si es la temporada de alguna. Vacía si no declaró ninguna. */
export async function lineaDeAlergias(db: Db | Tx, personaId: number, fecha: string): Promise<string> {
  const p = await una<{ alergias: Alergia[]; zona_horaria: string }>(db, sql`SELECT alergias, zona_horaria FROM personas WHERE id = ${personaId}`);
  return p ? alergiasParaIa(p.alergias, fecha, p.zona_horaria) : '';
}

export function avisosDeTexto(que: string, buscarEn: string, alergias: Alergia[], categoria: string, idioma: Idioma = 'es'): AvisoAlergia[] {
  return alergiasQueChocan(buscarEn, alergias, categoria).map((a) => ({ que, alergia: nombreDeAlergia(a, idioma) }));
}

/** Si lo que se acaba de anotar (o el remedio que se programó) choca con una alergia de esa persona. */
export async function avisosDeRegistros(db: Db | Tx, lista: Array<Pick<Registro, 'persona_id' | 'concepto_id' | 'concepto' | 'nota' | 'detalles'>>, idioma: Idioma = 'es'): Promise<Map<number, AvisoAlergia[]>> {
  const r = new Map<number, AvisoAlergia[]>();
  const ids = [...new Set(lista.map((x) => x.persona_id))];
  const alergias = new Map<number, Alergia[]>();
  for (const id of ids) alergias.set(id, await alergiasDe(db, id));
  // La mayoría no declaró nada: entonces ni se mira la categoría.
  if (![...alergias.values()].some((a) => a.length)) return r;
  const conceptos = [...new Set(lista.map((x) => x.concepto_id))];
  const categorias = new Map(
    (await filas<{ id: number; clave: string }>(db, sql`SELECT c.id, k.clave FROM conceptos c JOIN categorias k ON k.id = c.categoria_id WHERE c.id IN ${conceptos}`)).map((c) => [Number(c.id), c.clave]),
  );
  lista.forEach((x, i) => {
    const texto = [x.concepto, x.nota ?? '', ...(x.detalles ?? []).flatMap((d) => d.respuestas)].join(' . ');
    const avisos = avisosDeTexto(x.concepto, texto, alergias.get(x.persona_id) ?? [], categorias.get(Number(x.concepto_id)) ?? '', idioma);
    if (avisos.length) r.set(i, avisos);
  });
  return r;
}
