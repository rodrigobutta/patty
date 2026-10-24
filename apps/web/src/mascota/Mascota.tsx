import { svgMascota, type Cara } from './dibujo';

const TEXTOS: Record<Cara, string> = { feliz: 'Contenta', espera: 'Esperando que anotes', triste: 'Triste: hace días que no anotás' };

export function Mascota({ cara, tamano = 40, className }: { cara: Cara; tamano?: number; className?: string }) {
  return (
    <span
      className={`mascota ${className ?? ''}`}
      role="img"
      aria-label={`Patty: ${TEXTOS[cara].toLowerCase()}`}
      style={{ width: tamano, height: tamano }}
      dangerouslySetInnerHTML={{ __html: svgMascota(cara, { lado: tamano }) }}
    />
  );
}
