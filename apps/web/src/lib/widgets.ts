// Lo que la persona eligió de sus widgets, de este lado: lo último conocido queda en el teléfono (ver lib/guardado), y lo
// que cambia acá se ve al instante y se sube por detrás. Sin señal queda pendiente y se sube cuando vuelva; mientras tanto,
// lo pendiente gana a lo que diga el servidor. Si no hay nada pendiente, gana el servidor (lo cambió en otro dispositivo).
import { useEffect, useReducer } from 'react';
import type { AjustesWidgets, Persona, WidgetId } from 'shared';
import { api, ErrorApi } from '../api';
import { guardado, guardar } from './guardado';

export const NOMBRE_WIDGET: Record<WidgetId, string> = {
  remedios: 'Remedios',
  animo: 'Ánimo de la semana',
  clima: 'Clima',
  ubicacion: 'Viajes',
  pasos: 'Movimiento',
  telefono: 'Uso del teléfono',
  reuniones: 'Reuniones',
  sueno: 'Sueño',
  comida: 'Comida',
  cuerpo: 'Pulso y cuerpo',
  escuchas: 'Lo que sonó',
  malestares: 'Malestares',
};

interface Local {
  ajustes: AjustesWidgets;
  pendiente: boolean;
}
type DePersona = Pick<Persona, 'id' | 'widgets'>;

const clave = (id: number) => `widgets-persona-${id}`;
const firma = (a?: AjustesWidgets) => JSON.stringify(a ?? {});
/** Lo último que se vio del servidor, por persona: si cambia, lo cambió otro dispositivo. */
const delServidor = new Map<number, string>();
const subiendo = new Set<number>();
const oyentes = new Set<() => void>();
const cambio = () => oyentes.forEach((f) => f());

function ajustesDe(p: DePersona): AjustesWidgets {
  const l = guardado<Local>(clave(p.id));
  if (l && (l.pendiente || delServidor.get(p.id) === firma(p.widgets))) return l.ajustes;
  return p.widgets ?? {};
}

/** Sube lo pendiente (lo último, si mientras tanto cambió). Sin señal, sigue pendiente; si el servidor lo rechaza, se deja de lado. */
async function subir(id: number): Promise<void> {
  if (subiendo.has(id)) return;
  subiendo.add(id);
  try {
    for (;;) {
      const l = guardado<Local>(clave(id));
      if (!l?.pendiente) return;
      await api('PUT', `/api/personas/${id}`, { widgets: l.ajustes });
      if (guardado<Local>(clave(id))?.ajustes === l.ajustes) guardar(clave(id), { ajustes: l.ajustes, pendiente: false });
    }
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 0) return;
    const l = guardado<Local>(clave(id));
    if (l) guardar(clave(id), { ajustes: l.ajustes, pendiente: false });
    delServidor.delete(id);
    cambio();
    throw e;
  } finally {
    subiendo.delete(id);
  }
}

/** Cambia lo elegido: se ve ya. Rechaza solo si el servidor no lo acepta (y entonces vuelve a lo de antes). */
export async function cambiarWidgets(id: number, ajustes: AjustesWidgets): Promise<void> {
  guardar(clave(id), { ajustes, pendiente: true });
  cambio();
  await subir(id);
}

export function useAjustesWidgets(p: DePersona): AjustesWidgets {
  const [, refrescar] = useReducer((n: number) => n + 1, 0);
  const delServidorAhora = firma(p.widgets);
  useEffect(() => {
    oyentes.add(refrescar);
    return () => void oyentes.delete(refrescar);
  }, []);
  useEffect(() => {
    const l = guardado<Local>(clave(p.id));
    if (!l?.pendiente && delServidor.get(p.id) !== delServidorAhora) guardar(clave(p.id), { ajustes: p.widgets ?? {}, pendiente: false });
    delServidor.set(p.id, delServidorAhora);
    refrescar();
    const reintentar = () => void subir(p.id).catch(() => {});
    reintentar();
    window.addEventListener('online', reintentar);
    return () => window.removeEventListener('online', reintentar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, delServidorAhora]);
  return ajustesDe(p);
}

/** Para las pruebas: el teléfono recién abierto. */
export function olvidarLoVistoDelServidor(): void {
  delServidor.clear();
}
