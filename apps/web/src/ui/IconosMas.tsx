// Los íconos del menú de Más, dibujados para Patty: trazo redondeado del color del texto y dos colores de relleno (el
// violeta de Patty y un acento cálido), así andan en modo claro y oscuro.
import type { ReactNode } from 'react';

const T = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const V = 'var(--icono-1)';
const A = 'var(--icono-2)';

function Base({ children }: { children: ReactNode }) {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden className="icono-propio">
      {children}
    </svg>
  );
}

/** Salud: un corazón con el pulso. */
export const IconoSalud = () => (
  <Base>
    <path d="M16 27 C6 20 3 15 3 10.5 A6 6 0 0 1 16 8 A6 6 0 0 1 29 10.5 C29 15 26 20 16 27 Z" fill={V} {...T} />
    <path d="M7 15 h5 l2-4 l3 8 l2-4 h6" stroke={A} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Base>
);

/** Lo que junta sola: una antena con ondas. */
export const IconoDatos = () => (
  <Base>
    <path d="M16 15 L11 28 M16 15 L21 28 M12.5 24 h7" {...T} />
    <circle cx="16" cy="13" r="3.2" fill={A} {...T} />
    <path d="M10.5 7.5 a8 8 0 0 0 0 11 M21.5 7.5 a8 8 0 0 1 0 11" stroke={V} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M6.5 4 a13 13 0 0 0 0 18 M25.5 4 a13 13 0 0 1 0 18" {...T} />
  </Base>
);

/** Lugares: un marcador. */
export const IconoLugares = () => (
  <Base>
    <ellipse cx="16" cy="28" rx="7" ry="2" fill={A} />
    <path d="M16 27 C10.5 20 7 15.5 7 11.5 a9 9 0 0 1 18 0 C25 15.5 21.5 20 16 27 Z" fill={V} {...T} />
    <circle cx="16" cy="11.5" r="3.5" fill="#fff" {...T} />
  </Base>
);

/** Remedios: una cápsula de dos colores. */
export const IconoRemedios = () => (
  <Base>
    <g transform="rotate(-40 16 16)">
      <path d="M16 8 H11 a6 6 0 0 0 0 12 H16 Z" fill={V} />
      <path d="M16 8 H21 a6 6 0 0 1 0 12 H16 Z" fill={A} />
      <rect x="5" y="8" width="22" height="12" rx="6" {...T} />
      <path d="M16 8 V20" {...T} />
    </g>
  </Base>
);

/** Avisos: una campana. */
export const IconoAvisos = () => (
  <Base>
    <path d="M8 22 V14 a8 8 0 0 1 16 0 V22 l2.5 2.5 H5.5 Z" fill={V} {...T} />
    <path d="M13 26.5 a3 3 0 0 0 6 0" fill={A} {...T} />
    <path d="M24.5 5 a10 10 0 0 1 3.5 5.5" stroke={A} strokeWidth="2.2" strokeLinecap="round" />
  </Base>
);

/** Familia: una casa con un corazón. */
export const IconoFamilia = () => (
  <Base>
    <path d="M5 15 L16 5 L27 15 V27 H5 Z" fill={V} {...T} />
    <path d="M16 23.5 C12 20.8 11 19 11 17.5 a2.6 2.6 0 0 1 5-1 a2.6 2.6 0 0 1 5 1 C21 19 20 20.8 16 23.5 Z" fill={A} {...T} />
  </Base>
);

/** Tu gente: dos personas. */
export const IconoGente = () => (
  <Base>
    <circle cx="21.5" cy="11" r="4" fill={A} {...T} />
    <path d="M14.5 26 a7 7 0 0 1 14 0" fill={A} {...T} />
    <circle cx="11.5" cy="12" r="4.5" fill={V} {...T} />
    <path d="M3.5 27.5 a8 8 0 0 1 16 0 Z" fill={V} {...T} />
  </Base>
);

/** Tu cuenta: una persona en un círculo. */
export const IconoCuenta = () => (
  <Base>
    <circle cx="16" cy="16" r="12" fill={V} {...T} />
    <circle cx="16" cy="13" r="4.2" fill={A} {...T} />
    <path d="M8.5 25 a8 8 0 0 1 15 0" fill={A} {...T} />
  </Base>
);

