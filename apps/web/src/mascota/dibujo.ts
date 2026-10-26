// La mascota de Patty, dibujada en SVG (300 x 300): el mismo dibujo se usa adentro de la app y para generar los
// íconos del teléfono (movil/iconos.ts). Tiene tres caras según cómo viene la persona con lo que anota, y una cuarta,
// enojada, para retar un poco (no se tomó un remedio, se olvidó varias tomas): esa no es ícono de la app, solo de avisos.
// Y con sueño, de noche (después de la hora en que la persona se suele dormir).
// Para cambiar de animal alcanza con cambiar ANIMAL (y volver a generar los íconos).

export type Cara = 'feliz' | 'espera' | 'triste' | 'enojada' | 'dormida';
export type Animal = 'buho' | 'carpincho' | 'zorro';

export const ANIMAL: Animal = 'buho';
/** Las caras que puede tener el ícono de la app (la enojada no). */
export const CARAS: Cara[] = ['feliz', 'espera', 'triste', 'dormida'];

const TINTA = '#2a2440';

function ojos(cara: Cara, x1: number, x2: number, y: number, r: number): string {
  return [x1, x2]
    .map((x) => {
      if (cara === 'feliz') return `<path d="M${x - r} ${y + 2} Q${x} ${y - r - 4} ${x + r} ${y + 2}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      if (cara === 'espera') return `<circle cx="${x}" cy="${y}" r="${r * 0.75}" fill="${TINTA}"/><circle cx="${x + r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.25}" fill="#fff"/>`;
      // Con sueño: ojos cerrados (una curva hacia abajo) y párpados pesados.
      if (cara === 'dormida') return `<path d="M${x - r} ${y - 1} Q${x} ${y + r * 0.8} ${x + r} ${y - 1}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      if (cara === 'enojada') {
        // Enojada: cejas en V (bajan hacia el pico) y la mirada un poco entornada.
        const baja = x === x1 ? 1 : -1;
        return `<circle cx="${x}" cy="${y + 4}" r="${r * 0.7}" fill="${TINTA}"/><path d="M${x - r - 4} ${y - r - 6 * baja} L${x + r + 4} ${y - r + 6 * baja}" stroke="${TINTA}" stroke-width="8" stroke-linecap="round"/>`;
      }
      // Triste: cejas caídas hacia afuera.
      const caida = x === x1 ? 4 : -4;
      return `<circle cx="${x}" cy="${y + 3}" r="${r * 0.7}" fill="${TINTA}"/><path d="M${x - r - 2} ${y - r + caida} L${x + r + 2} ${y - r - caida}" stroke="${TINTA}" stroke-width="6" stroke-linecap="round"/>`;
    })
    .join('');
}

function boca(cara: Cara, x: number, y: number, w: number): string {
  if (cara === 'feliz') return `<path d="M${x - w} ${y} Q${x} ${y + w * 1.1} ${x + w} ${y}" stroke="${TINTA}" stroke-width="7" fill="#e85d75" stroke-linejoin="round"/>`;
  if (cara === 'espera') return `<path d="M${x - w * 0.5} ${y + 6} L${x + w * 0.5} ${y + 2}" stroke="${TINTA}" stroke-width="7" stroke-linecap="round"/>`;
  if (cara === 'enojada') return `<path d="M${x - w * 0.55} ${y + 10} Q${x} ${y} ${x + w * 0.55} ${y + 10}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  // Bostezando: una boquita redonda.
  if (cara === 'dormida') return `<ellipse cx="${x}" cy="${y + 8}" rx="${w * 0.28}" ry="${w * 0.36}" fill="${TINTA}"/>`;
  return `<path d="M${x - w * 0.6} ${y + 12} Q${x} ${y - 4} ${x + w * 0.6} ${y + 12}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
}

