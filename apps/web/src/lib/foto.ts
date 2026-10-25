// Sacar (o elegir) una foto para que Patty vea qué es: un plato de comida, una bebida, la caja de un remedio. En la app
// nativa usa la cámara del teléfono; en la web, el selector de archivos (que en el celular también abre la cámara). Se
// achica a 1280 px en JPEG antes de mandarla: alcanza para reconocer un plato y no gasta datos. La foto no se guarda.
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { t } from './idioma';
import { esNativa } from './nativo';

export interface Foto {
  /** JPEG en base64 (sin el "data:…"). */
  datos: string;
  tipo: 'image/jpeg';
  /** Para mostrarla mientras Patty la mira. */
  url: string;
}

const LADO = 1280;

/** Achica una imagen (data URL) a LADO px del lado más largo, en JPEG. */
function achicar(url: string): Promise<Foto> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, LADO / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const salida = c.toDataURL('image/jpeg', 0.72);
      ok({ datos: salida.split(',')[1], tipo: 'image/jpeg', url: salida });
    };
    img.onerror = () => mal(new Error(t('No se pudo leer la foto.')));
    img.src = url;
  });
}

/** Devuelve la foto, o null si se canceló. */
export async function sacarFoto(): Promise<Foto | null> {
  if (esNativa()) {
    try {
      const f = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 75,
        width: LADO,
        correctOrientation: true,
        promptLabelHeader: t('Foto para Patty'),
        promptLabelPicture: t('Sacar una foto'),
        promptLabelPhoto: t('Elegir de la galería'),
        promptLabelCancel: t('Cancelar'),
      });
      return f.dataUrl ? achicar(f.dataUrl) : null;
    } catch (e) {
      // Cancelar la cámara también llega como error.
      if (/cancel/i.test((e as Error).message ?? '')) return null;
      throw new Error(t('No se pudo usar la cámara. Revisá el permiso de cámara de Patty en los ajustes del teléfono.'));
    }
  }
  return new Promise((ok, mal) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const archivo = input.files?.[0];
      if (!archivo) return ok(null);
      const r = new FileReader();
      r.onload = () => achicar(String(r.result)).then(ok, mal);
      r.onerror = () => mal(new Error(t('No se pudo leer la foto.')));
      r.readAsDataURL(archivo);
    };
    input.click();
  });
}
