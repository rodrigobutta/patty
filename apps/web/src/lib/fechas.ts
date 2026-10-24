// Fechas en la zona horaria de la persona que se está anotando.

/** El día de Patty arranca a las 5: a la 1 de la mañana todavía es "hoy" el día anterior (igual que en la API). */
export const HORA_INICIO_DIA = 5;

/** El día de Patty (empieza a las 5) en la zona: el de ahora, o el de `cuando`. */
export function hoyEn(zona: string, cuando: Date = new Date()): string {
  const antes = new Date(cuando.getTime() - HORA_INICIO_DIA * 3600000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(antes);
}

/** El instante de una hora dentro de un día de Patty: las horas antes de las 5 son de la madrugada siguiente. */
export function instanteDelDia(fecha: string, hora: string, zona: string): string {
  const madrugada = Number(hora.split(':')[0]) < HORA_INICIO_DIA;
  return instanteLocal(madrugada ? sumarDias(fecha, 1) : fecha, hora, zona);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function horaEn(iso: string, zona: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** "Hoy", "Ayer" o "sáb 18 oct". */
export function nombreDia(fecha: string, zona: string): string {
  const hoy = hoyEn(zona);
  if (fecha === hoy) return 'Hoy';
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(fecha + 'T12:00:00Z'));
}

/** El instante ISO de una fecha y hora ("13:30") locales de la zona. */
export function instanteLocal(fecha: string, hora: string, zona: string): string {
  const [h, m] = hora.split(':').map(Number);
  const deseado = Date.parse(`${fecha}T00:00:00Z`) + (h * 60 + m) * 60000;
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let t = deseado;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    t += deseado - (Date.parse(`${p.year}-${p.month}-${p.day}T00:00:00Z`) + (Number(p.hour) * 60 + Number(p.minute)) * 60000);
  }
  return new Date(t).toISOString();
}

export function horaAhora(zona: string): string {
  return horaEn(new Date().toISOString(), zona);
}
