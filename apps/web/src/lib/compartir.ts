// Compartir desde Patty: una imagen (un patrón, la racha, la semana, un nivel) o la invitación con el link. En la app
// nativa usa los plugins Share y Filesystem (la imagen se guarda en la caché y se pasa al menú de compartir del
// teléfono); en el navegador, navigator.share con archivos; y si no hay cómo, se descarga. Si la app instalada es
// vieja (sin los plugins), avisa que hace falta actualizarla.
// Las invitaciones llevan `?ref=` con un código anónimo de quien invita (el comienzo de su id de Analytics): la
// presentación lo mide al llegar y la bienvenida al terminar, así se sabe cuánta gente llega por invitación.
import { Capacitor } from '@capacitor/core';
import { anonimo, medir } from './analytics';
import { t } from './idioma';
import { esNativa } from './nativo';

export const SITIO = 'https://patty.today';
const CLAVE_INVITADO = 'invitado-por';
const REF = /^[0-9a-f]{8}$/;

export type ComoSeCompartio = 'menu' | 'descarga' | 'copiado' | 'cancelado' | 'sin_soporte';

/** El link a patty.today, con el código de quien invita si hay usuario. */
export async function linkInvitacion(usuarioId?: number): Promise<string> {
  if (!usuarioId) return SITIO;
  try {
    return `${SITIO}/?ref=${(await anonimo(usuarioId)).slice(0, 8)}`;
  } catch {
    return SITIO;
  }
}

const hayPlugins = () => esNativa() && Capacitor.isPluginAvailable('Share') && Capacitor.isPluginAvailable('Filesystem');
const cancelado = (e: unknown) => /cancel|abort/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? e}`);

function base64(blob: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => mal(r.error);
    r.readAsDataURL(blob);
  });
}

/** Abre el menú de compartir del teléfono con la imagen y un texto (o la descarga si no se puede). */
export async function compartirImagen(imagen: Blob, archivo: string, texto: string): Promise<ComoSeCompartio> {
  try {
    if (hayPlugins()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const { uri } = await Filesystem.writeFile({ path: archivo, data: await base64(imagen), directory: Directory.Cache });
      await Share.share({ files: [uri], text: texto, dialogTitle: t('Compartir') });
      return 'menu';
    }
    if (esNativa()) return 'sin_soporte';
    const f = new File([imagen], archivo, { type: imagen.type });
    if (navigator.canShare?.({ files: [f] })) {
      await navigator.share({ files: [f], text: texto });
      return 'menu';
    }
  } catch (e) {
    if (cancelado(e)) return 'cancelado';
    throw e;
  }
  const url = URL.createObjectURL(imagen);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'descarga';
}

/** Comparte un texto con un link (la invitación); si no hay menú de compartir, lo copia. */
export async function compartirTexto(texto: string, url: string): Promise<ComoSeCompartio> {
  try {
    if (esNativa() && Capacitor.isPluginAvailable('Share')) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ text: texto, url, dialogTitle: t('Invitá a alguien') });
      return 'menu';
    }
    if (navigator.share) {
      await navigator.share({ text: texto, url });
      return 'menu';
    }
  } catch (e) {
    if (cancelado(e)) return 'cancelado';
  }
  try {
    await navigator.clipboard.writeText(`${texto} ${url}`);
    return 'copiado';
  } catch {
    return 'sin_soporte';
  }
}

/** "Invitá a alguien": el link con el código de quien invita y un texto corto. `desde` es para Analytics. */
export async function invitar(usuarioId: number | undefined, desde: string): Promise<ComoSeCompartio> {
  const url = await linkInvitacion(usuarioId);
  const como = await compartirTexto(t('Estoy usando Patty: le contás tu día y te muestra qué se relaciona con qué (lo que comés, cómo dormís, cómo te sentís). Probala:'), url);
  medir('invitar', { desde, como });
  return como;
}

/** En la presentación: si se llegó con `?ref=`, se guarda quién invitó y se mide la llegada (una vez por visita). */
let llegadaMedida = false;
export function medirLlegadaInvitada(): void {
  const ref = new URLSearchParams(location.search).get('ref')?.toLowerCase() ?? '';
  if (!REF.test(ref) || llegadaMedida) return;
  try {
    localStorage.setItem(CLAVE_INVITADO, ref);
  } catch {
    /* sin almacenamiento */
  }
  llegadaMedida = medir('llegada_invitacion', { ref });
}

/** Quién invitó a esta persona (si llegó por una invitación en este navegador). */
export function invitadoPor(): string | null {
  try {
    const r = localStorage.getItem(CLAVE_INVITADO);
    return r && REF.test(r) ? r : null;
  } catch {
    return null;
  }
}
