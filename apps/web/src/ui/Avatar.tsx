// La foto de la cuenta (la de Google) o, si no hay, un círculo con la inicial. Si la foto no carga, también la inicial.
import { useState } from 'react';

export function Avatar({ foto, nombre, tamano = 32, className = '' }: { foto?: string | null; nombre: string; tamano?: number; className?: string }) {
  const [rota, setRota] = useState(false);
  const estilo = { width: tamano, height: tamano, fontSize: Math.round(tamano * 0.45) };
  if (foto && !rota) {
    // Las fotos de Google no cargan si se manda el referer.
    return <img className={`avatar ${className}`} src={foto} alt="" style={estilo} referrerPolicy="no-referrer" onError={() => setRota(true)} />;
  }
  return <span className={`avatar inicial ${className}`} style={estilo} aria-hidden>{(nombre.trim()[0] ?? '?').toUpperCase()}</span>;
}
