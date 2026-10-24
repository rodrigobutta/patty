// La rueda grande de Patrones: se va llenando con los días anotados hasta que Patty puede buscar patrones, y después
// hasta el próximo nivel (más firmes, confiables). Con el búho adentro, puntitos que giran mientras "junta" datos y lo
// que falta, dicho en días.
import { useEffect, useState } from 'react';
import { avanceProgreso, NIVELES_PROGRESO, type Progreso } from 'shared';
import { Mascota } from '../mascota/Mascota';

const R = 92;
const LARGO = 2 * Math.PI * R;

export function RuedaProgreso({ progreso }: { progreso: Progreso }) {
  const { nivel, avance, siguiente } = avanceProgreso(progreso);
  // Arranca vacía y se llena con animación (también al cambiar).
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setMostrado(avance), 80);
    return () => clearTimeout(t);
  }, [avance]);
  // El número que sube contando.
  const [numero, setNumero] = useState(0);
  useEffect(() => {
    const meta = Math.round(avance * 100);
    let n = 0;
    const t = setInterval(() => {
      n = Math.min(meta, n + Math.max(1, Math.ceil(meta / 30)));
      setNumero(n);
      if (n >= meta) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
  }, [avance]);

  const faltanDias = Math.max(0, (siguiente?.dias ?? progreso.minimo) - progreso.dias);
  const faltanEfecto = Math.max(0, progreso.minimo_efecto - progreso.dias_efecto);
  const listo = nivel > 0;

  return (
    <div className={`rueda-progreso${listo ? ' lista' : ''}`}>
      <div className="rueda">
        <svg viewBox="0 0 220 220" aria-hidden>
          <defs>
            <linearGradient id="rueda-color" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--acento)" />
              <stop offset="1" stopColor="#e58bb4" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="110" r={R} className="pista" />
          <circle
            cx="110"
            cy="110"
            r={R}
            className="arco"
            stroke="url(#rueda-color)"
            strokeDasharray={LARGO}
            strokeDashoffset={LARGO * (1 - Math.max(0.02, mostrado))}
            transform="rotate(-90 110 110)"
          />
          {/* los datos que va juntando: puntitos que giran alrededor */}
          <g className="orbita-datos">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <circle key={i} cx={110 + 74 * Math.cos((i * Math.PI) / 3)} cy={110 + 74 * Math.sin((i * Math.PI) / 3)} r={i % 2 ? 3 : 4.5} />
            ))}
          </g>
        </svg>
        <div className="centro-rueda">
          <Mascota cara={listo ? 'feliz' : 'espera'} tamano={78} />
          <strong className="porcentaje">{numero}%</strong>
        </div>
      </div>

      <h3>{listo ? (siguiente ? `¡Ya busco patrones! Ahora, hacia «${siguiente.nombre.toLowerCase()}»` : '¡Tengo un montón de datos!') : 'Juntando datos para encontrar patrones'}</h3>
      <p className="suave">
        {listo
          ? siguiente
            ? `Con ${faltanDias} ${faltanDias === 1 ? 'día' : 'días'} más anotados, lo que encuentre va a ser más confiable.`
            : 'Los patrones que encuentre ya están bien sostenidos. Seguí anotando para que se mantengan al día.'
          : `Necesito ${progreso.minimo} días con algo anotado, y en unos ${progreso.minimo_efecto} de ellos saber cómo te sentiste.`}
      </p>

      {!listo ? (
        <ul className="requisitos">
          <li>
            <span>📅 Días anotados</span>
            <span className="barrita"><span style={{ width: `${Math.min(1, progreso.dias / progreso.minimo) * 100}%` }} /></span>
            <strong>{Math.min(progreso.dias, progreso.minimo)}/{progreso.minimo}</strong>
          </li>
          <li>
            <span>🙂 Con cómo te sentiste</span>
            <span className="barrita"><span style={{ width: `${Math.min(1, progreso.dias_efecto / progreso.minimo_efecto) * 100}%` }} /></span>
            <strong>{Math.min(progreso.dias_efecto, progreso.minimo_efecto)}/{progreso.minimo_efecto}</strong>
          </li>
        </ul>
      ) : null}
      {!listo ? (
        <p className="chico">
          {faltanDias > 0
            ? `Si anotás algo cada día, en ${faltanDias} ${faltanDias === 1 ? 'día' : 'días'} empiezo.`
            : faltanEfecto > 0
              ? `Me faltan ${faltanEfecto} ${faltanEfecto === 1 ? 'día' : 'días'} contándome cómo te sentiste (las caritas del Día).`
              : '¡Ya casi!'}
        </p>
      ) : null}

      <ol className="niveles" aria-label="Niveles">
        {NIVELES_PROGRESO.map((n, i) => (
          <li key={n.dias} className={i < nivel ? 'hecho' : i === nivel ? 'actual' : ''}>
            <span className="punto">{i < nivel ? '✓' : n.dias}</span>
            <span className="chico">{n.nombre}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
