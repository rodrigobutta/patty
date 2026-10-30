// Sol y luna de un día: salen de cuentas, sin pedirle nada a nadie ni al teléfono. Lógica pura.

const RAD = Math.PI / 180;

/** Cuántas horas hay entre que sale y se pone el sol ese día a esa latitud (con unos minutos de error). */
export function horasDeLuz(lat: number, fecha: string): number {
  const inicio = Date.UTC(Number(fecha.slice(0, 4)), 0, 1);
  const dia = (Date.parse(`${fecha}T12:00:00Z`) - inicio) / 86400000;
  const declinacion = -23.44 * RAD * Math.cos((2 * Math.PI * (dia + 10)) / 365.24);
  // El sol "sale" un poco antes de cruzar el horizonte (por su tamaño y porque la atmósfera desvía la luz): -0,83°.
  const coseno = (Math.sin(-0.83 * RAD) - Math.sin(lat * RAD) * Math.sin(declinacion)) / (Math.cos(lat * RAD) * Math.cos(declinacion));
  const angulo = Math.acos(Math.max(-1, Math.min(1, coseno)));
  return Math.round(((2 * angulo) / (15 * RAD)) * 10) / 10;
}

/** Luna nueva de referencia (6 de enero de 2000, 18:14 UTC) y lo que tarda en dar la vuelta a sus fases. */
const LUNA_NUEVA = Date.UTC(2000, 0, 6, 18, 14);
const CICLO_LUNAR_DIAS = 29.530588853;

/** Qué parte de la luna se ve iluminada ese día (0 = nueva, 100 = llena), al mediodía UTC. Es la fase media: ±1 día. */
export function lunaIluminada(fecha: string): number {
  const dias = (Date.parse(`${fecha}T12:00:00Z`) - LUNA_NUEVA) / 86400000;
  return Math.round(((1 - Math.cos((2 * Math.PI * dias) / CICLO_LUNAR_DIAS)) / 2) * 100);
}
