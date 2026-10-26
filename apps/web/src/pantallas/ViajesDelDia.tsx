// En el Día: los viajes que se detectaron con la ubicación (cuánto duraron, cuántos km y a qué velocidad), con lo que
// Patty adivina (en qué fue, si parece que hubo tráfico) y la pregunta de cómo fue, para contestar con dos toques.
// Lo contado entra en los patrones ("los días con viaje pesado te duele la cabeza").
import { useCallback, useEffect, useState } from 'react';
import { COMO_VIAJE, MODOS_VIAJE, type ModoViaje, type Persona, type ViajeDelDia } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { duracion } from '../lib/automatico';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { avisarAnotado } from '../mascota/cara';

export function ViajesDelDia({ persona, fecha, vuelta, alCambiar }: { persona: Persona; fecha: string; vuelta: number; alCambiar(): void }) {
  const { festejar, usuario } = useEstado();
  const [viajes, setViajes] = useState<ViajeDelDia[]>([]);
  const [modo, setModo] = useState<Record<string, ModoViaje>>({});
  const traer = useCallback(() => {
    api<ViajeDelDia[]>('GET', `/api/ubicacion/viajes?persona=${persona.id}&fecha=${fecha}`).then(setViajes).catch(() => setViajes([]));
  }, [persona.id, fecha]);
  useEffect(() => traer(), [traer, vuelta]);

  const pendientes = viajes.filter((v) => !v.contado);
  if (!pendientes.length || usuario?.rol === 'lector') return null;

  const contar = async (v: ViajeDelDia, como: (typeof COMO_VIAJE)[number]['clave']) => {
    const m = modo[v.inicio] ?? v.modo;
    try {
      await api('POST', '/api/ubicacion/viajes', { persona_id: persona.id, inicio: v.inicio, fin: v.fin, minutos: v.minutos, km: v.km, modo: m, como });
      festejar(como === 'pesado' ? t('Anotado: viaje pesado 😩 ¡Ya pasó!') : t('Anotado: viaje {modo} 👍', { modo: t(MODOS_VIAJE[m].nombre).toLowerCase() }), como === 'pesado' ? 'espera' : 'feliz');
      avisarAnotado();
      alCambiar();
    } catch (e) {
      festejar((e as Error).message, 'triste');
    }
  };

  return (
    <div className="tarjeta viajes">
      <h3>{t('🚗 ¿Cómo fueron tus viajes?')}</h3>
      <ul className="lista">
        {pendientes.map((v) => {
          const m = modo[v.inicio] ?? v.modo;
          return (
            <li key={v.inicio} className="viaje">
              <span className="que">
                <strong>
                  {horaEn(v.inicio, persona.zona_horaria)} → {horaEn(v.fin, persona.zona_horaria)} · {String(v.km).replace('.', ',')} km · {duracion(v.minutos)}
                </strong>
                <span className={`chico renglon-sub${v.pesado ? ' pista-pesada' : ' suave'}`}>{v.pista} ({v.velocidad} km/h)</span>
              </span>
              <span className="rotulo-campo">{t('¿En qué fuiste?')}</span>
              <span className="chips envolver">
                {(Object.keys(MODOS_VIAJE) as ModoViaje[]).map((k) => (
                  <button key={k} className={`chip${m === k ? ' activa' : ''}`} onClick={() => setModo({ ...modo, [v.inicio]: k })}>
                    {MODOS_VIAJE[k].icono} {t(MODOS_VIAJE[k].nombre)}
                  </button>
                ))}
              </span>
              <span className="rotulo-campo">{t('¿Cómo fue?')}</span>
              <span className="botones-como">
                {COMO_VIAJE.map((c) => (
                  <button key={c.clave} className={`btn chico${c.clave === 'pesado' && v.pesado ? ' primario' : ''}`} onClick={() => void contar(v, c.clave)}>
                    {c.icono} {t(c.nombre)}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
