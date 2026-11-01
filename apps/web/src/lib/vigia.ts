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

/** Que lo nativo se ponga al día (por ejemplo, la alarma del vigía al prender el seguimiento). */
export function asegurarVigia(): void {
  if (plataforma() === 'android') void Vigia.asegurar().catch(() => {});
}
