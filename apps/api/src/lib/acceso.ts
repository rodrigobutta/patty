// Quién puede ver y anotar a cada persona: los usuarios asociados en persona_usuarios, quienes supervisan a su dueño
// (la vista `accesos` junta las dos cosas) y los administradores.
import { sql } from 'drizzle-orm';
import type { Usuario } from 'shared';
import { una, type Tx } from '../db/client.js';
import { exigirRol } from '../auth/sesion.js';
import { ErrorApi } from './errores.js';

export interface PersonaAcceso {
  id: number;
  nombre: string;
  zona_horaria: string;
  rol: 'dueno' | 'editor' | 'lector';
}

export async function persona(tx: Tx, u: Usuario, personaId: number, escribir: boolean): Promise<PersonaAcceso> {
  const p = await una<PersonaAcceso>(
    tx,
    sql`SELECT p.id, p.nombre, p.zona_horaria, COALESCE(pu.rol, 'dueno') AS rol
        FROM personas p LEFT JOIN accesos pu ON pu.persona_id = p.id AND pu.usuario_id = ${u.id}
        WHERE p.id = ${personaId} AND (pu.usuario_id IS NOT NULL OR ${u.rol === 'admin'})
        ORDER BY pu.por_supervision LIMIT 1`,
  );
  if (!p) throw new ErrorApi('No existe esa persona o no tenés acceso.', 404);
  if (escribir) {
    exigirRol(u, 'editor');
    if (p.rol === 'lector') throw new ErrorApi(`Solo podés ver lo de ${p.nombre}.`, 403);
  }
  return p;
}
