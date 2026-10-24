import { useCallback, useEffect, useState } from 'react';
import { useEstado } from './estado';
import { useClimaDeLasUltimasHoras } from './lib/clima';
import { alPedirIrAlDia } from './lib/avisos';
import { useEncuesta, useIrAlDiaConElAviso } from './lib/encuesta';
import { alTocarAvisoPush, usePush } from './lib/push';
import { useRecordatorios } from './lib/remedios';
import { pedirSentir } from './lib/sentir';
import { useSalud } from './lib/salud';
import { useDatosDelTelefono } from './lib/telefono';
import { useCara } from './mascota/cara';
import { Festejo } from './mascota/Festejo';
import { Mascota } from './mascota/Mascota';
import { useSeguirUbicacion } from './lib/ubicacion';
import { Bienvenida, bienvenidaVista } from './pantallas/Bienvenida';
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
  const { fase, error, persona, personas, elegirPersona, aviso, sesion } = useEstado();
  const [pestana, setPestana] = useState<Pestana>('hoy');
  const [bienvenida, setBienvenida] = useState(() => !bienvenidaVista());
  // Lo que junta solo el teléfono (ubicación, llamadas, reloj, clima) va siempre a la persona propia, aunque se esté
  // mirando el día de alguien que se supervisa.
  const propia = personas.find((p) => p.propia) ?? (persona && !persona.supervisada ? persona : undefined);
  const deEsteTelefono = fase === 'listo' ? propia?.id : undefined;
  useSeguirUbicacion(deEsteTelefono);
  useDatosDelTelefono(deEsteTelefono);
  useSalud(deEsteTelefono);
  useClimaDeLasUltimasHoras(deEsteTelefono);
  const cara = useCara(fase === 'listo' ? persona : null);
  useEncuesta();
  useIrAlDiaConElAviso(useCallback(() => setPestana('hoy'), []));
  useRecordatorios(fase === 'listo');
  usePush(fase === 'listo', Boolean(sesion?.push));
  useEffect(() => alPedirIrAlDia(() => setPestana('hoy')), []);
  // Un aviso push de otra persona (una que se supervisa) la elige; uno de supervisión lleva a Más.
  useEffect(
    () =>
      alTocarAvisoPush((d) => {
        if (d.tipo === 'supervision') setPestana('mas');
        if (d.persona_id && personas.some((p) => p.id === Number(d.persona_id))) elegirPersona(Number(d.persona_id));
      }),
    [personas, elegirPersona],
  );

  if (fase === 'arrancando') return <div className="centro suave">Abriendo Patty…</div>;
  if (fase === 'error') return <div className="centro"><p className="neg">{error}</p><button className="btn" onClick={() => location.reload()}>Reintentar</button></div>;
  if (fase === 'entrar' || fase === 'configurar') return <Entrar configurar={fase === 'configurar'} />;
  if (bienvenida) return <Bienvenida alTerminar={() => setBienvenida(false)} />;
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
