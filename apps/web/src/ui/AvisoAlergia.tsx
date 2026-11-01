// El aviso cuando lo anotado (una comida, un remedio) choca con una alergia declarada. Lo anotado queda igual: solo avisa,
// con un consejo general, sin diagnósticos ni indicaciones.
import { useEffect, useState } from 'react';
import type { AvisoAlergia as Aviso } from 'shared';
import { useEstado } from '../estado';
import { escucharAvisosDeAlergia } from '../lib/avisoAlergia';
import { t } from '../lib/idioma';

export function AvisoAlergia() {
  const { persona } = useEstado();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  useEffect(() => escucharAvisosDeAlergia((a) => setAvisos((l) => [...l, ...a])), []);
  if (!avisos.length) return null;
  const propia = persona?.propia !== false;
  return (
    <>
      <div className="velo" onClick={() => setAvisos([])} />
      <div className="hoja modal-cuanto" role="alertdialog" aria-label={t('⚠️ Ojo con esta alergia')}>
        <h3>{t('⚠️ Ojo con esta alergia')}</h3>
        {avisos.map((a) => (
          <p key={`${a.que}|${a.alergia}`}>
            {propia
              ? t('Anotaste «{que}» y me contaste que tenés alergia a {alergia}.', { que: t(a.que), alergia: a.alergia.toLowerCase() })
              : t('Anotaste «{que}» y {nombre} tiene alergia a {alergia}.', { que: t(a.que), nombre: persona?.nombre ?? '', alergia: a.alergia.toLowerCase() })}
          </p>
        ))}
        <p className="suave chico">{t('Fijate bien qué tiene y, ante la duda, consultalo con quien te atiende. Si aparece algo raro, consultá; si cuesta respirar o se hincha la cara, pedí ayuda de emergencia.')}</p>
        <button className="btn primario ancho" onClick={() => setAvisos([])}>{t('Entendido')}</button>
      </div>
    </>
  );
}
