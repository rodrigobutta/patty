// Lo que el teléfono cuenta de sí mismo (solo la app de Android): si el seguimiento de la ubicación está andando, cuándo
// llegó el último punto, si Android le da permiso de seguir sin límites de batería y la bitácora de lo que le pasó (muertes,
// arranques bloqueados, alarmas). Lo nativo está en VigiaUbicacion.java y VigiaPlugin.java. Una app instalada antes no tiene
// el plugin: todo devuelve null y la fila no aparece.
import { registerPlugin } from '@capacitor/core';
import { plataforma } from './nativo';

/** [cuándo (ms), cuántas veces seguidas, qué pasó]. */
export type EventoVigia = [number, number, string];

export interface EstadoVigia {
  /** El seguimiento está prendido (lo eligió la persona). */
  prendido: boolean;
  /** El servicio está andando ahora mismo. */
  corriendo: boolean;
  movimiento: boolean;
  /** Cuándo llegó al servidor el último punto (ms; 0: nunca). */
  ultimoPunto: number;
  /** Android no le aplica la optimización de batería. */
  bateria: boolean;
  /** El trabajo de fondo: su estado en WorkManager (null: no está programado), si hay algo para mandar y cuándo corrió. */
  sincro: { estado: string | null; algo: boolean; ultima: number };
  bitacora: EventoVigia[];
}

interface PluginVigia {
  estado(): Promise<EstadoVigia>;
  pedirBateria(): Promise<{ bateria: boolean }>;
  asegurar(): Promise<void>;
  abrirInicioAutomatico(): Promise<{ abierta: string }>;
  versionSistema(): Promise<{ sistema: string }>;
}

const Vigia = registerPlugin<PluginVigia>('Vigia');

export async function leerVigia(): Promise<EstadoVigia | null> {
  if (plataforma() !== 'android') return null;
  return Vigia.estado().catch(() => null);
}

/** Muestra el cartel de Android. Devuelve si quedó dado (null: esta app no lo sabe pedir). */
export async function pedirBateria(): Promise<boolean | null> {
  if (plataforma() !== 'android') return null;
  return Vigia.pedirBateria()
    .then((r) => r.bateria)
    .catch(() => null);
}

/** Abre lo más cerca que deja la marca de su «Inicio automático». Devuelve false si esta app no lo sabe abrir. */
export async function abrirInicioAutomatico(): Promise<boolean> {
  if (plataforma() !== 'android') return false;
  return Vigia.abrirInicioAutomatico()
    .then(() => true)
    .catch(() => false);
}

const CLAVE_INICIO = 'patty.inicio-automatico';
/**
 * Android no le cuenta a ninguna app si este ajuste está prendido: vale lo que dijo la persona, y solo para esta
 * versión del sistema, porque una actualización puede apagarlo.
 */
export async function inicioConfirmado(): Promise<boolean> {
  if (plataforma() !== 'android') return false;
  const sistema = await Vigia.versionSistema().catch(() => null);
  try {
    return sistema !== null && localStorage.getItem(CLAVE_INICIO) === sistema.sistema;
  } catch {
    return false;
  }
}
export async function confirmarInicio(): Promise<void> {
  const sistema = await Vigia.versionSistema().catch(() => null);
  try {
    localStorage.setItem(CLAVE_INICIO, sistema?.sistema ?? '');
  } catch {
    /* sin almacenamiento */
  }
}

/** Que lo nativo se ponga al día (por ejemplo, la alarma del vigía al prender el seguimiento). */
export function asegurarVigia(): void {
  if (plataforma() === 'android') void Vigia.asegurar().catch(() => {});
}
