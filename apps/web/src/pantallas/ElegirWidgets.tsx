// Más → Widgets del Día: cuáles se ven y en qué orden, con subir y bajar. Se guarda en la persona (ver lib/widgets).
import { useState, type ReactNode } from 'react';
import { moverWidget, ordenDeWidgets, ponerWidgetVisible, vecinoDeWidget, widgetOculto, type AjustesWidgets, type Persona, type WidgetId } from 'shared';
import { t } from '../lib/idioma';
import { cambiarWidgets, NOMBRE_WIDGET, useAjustesWidgets } from '../lib/widgets';
import { IconoAnimo, IconoCategoria } from '../ui/IconosPatty';
import { IconoCelular, IconoCielo, IconoCuerpo, IconoEscuchas, IconoLugar, IconoPasos, IconoReuniones, IconoSueno } from '../ui/IconosWidget';

const ICONO: Record<WidgetId, () => ReactNode> = {
  remedios: () => <IconoCategoria clave="medicacion" tamano={32} />,
  animo: () => <IconoAnimo clave="bien" tamano={32} />,
  clima: () => <IconoCielo cielo="parcial" />,
  ubicacion: () => <IconoLugar />,
  pasos: () => <IconoPasos />,
  telefono: () => <IconoCelular />,
  reuniones: () => <IconoReuniones />,
  sueno: () => <IconoSueno />,
  comida: () => <IconoCategoria clave="comida" tamano={32} />,
  cuerpo: () => <IconoCuerpo />,
  escuchas: () => <IconoEscuchas />,
  malestares: () => <IconoCategoria clave="sintoma" tamano={32} />,
};

export function ElegirWidgets({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const ajustes = useAjustesWidgets(persona);
  const [error, setError] = useState('');
  const orden = ordenDeWidgets(ajustes);
  const cambiar = (a: AjustesWidgets) => {
    setError('');
    cambiarWidgets(persona.id, a).catch((e: Error) => setError(e.message));
  };
  const mover = (id: WidgetId, delta: -1 | 1) => {
    const otro = vecinoDeWidget(orden, id, delta);
    if (otro) cambiar(moverWidget(ajustes, id, otro));
  };
  return (
    <>
      <p className="suave chico">
        {t('Elegí cuáles ver en el Día y en qué orden. Cada uno aparece cuando tiene algo para mostrar. En el Día también podés mantener apretado un widget para ocultarlo o arrastrarlo.')}
      </p>
      <ul className="elegir-widgets">
        {orden.map((id, i) => {
          const nombre = t(NOMBRE_WIDGET[id]);
          const oculto = widgetOculto(ajustes, id);
          return (
            <li key={id} className={oculto ? 'oculto' : undefined}>
              <label className="opcion">
                <input type="checkbox" checked={!oculto} disabled={!puedeEscribir} onChange={(e) => cambiar(ponerWidgetVisible(ajustes, id, e.target.checked))} />
                <span className="icono-widget" aria-hidden>{ICONO[id]()}</span>
                <span>{nombre}</span>
              </label>
              <button className="btn-icono chico" disabled={!puedeEscribir || i === 0} onClick={() => mover(id, -1)} aria-label={t('Subir {nombre}', { nombre })}>↑</button>
              <button className="btn-icono chico" disabled={!puedeEscribir || i === orden.length - 1} onClick={() => mover(id, 1)} aria-label={t('Bajar {nombre}', { nombre })}>↓</button>
            </li>
          );
        })}
      </ul>
      {puedeEscribir ? <button className="btn ancho" onClick={() => cambiar({})}>{t('Volver al orden de siempre')}</button> : null}
      {error ? <p className="neg">{error}</p> : null}
    </>
  );
}
