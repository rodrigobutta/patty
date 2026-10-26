// Reloj y salud (en Más, en la app nativa): prender el envío de lo que el reloj deja en Health Connect (Android) o
// Salud (iPhone), dar el permiso y ver qué se puede leer.
import { Health } from '@capgo/capacitor-health';
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { useEstado } from '../estado';
import { plataforma } from '../lib/nativo';
import { t } from '../lib/idioma';
import { LEER, pedirPermisoSalud, permisosSalud, ponerSalud, saludActivada, sincronizarSalud } from '../lib/salud';

const NOMBRES: Record<string, string> = {
  steps: 'pasos', distance: 'distancia', calories: 'calorías', totalCalories: 'calorías totales', heartRate: 'pulso',
  restingHeartRate: 'pulso en reposo', heartRateVariability: 'variabilidad del pulso', oxygenSaturation: 'oxígeno',
  respiratoryRate: 'respiración', weight: 'peso', sleep: 'sueño', workouts: 'entrenamientos',
};

export function DatosSalud({ persona }: { persona: Persona }) {
  const { avisar } = useEstado();
  const [activo, setActivo] = useState(saludActivada());
  const [permitidos, setPermitidos] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [mandando, setMandando] = useState(false);
  const almacen = plataforma() === 'ios' ? t('Salud') : 'Health Connect';

  useEffect(() => {
    void permisosSalud().then(setPermitidos);
  }, []);

  const mandar = async () => {
    setError('');
    setMandando(true);
    try {
      const n = await sincronizarSalud(persona.id);
      if (n) avisar(t('Listo: {n} datos de los últimos 7 días', { n }));
      else setError(t('{almacen} no tiene datos de esta semana: en la app de tu reloj, activá compartir con {almacen}.', { almacen }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMandando(false);
    }
  };

  const prender = async (si: boolean) => {
    setError('');
    ponerSalud(si);
    setActivo(si);
    if (!si) return;
    try {
      const r = await pedirPermisoSalud();
      if (!r.disponible) return setError(t('{almacen} no está disponible en este teléfono', { almacen }) + (r.motivo ? ` (${r.motivo})` : '') + '.');
      setPermitidos(r.permitidos);
      if (r.permitidos.length) void mandar();
      else setError(t('No diste permiso para leer nada de {almacen}.', { almacen }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="tarjeta">
      <h3>{t('⌚ Reloj y salud')}</h3>
      <p className="chico ejemplo-permiso">{t('💡 Sin anotar nada, cómo dormiste y cuánto te moviste se cruzan con tu ánimo, tus dolores y lo que comiste.')}</p>
      <label className="opcion">
        <input type="checkbox" checked={activo} onChange={(e) => void prender(e.target.checked)} />
        <span>{t('Traer de {almacen} el sueño, los pasos, el pulso y más (un resumen por día).', { almacen })}</span>
      </label>
      <p className="suave chico">
        {t('Patty lee lo que la app de tu reloj deja en {almacen}', { almacen })}
        {plataforma() === 'ios'
          ? t(' (Apple Watch y la mayoría de los relojes lo hacen).')
          : t(': Samsung Health, Fitbit, Google Fit, Mi Fitness, Zepp, OHealth y otras lo hacen; fijate en la app del reloj que esté prendido "Health Connect".')}{' '}
        {t('Se manda al abrir Patty, los últimos 7 días.')}
      </p>
      {permitidos ? (
        <p className="chico">
          {permitidos.length
            ? t('Puede leer: {lista}.', { lista: permitidos.map((p) => (NOMBRES[p] ? t(NOMBRES[p]) : p)).join(', ') })
            : activo
              ? t('Sin permisos todavía para {n} tipos de datos.', { n: LEER.length })
              : ''}
        </p>
      ) : null}
      {activo ? (
        <div className="columna">
          <button className="btn" disabled={mandando} onClick={() => void mandar()}>{mandando ? t('Mandando…') : t('Mandar ahora')}</button>
          <button className="btn" onClick={() => void prender(true)}>{t('Permisos')}</button>
          {plataforma() === 'android' ? (
            // En Android 14+ Health Connect no tiene ícono: vive dentro de Ajustes. Desde acá se abre directo.
            <button className="btn" onClick={() => void Health.openHealthConnectSettings().catch(() => {})}>{t('Abrir Health Connect')}</button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
