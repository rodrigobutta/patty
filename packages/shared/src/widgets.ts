// Qué widgets ve cada persona en el Día y en qué orden. Se guarda en la persona (`personas.widgets`), así sigue entre el
// teléfono y la web. Se guarda solo lo elegido: lo que no figura en `orden` (un widget nuevo) va al final y se ve.

/** Todos los widgets. Uno nuevo se agrega al final: a quien nunca reordenó también le aparece último. */
export const WIDGETS = ['remedios', 'animo', 'clima', 'ubicacion', 'pasos', 'telefono', 'reuniones', 'sueno', 'comida', 'cuerpo', 'escuchas', 'malestares'] as const;
export type WidgetId = (typeof WIDGETS)[number];

/**
 * Lo elegido. Puede traer nombres que esta versión no conoce (los guardó otra más nueva, en otro teléfono): acá no se
 * muestran, pero se conservan al guardar para no perderle el lugar a ese widget.
 */
export interface AjustesWidgets {
  orden?: string[];
  ocultos?: string[];
}

const esWidget = (x: string): x is WidgetId => (WIDGETS as readonly string[]).includes(x);
const MAXIMO = 60;
const NOMBRE = /^[a-z0-9_]{1,40}$/;

/** Lo que manda el teléfono, solo si tiene la forma correcta (sin repetidos); si no, null. */
export function limpiarAjustesWidgets(x: unknown): AjustesWidgets | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const a: AjustesWidgets = {};
  for (const k of ['orden', 'ocultos'] as const) {
    const l = (x as Record<string, unknown>)[k];
    if (l === undefined) continue;
    if (!Array.isArray(l) || l.length > MAXIMO || l.some((n) => typeof n !== 'string' || !NOMBRE.test(n))) return null;
    a[k] = [...new Set(l as string[])];
  }
  return a;
}

/** El orden guardado, sin repetidos, con lo que faltaba al final (en el orden de WIDGETS). */
function ordenCompleto(a?: AjustesWidgets | null): string[] {
  const guardado = [...new Set(a?.orden ?? [])];
  return [...guardado, ...WIDGETS.filter((w) => !guardado.includes(w))];
}

/** Los widgets que esta versión conoce, en el orden de la persona (también los ocultos). */
export function ordenDeWidgets(a?: AjustesWidgets | null): WidgetId[] {
  return ordenCompleto(a).filter(esWidget);
}

export const widgetOculto = (a: AjustesWidgets | null | undefined, id: WidgetId): boolean => Boolean(a?.ocultos?.includes(id));

/** Los que quiere ver, en su orden. */
export function widgetsVisibles(a?: AjustesWidgets | null): WidgetId[] {
  return ordenDeWidgets(a).filter((w) => !widgetOculto(a, w));
}

/**
 * Pone `id` en el lugar de `destino`, corriendo a los del medio. Se mueve sobre la lista entera: los ocultos y los que
 * hoy no tienen datos conservan su lugar relativo.
 */
export function moverWidget(a: AjustesWidgets | null | undefined, id: WidgetId, destino: WidgetId): AjustesWidgets {
  const orden = ordenCompleto(a);
  const de = orden.indexOf(id);
  const hasta = orden.indexOf(destino);
  if (de !== hasta) {
    orden.splice(de, 1);
    orden.splice(hasta, 0, id);
  }
  return { ...a, orden };
}

/** El que está antes (delta -1) o después (+1) de `id` entre los que se ven; null si ya está en la punta. */
export function vecinoDeWidget(mostrados: WidgetId[], id: WidgetId, delta: -1 | 1): WidgetId | null {
  const i = mostrados.indexOf(id);
  return i < 0 ? null : (mostrados[i + delta] ?? null);
}

export function ponerWidgetVisible(a: AjustesWidgets | null | undefined, id: WidgetId, visible: boolean): AjustesWidgets {
  const ocultos = (a?.ocultos ?? []).filter((w) => w !== id);
  return { ...a, ocultos: visible ? ocultos : [...ocultos, id] };
}
