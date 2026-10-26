// Un cartel arriba de todo cuando hay una versión nueva de la app de Android publicada (desde la administración) y
// la instalada es más vieja: un toque abre el link para bajarla. Se puede cerrar hasta la próxima versión.
import { useEffect, useState } from 'react';
import { compararVersiones, type VersionApp } from 'shared';
import { t } from '../lib/idioma';
import { versionNativa } from '../lib/version';

const CLAVE = 'version-cerrada';

export function CartelVersion({ app }: { app: VersionApp | null | undefined }) {
  const [instalada, setInstalada] = useState<string | null>(null);
  const [cerrada, setCerrada] = useState(() => {
    try {
      return localStorage.getItem(CLAVE);
    } catch {
      return null;
    }
  });
  useEffect(() => void versionNativa().then(setInstalada), []);
  if (!app || !instalada || compararVersiones(instalada, app.version) >= 0 || cerrada === app.version) return null;
  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE, app.version);
    } catch {
      /* sin almacenamiento */
    }
    setCerrada(app.version);
  };
  return (
    <div className="cartel-version" role="status">
      <a href={app.url} target="_blank" rel="noreferrer">
        {t('📲 Hay una versión nueva de Patty ({v}): tocá para bajarla', { v: app.version })}
      </a>
      <button className="btn-icono" onClick={cerrar} aria-label={t('Cerrar')}>✕</button>
    </div>
  );
}
