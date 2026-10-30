// Buscar qué película, serie, disco o podcast fue: se escribe, Patty busca en iTunes y muestra hasta 6 con su tapa
// para elegir. Si no aparece, queda lo escrito (sin tapa). Lo elegido lleva título, año, género y tapa.
import { useEffect, useState } from 'react';
import type { ResultadoMedio, TipoMedio } from 'shared';
import { buscarTitulos } from '../lib/medios';
import { t } from '../lib/idioma';

export interface Elegido { titulo: string; resultado: ResultadoMedio | null }

const PISTAS: Partial<Record<TipoMedio, string>> = {
  pelicula: 'ej: Duna, Relatos salvajes',
  serie: 'ej: Breaking Bad, El Eternauta',
  tele: 'ej: Breaking Bad, El Eternauta',
  musica: 'ej: Soda Stereo, Abbey Road',
  podcast: 'ej: Se regalan dudas',
};

export function BuscarMedio({ tipo, valor, alCambiar }: { tipo: TipoMedio; valor: Elegido; alCambiar(e: Elegido): void }) {
  const [resultados, setResultados] = useState<ResultadoMedio[]>([]);
  const [buscando, setBuscando] = useState(false);
  const q = valor.titulo.trim();

  // Busca un ratito después de dejar de escribir (y no busca de nuevo lo que ya se eligió).
  useEffect(() => {
    if (q.length < 2 || valor.resultado) return setResultados([]);
    let vivo = true;
    const espera = setTimeout(() => {
      setBuscando(true);
      buscarTitulos(tipo, q)
        .then((l) => vivo && setResultados(l))
        .catch(() => vivo && setResultados([]))
        .finally(() => vivo && setBuscando(false));
    }, 450);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [q, tipo, valor.resultado]);

  if (valor.resultado) {
    const r = valor.resultado;
    return (
      <div className="medio-elegido">
        {r.tapa ? <img src={r.tapa} alt="" className={`tapa ${tipo === 'musica' || tipo === 'podcast' ? 'cuadrada' : ''}`} /> : null}
        <span className="que">
          <strong>{r.titulo}</strong>
          <span className="suave chico renglon-sub">{[r.artista && tipo !== 'pelicula' ? r.artista : null, r.genero ? t(r.genero) : null, r.anio].filter(Boolean).join(' · ')}</span>
        </span>
        <button type="button" className="enlace chico" onClick={() => alCambiar({ titulo: r.titulo, resultado: null })}>{t('Cambiar')}</button>
      </div>
    );
  }

  return (
    <div className="buscar-medio">
      <input value={valor.titulo} onChange={(e) => alCambiar({ titulo: e.target.value, resultado: null })} placeholder={t(PISTAS[tipo] ?? 'Título')} />
      {buscando && !resultados.length ? <p className="suave chico">{t('Buscando…')}</p> : null}
      {resultados.length ? (
        <ul className="resultados-medio">
          {resultados.map((r) => (
            <li key={r.itunes_id}>
              <button type="button" onClick={() => alCambiar({ titulo: r.titulo, resultado: r })}>
                {r.tapa ? <img src={r.tapa} alt="" loading="lazy" className={`tapa ${tipo === 'musica' || tipo === 'podcast' ? 'cuadrada' : ''}`} /> : <span className="tapa vacia" />}
                <span className="chico">{r.titulo}</span>
                <span className="suave chico">{[r.artista && tipo !== 'pelicula' ? r.artista : null, r.anio].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
