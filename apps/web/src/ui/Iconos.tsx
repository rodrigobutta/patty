// Los íconos de la barra de abajo, dibujados para Patty (trazo redondeado, como el búho). El de Patrones es una rueda
// que se va llenando hasta que hay datos suficientes para buscar patrones (y después, hasta el próximo nivel).

const base = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function IconoDia({ activo }: { activo: boolean }) {
  return (
    <svg {...base} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="4" />
      <path d="M8 3v3.5M16 3v3.5M3.5 10h17" />
      {/* el sol del día: se llena cuando la pestaña está activa */}
      <circle cx="12" cy="15.2" r="2.4" fill={activo ? 'currentColor' : 'none'} />
    </svg>
  );
}

export function IconoMas({ activo }: { activo: boolean }) {
  return (
    <svg {...base} aria-hidden>
      {[5.5, 12, 18.5].map((x, i) => (
        <circle key={x} cx={x} cy="12" r={activo && i === 1 ? 2.6 : 2.1} fill={activo ? 'currentColor' : 'none'} />
      ))}
    </svg>
  );
}

/** La rueda: `avance` de 0 a 1 hacia el próximo nivel; `nivel` > 0 cuando ya se pueden buscar patrones. */
export function IconoPatrones({ activo, avance, nivel }: { activo: boolean; avance: number; nivel: number }) {
  const r = 9;
  const largo = 2 * Math.PI * r;
  const lleno = nivel > 0 && avance >= 1 ? 1 : avance;
  return (
    <svg {...base} aria-hidden className="icono-rueda">
      <circle cx="12" cy="12" r={r} strokeOpacity={0.22} />
      <circle
        cx="12"
        cy="12"
        r={r}
        strokeDasharray={largo}
        strokeDashoffset={largo * (1 - Math.max(0.04, lleno))}
        transform="rotate(-90 12 12)"
        className="rueda-arco"
      />
      {/* adentro: dos cosas que se relacionan */}
      <circle cx="9.3" cy="13.6" r="1.6" fill={activo || nivel > 0 ? 'currentColor' : 'none'} strokeWidth={1.6} />
      <circle cx="14.7" cy="10.4" r="1.6" fill={activo || nivel > 0 ? 'currentColor' : 'none'} strokeWidth={1.6} />
      <path d="M10.7 12.8l2.6-1.6" strokeWidth={1.6} strokeOpacity={nivel > 0 ? 1 : 0.5} />
    </svg>
  );
}

/** La cámara (para cargar con una foto), con el mismo trazo redondeado. */
export function IconoCamara({ tamano = 26 }: { tamano?: number }) {
  return (
    <svg {...base} width={tamano} height={tamano} aria-hidden>
      <path d="M4.5 8.5a2 2 0 0 1 2-2h1.6l1.3-2h5.2l1.3 2h1.6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.4" />
      <circle cx="17" cy="9.3" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** El micrófono (para contarle a Patty hablando). */
export function IconoMicrofono({ tamano = 24 }: { tamano?: number }) {
  return (
    <svg {...base} width={tamano} height={tamano} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </svg>
  );
}

/** El lápiz (contarle escribiendo, cuando no hay micrófono). */
export function IconoLapiz({ tamano = 24 }: { tamano?: number }) {
  return (
    <svg {...base} width={tamano} height={tamano} aria-hidden>
      <path d="M15.5 4.5l4 4L9 19l-5 1 1-5z M13.5 6.5l4 4" />
    </svg>
  );
}

// ---------- Las sub-vistas de Patrones ----------

/** Patrones: dos cosas unidas, con un destello (lo que encontró). */
export function IconoRelacion({ tamano = 18 }: { tamano?: number }) {
  return (
    <svg {...base} width={tamano} height={tamano} aria-hidden>
      <circle cx="7" cy="15.5" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M9.4 13.8l4.2-3" />
      <path d="M18.5 15.5v4M16.5 17.5h4" strokeWidth={1.8} />
    </svg>
  );
}

/** Números: barras de alturas distintas sobre una base. */
export function IconoNumeros({ tamano = 18 }: { tamano?: number }) {
  return (
    <svg {...base} width={tamano} height={tamano} aria-hidden>
      <path d="M4 20h16" />
      <rect x="5.5" y="12" width="3" height="5" rx="1.2" />
      <rect x="10.5" y="6" width="3" height="11" rx="1.2" />
      <rect x="15.5" y="9.5" width="3" height="7.5" rx="1.2" />
    </svg>
  );
}

/** Calendario: el mes con algunos días marcados. */
export function IconoCalendario({ tamano = 18 }: { tamano?: number }) {
  return (
    <svg {...base} width={tamano} height={tamano} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="4" />
      <path d="M8 3v3.5M16 3v3.5M3.5 10h17" />
      {[[8, 14], [12, 14], [16, 14], [8, 17.5], [12, 17.5]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="currentColor" stroke="none" opacity={i === 1 || i === 3 ? 1 : 0.45} />
      ))}
    </svg>
  );
}

/** Buscar: la lupa. */
export function IconoBuscar({ tamano = 18 }: { tamano?: number }) {
  return (
    <svg {...base} width={tamano} height={tamano} aria-hidden>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </svg>
  );
}
