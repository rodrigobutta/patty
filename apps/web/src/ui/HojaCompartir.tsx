// La hoja para compartir: muestra cómo va a quedar la imagen antes de mandarla (sin nombre ni lo anotado), el botón
// para abrir el menú de compartir del teléfono y, abajo, invitar a alguien con el link.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { compartirImagen, invitar, linkInvitacion, type ComoSeCompartio } from '../lib/compartir';
import { t } from '../lib/idioma';
import { imagenDeTarjeta, type Tarjeta } from '../lib/tarjetaCompartir';

const AVISOS: Partial<Record<ComoSeCompartio, string>> = {
  descarga: 'Listo: la imagen quedó en tus descargas.',
  copiado: 'Copié el link: pegalo donde quieras.',
  sin_soporte: 'Para compartir imágenes hace falta la última versión de la app.',
};

/** Lo que se puede compartir: la tarjeta (ya traducida) y qué es, para Analytics y el nombre del archivo. */
export interface Compartible {
  que: 'patron' | 'racha' | 'semana' | 'nivel' | 'medio';
  tarjeta: Tarjeta;
}

export function HojaCompartir({ que, tarjeta, alCerrar }: Compartible & { alCerrar(): void }) {
  const { usuario } = useEstado();
  const [imagen, setImagen] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let url = '';
    let vivo = true;
    imagenDeTarjeta({ ...tarjeta, lema: tarjeta.lema ?? t('Contale tu día y descubrí qué se relaciona.') })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (vivo) setImagen({ blob, url });
      })
      .catch(() => vivo && setError(true));
    medir('compartir_ver', { que });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
    // La tarjeta se arma una sola vez, al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compartir = async () => {
    if (!imagen) return;
    setEnviando(true);
    setAviso('');
    try {
      const link = await linkInvitacion(usuario?.id);
      const como = await compartirImagen(imagen.blob, `patty-${que}.png`, `${t('Lo descubrí con Patty 🦉')} ${link}`);
      medir('compartir', { que, como });
      setAviso(AVISOS[como] ? t(AVISOS[como]!) : '');
    } catch {
      setAviso(t('No se pudo compartir. Probá de nuevo.'));
    } finally {
      setEnviando(false);
    }
  };
  const alInvitar = async () => {
    const como = await invitar(usuario?.id, `hoja_${que}`);
    setAviso(AVISOS[como] ? t(AVISOS[como]!) : '');
  };

  return createPortal(
    <>
      <div className="velo" onClick={alCerrar} />
      <div className="hoja hoja-compartir" role="dialog" aria-label={t('Compartir')}>
        <div className="hoja-cabeza">
          <h3>{t('Compartir')}</h3>
          <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
        </div>
        <div className="vista-compartir">
          {imagen ? <img src={imagen.url} alt={t('Así se va a ver la imagen')} /> : <span className="suave chico">{error ? t('No se pudo armar la imagen.') : t('Armando la imagen…')}</span>}
        </div>
        <p className="suave chico centro">{t('La imagen no lleva tu nombre ni lo que anotaste: solo esto.')}</p>
        <button className="btn primario ancho" onClick={compartir} disabled={!imagen || enviando}>{t('📤 Compartir')}</button>
        {aviso ? <p className="chico centro">{aviso}</p> : null}
        <button className="btn ancho" onClick={alInvitar}>{t('💌 Invitá a alguien a usar Patty')}</button>
      </div>
    </>,
    document.body,
  );
}

/** El botoncito "Compartir" que abre la hoja. */
export function BotonCompartir({ armar, className = 'btn chico' }: { armar(): Compartible; className?: string }) {
  const [abierto, setAbierto] = useState<Compartible | null>(null);
  return (
    <>
      <button className={className} onClick={() => setAbierto(armar())}>{t('📤 Compartir')}</button>
      {abierto ? <HojaCompartir {...abierto} alCerrar={() => setAbierto(null)} /> : null}
    </>
  );
}
