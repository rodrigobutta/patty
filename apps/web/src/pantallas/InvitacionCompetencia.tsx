// Aceptar una invitación a una competencia: dice de qué se trata y exactamente qué número van a ver los demás. Hasta que
// no se toca "Acepto" no se comparte nada.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { METRICAS, NUNCA_SE_COMPARTE, type DuracionCompetencia, type MetricaCompetencia } from 'shared';
import { api } from '../api';
import { medir } from '../lib/analytics';
import { nombreDe, pedirVerCompetencia } from '../lib/competencias';
import { t } from '../lib/idioma';
import { irAMas } from '../lib/navegar';
import { Mascota } from '../mascota/Mascota';

interface Invitacion {
  id: number | null;
  nombre: string | null;
  metrica: MetricaCompetencia;
  duracion: DuracionCompetencia;
  estado: 'en_curso' | 'terminada';
  dias_restantes: number;
  ya_participas: boolean;
  invita: string | null;
  tu_apodo: string;
}

/** Qué se comparte, en palabras: lo mismo al crear una competencia que al aceptar la invitación. */
export function LoQueSeComparte({ metrica, apodo }: { metrica: MetricaCompetencia; apodo: string }) {
  return (
    <div className="competencia-comparte">
      <p><strong>{t('Lo único que van a ver los demás:')}</strong></p>
      <p>{t('Tu apodo ({apodo}) y {que}.', { apodo, que: t(METRICAS[metrica].queVen) })}</p>
      <p className="suave chico">{t(NUNCA_SE_COMPARTE)}</p>
      <p className="suave chico">{t(METRICAS[metrica].comoCuenta)}</p>
      <p className="suave chico">{t('Lo ven los que participan, y se suma quien tenga el link. Podés salir cuando quieras y deja de compartirse.')}</p>
    </div>
  );
}

export function InvitacionCompetencia({ codigo, alCerrar }: { codigo: string; alCerrar(): void }) {
  const [d, setD] = useState<Invitacion | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    api<Invitacion>('GET', `/api/competencias/invitacion/${codigo}`).then(setD).catch((e: Error) => setError(e.message));
  }, [codigo]);

  const abrir = (id: number) => {
    alCerrar();
    irAMas('competencias');
    pedirVerCompetencia(id);
  };
  const aceptar = async () => {
    setEnviando(true);
    setError('');
    try {
      const r = await api<{ id: number }>('POST', `/api/competencias/invitacion/${codigo}/aceptar`, { acepto: true });
      medir('competencia_aceptar', { metrica: d!.metrica });
      abrir(r.id);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  return createPortal(
    <>
      <div className="velo" onClick={alCerrar} />
      <div className="hoja" role="dialog" aria-label={t('Invitación a una competencia')}>
        <div className="hoja-cabeza">
          <h3>{t('🏆 Te invitaron a competir')}</h3>
          <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
        </div>
        {error && !d ? (
          <p className="neg">{error}</p>
        ) : !d ? (
          <p className="suave centro">{t('Cargando…')}</p>
        ) : d.ya_participas && d.id ? (
          <>
            <p>{t('Ya estás en «{nombre}».', { nombre: nombreDe(d) })}</p>
            <button className="btn primario ancho" onClick={() => abrir(d.id!)}>{t('Ver la tabla')}</button>
          </>
        ) : d.estado === 'terminada' ? (
          <p>{t('«{nombre}» ya terminó. ¡Armá la tuya desde Más → Competencias!', { nombre: nombreDe(d) })}</p>
        ) : (
          <>
            <div className="competencia-buho">
              <Mascota cara="feliz" tamano={64} />
              <p>{d.invita ? t('{apodo} te desafía a «{nombre}». ¿Te animás?', { apodo: d.invita, nombre: nombreDe(d) }) : t('Te desafían a «{nombre}». ¿Te animás?', { nombre: nombreDe(d) })}</p>
            </div>
            <p className="suave chico">
              {METRICAS[d.metrica].icono} {t(METRICAS[d.metrica].nombre)} · {d.dias_restantes === 1 ? t('Hoy es el último día') : t('Quedan {n} días', { n: d.dias_restantes })}
            </p>
            <LoQueSeComparte metrica={d.metrica} apodo={d.tu_apodo} />
            {error ? <p className="neg">{error}</p> : null}
            <div className="competencia-botones">
              <button className="btn primario ancho" onClick={() => void aceptar()} disabled={enviando}>{t('Acepto, quiero jugar')}</button>
              <button className="btn ancho" onClick={alCerrar}>{t('Ahora no')}</button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
