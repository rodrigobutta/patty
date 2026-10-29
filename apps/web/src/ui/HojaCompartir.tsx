// La hoja para compartir: muestra cómo va a quedar la imagen antes de mandarla (sin nombre ni lo anotado), el botón
// para abrir el menú de compartir del teléfono y, abajo, invitar a alguien con el link. Algunas imágenes traen algo que
// se puede sacar antes de mandarla (el mapa de una actividad, lo que dijo Patty de la noche).
import { useEffect, useRef, useState } from 'react';
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
  que: 'patron' | 'racha' | 'semana' | 'nivel' | 'actividad' | 'viaje' | 'sueno';
  tarjeta: Tarjeta;
  /** Algo que se puede sacar de la imagen: el tilde (prendido de entrada) y la tarjeta sin eso. */
  opcion?: { rotulo: string; sin: Tarjeta };
}

/** Lo que va escrito junto a la imagen, según qué se comparte. */
const TEXTOS: Record<Compartible['que'], string> = {
  patron: 'Lo descubrí con Patty 🦉',
  racha: 'Mi racha en Patty 🦉',
  semana: 'Mi semana con Patty 🦉',
  nivel: 'Mi nivel en Patty 🦉',
  actividad: 'Lo anoté con Patty 🦉',
  viaje: 'Lo anoté con Patty 🦉',
  sueno: 'Cómo dormí, con Patty 🦉',
};

export function HojaCompartir({ que, tarjeta, opcion, alCerrar }: Compartible & { alCerrar(): void }) {
  const { usuario } = useEstado();
  const [con, setCon] = useState(true);
  const [imagenes, setImagenes] = useState<Record<'con' | 'sin', { blob: Blob; url: string } | undefined>>({ con: undefined, sin: undefined });
  const [error, setError] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const cual = con || !opcion ? 'con' : 'sin';
  const imagen = imagenes[cual];

  useEffect(() => {
    medir('compartir_ver', { que });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Cada versión de la imagen se arma una sola vez (la primera vez que se pide).
  useEffect(() => {
    if (imagenes[cual]) return;
    let vivo = true;
    setError(false);
    const d = cual === 'con' ? tarjeta : opcion!.sin;
    imagenDeTarjeta({ ...d, lema: d.lema ?? t('Contale tu día y descubrí qué se relaciona.') })
      .then((blob) => {
        if (vivo) setImagenes((ya) => ({ ...ya, [cual]: { blob, url: URL.createObjectURL(blob) } }));
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cual]);
  const urls = useRef<string[]>([]);
  urls.current = Object.values(imagenes).flatMap((x) => (x ? [x.url] : []));
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const compartir = async () => {
    if (!imagen) return;
    setEnviando(true);
    setAviso('');
    try {
      const link = await linkInvitacion(usuario?.id);
      const como = await compartirImagen(imagen.blob, `patty-${que}.png`, `${t(TEXTOS[que])} ${link}`);
      medir('compartir', { que, como, ...(opcion ? { con: con ? 'si' : 'no' } : {}) });
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
        {opcion ? (
          <label className="opcion-compartir">
            <input type="checkbox" checked={con} onChange={(e) => setCon(e.target.checked)} /> {opcion.rotulo}
          </label>
        ) : null}
        <p className="suave chico centro">{t('La imagen no lleva tu nombre ni lo que anotaste: solo esto.')}</p>
        <button className="btn primario ancho" onClick={compartir} disabled={!imagen || enviando}>{t('📤 Compartir')}</button>
        {aviso ? <p className="chico centro">{aviso}</p> : null}
        <button className="btn ancho" onClick={alInvitar}>{t('💌 Invitá a alguien a usar Patty')}</button>
      </div>
    </>,
    document.body,
  );
}

/** El botoncito "Compartir" que abre la hoja (lo que se comparte puede tener que buscarse antes, como un recorrido). */
export function BotonCompartir({ armar, className = 'btn chico' }: { armar(): Compartible | Promise<Compartible>; className?: string }) {
  const [abierto, setAbierto] = useState<Compartible | null>(null);
  const [armando, setArmando] = useState(false);
  const abrir = async () => {
    setArmando(true);
    try {
      setAbierto(await armar());
    } catch {
      /* no se pudo traer lo que hacía falta: queda el botón para probar de nuevo */
    } finally {
      setArmando(false);
    }
  };
  return (
    <>
      <button className={className} onClick={() => void abrir()} disabled={armando}>{armando ? t('Armando…') : t('📤 Compartir')}</button>
      {abierto ? <HojaCompartir {...abierto} alCerrar={() => setAbierto(null)} /> : null}
    </>
  );
}