/** Cachetes cuando está contenta, una lágrima cuando está triste. */
function extra(cara: Cara, x: number, y: number): string {
  if (cara === 'feliz') return `<circle cx="${x - 62}" cy="${y}" r="13" fill="#ff8fa3" opacity=".55"/><circle cx="${x + 62}" cy="${y}" r="13" fill="#ff8fa3" opacity=".55"/>`;
  if (cara === 'triste') return `<path d="M${x + 48} ${y - 8} q8 14 0 22 q-8 -8 0 -22z" fill="#6fb7ff"/>`;
  // Las zetas de sueño, arriba a la derecha.
  if (cara === 'dormida')
    return `<g fill="none" stroke="#9fd3ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M${x + 52} ${y - 128} h16 l-16 18 h16"/><path d="M${x + 76} ${y - 152} h11 l-11 12 h11"/></g>`;
  // La venita de enojo arriba a la derecha y los cachetes colorados.
  if (cara === 'enojada')
    return `<g stroke="#e5484d" stroke-width="6" stroke-linecap="round" fill="none"><path d="M${x + 58} ${y - 118} q6 6 0 12"/><path d="M${x + 76} ${y - 118} q-6 6 0 12"/><path d="M${x + 61} ${y - 128} q6 -6 12 0"/><path d="M${x + 61} ${y - 98} q6 6 12 0"/></g><circle cx="${x - 62}" cy="${y}" r="13" fill="#e5484d" opacity=".45"/><circle cx="${x + 62}" cy="${y}" r="13" fill="#e5484d" opacity=".45"/>`;
  return '';
}

const DIBUJOS: Record<Animal, (c: Cara) => string> = {
  buho: (c) => `
<ellipse cx="150" cy="160" rx="105" ry="110" fill="#6b4fbb"/>
<path d="M60 80 L85 120 L110 92Z M240 80 L215 120 L190 92Z" fill="#53399e"/>
<ellipse cx="150" cy="200" rx="62" ry="58" fill="#c9bcf2"/>
<circle cx="108" cy="140" r="38" fill="#fff"/><circle cx="192" cy="140" r="38" fill="#fff"/>
${ojos(c, 108, 192, 140, 16)}
<path d="M140 165 L160 165 L150 185Z" fill="#f2a33a"/>
${c === 'feliz' ? `<path d="M128 200 Q150 222 172 200" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>` : boca(c, 150, 205, 22)}
${extra(c, 150, 180)}`,
  carpincho: (c) => `
<ellipse cx="95" cy="70" rx="20" ry="16" fill="#8a5a36"/><ellipse cx="205" cy="70" rx="20" ry="16" fill="#8a5a36"/>
<rect x="45" y="60" width="210" height="200" rx="90" fill="#b07a4b"/>
<rect x="85" y="165" width="130" height="85" rx="42" fill="#8a5a36"/>
<ellipse cx="128" cy="190" rx="8" ry="5" fill="${TINTA}"/><ellipse cx="172" cy="190" rx="8" ry="5" fill="${TINTA}"/>
${ojos(c, 110, 190, 128, 14)}
${boca(c, 150, 222, 20)}
${extra(c, 150, 165)}`,
  zorro: (c) => `
<path d="M55 45 L120 105 L65 140Z M245 45 L180 105 L235 140Z" fill="#e8743b"/>
<path d="M68 70 L105 105 L76 122Z M232 70 L195 105 L224 122Z" fill="#fff3e6"/>
<path d="M50 120 Q150 40 250 120 Q250 220 150 262 Q50 220 50 120Z" fill="#f28a45"/>
<path d="M60 160 Q105 175 150 262 Q195 175 240 160 Q215 245 150 262 Q85 245 60 160Z" fill="#fff3e6"/>
${ojos(c, 112, 188, 145, 15)}
<ellipse cx="150" cy="200" rx="15" ry="11" fill="${TINTA}"/>
${boca(c, 150, 225, 18)}
${extra(c, 150, 180)}`,
};

/** Las figuras de la mascota (sin la etiqueta <svg>), en un lienzo de 300 x 300. */
export const figuras = (cara: Cara, animal: Animal = ANIMAL): string => DIBUJOS[animal](cara);

/** El SVG completo. `zona` deja la mascota dentro de un cuadrado de ese lado (en px del lienzo), centrada. */
export function svgMascota(cara: Cara, opciones: { lado?: number; fondo?: string; zona?: number; animal?: Animal } = {}): string {
  const lado = opciones.lado ?? 300;
  const zona = opciones.zona ?? 300;
  const escala = zona / 300;
  const corrimiento = (300 - zona) / 2;
  const fondo = opciones.fondo ? `<rect width="300" height="300" fill="${opciones.fondo}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 300 300">${fondo}<g transform="translate(${corrimiento} ${corrimiento}) scale(${escala})">${figuras(cara, opciones.animal)}</g></svg>`;
}
