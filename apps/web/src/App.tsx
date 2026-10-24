import { useCallback, useState } from 'react';
import { useEstado } from './estado';
import { useClimaDeLasUltimasHoras } from './lib/clima';
import { useEncuesta, useIrAlDiaConElAviso } from './lib/encuesta';
import { pedirSentir } from './lib/sentir';
import { useSalud } from './lib/salud';
import { useDatosDelTelefono } from './lib/telefono';
import { useCara } from './mascota/cara';
import { Festejo } from './mascota/Festejo';
import { Mascota } from './mascota/Mascota';
import { useSeguirUbicacion } from './lib/ubicacion';
import { Entrar } from './pantallas/Entrar';
import { Hoy } from './pantallas/Hoy';
import { Mas } from './pantallas/Mas';
import { NuevaPersona } from './pantallas/NuevaPersona';
import { Patrones } from './pantallas/Patrones';

type Pestana = 'hoy' | 'patrones' | 'mas';

const PESTANAS: Array<{ id: Pestana; icono: string; nombre: string }> = [
  { id: 'hoy', icono: '📅', nombre: 'Día' },
  { id: 'patrones', icono: '✨', nombre: 'Patrones' },
  { id: 'mas', icono: '☰', nombre: 'Más' },
];

export function App() {
  const { fase, error, persona, personas, elegirPersona, aviso } = useEstado();
  const [pestana, setPestana] = useState<Pestana>('hoy');
  useSeguirUbicacion(fase === 'listo' ? persona?.id : undefined);
  useDatosDelTelefono(fase === 'listo' ? persona?.id : undefined);
  useSalud(fase === 'listo' ? persona?.id : undefined);
  useClimaDeLasUltimasHoras(fase === 'listo' ? persona?.id : undefined);
  const cara = useCara(fase === 'listo' ? persona : null);
  useEncuesta();
  useIrAlDiaConElAviso(useCallback(() => setPestana('hoy'), []));

  if (fase === 'arrancando') return <div className="centro suave">Abriendo Patty…</div>;
  if (fase === 'error') return <div className="centro"><p className="neg">{error}</p><button className="btn" onClick={() => location.reload()}>Reintentar</button></div>;
  if (fase === 'entrar' || fase === 'configurar') return <Entrar configurar={fase === 'configurar'} />;
  if (!persona) return <NuevaPersona primera />;

  return (
    <div className="app">
      <header className="barra">
        <button className="marca" onClick={() => { setPestana('hoy'); pedirSentir(); }} aria-label="Patty: contale cómo te sentís">
          {cara ? <Mascota cara={cara} tamano={34} /> : null}
          Patty
        </button>
        {personas.length > 1 ? (
          <select className="persona" value={persona.id} onChange={(e) => elegirPersona(Number(e.target.value))} aria-label="Persona">
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        ) : (
          <span className="persona">{persona.nombre}</span>
        )}
      </header>
      <main>
        {pestana === 'hoy' ? <Hoy persona={persona} cara={cara} /> : pestana === 'patrones' ? <Patrones persona={persona} /> : <Mas />}
      </main>
      <nav className="pestanas">
        {PESTANAS.map((p) => (
          <button key={p.id} className={pestana === p.id ? 'activa' : ''} onClick={() => setPestana(p.id)}>
            <span aria-hidden>{p.icono}</span>
            {p.nombre}
          </button>
        ))}
      </nav>
      {aviso ? <div className="aviso" role="status">{aviso}</div> : null}
      <Festejo />
    </div>
  );
}
