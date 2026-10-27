// "Última sincronización: hace 12 min" (en las pantallas de lo que Patty trae de otro lado: clima, teléfono, reloj,
// ubicación). Se actualiza sola cada minuto.
import { useEffect, useState } from 'react';
import { locale, t } from '../lib/idioma';

/** Lo guardado en el teléfono al sincronizar cada cosa (instante en ms). */
export const CLAVES_SYNC = { clima: 'clima-completado', telefono: 'datos-telefono-ultima', salud: 'salud-ultima' } as const;

export function leerUltimaVez(clave: string): number | null {
  try {
    const n = Number(localStorage.getItem(clave) ?? 0);
    return n || null;
  } catch {
    return null;
  }
}

function haceCuanto(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t('recién');
  if (min < 60) return t('hace {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('hace {n} h', { n: h });
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

export function UltimaVez({ ms }: { ms: number | null }) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTic((x) => x + 1), 60000);
    return () => clearInterval(iv);
  }, []);
  return <p className="suave chico ultima-vez">🕒 {t('Última sincronización: {cuando}', { cuando: ms ? haceCuanto(ms) : t('nunca') })}</p>;
}
