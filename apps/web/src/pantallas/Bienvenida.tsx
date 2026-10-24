// La bienvenida de la primera vez: qué es Patty en tres pasos, con el búho. Se ve una sola vez por dispositivo.
import { useRef, useState } from 'react';
import { Mascota } from '../mascota/Mascota';
import type { Cara } from '../mascota/dibujo';

const CLAVE = 'bienvenida-vista';

export function bienvenidaVista(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return true;
  }
}

interface Paso { cara: Cara; titulo: string; texto: string; dibujo: 'chips' | 'orbita' | 'relacion' }

const PASOS: Paso[] = [
  { cara: 'feliz', titulo: 'Contame tu día', texto: 'Qué comiste, cómo dormiste, si te dolió algo. Con un toque, escribiendo o hablándome.', dibujo: 'chips' },
  { cara: 'espera', titulo: 'Yo junto lo demás', texto: 'El clima, tus viajes, el uso del teléfono y lo que mide tu reloj llegan solos.', dibujo: 'orbita' },
  { cara: 'feliz', titulo: 'Y busco qué se relaciona', texto: '"Cuando comés tomate, a los dos días te duele la cabeza". Cuanto más me contás, mejor te conozco.', dibujo: 'relacion' },
];

function Dibujo({ tipo }: { tipo: Paso['dibujo'] }) {
  if (tipo === 'chips')
    return (
      <div className="dibujo chips-dibujo" aria-hidden>
        {['☕ Café', '😴 Me levanté 7:30', '🍝 Fideos', '🤕 Dolor de cabeza'].map((c, i) => <span key={c} style={{ ['--i' as string]: i }}>{c}</span>)}
      </div>
    );
  if (tipo === 'orbita')
    return (
      <div className="dibujo orbita" aria-hidden>
        {['🌤️', '📍', '📱', '⌚', '📞', '🌙'].map((c, i) => <span key={c} style={{ ['--i' as string]: i }}>{c}</span>)}
      </div>
    );
  return (
    <div className="dibujo relacion" aria-hidden>
      <span className="nodo">🍅</span>
      <span className="flecha"><span>2 días</span></span>
      <span className="nodo">🤕</span>
    </div>
  );
}

export function Bienvenida({ alTerminar }: { alTerminar(): void }) {
  const [paso, setPaso] = useState(0);
  const toque = useRef<number | null>(null);
  const terminar = () => {
    try {
      localStorage.setItem(CLAVE, 'si');
    } catch {
      /* sin almacenamiento: se verá de nuevo */
    }
    alTerminar();
  };
  const ir = (n: number) => (n >= PASOS.length ? terminar() : setPaso(Math.max(0, n)));
  const p = PASOS[paso];
  return (
    <div
      className="bienvenida"
      onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (toque.current === null) return;
        const dx = e.changedTouches[0].clientX - toque.current;
        toque.current = null;
        if (Math.abs(dx) > 60) ir(paso + (dx < 0 ? 1 : -1));
      }}
    >
      <button className="enlace saltar" onClick={terminar}>Saltar</button>
      <div className="paso" key={paso}>
        <Dibujo tipo={p.dibujo} />
        <Mascota cara={p.cara} tamano={120} className="saluda" />
        <h2>{p.titulo}</h2>
        <p>{p.texto}</p>
      </div>
      <div className="puntos" role="tablist" aria-label="Pasos">
        {PASOS.map((_, i) => <button key={i} className={i === paso ? 'activo' : ''} onClick={() => setPaso(i)} aria-label={`Paso ${i + 1}`} />)}
      </div>
      <button className="btn primario ancho" onClick={() => ir(paso + 1)}>{paso === PASOS.length - 1 ? '¡Empecemos!' : 'Siguiente'}</button>
    </div>
  );
}
