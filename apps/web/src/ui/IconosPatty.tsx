// Los íconos del Día dibujados para Patty, en dos colores (como los de Más): uno por categoría de lo que se anota, las
// caritas del ánimo y las formas de viajar. Trazo del color del texto y rellenos con --icono-1 (violeta) y --icono-2
// (cálido), así andan en modo claro y oscuro. Lo que no tenga dibujo sigue con su emoji.
import type { ReactNode } from 'react';
import type { ModoViaje } from 'shared';

const T = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const V = 'var(--icono-1)';
const A = 'var(--icono-2)';

function Base({ children, tamano = 26 }: { children: ReactNode; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 32 32" fill="none" aria-hidden className="icono-propio">
      {children}
    </svg>
  );
}

/** Una carita (también la del ánimo): de 'muy_bien' a 'muy_mal'. */
/** La tinta y los colores fijos de las caritas (como el búho): se ven igual en modo claro y oscuro. */
const TINTA = '#2a2440';
const TC = { ...T, stroke: TINTA } as const;

/** Una carita (también la del ánimo): de 'muy_bien' a 'muy_mal'. */
function Cara({ como }: { como: 'muy_bien' | 'bien' | 'mal' | 'muy_mal' | 'tranquilo' | 'normal' }) {
  const boca = {
    muy_bien: <path d="M10.5 18.5 Q16 25 21.5 18.5 Z" fill="#e85d75" {...TC} />,
    bien: <path d="M11 19 Q16 23 21 19" {...TC} />,
    tranquilo: <path d="M11.5 19.5 Q16 22.5 20.5 19.5" {...TC} />,
    normal: <path d="M11.5 20 H20.5" {...TC} />,
    mal: <path d="M11 21.5 Q16 17.5 21 21.5" {...TC} />,
    muy_mal: <path d="M10.5 22.5 Q16 16.5 21.5 22.5" {...TC} />,
  }[como];
  const ojos =
    como === 'muy_mal' ? (
      <path d="M9.5 11 l3 2 l-3 2 M22.5 11 l-3 2 l3 2" {...TC} />
    ) : como === 'muy_bien' || como === 'tranquilo' ? (
      <path d="M9.5 13.5 Q11.5 11 13.5 13.5 M18.5 13.5 Q20.5 11 22.5 13.5" {...TC} />
    ) : (
      <>
        <circle cx="11.5" cy="13" r="1.7" fill={TINTA} />
        <circle cx="20.5" cy="13" r="1.7" fill={TINTA} />
      </>
    );
  return (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#ffd166" {...TC} />
      {ojos}
      {boca}
      {como === 'muy_bien' || como === 'bien' || como === 'tranquilo' ? (
        <>
          <circle cx="8.5" cy="18" r="1.9" fill="#ff8fa3" opacity=".7" />
          <circle cx="23.5" cy="18" r="1.9" fill="#ff8fa3" opacity=".7" />
        </>
      ) : null}
    </>
  );
}

export function IconoAnimo({ clave, tamano }: { clave: string; tamano?: number }) {
  const c = (['muy_bien', 'bien', 'mal', 'muy_mal', 'tranquilo', 'normal'] as const).find((x) => x === clave) ?? 'bien';
  return (
    <Base tamano={tamano}>
      <Cara como={c} />
    </Base>
  );
}

const Auto = ({ techo = false }: { techo?: boolean }) => (
  <>
    {techo ? <rect x="13" y="5" width="6" height="3.5" rx="1" fill={A} {...T} /> : null}
    <path d="M5 21 V16.5 l3-6 a2 2 0 0 1 1.8-1.2 H22.2 a2 2 0 0 1 1.8 1.2 l3 6 V21 Z" fill={techo ? A : V} {...T} />
    <path d="M9.5 15.5 l2-4 h9 l2 4 Z" fill="#fff" {...T} />
    <circle cx="10" cy="22" r="2.8" fill="currentColor" />
    <circle cx="22" cy="22" r="2.8" fill="currentColor" />
  </>
);

