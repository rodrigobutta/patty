// El apodo del usuario guardado en el teléfono, para los avisos que el teléfono programa por su cuenta (remedios, la
// encuesta de la noche): se guarda cada vez que se abre la app.
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
