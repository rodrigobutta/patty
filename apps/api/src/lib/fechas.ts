// Días y horas en la zona horaria de cada persona.
import { ErrorApi } from './errores.js';

const formatos = new Map<string, Intl.DateTimeFormat>();
function formato(zona: string): Intl.DateTimeFormat {
  let f = formatos.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatos.set(zona, f);
  }
  return f;
}

/**
 * Los nombres viejos de algunas zonas ("America/Buenos_Aires", que es el que da Android) que Postgres puede no conocer
 * (en el servidor, AT TIME ZONE falla): se guardan con el nombre actual.
 */
const ZONAS_VIEJAS: Record<string, string> = {
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Rosario': 'America/Argentina/Cordoba',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
};
export const zonaCanonica = (zona: string): string => ZONAS_VIEJAS[zona] ?? zona;

export function zonaValida(zona: string): boolean {
  try {
    formato(zona);
    return true;
  } catch {
    return false;
  }
}

function partes(instante: Date, zona: string): Record<string, string> {
  return Object.fromEntries(formato(zona).formatToParts(instante).map((p) => [p.type, p.value]));
}

/** AAAA-MM-DD del instante, en la zona de la persona. */
export function fechaLocal(instante: Date, zona: string): string {
  const p = partes(instante, zona);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * El día al que pertenece algo que se anota a mano: el día de Patty arranca a las 5 de la mañana, así "me acosté a la
 * 1:30" o "comí algo a las 2" cuentan para la noche anterior, como lo piensa la gente.
 */
export const HORA_INICIO_DIA = 5;
export function diaDePatty(instante: Date, zona: string): string {
  return fechaLocal(new Date(instante.getTime() - HORA_INICIO_DIA * 3600000), zona);
}

/** Minutos desde la medianoche local (para los conceptos de tipo "hora": me levanté 7:10 = 430). */
export function minutosDelDia(instante: Date, zona: string): number {
  const p = partes(instante, zona);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Lee un instante ISO 8601; si no viene, es ahora. */
export function leerInstante(v: unknown, campo: string): Date {
  if (v === undefined || v === null || v === '') return new Date();
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ErrorApi('{campo}: fecha inválida.', 400, { campo });
  return d;
}

export const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000);
}

/** El instante de una fecha y hora locales ("2026-10-24", "13:30") en la zona dada. */
export function localAInstante(fecha: string, hora: string, zona: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const deseado = Date.parse(`${fecha}T00:00:00Z`) + (h * 60 + m) * 60000;
  // Dos pasadas alcanzan también en los cambios de horario.
  let t = deseado;
  for (let i = 0; i < 2; i++) {
    const p = partes(new Date(t), zona);
    const visto = Date.parse(`${p.year}-${p.month}-${p.day}T00:00:00Z`) + (Number(p.hour) * 60 + Number(p.minute)) * 60000;
    t += deseado - visto;
  }
  return new Date(t);
}
