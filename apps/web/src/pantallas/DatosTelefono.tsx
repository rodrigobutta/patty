// Datos del teléfono (en Más, solo en la app de Android): prender el envío del tiempo de uso de cada app y de las
// llamadas, dar los dos permisos y ver qué se mandó.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { useEstado } from '../estado';
import { datosActivados, ponerDatos, sincronizar, Telefono } from '../lib/telefono';
import { t } from '../lib/idioma';

type Permisos = Awaited<ReturnType<typeof Telefono.permisos>>;

export function DatosTelefono({ persona }: { persona: Persona }) {
  const { avisar } = useEstado();
  const [activo, setActivo] = useState(datosActivados());
  const [permisos, setPermisos] = useState<Permisos | null>(null);
  const [error, setError] = useState('');
  const [mandando, setMandando] = useState(false);

  // Al volver de Ajustes (donde se da el acceso a datos de uso) se vuelve a mirar.
  useEffect(() => {
    const mirar = () => void Telefono.permisos().then(setPermisos).catch(() => {});
    mirar();
    const f = () => document.visibilityState === 'visible' && mirar();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  const mandar = async () => {
    setError('');
    setMandando(true);
    try {
      const n = await sincronizar(persona.id);
      avisar(n ? t('Listo: {n} datos de los últimos 7 días', { n }) : t('Falta dar algún permiso'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMandando(false);
    }
  };

  const prender = (si: boolean) => {
    ponerDatos(si);
    setActivo(si);
    if (si) void mandar();
  };

  return (
    <div className="tarjeta">
      <h3>{t('📱 Uso del teléfono y llamadas')}</h3>
      <label className="opcion">
        <input type="checkbox" checked={activo} onChange={(e) => prender(e.target.checked)} />
        <span>{t('Anotar cada día el tiempo de pantalla, los minutos de cada app y las llamadas de este teléfono.')}</span>
      </label>
      <p className="suave chico">
        {t('De las llamadas solo se cuentan cuántas y cuánto duraron (no números ni nombres). Una app entra con su nombre si se usó 5 minutos o más en el día. Se manda al abrir Patty, los últimos 7 días.')}
      </p>
      {permisos ? (
        <div className="columna">
          {permisos.uso === 'granted' ? (
            <span className="chico">{t('✅ Uso de apps')}</span>
          ) : (
            <button className="btn" onClick={() => void Telefono.pedirPermisoUso()}>{t('Permitir uso de apps')}</button>
          )}
          {permisos.llamadas === 'granted' ? (
            <span className="chico">{t('✅ Llamadas')}</span>
          ) : (
            <button className="btn" onClick={() => void Telefono.pedirPermisoLlamadas().then(setPermisos)}>{t('Permitir llamadas')}</button>
          )}
        </div>
      ) : null}
      {permisos?.uso !== 'granted' ? (
        <p className="suave chico">{t('«Permitir uso de apps» abre Ajustes: buscá Patty en la lista y prendé «Permitir acceso al uso».')}</p>
      ) : null}
      {activo ? (
        <button className="btn" disabled={mandando} onClick={() => void mandar()}>{mandando ? t('Mandando…') : t('Mandar ahora')}</button>
      ) : null}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
