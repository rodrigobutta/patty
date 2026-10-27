// "¿Hoy también…?": lo que se viene anotando seguido (café todas las mañanas, fútbol los martes) se ofrece para anotar
// con un toque, desde un rato antes de la hora de siempre. "Hoy no" lo saca hasta mañana (en este teléfono).
import { useEffect, useState } from 'react';
import type { Categoria, Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { horaAhora, instanteDelDia } from '../lib/fechas';
import { t } from '../lib/idioma';
import { avisarAnotado } from '../mascota/cara';
import { IconoCategoria } from '../ui/IconosPatty';

interface Rutina {
  concepto_id: number;
  nombre: string;
  categoria_id: number;
  tipo: 'diaria' | 'semanal';
  hora: string;
  valor: number | null;
  unidad: string | null;
  veces: number;
}

/** Desde cuánto antes de la hora de siempre se ofrece (minutos). */
const ANTES_MIN = 60;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const clave = (hoy: string) => `rutinas-no|${hoy}`;
const NOMBRES_DIA = [t('domingos'), t('lunes'), t('martes'), t('miércoles'), t('jueves'), t('viernes'), t('sábados')];

export function RutinasDelDia({ persona, hoy, categorias, alAnotar }: { persona: Persona; hoy: string; categorias: Categoria[]; alAnotar(): void }) {
  const { festejar, avisar } = useEstado();
  const [lista, setLista] = useState<Rutina[]>([]);
  const [no, setNo] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(clave(hoy)) ?? '[]') as number[];
    } catch {
      return [];
    }
  });
  const [anotando, setAnotando] = useState<number | null>(null);
  useEffect(() => {
    api<Rutina[]>('GET', `/api/registros/rutinas?persona=${persona.id}`).then(setLista).catch(() => {});
  }, [persona.id, hoy]);

  const ahora = minutos(horaAhora(persona.zona_horaria));
  const visibles = lista.filter((r) => !no.includes(r.concepto_id) && ahora >= minutos(r.hora) - ANTES_MIN);
  if (!visibles.length) return null;

  const hoyNo = (r: Rutina) => {
    const l = [...no, r.concepto_id];
    setNo(l);
    try {
      localStorage.setItem(clave(hoy), JSON.stringify(l));
    } catch {
      /* sin almacenamiento */
    }
  };
  const anotar = async (r: Rutina) => {
    setAnotando(r.concepto_id);
    try {
      // A la hora de siempre; si todavía no llegó, ahora.
      const inicio = minutos(r.hora) <= ahora ? instanteDelDia(hoy, r.hora, persona.zona_horaria) : new Date().toISOString();
      await api('POST', '/api/registros', { persona_id: persona.id, concepto_id: r.concepto_id, inicio, valor: r.valor, unidad: r.unidad });
      setLista((l) => l.filter((x) => x.concepto_id !== r.concepto_id));
      festejar(t('¡Anotado! {que}', { que: t(r.nombre) }));
      avisarAnotado();
      alAnotar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setAnotando(null);
    }
  };
  const dia = NOMBRES_DIA[new Date(`${hoy}T12:00:00Z`).getUTCDay()];

  return (
    <div className="tarjeta rutinas-dia">
      <h3>{t('¿Hoy también?')}</h3>
      <ul className="lista-rutinas">
        {visibles.map((r) => {
          const cat = categorias.find((c) => c.id === r.categoria_id);
          return (
            <li key={r.concepto_id}>
              <span className="icono"><IconoCategoria clave={cat?.clave} emoji={cat?.icono} tamano={28} /></span>
              <span className="que">
                <strong>{t(r.nombre)}{r.valor !== null ? ` · ${r.valor}${r.unidad ? ' ' + r.unidad : ''}` : ''}</strong>
                <span className="suave chico">
                  {r.tipo === 'diaria'
                    ? t('Lo anotaste {n} de los últimos 3 días, a eso de las {hora}', { n: r.veces, hora: r.hora })
                    : t('Como los últimos {dia}, a eso de las {hora}', { dia, hora: r.hora })}
                </span>
              </span>
              <span className="botones-rutina">
                <button className="btn chico primario" disabled={anotando !== null} onClick={() => void anotar(r)}>{anotando === r.concepto_id ? '…' : t('Sí')}</button>
                <button className="btn chico" onClick={() => hoyNo(r)}>{t('Hoy no')}</button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
