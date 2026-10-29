// Abrir un enlace afuera de Patty (el PDF del informe para el médico). En la app de Android, Patty es la web adentro de
// un visor que no muestra ni baja PDFs, y los enlaces del mismo sitio se quedan adentro: se abre en el navegador del
// teléfono con el plugin propio. Si la app instalada es vieja y no lo tiene, se copia el enlace para pegarlo en el
// navegador. En el iPhone, Capacitor ya abre los `_blank` en Safari; en la web, una pestaña nueva.
import { plataforma } from './nativo';
import { Telefono } from './telefono';

export type Abierto = 'abierto' | 'copiado' | 'nada';

/**
 * En la web la pestaña se abre antes de pedir el enlace (al tocar el botón): si se abre después de esperar al
 * servidor, el navegador la bloquea. Devuelve null en la app nativa.
 */
export function pestanaPrevia(): Window | null {
  return plataforma() === 'web' ? window.open('', '_blank') : null;
}

export async function abrirAfuera(url: string, pestana: Window | null = null): Promise<Abierto> {
  if (plataforma() === 'android') {
    try {
      await Telefono.abrirAfuera({ url });
      return 'abierto';
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        return 'copiado';
      } catch {
        return 'nada';
      }
    }
  }
  if (pestana && !pestana.closed) {
    pestana.location.href = url;
    return 'abierto';
  }
  if (window.open(url, '_blank')) return 'abierto';
  location.href = url;
  return 'abierto';
}
