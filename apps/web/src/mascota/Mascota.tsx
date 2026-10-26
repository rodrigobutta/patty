import { svgMascota, type Cara } from './dibujo';
import { t } from '../lib/idioma';

const TEXTOS: Record<Cara, string> = { feliz: t('Contenta'), espera: t('Esperando que anotes'), triste: t('Triste: hace días que no anotás'), enojada: t('Enojada'), dormida: t('Con sueño'), manana: t('Recién levantada') };

export function Mascota({ cara, tamano = 40, className }: { cara: Cara; tamano?: number; className?: string }) {
  return (
    <span
      className={`mascota ${className ?? ''}`}
      role="img"
      aria-label={t('Patty: {que}', { que: TEXTOS[cara].toLowerCase() })}
      style={{ width: tamano, height: tamano }}
      dangerouslySetInnerHTML={{ __html: svgMascota(cara, { lado: tamano }) }}
    />
  );
}
