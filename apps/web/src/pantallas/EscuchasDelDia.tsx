// En el Día: lo que sonó o se miró en el teléfono (con «Qué estás escuchando» prendido en Más → Permisos). Una línea
// por sesión: qué fue (música, podcast, series y videos), de qué hora a qué hora, cuánto y lo principal (los artistas
// o los títulos); al tocarla se ven todos los temas. Desde ahí también se puede borrar todo lo escuchado.
import { useEffect, useState } from 'react';
import type { Persona, SesionEscucha } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { duracion } from '../lib/automatico';
import { borrarEscuchas } from '../lib/escuchas';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { IconoMedio } from '../ui/IconosPatty';

export const NOMBRE_ESCUCHA: Record<SesionEscucha['tipo'], string> = { musica: 'Música', podcast: 'Podcasts', video: 'Series y videos' };

/** Lo principal de una sesión: los artistas que más sonaron (en la música) o los títulos. */
export function principal(s: SesionEscucha): string {
  const cuenta = new Map<string, number>();
  for (const p of s.pistas) {
    const k = (s.tipo === 'musica' ? p.artista : p.titulo) || p.titulo;
    if (k) cuenta.set(k, (cuenta.get(k) ?? 0) + p.minutos);
  }
  const l = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return l.length > 3 ? t('{lista} y {n} más', { lista: l.slice(0, 3).join(', '), n: l.length - 3 }) : l.join(', ');
}

export function EscuchasDelDia({ persona, fecha, vuelta }: { persona: Persona; fecha: string; vuelta: number }) {
  const { sesion, avisar } = useEstado();
  const [sesiones, setSesiones] = useState<SesionEscucha[]>([]);
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    api<SesionEscucha[]>('GET', `/api/medios/escuchas?persona=${persona.id}&fecha=${fecha}`)
      .then((l) => vivo && setSesiones(l))
      .catch(() => vivo && setSesiones([]));
    return () => {
      vivo = false;
    };
  }, [persona.id, fecha, vuelta]);

  if (!sesiones.length) return null;
  const borrar = async () => {
    if (!confirm(t('¿Borrar todo lo que Patty anotó que escuchaste o miraste en el teléfono? No se puede deshacer.'))) return;
    try {
      await borrarEscuchas(persona.id);
      setSesiones([]);
      avisar(t('Borrado'));
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  return (
    <div className="tarjeta escuchas-dia">
      <h3>{t('Lo que sonó en el teléfono')}</h3>
      <ul className="lista">
        {sesiones.map((s, i) => (
          <li key={s.inicio} className="tocable" onClick={() => setAbierta(abierta === i ? null : i)}>
            <span className="hora">{horaEn(new Date(s.inicio).toISOString(), persona.zona_horaria)}</span>
            <span className="icono"><IconoMedio tipo={s.tipo === 'video' ? 'tele' : s.tipo} /></span>
            <span className="que">
              <span className="frase">
                <span className="frase-que">{t(NOMBRE_ESCUCHA[s.tipo])}</span> <span className="frase-cant">{duracion(s.minutos)}</span>
              </span>
              <span className="frase-extra">{[principal(s), s.apps.join(', ')].filter(Boolean).join(' · ')}</span>
              {abierta === i ? (
                <ol className="pistas">
                  {s.pistas.map((p) => (
                    <li key={p.inicio}>
                      <span className="suave chico">{horaEn(new Date(p.inicio).toISOString(), persona.zona_horaria)}</span> {p.titulo || t('(sin título)')}
                      {p.artista ? <span className="suave"> — {p.artista}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {abierta !== null && sesion?.usuario?.rol !== 'lector' ? (
        <button className="borrar-chico" onClick={() => void borrar()}>{t('Borrar todo lo escuchado')}</button>
      ) : null}
    </div>
  );
}
