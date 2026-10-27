// Si varias noches se despierta a la misma hora (lo dicen las etapas del reloj), Patty pregunta por qué: puede ser un
// tren que pasa, el perro, el baño… La respuesta queda anotada como "Me desperté a la noche" (con el motivo de nota) y
// no se vuelve a preguntar por una semana.
import { useEffect, useState } from 'react';
import type { Categoria, Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { instanteDelDia, sumarDias } from '../lib/fechas';
import { t } from '../lib/idioma';
import { IconoCategoria } from '../ui/IconosPatty';

interface Despertar {
  hora: string;
  noches: number;
  miradas: number;
}

const MOTIVOS = [t('Ruido (la calle, un tren…)'), t('Ir al baño'), t('Calor o frío'), t('Me desvelo pensando'), t('Mascotas o chicos'), t('Algún dolor'), t('No sé')];

export function PreguntaDespertar({ persona, hoy, categorias, alAnotar }: { persona: Persona; hoy: string; categorias: Categoria[]; alAnotar(): void }) {
  const { festejar, avisar } = useEstado();
  const [d, setD] = useState<Despertar | null>(null);
  const [otro, setOtro] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    api<Despertar | null>('GET', `/api/sueno/despertares?persona=${persona.id}`).then(setD).catch(() => {});
  }, [persona.id, hoy]);
  if (!d) return null;

  const contestar = async (motivo: string) => {
    const sueno = categorias.find((c) => c.clave === 'sueno');
    if (!sueno || !motivo.trim()) return;
    setEnviando(true);
    try {
      await api('POST', '/api/registros', {
        persona_id: persona.id,
        concepto_nombre: 'Me desperté a la noche',
        categoria_id: sueno.id,
        inicio: instanteDelDia(sumarDias(hoy, -1), d.hora, persona.zona_horaria),
        nota: motivo.trim(),
      });
      festejar(t('Gracias, lo tengo en cuenta 🌙'));
      setD(null);
      alAnotar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="tarjeta pregunta-despertar">
      <h3 className="con-icono"><IconoCategoria clave="sueno" tamano={26} /> {t('¿Por qué te despertás a las {hora}?', { hora: d.hora })}</h3>
      <p className="suave chico">{t('Tu reloj dice que {n} de las últimas {total} noches te despertaste cerca de esa hora.', { n: d.noches, total: d.miradas })}</p>
      <div className="chips envolver">
        {MOTIVOS.map((m) => (
          <button key={m} className="chip" disabled={enviando} onClick={() => void contestar(m)}>{m}</button>
        ))}
      </div>
      <div className="afinar">
        <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder={t('Otra cosa: «pasa un tren cerca de casa»')} onKeyDown={(e) => e.key === 'Enter' && void contestar(otro)} />
        <button className="btn" disabled={enviando || !otro.trim()} onClick={() => void contestar(otro)}>{t('Listo')}</button>
      </div>
    </div>
  );
}
