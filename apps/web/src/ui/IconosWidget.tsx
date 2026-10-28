// Los íconos de los widgets del Día (lo que llega solo), dibujados para Patty: formas redondeadas con el trazo oscuro
// del búho y colores suaves. El del clima cambia según cómo estuvo el día (sol, algo de nubes, nublado, lluvia).

const TRAZO = '#2a2440';
const props = { width: 44, height: 44, viewBox: '0 0 48 48', 'aria-hidden': true } as const;

export type Cielo = 'sol' | 'parcial' | 'nublado' | 'lluvia';

function Sol({ x = 24, y = 24, r = 9 }: { x?: number; y?: number; r?: number }) {
  return (
    <g>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d={`M${x} ${y - r - 4} V${y - r - 8}`} stroke="#f2a33a" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <circle cx={x} cy={y} r={r} fill="#ffd166" stroke={TRAZO} strokeWidth="2.5" />
    </g>
  );
}

function Nube({ dx = 0, dy = 0, color = '#eef0f7' }: { dx?: number; dy?: number; color?: string }) {
  return (
    <path
      transform={`translate(${dx} ${dy})`}
      d="M14 36 H35 a7 7 0 0 0 0-14 a10 10 0 0 0-19-2 a7.5 7.5 0 0 0-2 16 z"
      fill={color}
      stroke={TRAZO}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  );
}

export function IconoCielo({ cielo }: { cielo: Cielo }) {
  return (
    <svg {...props}>
      {cielo === 'sol' ? <Sol /> : null}
      {cielo === 'parcial' ? (
        <>
          <Sol x={18} y={17} r={7.5} />
          <Nube dx={4} dy={4} />
        </>
      ) : null}
      {cielo === 'nublado' ? (
        <>
          <Nube dx={-4} dy={-6} color="#d9dcea" />
          <Nube dx={3} dy={2} />
        </>
      ) : null}
      {cielo === 'lluvia' ? (
        <>
          <Nube dy={-6} color="#d9dcea" />
          {[16, 24, 32].map((x) => (
            <path key={x} d={`M${x} 35 l-2 6`} stroke="#5aa9f0" strokeWidth="3" strokeLinecap="round" />
          ))}
        </>
      ) : null}
    </svg>
  );
}

export function IconoLugar() {
  return (
    <svg {...props}>
      <ellipse cx="24" cy="41" rx="9" ry="2.5" fill="#d9d2f3" />
      <path d="M24 40 C17 31 12 25 12 18.5 a12 12 0 0 1 24 0 C36 25 31 31 24 40 z" fill="#8f78d6" stroke={TRAZO} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="24" cy="18.5" r="4.5" fill="#fff" stroke={TRAZO} strokeWidth="2.2" />
    </svg>
  );
}

export function IconoReuniones() {
  return (
    <svg {...props}>
      <rect x="7" y="10" width="34" height="31" rx="5" fill="#fff" stroke={TRAZO} strokeWidth="2.5" />
      <path d="M7 15 a5 5 0 0 1 5-5 h24 a5 5 0 0 1 5 5 v4 H7 z" fill="#8f78d6" stroke={TRAZO} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M16 6 v7 M32 6 v7" stroke={TRAZO} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="13" y="24" width="10" height="5" rx="1.5" fill="#c9bcf2" />
      <rect x="25" y="24" width="10" height="5" rx="1.5" fill="#c9bcf2" />
      <rect x="13" y="32" width="10" height="5" rx="1.5" fill="#c9bcf2" />
    </svg>
  );
}

export function IconoCelular() {
  return (
    <svg {...props}>
      <rect x="14" y="5" width="20" height="38" rx="5" fill="#c9bcf2" stroke={TRAZO} strokeWidth="2.5" />
      <rect x="17.5" y="10" width="13" height="24" rx="2" fill="#fff" />
      <path d="M20 16 h8 M20 21 h5" stroke="#8f78d6" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="24" cy="38.5" r="1.8" fill={TRAZO} />
    </svg>
  );
}

export function IconoSueno() {
  return (
    <svg {...props}>
      <path d="M30 8 a15 15 0 1 0 10 25 a12 12 0 0 1-10-25 z" fill="#ffe08a" stroke={TRAZO} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M31 13 h6 l-6 7 h6" fill="none" stroke="#8f78d6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="22" r="1.4" fill={TRAZO} opacity=".35" />
    </svg>
  );
}

export function IconoPasos() {
  return (
    <svg {...props}>
      <path d="M9 30 c0-7 3-13 7-13 c3 0 4 3 4 6 c0 3 1 5 4 6 l8 3 c3 1 5 3 5 6 v1 H11 c-1.5 0-2-1-2-3 z" fill="#8f78d6" stroke={TRAZO} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M9 37 H37" stroke={TRAZO} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M21 27 l3-2 M24 30 l3-2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 18 h5 M4 23 h6 M7 13 h4" stroke="#c9bcf2" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** La parte del día en la lista del Día (mañana, tarde, noche), con el mismo sol y luna de los widgets. */
export function IconoFranja({ cual }: { cual: 'manana' | 'tarde' | 'noche' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      {cual === 'tarde' ? <Sol r={10} /> : null}
      {cual === 'manana' ? (
        <>
          <clipPath id="patty-horizonte"><rect x="0" y="0" width="48" height="31" /></clipPath>
          <g clipPath="url(#patty-horizonte)"><Sol y={30} r={9} /></g>
          <path d="M6 32 H42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : null}
      {cual === 'noche' ? (
        <path d="M30 8 a15 15 0 1 0 10 25 a12 12 0 0 1-10-25 z" fill="#ffe08a" stroke={TRAZO} strokeWidth="2.5" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}
