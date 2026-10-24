// "Para que Patty te ayude más": activar, uno por uno y explicado, lo que la app puede hacer sola (avisos, ubicación,
// uso del teléfono y llamadas, salud). Se ofrece una vez después de la bienvenida (todo salteable) y se puede volver a
// abrir desde Más. Cada fila dice para qué sirve, tiene su botón y queda tildada cuando el permiso está dado; al volver
// de los ajustes del teléfono se vuelve a mirar.
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { useCallback, useEffect, useState } from 'react';
import type { Persona } from 'shared';
import { permisoAvisos } from '../lib/avisos';
import { ponerClima } from '../lib/clima';
import { leerEstado, reportarEstado, type EstadoTelefono } from '../lib/estadoTelefono';
import { esNativa, plataforma } from '../lib/nativo';
import { programarRecordatorios } from '../lib/remedios';
import { pedirPermisoSalud, ponerSalud, sincronizarSalud } from '../lib/salud';
import { hayDatosDelTelefono, ponerDatos, sincronizar, Telefono } from '../lib/telefono';
import { ponerSeguimiento } from '../lib/ubicacion';
import { Mascota } from '../mascota/Mascota';

const CLAVE = 'permisos-ofrecidos';

/** Si todavía no se ofreció este paso en este teléfono (solo en la app nativa: en la web casi no hay permisos). */
export function ofrecerPermisos(): boolean {
  if (!esNativa()) return false;
  try {
    return localStorage.getItem(CLAVE) !== 'si';
  } catch {
    return false;
  }
}
const yaOfrecido = () => {
  try {
    localStorage.setItem(CLAVE, 'si');
  } catch {
    /* sin almacenamiento */
  }
};

type Paso = 'avisos' | 'ubicacion' | 'telefono' | 'salud';

