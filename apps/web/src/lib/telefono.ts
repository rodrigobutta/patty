// Datos del teléfono (solo en la app de Android; el iPhone no deja leerlos): minutos de uso de cada app y llamadas
// del día. Se prende en Más y se manda solo al abrir Patty (como mucho cada media hora), los últimos 7 días completos:
// así lo que pasó con la app cerrada llega igual. Van por la ingesta: mandar dos veces el mismo día actualiza el valor.
import { registerPlugin } from '@capacitor/core';
import { useEffect } from 'react';
import { ingesta } from './fuenteApp';
import { plataforma } from './nativo';
import { calendarioActivado, reunionesDelDia, type EventoCalendario } from './calendario';

type Estado = 'granted' | 'denied';
interface Permisos { uso: Estado; llamadas: Estado; llamadasDe?: 'registro' | 'en_vivo' | 'nada'; calendario?: Estado }
interface Periodo { desde: number; hasta: number }
export interface UsoDeApps { minutos: number; apps: Array<{ paquete: string; nombre: string; minutos: number }> }
export interface Llamadas { entrantes: number; salientes: number; perdidas: number; segundos: number }

interface PluginTelefono {
  permisos(): Promise<Permisos>;
  pedirPermisoUso(): Promise<void>;
  pedirPermisoLlamadas(): Promise<Permisos>;
  uso(p: Periodo): Promise<UsoDeApps>;
  llamadas(p: Periodo): Promise<Llamadas>;
  pedirPermisoCalendario(): Promise<Permisos>;
  eventos(p: Periodo): Promise<{ eventos: EventoCalendario[] }>;
}

export const Telefono = registerPlugin<PluginTelefono>('Telefono');

const CLAVE = 'datos-telefono';
const ULTIMA = 'datos-telefono-ultima';
const DIAS = 7;
/** Una app entra con su propio concepto («Uso de Instagram») si se usó al menos esto en el día. */
const MINUTOS_MINIMOS_POR_APP = 5;
const CADA_MS = 30 * 60000;

export const hayDatosDelTelefono = () => plataforma() === 'android';

export function datosActivados(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return false;
  }
}

export function ponerDatos(activo: boolean): void {
  try {
    if (activo) localStorage.setItem(CLAVE, 'si');
    else localStorage.removeItem(CLAVE);
    localStorage.removeItem(ULTIMA);
  } catch {
    /* sin almacenamiento */
  }
}

export interface Medicion { concepto: string; categoria: string; unidad: string | null; valor: number; inicio: string; fin: string }

/** Las mediciones de un día a partir de lo que dio el teléfono (lógica pura, para poder probarla). */
export function medicionesDelDia(desde: Date, hasta: Date, uso: UsoDeApps | null, llamadas: Llamadas | null): Medicion[] {
  const base = { inicio: desde.toISOString(), fin: hasta.toISOString() };
  const r: Medicion[] = [];
  if (uso) {
    r.push({ ...base, concepto: 'Tiempo de pantalla', categoria: 'pantalla', unidad: 'min', valor: Math.round(uso.minutos) });
    for (const a of uso.apps) {
      if (a.minutos >= MINUTOS_MINIMOS_POR_APP) r.push({ ...base, concepto: `Uso de ${a.nombre}`, categoria: 'pantalla', unidad: 'min', valor: Math.round(a.minutos) });
    }
  }
  if (llamadas) {
    r.push({ ...base, concepto: 'Llamadas', categoria: 'comunicacion', unidad: null, valor: llamadas.entrantes + llamadas.salientes });
    r.push({ ...base, concepto: 'Llamadas perdidas', categoria: 'comunicacion', unidad: null, valor: llamadas.perdidas });
    r.push({ ...base, concepto: 'Minutos en llamadas', categoria: 'comunicacion', unidad: 'min', valor: Math.round(llamadas.segundos / 60) });
  }
  return r;
}

/** Lee los últimos días del teléfono y los manda. Devuelve cuántas mediciones mandó. */
export async function sincronizar(personaId: number): Promise<number> {
  const p = await Telefono.permisos();
  // Las reuniones van si se prendió el calendario y está el permiso (la app de una versión vieja no lo tiene).
  const conCalendario = calendarioActivado() && p.calendario === 'granted';
  const conTelefono = datosActivados() && (p.uso === 'granted' || p.llamadas === 'granted');
  if (!conTelefono && !conCalendario) return 0;
  const lista: Medicion[] = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (conCalendario) {
    const desde = new Date(hoy);
    desde.setDate(hoy.getDate() - (DIAS - 1));
    const hasta = new Date(hoy);
    hasta.setDate(hoy.getDate() + 1);
    const eventos = (await Telefono.eventos({ desde: desde.getTime(), hasta: hasta.getTime() }).catch(() => ({ eventos: [] }))).eventos;
    for (let i = DIAS - 1; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() - i);
      const f = new Date(d);
      f.setDate(d.getDate() + 1);
      lista.push(...reunionesDelDia(d, f, eventos));
    }
  }
  if (!conTelefono) {
    if (lista.length) await ingesta(personaId, '', { mediciones: lista });
    return lista.length;
  }
  for (let i = DIAS - 1; i >= 0; i--) {
    const desde = new Date(hoy);
    desde.setDate(hoy.getDate() - i);
    const hasta = new Date(desde);
    hasta.setDate(desde.getDate() + 1);
    const periodo = { desde: desde.getTime(), hasta: hasta.getTime() };
    const [uso, llamadas] = await Promise.all([
      p.uso === 'granted' ? Telefono.uso(periodo) : null,
      p.llamadas === 'granted' ? Telefono.llamadas(periodo) : null,
    ]);
    lista.push(...medicionesDelDia(desde, hasta, uso, llamadas));
  }
  if (lista.length) await ingesta(personaId, '', { mediciones: lista });
  try {
    localStorage.setItem(ULTIMA, String(Date.now()));
  } catch {
    /* se volverá a mandar */
  }
  return lista.length;
}

/** Con los datos del teléfono prendidos, los manda al abrir o volver a Patty (como mucho cada media hora). */
export function useDatosDelTelefono(personaId: number | undefined): void {
  useEffect(() => {
    if (!hayDatosDelTelefono() || !personaId) return;
    const quizas = () => {
      if (document.visibilityState !== 'visible' || (!datosActivados() && !calendarioActivado())) return;
      const ultima = Number(localStorage.getItem(ULTIMA) ?? 0);
      if (Date.now() - ultima > CADA_MS) void sincronizar(personaId).catch(() => {});
    };
    quizas();
    document.addEventListener('visibilitychange', quizas);
    return () => document.removeEventListener('visibilitychange', quizas);
  }, [personaId]);
}
