// La mascota de Patty, dibujada en SVG (300 x 300): el mismo dibujo se usa adentro de la app y para generar los
// íconos del teléfono (movil/iconos.ts). Tiene tres caras según cómo viene la persona con lo que anota, y una cuarta,
// enojada, para retar un poco (no se tomó un remedio, se olvidó varias tomas): esa no es ícono de la app, solo de avisos.
// Y con sueño, de noche (después de la hora en que la persona se suele dormir), y recién levantado a la mañana.
// Para cambiar de animal alcanza con cambiar ANIMAL (y volver a generar los íconos).

export type Cara = 'feliz' | 'espera' | 'triste' | 'enojada' | 'dormida' | 'manana';
export type Animal = 'buho' | 'carpincho' | 'zorro';

export const ANIMAL: Animal = 'buho';
/** Las caras que puede tener el ícono de la app (la enojada no). */
export const CARAS: Cara[] = ['feliz', 'espera', 'triste', 'dormida', 'manana'];

const TINTA = '#2a2440';

function ojos(cara: Cara, x1: number, x2: number, y: number, r: number): string {
  return [x1, x2]
    .map((x) => {
      if (cara === 'feliz') return `<path d="M${x - r} ${y + 2} Q${x} ${y - r - 4} ${x + r} ${y + 2}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      // Recién levantado: ojos abiertos a medias (el párpado de arriba todavía pesado) y tranquilo.
      if (cara === 'manana') {
        const R = r * 2.35;
        return `<circle cx="${x}" cy="${y + 6}" r="${r * 0.7}" fill="${TINTA}"/><circle cx="${x + r * 0.3}" cy="${y + 2}" r="${r * 0.22}" fill="#fff"/><path d="M${x - R} ${y - 1} A${R} ${R} 0 0 1 ${x + R} ${y - 1} Z" fill="#8f78d6"/><path d="M${x - R + 4} ${y - 1} L${x + R - 4} ${y - 1}" stroke="${TINTA}" stroke-width="6" stroke-linecap="round"/>`;
      }
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
  // Esperando: una boquita chica y curiosa (no recta, que parecía enojo).
  if (cara === 'espera') return `<ellipse cx="${x}" cy="${y + 6}" rx="${w * 0.22}" ry="${w * 0.2}" fill="none" stroke="${TINTA}" stroke-width="6"/>`;
  if (cara === 'manana') return `<path d="M${x - w * 0.45} ${y + 4} Q${x} ${y + w * 0.6} ${x + w * 0.45} ${y + 4}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  if (cara === 'enojada') return `<path d="M${x - w * 0.55} ${y + 10} Q${x} ${y} ${x + w * 0.55} ${y + 10}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  // Bostezando: una boquita redonda.
  if (cara === 'dormida') return `<ellipse cx="${x}" cy="${y + 8}" rx="${w * 0.28}" ry="${w * 0.36}" fill="${TINTA}"/>`;
  return `<path d="M${x - w * 0.6} ${y + 12} Q${x} ${y - 4} ${x + w * 0.6} ${y + 12}" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
}

/** Cachetes cuando está contenta, una lágrima cuando está triste. */
function extra(cara: Cara, x: number, y: number): string {
  if (cara === 'feliz') return `<circle cx="${x - 62}" cy="${y}" r="13" fill="#ff8fa3" opacity=".55"/><circle cx="${x + 62}" cy="${y}" r="13" fill="#ff8fa3" opacity=".55"/>`;
  if (cara === 'triste') return `<path d="M${x + 48} ${y - 8} q8 14 0 22 q-8 -8 0 -22z" fill="#6fb7ff"/>`;
  // Un solcito arriba a la derecha y los cachetes apenas rosados.
  if (cara === 'manana')
    return `<g transform="translate(${x + 80} ${y - 135})"><circle r="14" fill="#ffd166"/><g stroke="#ffd166" stroke-width="5" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0 -21 V-28" transform="rotate(${a})"/>`).join('')}</g></g><circle cx="${x - 62}" cy="${y}" r="12" fill="#ff8fa3" opacity=".35"/><circle cx="${x + 62}" cy="${y}" r="12" fill="#ff8fa3" opacity=".35"/>`;
  // Las zetas de sueño, arriba a la derecha.
  if (cara === 'dormida')
    return `<g fill="none" stroke="#9fd3ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M${x + 52} ${y - 128} h16 l-16 18 h16"/><path d="M${x + 76} ${y - 152} h11 l-11 12 h11"/></g>`;
  // Los cachetes colorados (el enojo ya se ve en el pelo alborotado).
  if (cara === 'enojada')
    return `<circle cx="${x - 62}" cy="${y}" r="13" fill="#e5484d" opacity=".45"/><circle cx="${x + 62}" cy="${y}" r="13" fill="#e5484d" opacity=".45"/>`;
  return '';
}

const PELO = '#b8a4ec';
const PELO_SOMBRA = '#9d86e0';
const PELO_BRILLO = '#d6c9f7';

/** Un rulo esponjoso: un círculo con su sombra abajo y un brillito arriba. */
const rulo = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y + r * 0.14}" r="${r}" fill="${PELO_SOMBRA}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${PELO}"/><circle cx="${x - r * 0.32}" cy="${y - r * 0.36}" r="${r * 0.26}" fill="${PELO_BRILLO}" opacity=".75"/>`;
const rulos = (l: Array<[number, number, number]>) => l.map(([x, y, r]) => rulo(x, y, r)).join('');

/** El peinado de siempre (esperando): rulos atrás que enmarcan la cabeza y un flequillo de rulos adelante. */
const PEINADO_BASE = {
  atras: [[56, 132, 34], [244, 132, 34], [62, 88, 40], [238, 88, 40], [96, 52, 44], [204, 52, 44], [150, 40, 48]] as Array<[number, number, number]>,
  adelante: [[114, 94, 24], [150, 88, 26], [186, 94, 24]] as Array<[number, number, number]>,
};

/**
 * El peinado de siempre, más chico y con menos rulos (contenta, con sueño, triste). `chato` lo aplasta contra la
 * cabeza (triste: el pelo "caído").
 */
function peinadoChico(chato = 1): { atras: string; adelante: string } {
  const cx = 150;
  const base = 104; // donde apoya el pelo sobre la cabeza
  const achicar = ([x, y, r]: [number, number, number]): [number, number, number] => [
    cx + (x - cx) * 0.86,
    base - (base - y) * 0.82 * chato + (1 - chato) * 14,
    r * 0.86,
  ];
  // Menos rulos: sin los de más abajo a los costados.
  const atras = PEINADO_BASE.atras.filter(([, y]) => y < 120).map(achicar);
  return { atras: rulos(atras), adelante: rulos([[120, 96, 22], [150, 91, 24], [180, 96, 22]]) };
}

/** Una corona de `n` picos que va de un costado de la cabeza al otro por arriba (el pelo de punta, enojada). */
function picos(cx: number, cy: number, adentro: number, afuera: number, n: number): string {
  const p: string[] = [];
  const desde = Math.PI * 1.02;
  const hasta = -Math.PI * 0.02;
  for (let i = 0; i <= n * 2; i++) {
    const a = desde + ((hasta - desde) * i) / (n * 2);
    // Los picos un poco desparejos: más agresivo.
    const r = i % 2 ? afuera * (0.92 + 0.08 * Math.sin(i * 2.3)) : adentro;
    p.push(`${(cx + Math.cos(a) * r * 0.95).toFixed(1)},${(cy - Math.sin(a) * r * 0.85).toFixed(1)}`);
  }
  const puntos = p.join(' ');
  return `<polygon points="${puntos}" fill="${PELO_SOMBRA}" transform="translate(0 5)"/><polygon points="${puntos}" fill="${PELO}" stroke="${PELO_SOMBRA}" stroke-width="4" stroke-linejoin="miter"/>`;
}

/** El flequillo en zigzag, con las puntas hacia la frente. */
function flequilloDePunta(): string {
  const xs = [104, 119, 134, 150, 166, 181, 196];
  const zigzag = xs.map((x, i) => `${x},${i % 2 ? 106 : 86}`).join(' ');
  // Sin borde arriba: se funde con la corona de atrás; solo el zigzag lleva la línea.
  return `<polygon points="104,70 ${zigzag} 196,70" fill="${PELO}"/><polyline points="${zigzag}" fill="none" stroke="${PELO_SOMBRA}" stroke-width="4" stroke-linejoin="miter"/>`;
}

/** Ruleros rosas (x, y, giro en grados) sobre el pelo. */
const ruleros = (l: Array<[number, number, number]>) =>
  l
    .map(
      ([x, y, g]) =>
        `<g transform="translate(${x} ${y}) rotate(${g})"><rect x="-15" y="-10" width="30" height="20" rx="8" fill="#f59ab8" stroke="#d9729a" stroke-width="3"/>` +
        `<path d="M-6 -9 v18 M0 -9 v18 M6 -9 v18" stroke="#d9729a" stroke-width="3"/><rect x="-19" y="-3" width="38" height="6" rx="3" fill="#fbd3e1"/></g>`,
    )
    .join('');

/**
 * El peinado: un batido de rulos lila que enmarca la cabeza (atrás) con un flequillo (adelante). Esperando, el de
 * siempre; contenta y con sueño, el mismo más chico y con menos rulos; triste, además aplastado; enojada, el de siempre
 * alborotado (pelos sueltos para todos lados); recién levantada, despeinado y torcido.
 */
function peinado(c: Cara): { atras: string; adelante: string } {
  const pelos = (l: string[]) => `<g stroke="${PELO_SOMBRA}" stroke-width="6" fill="none" stroke-linecap="round">${l.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  if (c === 'feliz') return peinadoChico();
  if (c === 'dormida') {
    // Con sueño: el peinado chico con ruleros rosas, como para ir a dormir.
    const p = peinadoChico();
    return { atras: p.atras, adelante: p.adelante + ruleros([[86, 88, -50], [126, 52, -15], [174, 52, 15], [214, 88, 50]]) };
  }
  if (c === 'triste') return peinadoChico(0.55);
  if (c === 'enojada')
    // De punta: una corona de picos alrededor de la cabeza y un flequillo en zigzag.
    return { atras: picos(150, 112, 88, 136, 11), adelante: flequilloDePunta() };
  if (c === 'manana')
    // Torcido: más pelo de un lado, rulos de distinto tamaño, el flequillo corrido y unos pelos parados.
    return {
      atras: rulos([[48, 120, 30], [70, 76, 44], [112, 40, 40], [168, 34, 50], [222, 62, 36], [250, 108, 26], [236, 140, 22]]),
      adelante: rulos([[110, 98, 22], [140, 86, 28], [190, 100, 20]]) + pelos(['M96 18 q-14 -8 -10 -24', 'M150 6 q10 -10 4 -24', 'M206 22 q20 -2 26 -18']),
    };
  return { atras: rulos(PEINADO_BASE.atras), adelante: rulos(PEINADO_BASE.adelante) };
}

const DIBUJOS: Record<Animal, (c: Cara) => string> = {
  // El búho, un poco más chico y más abajo, para que entre el peinado arriba.
  buho: (c) => {
    const pelo = peinado(c);
    // Todo un poco más chico y más abajo, para que el peinado alto entre en el lienzo.
    return `<g transform="translate(15 24) scale(0.9)">
<g transform="translate(0 24)">${pelo.atras}</g>
<g transform="translate(36 72) scale(0.76)">
<ellipse cx="150" cy="160" rx="105" ry="110" fill="#6b4fbb"/>
</g>
<g transform="translate(0 24)">${pelo.adelante}</g>
<g transform="translate(36 72) scale(0.76)">
<ellipse cx="150" cy="200" rx="62" ry="58" fill="#c9bcf2"/>
<circle cx="108" cy="140" r="38" fill="#fff"/><circle cx="192" cy="140" r="38" fill="#fff"/>
${ojos(c, 108, 192, 140, 16)}
<path d="M140 165 L160 165 L150 185Z" fill="#f2a33a"/>
${c === 'feliz' ? `<path d="M128 200 Q150 222 172 200" stroke="${TINTA}" stroke-width="7" fill="none" stroke-linecap="round"/>` : boca(c, 150, 205, 22)}
${extra(c, 150, 180)}
</g></g>`;
  },
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
