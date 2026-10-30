// Las reuniones del calendario del teléfono (Android: todas las cuentas sincronizadas, Google, Outlook, Exchange…),
// para ver cómo pesa el trabajo: cuántas reuniones por día, cuántas horas, cuántas seguidas, a qué hora empiezan y
// terminan, y cuántas caen fuera de horario. Del teléfono solo se leen horarios y cantidad de invitados (nunca
// títulos ni nombres) y al servidor van únicamente estos números del día. Se manda junto con los datos del teléfono.
import { Telefono } from './telefono';

export interface EventoCalendario {
  inicio: number;
  fin: number;
  todoElDia: boolean;
  libre: boolean;
  rechazado: boolean;
  cuenta: string | null;
  invitados: number;
}

const CLAVE = 'datos-calendario';
/** Dos reuniones son "seguidas" si entre una y otra hay menos de esto. */
const SEGUIDAS_MS = 10 * 60000;
const HORA_ENTRADA = 8;
const HORA_SALIDA = 19;

export function calendarioActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return false;
  }
}
export function ponerCalendario(activo: boolean): void {
  try {
    if (activo) localStorage.setItem(CLAVE, 'si');
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}

/** Una reunión: un evento con horario, ocupado, no rechazado, de 5 minutos a 8 horas, con gente o de una cuenta de trabajo. */
export function esReunion(e: EventoCalendario): boolean {
  const dur = e.fin - e.inicio;
  if (e.todoElDia || e.libre || e.rechazado || dur < 5 * 60000 || dur > 8 * 3600000) return false;
  return e.invitados >= 2 || /exchange|microsoft|outlook|office/i.test(e.cuenta ?? '');
}

const horaDecimal = (ms: number) => {
  const d = new Date(ms);
  return Math.round((d.getHours() + d.getMinutes() / 60) * 100) / 100;
};

export interface MedicionCalendario { concepto: string; categoria: string; unidad: string | null; valor: number; inicio: string; fin: string }

/** Los números de un día (de `desde` a `hasta`, en la hora del teléfono). Lógica pura, para poder probarla. */
export function reunionesDelDia(desde: Date, hasta: Date, eventos: EventoCalendario[]): MedicionCalendario[] {
  const a = desde.getTime();
  const b = hasta.getTime();
  const base = { inicio: desde.toISOString(), fin: hasta.toISOString(), categoria: 'trabajo' };
  const del = eventos.filter(esReunion).filter((e) => e.fin > a && e.inicio < b).sort((x, y) => x.inicio - y.inicio);
  // Las horas en reuniones: la unión de los tramos (dos reuniones a la vez cuentan una sola vez).
  let ms = 0;
  let hastaAhora = a;
  for (const e of del) {
    const i = Math.max(e.inicio, hastaAhora);
    const f = Math.min(e.fin, b);
    if (f > i) ms += f - i;
    hastaAhora = Math.max(hastaAhora, f);
  }
  let seguidas = 0;
  for (let i = 1; i < del.length; i++) if (del[i].inicio - del[i - 1].fin < SEGUIDAS_MS) seguidas++;
  const finde = desde.getDay() === 0 || desde.getDay() === 6;
  const fuera = del.filter((e) => finde || new Date(e.inicio).getHours() < HORA_ENTRADA || horaDecimal(e.fin) > HORA_SALIDA).length;
  const r: MedicionCalendario[] = [
    { ...base, concepto: 'Reuniones', unidad: null, valor: del.length },
    { ...base, concepto: 'Horas de reuniones', unidad: 'h', valor: Math.round((ms / 3600000) * 10) / 10 },
  ];
  // Todo lo que hay en la agenda (también lo propio, sin invitados: el dentista, el gimnasio, "llevar a los chicos"):
  // cuántos eventos y cuántas horas ocupadas, para ver si un día cargado te pega.
  const agenda = eventos
    .filter((e) => !e.todoElDia && !e.libre && !e.rechazado && e.fin - e.inicio >= 5 * 60000 && e.fin - e.inicio <= 12 * 3600000)
    .filter((e) => e.fin > a && e.inicio < b);
  if (agenda.length) {
    let msAgenda = 0;
    let hasta2 = a;
    for (const e of [...agenda].sort((x, y) => x.inicio - y.inicio)) {
      const i = Math.max(e.inicio, hasta2);
      const f = Math.min(e.fin, b);
      if (f > i) msAgenda += f - i;
      hasta2 = Math.max(hasta2, f);
    }
    r.push(
      { ...base, categoria: 'otro', concepto: 'Eventos del calendario', unidad: null, valor: agenda.length },
      { ...base, categoria: 'otro', concepto: 'Horas ocupadas en el calendario', unidad: 'h', valor: Math.round((msAgenda / 3600000) * 10) / 10 },
    );
  }
  if (del.length) {
    r.push(
      { ...base, concepto: 'Reuniones seguidas', unidad: null, valor: seguidas },
      { ...base, concepto: 'Reuniones fuera de horario', unidad: null, valor: fuera },
      { ...base, concepto: 'Primera reunión', unidad: 'hora', valor: horaDecimal(Math.max(del[0].inicio, a)) },
      { ...base, concepto: 'Última reunión', unidad: 'hora', valor: horaDecimal(Math.min(Math.max(...del.map((e) => e.fin)), b)) },
    );
  }
  return r;
}

/** Los eventos del teléfono entre dos instantes (vacío si falta el permiso). */
export async function eventosDelTelefono(desde: number, hasta: number): Promise<EventoCalendario[]> {
  const p = await Telefono.permisos();
  if (p.calendario !== 'granted') return [];
  return (await Telefono.eventos({ desde, hasta })).eventos;
}
