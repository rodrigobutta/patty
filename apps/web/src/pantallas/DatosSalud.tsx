// Reloj y salud (en Más, en la app nativa): prender el envío de lo que el reloj deja en Health Connect (Android) o
// Salud (iPhone), dar el permiso y ver qué se puede leer.
import { useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { useEstado } from '../estado';
import { plataforma } from '../lib/nativo';
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
  const almacen = plataforma() === 'ios' ? 'Salud' : 'Health Connect';

  useEffect(() => {
    void permisosSalud().then(setPermitidos);
  }, []);

  const mandar = async () => {
    setError('');
    setMandando(true);
    try {
      const n = await sincronizarSalud(persona.id);
      avisar(n ? `Listo: ${n} datos de los últimos 7 días` : `Todavía no hay datos en ${almacen}`);
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
      if (!r.disponible) return setError(`${almacen} no está disponible en este teléfono${r.motivo ? ` (${r.motivo})` : ''}.`);
      setPermitidos(r.permitidos);
      if (r.permitidos.length) void mandar();
      else setError(`No diste permiso para leer nada de ${almacen}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="tarjeta">
      <h3>Reloj y salud</h3>
      <label className="opcion">
        <input type="checkbox" checked={activo} onChange={(e) => void prender(e.target.checked)} />
        <span>Traer de {almacen} el sueño, los pasos, el pulso, las calorías y más, un resumen por día.</span>
      </label>
      <p className="suave chico">
        Patty lee lo que la app de tu reloj deja en {almacen}
        {plataforma() === 'ios'
          ? ' (Apple Watch y la mayoría de los relojes lo hacen).'
          : ': Samsung Health, Fitbit, Google Fit, Mi Fitness, Zepp, OHealth y otras lo hacen; fijate en la app del reloj que esté prendido "Health Connect".'}{' '}
        Se manda al abrir Patty, los últimos 7 días.
      </p>
      {permitidos ? (
        <p className="chico">
          {permitidos.length
            ? `Puede leer: ${permitidos.map((p) => NOMBRES[p] ?? p).join(', ')}.`
            : activo
              ? `Sin permisos todavía para ${LEER.length} tipos de datos.`
              : ''}
        </p>
      ) : null}
      {activo ? (
        <div className="fila">
          <button className="btn" disabled={mandando} onClick={() => void mandar()}>{mandando ? 'Mandando…' : 'Mandar ahora'}</button>
          <button className="btn" onClick={() => void prender(true)}>Permisos</button>
        </div>
      ) : null}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
