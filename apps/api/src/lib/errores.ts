// Errores que se devuelven al usuario como {"error": "..."} con su estado HTTP.

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly status = 400,
  ) {
    super(mensaje);
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
