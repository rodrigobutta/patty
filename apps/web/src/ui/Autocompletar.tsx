// Escribir qué fue: sugiere lo que ya existe (sin importar tildes ni plurales) y, si no está, ofrece crearlo ahí mismo.
import { useEffect, useRef, useState } from 'react';
import { normalizar, type Categoria, type Sugerencia } from 'shared';
import { api } from '../api';

interface Props {
  categoria: Categoria | null;
  categorias: Categoria[];
  alElegir(s: Sugerencia): void;
  alCrear(nombre: string): void;
}

export function Autocompletar({ categoria, categorias, alElegir, alCrear }: Props) {
  const [texto, setTexto] = useState('');
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [marcada, setMarcada] = useState(0);
  const pedido = useRef(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const n = ++pedido.current;
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ q: texto, limite: '8' });
      if (categoria) q.set('categoria', String(categoria.id));
      try {
        const r = await api<Sugerencia[]>('GET', `/api/conceptos/buscar?${q}`);
        if (n === pedido.current) {
          setSugerencias(r);
          setMarcada(0);
        }
      } catch {
        /* sin conexión: quedan las anteriores */
      }
    }, 120);
    return () => clearTimeout(t);
  }, [texto, categoria]);

  const icono = (id: number) => categorias.find((c) => c.id === id)?.icono ?? '';
  const exacto = sugerencias.some((s) => normalizar(s.nombre) === normalizar(texto));
  const puedeCrear = texto.trim() !== '' && !exacto;
  const opciones = sugerencias.length + (puedeCrear ? 1 : 0);

  const elegir = (i: number) => {
    if (i < sugerencias.length) alElegir(sugerencias[i]);
    else if (puedeCrear) alCrear(texto.trim());
  };

  return (
    <div className="autocompletar">
      <input
        ref={entrada}
        autoFocus
        value={texto}
        placeholder={categoria ? `¿Qué ${categoria.nombre.toLowerCase()}?` : 'Escribí qué fue: tomate, dolor de cabeza, caminar…'}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setMarcada((m) => Math.min(m + 1, opciones - 1));
          else if (e.key === 'ArrowUp') setMarcada((m) => Math.max(m - 1, 0));
          else if (e.key === 'Enter' && opciones) {
            e.preventDefault();
            elegir(marcada);
          } else return;
          e.preventDefault();
        }}
        enterKeyHint="go"
        autoCapitalize="sentences"
        aria-label="Qué fue"
        role="combobox"
        aria-expanded={opciones > 0}
      />
      <ul role="listbox">
        {sugerencias.map((s, i) => (
          <li key={s.id} role="option" aria-selected={i === marcada} className={i === marcada ? 'marcada' : ''} onClick={() => elegir(i)}>
            <span className="icono">{icono(s.categoria_id)}</span>
            {s.nombre}
            {s.usos ? <span className="suave chico"> · {s.usos}</span> : null}
          </li>
        ))}
        {puedeCrear ? (
          <li role="option" aria-selected={marcada === sugerencias.length} className={`crear ${marcada === sugerencias.length ? 'marcada' : ''}`} onClick={() => elegir(sugerencias.length)}>
            <span className="icono">＋</span>Crear «{texto.trim()}»{categoria ? ` en ${categoria.nombre}` : ''}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