/** Otros dispositivos: un engranaje. */
export const IconoAvanzado = () => (
  <Base>
    <path
      d="M16 3.5 l2 3.2 l3.6-1 l.8 3.7 l3.6 1 l-1 3.6 l3.2 2 l-3.2 2 l1 3.6 l-3.6 1 l-.8 3.7 l-3.6-1 l-2 3.2 l-2-3.2 l-3.6 1 l-.8-3.7 l-3.6-1 l1-3.6 l-3.2-2 l3.2-2 l-1-3.6 l3.6-1 l.8-3.7 l3.6 1 Z"
      fill={V}
      {...T}
    />
    <circle cx="16" cy="16" r="4" fill={A} {...T} />
  </Base>
);

/** Permisos: un escudo con tilde. */
export const IconoPermisos = () => (
  <Base>
    <path d="M16 3 L26 7 V15 C26 21.5 21.5 26 16 29 C10.5 26 6 21.5 6 15 V7 Z" fill={V} {...T} />
    <path d="M11 16 l3.5 3.5 L21.5 12" stroke={A} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </Base>
);

/** Clima: sol con nube. */
export const IconoClima = () => (
  <Base>
    <circle cx="12" cy="11" r="5.5" fill={A} {...T} />
    <path d="M12 2.5 v1.5 M4.5 11 H3 M6.5 5.5 l-1-1 M17.5 5.5 l1-1" {...T} />
    <path d="M10 27 H24 a5 5 0 0 0 0-10 a7 7 0 0 0-13 1.5 a4.3 4.3 0 0 0-1 8.5 Z" fill={V} {...T} />
  </Base>
);

/** Uso del teléfono: un celular. */
export const IconoTelefono = () => (
  <Base>
    <rect x="9" y="3.5" width="14" height="25" rx="3.5" fill={V} {...T} />
    <rect x="11.5" y="7" width="9" height="15.5" rx="1.5" fill={A} />
    <circle cx="16" cy="25.5" r="1.2" fill="currentColor" />
  </Base>
);

/** Reloj y salud: un reloj con pulso. */
export const IconoReloj = () => (
  <Base>
    <path d="M11 7 l1-4 h8 l1 4 M11 25 l1 4 h8 l1-4" {...T} />
    <rect x="7" y="7" width="18" height="18" rx="5" fill={V} {...T} />
    <path d="M10 16 h3 l1.5-3 l2.5 6 l1.5-3 h3.5" stroke={A} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Base>
);

/** Preguntas de Patty: un globito con un signo de pregunta. */
export const IconoPreguntas = () => (
  <Base>
    <path d="M5 7 a3 3 0 0 1 3-3 h16 a3 3 0 0 1 3 3 v12 a3 3 0 0 1-3 3 h-9 l-6 5 v-5 h-1 a3 3 0 0 1-3-3 z" fill={V} {...T} />
    <path d="M13 10.5 a3 3 0 1 1 4.5 2.6 c-1 .6-1.5 1.2-1.5 2.4" stroke={A} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="16" cy="18.5" r="1.3" fill={A} />
  </Base>
);

/** Seguimientos: un portapapeles con tildes. */
export const IconoSeguimientos = () => (
  <Base>
    <rect x="6" y="5" width="20" height="24" rx="3" fill={V} {...T} />
    <rect x="11" y="3" width="10" height="5" rx="1.5" fill={A} {...T} />
    <path d="M10 14 l2 2 l3-3.5 M10 21 l2 2 l3-3.5 M18 14.5 h4 M18 21.5 h4" stroke={A} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Base>
);

/** Qué patrones buscar: una lupa sobre dos puntos unidos. */
export const IconoPatrones = () => (
  <Base>
    <circle cx="14" cy="14" r="10" fill={V} {...T} />
    <path d="M21.5 21.5 L28 28" {...T} strokeWidth="3" />
    <path d="M10 17 L18 11" stroke={A} strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="10" cy="17" r="2.2" fill={A} {...T} />
    <circle cx="18" cy="11" r="2.2" fill={A} {...T} />
  </Base>
);
