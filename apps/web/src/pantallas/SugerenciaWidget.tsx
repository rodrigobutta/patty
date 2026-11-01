// En el Día, a partir del segundo día de usar Patty en el teléfono: sugiere poner el widget en la pantalla de inicio,
// contando lo que se puede hacer desde ahí con un toque. Si ya está puesto no aparece. Se puede cerrar para siempre; si
// se toca "Agregarlo", no vuelve a preguntar por unos días (Android no avisa si la persona lo terminó de poner).
import { useEffect, useState } from 'react';
import { medir } from '../lib/analytics';
import { t } from '../lib/idioma';
import { plataforma } from '../lib/nativo';
import { agregarWidget, tieneWidget } from '../lib/push';
import { useEstado } from '../estado';
import { Mascota } from '../mascota/Mascota';

const PRIMER_USO = 'widget-primer-uso';
const CERRADA = 'widget-sugerencia-cerrada';
const PEDIDO = 'widget-sugerencia-pedido';
const DIA_MS = 86400000;
/** A partir de cuánto de usar la app se sugiere. */
const DESDE_MS = DIA_MS;
/** Después de tocar "Agregarlo", cuánto esperar para volver a mirar si quedó puesto. */
const VOLVER_MS = 3 * DIA_MS;

const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const guardar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: se vuelve a sugerir */
  }
};

/** Si ya pasó el tiempo y no se cerró. La primera vez que se abre el Día en este teléfono empieza a contar. */
function leToca(ahora = Date.now()): boolean {
  if (leer(CERRADA)) return false;
  const primero = Number(leer(PRIMER_USO));
  if (!primero) {
    guardar(PRIMER_USO, String(ahora));
    return false;
  }
  if (ahora - primero < DESDE_MS) return false;
  const pedido = Number(leer(PEDIDO));
  return !pedido || ahora - pedido >= VOLVER_MS;
}

export function SugerenciaWidget() {
  const { avisar } = useEstado();
  const [ver, setVer] = useState(false);
  useEffect(() => {
    if (plataforma() !== 'android' || !leToca()) return;
    let vivo = true;
    void tieneWidget().then((tiene) => {
      if (!vivo) return;
      if (tiene) guardar(CERRADA, 'puesto');
      else {
        medir('widget_sugerencia_ver');
        setVer(true);
      }
    });
    return () => {
      vivo = false;
    };
  }, []);
  if (!ver) return null;
  const agregar = () => {
    medir('agregar_widget', { desde: 'sugerencia' });
    guardar(PEDIDO, String(Date.now()));
    setVer(false);
    void agregarWidget().then((ok) => !ok && avisar(t('Tu teléfono no deja agregarlo desde acá: mantené apretada la pantalla de inicio, tocá "Widgets" y buscá Patty.')));
  };
  const cerrar = () => {
    medir('widget_sugerencia_cerrar');
    guardar(CERRADA, 'si');
    setVer(false);
  };
  return (
    <div className="tarjeta comentario-patty sugerencia-widget">
      <span className="emoji-comentario" aria-hidden="true"><Mascota cara="feliz" tamano={40} /></span>
      <div className="cuerpo-comentario">
        <p><strong>{t('¿Me ponés en tu pantalla de inicio?')}</strong></p>
        <p className="suave chico">{t('Con un toque me contás cómo te sentís, prendés la voz para contarme tu día o sacás una foto del plato, sin buscar la app.')}</p>
        <div className="pie-comentario">
          <button className="btn chico primario" onClick={agregar}>{t('Agregarlo')}</button>
          <button className="btn-icono chico" onClick={cerrar} aria-label={t('Cerrar')}>✕</button>
        </div>
      </div>
    </div>
  );
}
