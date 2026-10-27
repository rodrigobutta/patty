// Los resúmenes de la semana (los arma Patty el domingo a la noche): una tarjeta en el Día cuando hay uno nuevo, la lista
// en Descubrir, y la hoja con todo (lo que se destacó, para probar, y los números comparados con la semana anterior).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Persona } from 'shared';
import { api } from '../api';
import { locale, t } from '../lib/idioma';

export interface Semana {
  semana: string;
  titulo: string;
  texto: string;
  destacados: Array<{ emoji: string; texto: string }>;
  sugerencias: string[];
  numeros: Record<string, number | null>;
  creado: string;
}

const CLAVE_VISTA = 'semana-vista';
const fechaCorta = (f: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${f}T12:00:00Z`));
const rango = (lunes: string) => {
  const d = new Date(`${lunes}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return `${fechaCorta(lunes)} – ${fechaCorta(d.toISOString().slice(0, 10))}`;
};

function useSemanas(persona: Persona): Semana[] | null {
  const [l, setL] = useState<Semana[] | null>(null);
  useEffect(() => {
    api<Semana[]>('GET', `/api/semanas?persona=${persona.id}`).then(setL).catch(() => setL([]));
  }, [persona.id]);
  return l;
}

/** Los números de la semana, con una flechita contra la anterior. */
function Numeros({ s, antes }: { s: Semana; antes?: Semana }) {
  const filas: Array<[string, string, (n: number) => string, boolean]> = [
    ['sueno_horas', t('Sueño por noche'), (n) => t('{n} h', { n: n.toLocaleString(locale()) }), true],
    ['pasos', t('Pasos por día'), (n) => Math.round(n).toLocaleString(locale()), true],
    ['caminatas_min', t('Caminatas'), (n) => t('{n} min', { n: Math.round(n) }), true],
    ['animo', t('Ánimo'), (n) => `${n.toLocaleString(locale())}/10`, true],
    ['molestias', t('Molestias anotadas'), (n) => String(n), false],
    ['dias_anotados', t('Días con algo anotado'), (n) => `${n}/7`, true],
  ];
  return (
    <ul className="numeros-semana">
      {filas
        .filter(([k]) => s.numeros[k] !== null && s.numeros[k] !== undefined)
        .map(([k, nombre, f, masEsMejor]) => {
          const v = s.numeros[k]!;
          const a = antes?.numeros[k];
          const sube = a !== null && a !== undefined && v > a;
          const baja = a !== null && a !== undefined && v < a;
          const bueno = (sube && masEsMejor) || (baja && !masEsMejor);
          return (
            <li key={k}>
              <span className="suave chico">{nombre}</span>
              <strong>{f(v)}</strong>
              {sube || baja ? <span className={`flecha-semana ${bueno ? 'bien' : 'mal'}`}>{sube ? '▲' : '▼'}</span> : null}
            </li>
          );
        })}
    </ul>
  );
}

export function HojaSemana({ s, antes, alCerrar }: { s: Semana; antes?: Semana; alCerrar(): void }) {
  return createPortal(
    <>
      <div className="velo" onClick={alCerrar} />
      <div className="hoja hoja-semana" role="dialog" aria-label={s.titulo}>
        <div className="hoja-cabeza">
          <h3>🦉 {s.titulo}</h3>
          <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
        </div>
        <p className="suave chico">{rango(s.semana)}</p>
        <p>{s.texto}</p>
        {s.destacados.length ? (
          <ul className="destacados-semana">
            {s.destacados.map((d) => (
              <li key={d.texto}><span aria-hidden>{d.emoji}</span> {d.texto}</li>
            ))}
          </ul>
        ) : null}
        <Numeros s={s} antes={antes} />
        {s.sugerencias.length ? (
          <div className="nota-ia">
            <p><strong>{t('Para probar esta semana')}</strong></p>
            {s.sugerencias.map((x) => <p key={x}>💡 {x}</p>)}
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

/** En el Día: el resumen nuevo (de los últimos 2 días), hasta que se ve o se cierra. */
export function TarjetaSemana({ persona }: { persona: Persona }) {
  const l = useSemanas(persona);
  const [abierta, setAbierta] = useState(false);
  const [vista, setVista] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_VISTA) ?? '';
    } catch {
      return '';
    }
  });
  const s = l?.[0];
  if (!s || vista === s.semana || Date.now() - Date.parse(s.creado) > 2 * 86400000) return null;
  const marcarVista = () => {
    setVista(s.semana);
    try {
      localStorage.setItem(CLAVE_VISTA, s.semana);
    } catch {
      /* sin almacenamiento */
    }
  };
  return (
    <>
      <div className="tarjeta tarjeta-semana">
        <button className="cuerpo-semana" onClick={() => setAbierta(true)}>
          <span className="suave chico">{t('🦉 Tu semana')}</span>
          <strong>{s.titulo}</strong>
          <span className="enlace chico">{t('Ver el resumen')}</span>
        </button>
        <button className="btn-icono chico" onClick={marcarVista} aria-label={t('Cerrar')}>✕</button>
      </div>
      {abierta ? <HojaSemana s={s} antes={l?.[1]} alCerrar={() => { setAbierta(false); marcarVista(); }} /> : null}
    </>
  );
}

/** En Descubrir: las semanas anteriores. */
export function ListaSemanas({ persona }: { persona: Persona }) {
  const l = useSemanas(persona);
  const [abierta, setAbierta] = useState<number | null>(null);
  if (!l?.length) return null;
  return (
    <div className="tarjeta">
      <h3>{t('🦉 Tus semanas')}</h3>
      <ul className="lista-simple semanas">
        {l.map((s, i) => (
          <li key={s.semana}>
            <button className="fila-semana" onClick={() => setAbierta(i)}>
              <span><strong>{s.titulo}</strong><span className="suave chico"> · {rango(s.semana)}</span></span>
              <span className="suave" aria-hidden>›</span>
            </button>
          </li>
        ))}
      </ul>
      {abierta !== null ? <HojaSemana s={l[abierta]} antes={l[abierta + 1]} alCerrar={() => setAbierta(null)} /> : null}
    </div>
  );
}
