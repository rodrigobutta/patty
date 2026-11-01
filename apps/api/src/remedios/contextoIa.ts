// Lo que la persona toma, lo que se vigila y lo que aparece poco, en unas líneas para la IA (hipótesis, "qué pasó antes", preguntas): así
// puede pensar escenarios posibles teniéndolo en cuenta. Sale de lo ya guardado, sin gastar IA. Sin nada que contar, vacío.
import { nombreNutriente, type Idioma } from 'shared';
import type { Tx } from '../db/client.js';
import { coberturaDe, loQueToma } from './cobertura.js';
import { remediosVigilados } from './senales.js';

/** La regla que acompaña a esas líneas en cada prompt. */
export const REGLA_SALUD_IA =
  'Lo que toma y sus efectos posibles son información general: usalo solo para pensar posibilidades, nunca como un diagnóstico. ' +
  'Nunca sugieras dejar, cambiar ni ajustar un remedio o su dosis, ni comprar o empezar un suplemento: frente a un efecto o a algo que aparece poco, ' +
  'lo que corresponde es que lo hable con su médico.';

export async function saludParaIa(tx: Tx, personaId: number, hoy: string, idioma: Idioma = 'es'): Promise<string> {
  const remedios = await remediosVigilados(tx, personaId, idioma);
  const lineas: string[] = [];
  for (const r of remedios) {
    if (r.estado !== 'conocido') {
      lineas.push(`- ${r.nombre}: no se sabe nada de sus efectos.`);
      continue;
    }
    const efectos = r.efectos.map((e) => e.nombre).join(', ');
    const inter = r.interacciones.filter((i) => i.tambien_toma).map((i) => `${i.con} (${i.detalle})`).join('; ');
    lineas.push(`- ${r.nombre}${efectos ? `: efectos posibles: ${efectos}` : ''}${inter ? `. Interacciones con lo que también toma: ${inter}` : ''}.`);
  }
  const toma = await loQueToma(tx, personaId);
  const contenido = toma
    .filter((t) => t.contenido.length)
    .map((t) => `- ${t.nombre}: ${t.contenido.map((c) => `${c.nombre}${c.cantidad !== null ? ` ${c.cantidad}${c.unidad ? ' ' + c.unidad : ''}` : ''}`).join(', ')}.`);
  const cobertura = await coberturaDe(tx, personaId, hoy);
  const poco = cobertura.nutrientes.filter((n) => n.estado === 'poco').map((n) => nombreNutriente(n.clave));
  const partes = [
    ...(lineas.length ? ['Lo que toma (información general):', ...lineas] : []),
    ...(contenido.length ? ['Lo que contiene lo que toma:', ...contenido] : []),
    ...(poco.length ? [`Aparece poco en lo que anotó que come en ${cobertura.dias_con_comida} días, y no toma nada que lo tenga (es una estimación gruesa, no quiere decir que le falte): ${poco.join(', ')}.`] : []),
  ];
  return partes.join('\n');
}
