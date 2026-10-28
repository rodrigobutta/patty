// Los seguimientos (ver shared: PLANTILLAS_SEGUIMIENTO) desde la app: los activos y las plantillas propias.
import type { PlantillaSeguimiento, Seguimiento } from 'shared';
import { api } from '../api';

export const EVENTO_SEGUIMIENTOS = 'patty-seguimientos';
export const avisarSeguimientos = () => window.dispatchEvent(new Event(EVENTO_SEGUIMIENTOS));

export const traerSeguimientos = (personaId: number) =>
  api<{ activos: Seguimiento[]; plantillas: Array<PlantillaSeguimiento & { id: number }> }>('GET', `/api/seguimientos?persona=${personaId}`);

export async function activarSeguimiento(personaId: number, plantilla: PlantillaSeguimiento): Promise<void> {
  const { nombre, emoji, items, horarios, dias } = plantilla;
  await api('POST', '/api/seguimientos', { persona_id: personaId, plantilla: { nombre, emoji, items, horarios, dias } });
  avisarSeguimientos();
}

export async function terminarSeguimiento(id: number): Promise<void> {
  await api('DELETE', `/api/seguimientos/${id}`);
  avisarSeguimientos();
}
