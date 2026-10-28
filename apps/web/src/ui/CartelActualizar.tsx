// Cuando hay una versión nueva de Patty esperando: un cartelito abajo para actualizar con un toque (si no, se aplica
// sola cuando la app pasa a segundo plano).
import { useState } from 'react';
import { actualizarAhora, useVersionNueva } from '../lib/actualizar';
import { t } from '../lib/idioma';

export function CartelActualizar() {
  const hay = useVersionNueva();
  const [cerrado, setCerrado] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  if (!hay || cerrado) return null;
  return (
    <div className="cartel-actualizar" role="status">
      <span>{t('✨ Hay una versión nueva de Patty')}</span>
      <button className="btn chico primario" disabled={actualizando} onClick={() => { setActualizando(true); void actualizarAhora(); }}>
        {actualizando ? t('Actualizando…') : t('Actualizar')}
      </button>
      <button className="btn-icono" aria-label={t('Cerrar')} onClick={() => setCerrado(true)}>✕</button>
    </div>
  );
}