export function Permisos({ persona, bienvenida = false, alTerminar }: { persona: Persona; bienvenida?: boolean; alTerminar(): void }) {
  const [estado, setEstado] = useState<EstadoTelefono | null>(null);
  const [ocupado, setOcupado] = useState<Paso | null>(null);
  const [nota, setNota] = useState<Partial<Record<Paso, string>>>({});

  const mirar = useCallback(() => void leerEstado().then(setEstado), []);
  // Al volver de los ajustes del teléfono se vuelve a mirar.
  useEffect(() => {
    mirar();
    const f = () => document.visibilityState === 'visible' && mirar();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [mirar]);

  const hacer = async (paso: Paso, f: () => Promise<string | void>) => {
    setOcupado(paso);
    try {
      const n = await f();
      setNota((x) => ({ ...x, [paso]: n ?? '' }));
    } catch (e) {
      setNota((x) => ({ ...x, [paso]: (e as Error).message }));
    } finally {
      setOcupado(null);
      mirar();
    }
  };

  const avisos = () =>
    hacer('avisos', async () => {
      if (!(await permisoAvisos())) return 'El teléfono no lo dejó: activalo en Ajustes → Notificaciones → Patty.';
      await programarRecordatorios();
    });

  const ubicacion = () =>
    hacer('ubicacion', async () => {
      const p = await BackgroundGeolocation.requestPermissions().catch(() => null);
      ponerClima(true);
      ponerSeguimiento(true);
      const fondo = p?.backgroundLocation === 'granted' || (p?.backgroundLocation as string) === 'always';
      if (!fondo) {
        return plataforma() === 'ios'
          ? 'Para contar viajes con la app cerrada, en Ajustes → Patty → Ubicación elegí «Siempre».'
          : 'Para contar viajes con la app cerrada, en los ajustes elegí «Permitir todo el tiempo».';
      }
    });

  const telefono = () =>
    hacer('telefono', async () => {
      ponerDatos(true);
      const p = await Telefono.pedirPermisoLlamadas().catch(() => null);
      if (p?.uso !== 'granted') {
        // El acceso al uso de apps se da en una pantalla de Ajustes: se abre y al volver se mira de nuevo.
        await Telefono.pedirPermisoUso();
        return 'En la lista que se abre, buscá Patty y activá «Permitir acceso al uso». Después volvé acá.';
      }
      void sincronizar(persona.id).catch(() => {});
    });

  const salud = () =>
    hacer('salud', async () => {
      ponerSalud(true);
      const r = await pedirPermisoSalud();
      if (!r.disponible) {
        return plataforma() === 'android'
          ? 'Este teléfono no tiene Health Connect. Se instala desde Play Store (es de Google) y después volvés acá.'
          : 'Este teléfono no tiene Salud disponible.';
      }
      if (!r.permitidos.length) return 'No se dio permiso a ningún dato. Podés volver a intentarlo cuando quieras.';
      void sincronizarSalud(persona.id).catch(() => {});
      return plataforma() === 'android' ? 'Listo. Si usás un reloj, revisá que su app comparta los datos con Health Connect.' : undefined;
    });

  const terminar = () => {
    yaOfrecido();
    void reportarEstado(true);
    alTerminar();
  };

  const p = estado?.permisos;
  const filas: Array<{ paso: Paso; icono: string; titulo: string; para: string; listo: boolean; parcial?: boolean; accion(): void; mostrar: boolean }> = [
    {
      paso: 'avisos',
      icono: '🔔',
      titulo: 'Avisos',
      para: 'Para recordarte cada toma de un remedio y preguntarte a la noche cómo te fue.',
      listo: p?.avisos === 'si',
      accion: avisos,
      mostrar: true,
    },
    {
      paso: 'ubicacion',
      icono: '📍',
      titulo: 'Ubicación',
      para: 'Para anotar el clima de cada momento y contar tus viajes y lugares, sola.',
      listo: p?.ubicacion === 'siempre',
      parcial: p?.ubicacion === 'en_uso',
      accion: ubicacion,
      mostrar: true,
    },
    {
      paso: 'telefono',
      icono: '📱',
      titulo: 'Uso del teléfono y llamadas',
      para: 'Cuánto usás cada app y cuántas llamadas hacés (nunca números ni nombres).',
      listo: p?.uso_apps === 'si' && p?.llamadas === 'si',
      parcial: p?.uso_apps === 'si' || p?.llamadas === 'si',
      accion: telefono,
      mostrar: hayDatosDelTelefono(),
    },
    {
      paso: 'salud',
      icono: '⌚',
      titulo: plataforma() === 'ios' ? 'Salud' : 'Reloj y salud',
      para: 'Tu sueño, pasos y pulso, desde el reloj o el teléfono.',
      listo: typeof p?.salud === 'number' && p.salud > 0,
      accion: salud,
      mostrar: true,
    },
  ];
  const visibles = filas.filter((f) => f.mostrar);
  const listos = visibles.filter((f) => f.listo).length;

  return (
    <div className={bienvenida ? 'perfil perfil-bienvenida permisos' : 'hoja perfil permisos'} role={bienvenida ? undefined : 'dialog'} aria-label="Permisos">
      <div className="hoja-cabeza">
        <h3>{bienvenida ? 'Para que te ayude más' : 'Permisos de este teléfono'}</h3>
        {bienvenida ? <button className="enlace" onClick={terminar}>Ahora no</button> : <button className="btn-icono" onClick={terminar} aria-label="Cerrar">✕</button>}
      </div>
      <p className="suave chico">
        Con esto Patty junta datos sola y te avisa. Todo es opcional: activá lo que quieras, ahora o después desde Más.
      </p>
      <ul className="lista-permisos">
        {visibles.map((f) => (
          <li key={f.paso} className={f.listo ? 'listo' : ''}>
            <span className="icono-permiso">{f.icono}</span>
            <span className="que">
              <strong>{f.titulo}</strong>
              <span className="suave chico renglon-sub">{f.para}</span>
              {nota[f.paso] ? <span className="chico renglon-sub nota-permiso">{nota[f.paso]}</span> : null}
            </span>
            {f.listo ? (
              <span className="tilde" aria-label="Activado">✓</span>
            ) : (
              <button className={`btn chico ${f.parcial ? '' : 'primario'}`} disabled={ocupado !== null} onClick={f.accion}>
                {ocupado === f.paso ? '…' : f.parcial ? 'Completar' : 'Activar'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {listos === visibles.length ? (
        <div className="todo-listo">
          <Mascota cara="feliz" tamano={44} />
          <span>¡Todo listo! Ya puedo ayudarte un montón.</span>
        </div>
      ) : null}
      <button className="btn primario ancho" onClick={terminar}>{listos ? 'Listo' : 'Seguir sin activar'}</button>
    </div>
  );
}
