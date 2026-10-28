// Datos del teléfono (en Más, solo en la app de Android): prender el envío del tiempo de uso de cada app y de las
// llamadas, dar los dos permisos y ver qué se mandó.
import { useEffect, useState } from 'react';
import { CLAVES_SYNC, leerUltimaVez, UltimaVez } from '../ui/UltimaVez';
import type { Persona } from 'shared';
import { useEstado } from '../estado';
import { datosActivados, ponerDatos, sincronizar, Telefono } from '../lib/telefono';
import { calendarioActivado, ponerCalendario } from '../lib/calendario';
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
      <p className="chico ejemplo-permiso">{t('💡 Por ejemplo: «los días con más de 4 h de pantalla te cuesta dormir» o «cuando hablás más con gente, te sentís mejor».')}</p>
      <label className="opcion">
        <input type="checkbox" checked={activo} onChange={(e) => prender(e.target.checked)} />
        <span>{t('Anotar cada día el tiempo de pantalla, el uso de cada app y las llamadas.')}</span>
      </label>
      <p className="suave chico">
        {t('De las llamadas, solo cuántas y cuánto duraron (nunca números ni nombres). Las apps usadas 5 min o más entran con su nombre. Se manda al abrir Patty.')}
      </p>
      {permisos ? (
        <div className="columna">
          {permisos.uso === 'granted' ? (
            <span className="chico">{t('✅ Uso de apps')}</span>
          ) : (
            <button className="btn" onClick={() => void Telefono.pedirPermisoUso()}>{t('Permitir uso de apps')}</button>
          )}
          {permisos.llamadas === 'granted' ? (
            <span className="chico">
              {permisos.llamadasDe === 'en_vivo' ? t('✅ Llamadas (medidas mientras pasan, desde que diste el permiso)') : t('✅ Llamadas')}
            </span>
          ) : (
            <button className="btn" onClick={() => void Telefono.pedirPermisoLlamadas().then(setPermisos)}>{t('Permitir llamadas')}</button>
          )}
        </div>
      ) : null}
      {permisos?.uso !== 'granted' ? (
        <p className="suave chico">{t('«Permitir uso de apps» abre Ajustes: buscá Patty en la lista y prendé «Permitir acceso al uso».')}</p>
      ) : null}
      {activo ? (
        <>
          <button className="btn primario" disabled={mandando} onClick={() => void mandar()}>{mandando ? t('Sincronizando…') : t('🔄 Sincronizar ahora')}</button>
          <UltimaVez ms={leerUltimaVez(CLAVES_SYNC.telefono)} />
        </>
      ) : null}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}

/** Las reuniones del calendario del teléfono (Google, Outlook…): prenderlo, dar el permiso y mandar. */
export function DatosCalendario({ persona }: { persona: Persona }) {
  const { avisar } = useEstado();
  const [activo, setActivo] = useState(calendarioActivado());
  const [permiso, setPermiso] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  useEffect(() => {
    void Telefono.permisos().then((p) => setPermiso(p.calendario ?? 'viejo')).catch(() => {});
  }, []);
  const mandar = async () => {
    setMandando(true);
    try {
      const n = await sincronizar(persona.id);
      avisar(n ? t('Listo: las reuniones de los últimos 7 días') : t('Falta dar algún permiso'));
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setMandando(false);
    }
  };
  const prender = async (si: boolean) => {
    ponerCalendario(si);
    setActivo(si);
    if (!si) return;
    let p = permiso;
    if (p !== 'granted') p = (await Telefono.pedirPermisoCalendario().catch(() => ({ calendario: 'denied' as const }))).calendario ?? 'viejo';
    setPermiso(p);
    if (p === 'granted') void mandar();
  };
  return (
    <div className="tarjeta">
      <h3>{t('📅 Reuniones del calendario')}</h3>
      <p className="chico ejemplo-permiso">{t('💡 Por ejemplo: «los días con más de 4 horas de reuniones dormís peor» o «con reuniones seguidas aparece el dolor de cabeza».')}</p>
      {permiso === 'viejo' ? (
        <p className="suave chico">{t('Para esto hace falta la versión nueva de la app de Android.')}</p>
      ) : (
        <>
          <label className="opcion">
            <input type="checkbox" checked={activo} onChange={(e) => void prender(e.target.checked)} />
            <span>{t('Sumar cada día cuántas reuniones tuve y cuántas horas, de todas las cuentas del teléfono (Google, Outlook…).')}</span>
          </label>
          <p className="suave chico">{t('Solo los horarios y cuánta gente había: nunca los títulos, los lugares ni quiénes. Cuentan como reunión los eventos con más gente o de cuentas de trabajo.')}</p>
          {activo && permiso === 'denied' ? (
            <button className="btn" onClick={() => void Telefono.pedirPermisoCalendario().then((p) => setPermiso(p.calendario ?? 'denied'))}>{t('Permitir calendario')}</button>
          ) : null}
          {activo && permiso === 'granted' ? (
            <button className="btn primario" disabled={mandando} onClick={() => void mandar()}>{mandando ? t('Sincronizando…') : t('🔄 Sincronizar ahora')}</button>
          ) : null}
        </>
      )}
    </div>
  );
}
