// Lo que Patty tiene en cuenta de lo que tomás: en cada remedio, qué efectos posibles está vigilando (información general, rotulada como
// generada con IA) y, en el Día o al abrir un síntoma, cuando lo anotado coincide con uno de ellos. Nunca es un diagnóstico, y nunca
// sugiere dejar ni cambiar nada: eso lo decide el médico.
import { useCallback, useEffect, useState } from 'react';
import { AVISO_DECIDE_EL_MEDICO, AVISO_INFORMACION_GENERAL, INTERACCION_TAMBIEN_TOMAS, NO_SE_DE_ESTE_REMEDIO, textoSenal, TODAVIA_AVERIGUANDO, type Persona, type RemedioVigilado, type SenalEfecto } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { idioma, t } from '../lib/idioma';

/** Lo que se sabe de un remedio o suplemento, plegado: en la lista de remedios no tiene que tapar lo demás. */
export function EfectosVigilados({ remedio }: { remedio: RemedioVigilado }) {
  if (remedio.estado === 'pendiente') return <span className="suave chico renglon-sub">{t(TODAVIA_AVERIGUANDO)}</span>;
  if (remedio.estado !== 'conocido') return <span className="suave chico renglon-sub">{t(NO_SE_DE_ESTE_REMEDIO)}</span>;
  const { efectos, interacciones } = remedio;
  if (!efectos.length && !interacciones.length) return <span className="suave chico renglon-sub">{t(NO_SE_DE_ESTE_REMEDIO)}</span>;
  const urgentes = efectos.filter((e) => e.urgente);
  const comunes = efectos.filter((e) => !e.urgente);
  const conLoQueToma = interacciones.filter((i) => i.tambien_toma).length;
  return (
    <details className="efectos-vigilados">
      <summary className="chico">
        {efectos.length ? t('👀 Tengo en cuenta {n} efectos posibles', { n: efectos.length }) : t('👀 Interacciones conocidas')}
        {conLoQueToma ? ` · ${t('{n} con algo que también tomás', { n: conLoQueToma })}` : ''}
      </summary>
      {comunes.length ? (
        <>
          <p className="chico">{t('Si aparece alguno y lo anotás, te lo señalo:')}</p>
          <ul className="chips-suaves">{comunes.map((e) => <li key={e.nombre}>{e.nombre}</li>)}</ul>
        </>
      ) : null}
      {urgentes.length ? (
        <>
          <p className="chico">{t('Si aparece alguno de estos, conviene consultar pronto:')}</p>
          <ul className="chips-suaves consultar">{urgentes.map((e) => <li key={e.nombre}>{e.nombre}</li>)}</ul>
        </>
      ) : null}
      {interacciones.length ? (
        <>
          <p className="chico">{t('Interacciones conocidas:')}</p>
          <ul className="interacciones chico">
            {interacciones.map((i) => (
              <li key={i.con}>
                <strong>{i.con}</strong>: {i.detalle}
                {i.tambien_toma ? <span className="renglon-sub consultar">{t(INTERACCION_TAMBIEN_TOMAS)}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="suave chico">🤖 {t(AVISO_INFORMACION_GENERAL)} {t(AVISO_DECIDE_EL_MEDICO)}</p>
    </details>
  );
}

/** Cuando lo anotado coincide con un efecto posible de algo que tomás: en el Día (`fecha`) o al abrir ese síntoma (`registroId`). */
export function SenalesEfecto({ persona, fecha, registroId, vuelta }: { persona: Persona; fecha?: string; registroId?: number; vuelta?: number }) {
  const [senales, setSenales] = useState<SenalEfecto[]>([]);
  const { avisar, usuario } = useEstado();
  const puedeEscribir = usuario?.rol !== 'lector';
  const que = registroId ? `registro=${registroId}` : `fecha=${fecha}`;
  const traer = useCallback(() => {
    api<SenalEfecto[]>('GET', `/api/remedios/senales?persona=${persona.id}&${que}`).then(setSenales).catch(() => setSenales([]));
  }, [persona.id, que]);
  useEffect(traer, [traer, vuelta]);
  if (!senales.length) return null;
  const apartar = async (s: SenalEfecto) => {
    try {
      await api('POST', '/api/remedios/senales/apartar', { persona_id: persona.id, concepto_id: s.concepto_id, clave: s.clave });
      traer();
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  return (
    <div className="tarjeta senales-efecto">
      {senales.map((s) => (
        <div key={`${s.registro_id}|${s.clave}`} className={`senal-efecto${s.urgente ? ' urgente' : ''}`}>
          <p><strong>🦉 {s.sintoma}</strong></p>
          <p>{textoSenal(s, idioma())}</p>
          {puedeEscribir ? <button className="enlace chico" onClick={() => void apartar(s)}>{t('No tiene que ver, no me lo señales más')}</button> : null}
        </div>
      ))}
      <p className="suave chico">🤖 {t(AVISO_INFORMACION_GENERAL)} {t(AVISO_DECIDE_EL_MEDICO)}</p>
    </div>
  );
}
