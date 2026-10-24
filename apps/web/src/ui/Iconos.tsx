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