const DIBUJOS: Record<string, () => ReactNode> = {
  sueno: () => (
    <>
      <path d="M19 4.5 a12 12 0 1 0 8.5 19.5 a10 10 0 0 1-8.5-19.5 Z" fill={A} {...T} />
      <path d="M20 9 h5 l-5 6 h5" stroke={V} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  comida: () => (
    <>
      <circle cx="16" cy="17" r="10" fill={V} {...T} />
      <circle cx="16" cy="17" r="5.5" fill={A} {...T} />
      <path d="M3.5 5 V11 a2 2 0 0 0 4 0 V5 M5.5 11 V28 M28.5 5 c-2.5 1-3.5 4-3.5 8 h3.5 V28" {...T} />
    </>
  ),
  bebida: () => (
    <>
      <path d="M8 9 H24 L22 27.5 H10 Z" fill={V} {...T} />
      <path d="M9 15 H23 L22 27.5 H10 Z" fill={A} />
      <path d="M8 9 H24 L22 27.5 H10 Z" {...T} />
      <path d="M17 9 L20 3.5 H24" {...T} />
    </>
  ),
  bano: () => (
    <>
      <ellipse cx="13" cy="16" rx="8" ry="10" fill={V} {...T} />
      <ellipse cx="13" cy="16" rx="3" ry="4" fill={A} {...T} />
      <path d="M13 6 H24 a8 10 0 0 1 0 20 H13" fill="none" {...T} />
    </>
  ),
  sintoma: () => (
    <>
      <rect x="4" y="11" width="24" height="10" rx="5" fill={A} transform="rotate(-35 16 16)" {...T} />
      <rect x="11" y="11" width="10" height="10" rx="1.5" fill={V} transform="rotate(-35 16 16)" {...T} />
      <path d="M14.5 16 h3 M16 14.5 v3" {...T} transform="rotate(-35 16 16)" />
    </>
  ),
  animo: () => <Cara como="bien" />,
  actividad: () => (
    <>
      <path d="M5 23 c0-6 2.5-11 6-11 c2.5 0 3.5 2.5 3.5 5 c0 2.5 1 4 3.5 5 l6.5 2.5 c2.5.8 4 2.5 4 4.5 H7 c-1.3 0-2-.8-2-2.5 Z" fill={V} {...T} />
      <path d="M15 21.5 l2.5-1.8 M17.5 24 l2.5-1.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 10 h4 M2 14 h4" stroke={A} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  comunicacion: () => (
    <>
      <path d="M8 4.5 h4 l2 6 l-3 2.5 a14 14 0 0 0 8 8 l2.5-3 l6 2 v4 a3 3 0 0 1-3 3 C14 27 5 18 5 7.5 a3 3 0 0 1 3-3 Z" fill={V} {...T} />
      <path d="M19 4.5 a8 8 0 0 1 8.5 8.5 M19 9 a4 4 0 0 1 4 4" stroke={A} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  pantalla: () => (
    <>
      <rect x="9" y="3.5" width="14" height="25" rx="3.5" fill={V} {...T} />
      <rect x="11.5" y="7" width="9" height="15.5" rx="1.5" fill={A} />
      <circle cx="16" cy="25.5" r="1.2" fill="currentColor" />
    </>
  ),
  // Auriculares con una notita: lo que se escucha (música, podcasts).
  musica: () => (
    <>
      <path d="M6 19 V15 a10 10 0 0 1 20 0 V19" {...T} />
      <rect x="4.5" y="17" width="6" height="10" rx="2.5" fill={V} {...T} />
      <rect x="21.5" y="17" width="6" height="10" rx="2.5" fill={V} {...T} />
      <path d="M15 21.5 V13.5 l4.5 -1.5" {...T} />
      <circle cx="13.6" cy="22" r="2" fill={A} {...T} />
    </>
  ),
  medicacion: () => (
    <g transform="rotate(-40 16 16)">
      <path d="M16 10 H11 a6 6 0 0 0 0 12 H16 Z" fill={V} />
      <path d="M16 10 H21 a6 6 0 0 1 0 12 H16 Z" fill={A} />
      <rect x="5" y="10" width="22" height="12" rx="6" {...T} />
      <path d="M16 10 V22" {...T} />
    </g>
  ),
  clima: () => (
    <>
      <circle cx="12" cy="11" r="5.5" fill={A} {...T} />
      <path d="M12 2.5 v1.5 M4.5 11 H3 M6.5 5.5 l-1-1 M17.5 5.5 l1-1" {...T} />
      <path d="M10 27 H24 a5 5 0 0 0 0-10 a7 7 0 0 0-13 1.5 a4.3 4.3 0 0 0-1 8.5 Z" fill={V} {...T} />
    </>
  ),
  lugar: () => (
    <>
      <ellipse cx="16" cy="28" rx="7" ry="2" fill={A} />
      <path d="M16 27 C10.5 20 7 15.5 7 11.5 a9 9 0 0 1 18 0 C25 15.5 21.5 20 16 27 Z" fill={V} {...T} />
      <circle cx="16" cy="11.5" r="3.5" fill="#fff" {...T} />
    </>
  ),
  otro: () => (
    <>
      <rect x="6" y="4" width="17" height="24" rx="3" fill={A} {...T} />
      <path d="M10 10 h9 M10 15 h6" {...T} />
      <path d="M17 24 l1-4 l9-9 l3 3 l-9 9 Z" fill={V} {...T} />
    </>
  ),
  ciclo: () => (
    <>
      <path d="M16 3.5 C11 11 7.5 15.5 7.5 19.5 a8.5 8.5 0 0 0 17 0 C24.5 15.5 21 11 16 3.5 Z" fill={V} {...T} />
      <path d="M12.5 20 a3.5 3.5 0 0 0 3.5 3.5" stroke={A} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  gente: () => (
    <>
      <circle cx="21.5" cy="11" r="4" fill={A} {...T} />
      <path d="M14.5 26 a7 7 0 0 1 14 0" fill={A} {...T} />
      <circle cx="11.5" cy="12" r="4.5" fill={V} {...T} />
      <path d="M3.5 27.5 a8 8 0 0 1 16 0 Z" fill={V} {...T} />
    </>
  ),
  viaje: () => <Auto />,
};

/** El ícono de una categoría (por su clave); si no hay dibujo, su emoji. */
export function IconoCategoria({ clave, emoji, tamano }: { clave?: string | null; emoji?: string; tamano?: number }) {
  const d = clave ? DIBUJOS[clave] : undefined;
  if (!d) return <>{emoji ?? '📝'}</>;
  return <Base tamano={tamano}>{d()}</Base>;
}

const MODOS: Record<ModoViaje, () => ReactNode> = {
  caminando: () => DIBUJOS.actividad(),
  bici: () => (
    <>
      <circle cx="8" cy="21" r="5.5" fill={A} {...T} />
      <circle cx="24" cy="21" r="5.5" fill={A} {...T} />
      <path d="M8 21 l5-9 h7 l4 9 M13 12 l4 9 l3-9" {...T} strokeWidth="2.4" />
      <path d="M10.5 8 h5" stroke={V} strokeWidth="3" strokeLinecap="round" />
      <path d="M20 12 l-1-4 h3" {...T} />
    </>
  ),
  auto: () => <Auto />,
  taxi: () => <Auto techo />,
  colectivo: () => (
    <>
      <rect x="5" y="4" width="22" height="20" rx="4" fill={V} {...T} />
      <rect x="8" y="8" width="16" height="7" rx="1.5" fill="#fff" {...T} />
      <path d="M8 19 h3 M21 19 h3" stroke={A} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9 24 v3.5 M23 24 v3.5" {...T} />
    </>
  ),
  tren: () => (
    <>
      <rect x="7" y="3.5" width="18" height="20" rx="5" fill={V} {...T} />
      <rect x="10" y="7.5" width="12" height="6" rx="1.5" fill="#fff" {...T} />
      <circle cx="12" cy="18.5" r="1.8" fill={A} />
      <circle cx="20" cy="18.5" r="1.8" fill={A} />
      <path d="M11 23.5 l-3 5 M21 23.5 l3 5 M9.5 26.5 h13" {...T} />
    </>
  ),
};

export function IconoModo({ modo, tamano }: { modo: ModoViaje; tamano?: number }) {
  return <Base tamano={tamano}>{MODOS[modo]()}</Base>;
}

/** La tele (con sus antenas y un botón de play): mirar tele, películas, series, deportes. */
export function IconoTele({ tamano }: { tamano?: number }) {
  return (
    <Base tamano={tamano}>
      <path d="M12 4.5 l4 4 l4 -4" {...T} />
      <rect x="3.5" y="8.5" width="25" height="17" rx="3.5" fill={V} {...T} />
      <rect x="6.5" y="11.5" width="19" height="11" rx="1.5" fill="#fff" />
      <path d="M14 14 v6 l5 -3 Z" fill={A} {...T} strokeWidth={1.6} />
      <path d="M10 28 h12" {...T} />
    </Base>
  );
}

/** Un micrófono de radio: los podcasts. */
export function IconoPodcast({ tamano }: { tamano?: number }) {
  return (
    <Base tamano={tamano}>
      <rect x="11.5" y="3.5" width="9" height="15" rx="4.5" fill={V} {...T} />
      <path d="M14 8 h4 M14 11.5 h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.5 15 a8.5 8.5 0 0 0 17 0" {...T} />
      <path d="M16 23.5 V28 M11.5 28.5 h9" {...T} />
      <circle cx="25.5" cy="7" r="2" fill={A} />
    </Base>
  );
}

/** El de cada tipo de medio: la tele, los auriculares o el micrófono. */
export function IconoMedio({ tipo, tamano }: { tipo: 'tele' | 'musica' | 'podcast'; tamano?: number }) {
  if (tipo === 'musica') return <IconoCategoria clave="musica" tamano={tamano} />;
  if (tipo === 'podcast') return <IconoPodcast tamano={tamano} />;
  return <IconoTele tamano={tamano} />;
}
