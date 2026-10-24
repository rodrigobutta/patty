// Los avisos del teléfono (notificaciones locales de la app nativa): permiso, si pueden ser exactos y a qué canal van.
// Los usan la encuesta de la noche y los recordatorios de remedios; lo que venga después va por acá también.
import { LocalNotifications } from '@capacitor/local-notifications';
import { esNativa } from './nativo';

/** ¿Se pueden mandar avisos? Si todavía no se preguntó, lo pregunta (salvo `pedir: false`). */
export async function permisoAvisos(pedir = true): Promise<boolean> {
  if (!esNativa()) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && pedir) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Exacto si el teléfono ya lo permite (la app pide USE_EXACT_ALARM, que Android da solo al instalar); si no,
 * aproximado: pedirlo abriría Ajustes, y unos minutos de diferencia no cambian nada.
 */
export async function avisoExacto(): Promise<boolean> {
  return LocalNotifications.checkExactNotificationSetting()
    .then((p) => p.exact_alarm === 'granted')
    .catch(() => false);
}

let canales: Promise<void> | null = null;
/** Los canales de Android (cada uno se puede silenciar aparte desde los ajustes del teléfono). */
export function crearCanales(): Promise<void> {
  canales ??= (async () => {
    try {
      await LocalNotifications.createChannel({
        id: 'remedios',
        name: 'Remedios',
        description: 'Recordatorios de cada toma',
        importance: 5,
        visibility: 0,
        vibration: true,
      });
    } catch {
      /* iPhone o web: no hay canales */
    }
  })();
  return canales;
}

/** Un número de aviso estable a partir de un texto (los avisos se identifican con un entero de 31 bits). */
export function idDeAviso(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  // Lejos de los fijos (la encuesta es 2210).
  return 100000 + ((h >>> 0) % 2000000000);
}

const EVENTO_DIA = 'patty-ir-al-dia';
/** Pedir que se muestre el Día (al tocar un aviso). */
export const irAlDia = () => window.dispatchEvent(new Event(EVENTO_DIA));
export function alPedirIrAlDia(f: () => void): () => void {
  window.addEventListener(EVENTO_DIA, f);
  return () => window.removeEventListener(EVENTO_DIA, f);
}
