// La gente de la persona (para anotar con quién estuvo). Se guarda la última lista traída para que los chips aparezcan
// enseguida.
import { api } from '../api';

export interface Alguien {
  id: number;
  nombre: string;
  veces: number;
}

const cache = new Map<number, Alguien[]>();

export const genteGuardada = (personaId: number): Alguien[] => cache.get(personaId) ?? [];

export async function traerGente(personaId: number): Promise<Alguien[]> {
  const l = await api<Alguien[]>('GET', `/api/gente?persona=${personaId}`);
  cache.set(personaId, l);
  return l;
}
