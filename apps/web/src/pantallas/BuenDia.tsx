// En el Día de hoy, a la mañana: "Tu reporte de sueño está listo", con un botón que abre la hoja del sueño. Aparece
// cuando ya llegó la noche del reloj, hasta el mediodía o hasta que se abre la noche (en este teléfono). Se apaga con
// el mismo ajuste que el aviso de buen día (Más → Avisos).
import { useCallback, useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { api } from '../api';
import { abrirNoche, BUEN_DIA_HASTA, marcarNocheVista, nocheVista, useAlVerNoche } from '../lib/buenDia';
import { t } from '../lib/idioma';
import { IconoSueno } from '../ui/IconosWidget';

/** Si el usuario quiere el buen día (se pregunta una vez por sesión de la app). */
let quiere: Promise<boolean> | null = null;
export function olvidarPreferenciaBuenDia(): void {
  quiere = null;
}

export function BuenDia({ persona, hoy, hayNoche }: { persona: Persona; hoy: string; hayNoche: boolean }) {
  const deManana = new Date().getHours() < BUEN_DIA_HASTA;
  const [visto, setVisto] = useState(() => nocheVista(persona.id, hoy));
  const [activo, setActivo] = useState(false);
  useAlVerNoche(useCallback(() => setVisto(nocheVista(persona.id, hoy)), [persona.id, hoy]));
  useEffect(() => setVisto(nocheVista(persona.id, hoy)), [persona.id, hoy]);
  const mirar = hayNoche && deManana && !visto;
  useEffect(() => {
    if (!mirar) return;
    quiere ??= api<{ avisar_buen_dia?: boolean }>('GET', '/api/usuarios/yo/preferencias')
      .then((r) => r.avisar_buen_dia !== false)
      .catch(() => {
        quiere = null;
        return false;
      });
    let vivo = true;
    void quiere.then((si) => vivo && setActivo(si));
    return () => {
      vivo = false;
    };
  }, [mirar]);
  if (!mirar || !activo) return null;
  return (
    <div className="tarjeta comentario-patty buen-dia">
      <span className="emoji-comentario" aria-hidden="true"><IconoSueno /></span>
      <div className="cuerpo-comentario">
        <p><strong>{t('Tu reporte de sueño está listo')}</strong></p>
        <p className="suave chico">{t('Cuánto dormiste, la nota de la noche y cómo se repartieron las etapas.')}</p>
        <div className="pie-comentario">
          <button className="btn primario chico" onClick={abrirNoche}>{t('Ver mi noche')}</button>
          <button className="btn chico" onClick={() => marcarNocheVista(persona.id, hoy)} aria-label={t('Cerrar')}>✕</button>
        </div>
      </div>
    </div>
  );
}
