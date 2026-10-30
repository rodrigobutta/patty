// El apodo del usuario guardado en el teléfono, para los avisos que el teléfono programa por su cuenta (remedios, la
// encuesta de la noche): se guarda cada vez que se abre la app.
import { sumarApodo } from 'shared';

const CLAVE = 'apodo';

export function guardarApodo(apodo: string | null | undefined): void {
  try {
    if (apodo) localStorage.setItem(CLAVE, apodo);
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}

export function apodoGuardado(): string {
  try {
    return localStorage.getItem(CLAVE) ?? '';
  } catch {
    return '';
  }
}

/** Una pregunta o un mensaje de Patty con el apodo adelante ("Rodri, ¿cómo te sentís ahora?"), si hay apodo. */
export const conApodo = (texto: string): string => sumarApodo(texto, apodoGuardado());
