// Errores que se devuelven al usuario como {"error": "..."} con su estado HTTP. El mensaje se traduce al idioma del
// pedido (app.ts): si lleva datos, va como plantilla con {llaves} y los datos en `vars` (el `message` queda armado).
import { traducir } from 'shared';

export class ErrorApi extends Error {
  /** El mensaje sin armar (la clave para traducirlo). */
  readonly plantilla: string;
  constructor(
    mensaje: string,
    readonly status = 400,
    readonly vars?: Record<string, string | number>,
  ) {
    super(vars ? traducir('es', mensaje, vars) : mensaje);
    this.plantilla = mensaje;
    this.name = 'ErrorApi';
  }
}

/** Busca el código de error de Postgres (drizzle lo envuelve en DrizzleQueryError con .cause). */
export function codigoPg(e: unknown): string | undefined {
  let x: unknown = e;
  for (let i = 0; i < 4 && x; i++) {
    const c = x as { code?: unknown; cause?: unknown };
    if (typeof c.code === 'string' && /^[0-9A-Z]{5}$/.test(c.code)) return c.code;
    x = c.cause;
  }
  return undefined;
}
