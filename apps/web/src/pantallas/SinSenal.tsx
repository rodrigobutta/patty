// Lo anotado sin señal, en el Día: cuántas cosas esperan para subirse, y lo contado con palabras que hay que ordenar
// (cuando vuelve la conexión, "Revisarlo" lo manda a Patty con la hora en que se contó). La subida en sí la hace
// useSubirSinSenal, desde App.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { subirLoPendiente } from '../api';
import { useEstado } from '../estado';
import { contadosPendientes, EVENTO_COLA, pendientes, sacarContado, type ContadoPendiente } from '../lib/cola';
import { t } from '../lib/idioma';

export const EVENTO_SUBIDO = 'patty-subido';

/** Sube la cola al abrir, al volver a la app, al recuperar la señal y cada minuto; avisa lo que subió. */
export function useSubirSinSenal() {
  const { festejar } = useEstado();
  useEffect(() => {
    const subir = async () => {
      if (!navigator.onLine) return;
      const n = await subirLoPendiente();
      if (n > 0) {
        festejar(n === 1 ? t('Subí lo que anotaste sin señal ✓') : t('Subí {n} cosas que anotaste sin señal ✓', { n }));
        window.dispatchEvent(new Event(EVENTO_SUBIDO));
      } else if (contadosPendientes().length) {
        window.dispatchEvent(new Event(EVENTO_SUBIDO));
      }
    };
    void subir();
    const alVolver = () => document.visibilityState === 'visible' && void subir();
    window.addEventListener('online', subir);
    document.addEventListener('visibilitychange', alVolver);
    const i = setInterval(() => pendientes().length && void subir(), 60000);
    return () => {
      window.removeEventListener('online', subir);
      document.removeEventListener('visibilitychange', alVolver);
      clearInterval(i);
    };
  }, [festejar]);
}

export function SinSenal({ persona, alRevisar }: { persona: Persona; alRevisar(c: ContadoPendiente): void }) {
  const leer = () => ({ cola: pendientes().length, contados: contadosPendientes().filter((c) => c.persona_id === persona.id), enLinea: navigator.onLine });
  const [e, setE] = useState(leer);
  useEffect(() => {
    const f = () => setE(leer());
    window.addEventListener(EVENTO_COLA, f);
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    return () => {
      window.removeEventListener(EVENTO_COLA, f);
      window.removeEventListener('online', f);
      window.removeEventListener('offline', f);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.id]);
  if (!e.cola && !e.contados.length && e.enLinea) return null;
  return (
    <div className="tarjeta sin-senal">
      {!e.enLinea ? <p className="chico"><strong>{t('📶 Sin señal')}</strong> · {t('Podés seguir anotando: lo guardo acá y lo subo cuando vuelva.')}</p> : null}
      {e.cola ? <p className="suave chico">{e.cola === 1 ? t('1 cosa esperando para subirse') : t('{n} cosas esperando para subirse', { n: e.cola })}</p> : null}
      {e.contados.map((c) => (
        <div key={c.id} className="contado-pendiente">
          <p className="chico">📝 «{c.texto.length > 120 ? `${c.texto.slice(0, 117)}…` : c.texto}»</p>
          <div className="fila">
            <button className="btn chico primario" disabled={!e.enLinea} onClick={() => alRevisar(c)}>{e.enLinea ? t('Revisarlo') : t('Espero la señal')}</button>
            <button className="btn chico" onClick={() => sacarContado(c.id)} aria-label={t('Descartar')}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
