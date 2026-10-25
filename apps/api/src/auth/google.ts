// "Continuar con Google": valida con Google el token del botón y devuelve email y nombre.
import { config } from '../config.js';
import { ErrorApi } from '../lib/errores.js';

export interface CuentaGoogle {
  email: string;
  nombre: string;
  /** La foto de perfil (URL), si la cuenta tiene. */
  foto: string | null;
}

export async function verificarGoogle(credencial: string): Promise<CuentaGoogle> {
  const cliente = config.googleClientId;
  if (!cliente) throw new ErrorApi('El acceso con Google no está configurado.', 503);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credencial || '')) {
    throw new ErrorApi('Credencial de Google inválida.', 401);
  }
  let info: Record<string, unknown>;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + credencial, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    info = (await r.json()) as Record<string, unknown>;
  } catch {
    // token vencido o inválido: Google responde 400
    throw new ErrorApi('No se pudo validar la cuenta de Google. Probá de nuevo.', 401);
  }
  // El token del iPhone puede venir a nombre del cliente de iOS (o del web, si se pidió con serverClientId).
  const aceptados = [cliente, ...(config.googleIosClientId ? [config.googleIosClientId] : [])];
  if (!aceptados.includes(info.aud as string) || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss as string)) {
    throw new ErrorApi('La credencial no es para esta app.', 401);
  }
  if (String(info.email_verified).toLowerCase() !== 'true' || !info.email) {
    throw new ErrorApi('La cuenta de Google no tiene el email verificado.', 401);
  }
  if (Number(info.exp || 0) < Date.now() / 1000) throw new ErrorApi('La credencial de Google venció. Probá de nuevo.', 401);
  const email = String(info.email).toLowerCase();
  const foto = typeof info.picture === 'string' && info.picture.startsWith('https://') ? info.picture : null;
  return { email, nombre: (info.name as string) || String(info.email).split('@')[0], foto };
}
