import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useEstado } from './estado';
import { useClimaDeLasUltimasHoras } from './lib/clima';
import { alPedirIrAlDia } from './lib/avisos';
import { useEncuesta, useIrAlDiaConElAviso } from './lib/encuesta';
import { alTocarAvisoPush, usePush } from './lib/push';
import { marcarToma, useRecordatorios } from './lib/remedios';
import { pedirSentir } from './lib/sentir';
import { useSalud } from './lib/salud';
import { useDatosDelTelefono } from './lib/telefono';
import { useCara } from './mascota/cara';
import { Festejo } from './mascota/Festejo';
import { Mascota } from './mascota/Mascota';
import { useSeguirUbicacion } from './lib/ubicacion';
import { Admin } from './pantallas/Admin';
import { Bienvenida, bienvenidaVista } from './pantallas/Bienvenida';
import { Entrar } from './pantallas/Entrar';
import { Hoy } from './pantallas/Hoy';
import { Mas } from './pantallas/Mas';
import { NuevaPersona } from './pantallas/NuevaPersona';
import { Avatar } from './ui/Avatar';
import { Patrones } from './pantallas/Patrones';
import { IconoDia, IconoMas, IconoPatrones } from './ui/Iconos';
import { useProgreso } from './lib/progreso';
import { avanceProgreso } from 'shared';
import { ofrecerPerfil, Perfil } from './pantallas/Perfil';
import { ofrecerPermisos, pedirGuia, Permisos, type Paso } from './pantallas/Permisos';
import { useReportarEstado } from './lib/estadoTelefono';
import { t } from './lib/idioma';

type Pestana = 'hoy' | 'patrones' | 'mas' | 'admin';

const PESTANAS: Array<{ id: Pestana; nombre: string }> = [
  { id: 'hoy', nombre: t('Día') },
  { id: 'patrones', nombre: t('Patrones') },
  { id: 'mas', nombre: t('Más') },
];

export function App() {
  const { fase, error, persona, personas, elegirPersona, aviso, sesion, avisar, festejar, recargar } = useEstado();
  // patty.today/#admin abre la administración directo (para mirarla en la compu).
  const [pestana, setPestana] = useState<Pestana>(() => (location.hash === '#admin' ? 'admin' : 'hoy'));
  // Cada pestaña arranca arriba de todo (si no, queda el scroll de la anterior).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pestana]);
  const [bienvenida, setBienvenida] = useState(() => !bienvenidaVista());
  /** El paso opcional de datos de la persona (una vez, después de la bienvenida). */
  const [perfilListo, setPerfilListo] = useState(false);
  /** Y el de permisos (avisos, ubicación, teléfono, salud), una vez por teléfono. */
  const [permisosListo, setPermisosListo] = useState(false);
  // Lo que junta solo el teléfono (ubicación, llamadas, reloj, clima) va siempre a la persona propia, aunque se esté
  // mirando el día de alguien que se supervisa.
  const propia = personas.find((p) => p.propia) ?? (persona && !persona.supervisada ? persona : undefined);
  const deEsteTelefono = fase === 'listo' ? propia?.id : undefined;
  useSeguirUbicacion(deEsteTelefono);
  useDatosDelTelefono(deEsteTelefono);
  useSalud(deEsteTelefono);
  useClimaDeLasUltimasHoras(deEsteTelefono);
  const cara = useCara(fase === 'listo' ? persona : null);
  useEncuesta(fase === 'listo');
  useIrAlDiaConElAviso(useCallback(() => setPestana('hoy'), []));
  useRecordatorios(fase === 'listo');
  useReportarEstado(fase === 'listo');
  const progreso = useProgreso(fase === 'listo' ? persona?.id : undefined);
  const avance = progreso ? avanceProgreso(progreso) : { avance: 0, nivel: 0 };
  usePush(fase === 'listo', Boolean(sesion?.push));
  useEffect(() => alPedirIrAlDia(() => setPestana('hoy')), []);
  // Un aviso push de otra persona (una que se supervisa) la elige; uno de supervisión lleva a Más.
  useEffect(
    () =>
      alTocarAvisoPush((d) => {
        if (d.tipo === 'supervision') {
          setPestana('mas');
          // "Aceptar" o "No" tocado en el aviso de la invitación.
          if (d.supervision_id && (d.accion === 'aceptar' || d.accion === 'rechazar')) {
            void api('POST', `/api/supervision/${d.supervision_id}/responder`, { aceptar: d.accion === 'aceptar' })
              .then(() => {
                avisar(d.accion === 'aceptar' ? t('Listo, aceptaste la supervisión') : t('Listo, no aceptaste'));
                window.dispatchEvent(new Event('patty-supervision'));
                return recargar();
              })
              .catch((e: Error) => avisar(e.message));
          }
        }
        // Un permiso que falta: Más, con los pasos para darlo en este teléfono.
        if (d.tipo === 'permiso' && ['avisos', 'ubicacion', 'telefono', 'salud'].includes(d.permiso)) {
          setPestana('mas');
          pedirGuia(d.permiso as Paso);
        }
        // "La tomé", "No la tomo" o "Las tomé todas" tocado en el aviso de remedios.
        if (d.tipo === 'toma' && d.tomas && (d.accion === 'tomada' || d.accion === 'salteada')) {
          const estado = d.accion;
          void (async () => {
            const tomas = JSON.parse(d.tomas) as Array<{ tratamiento_id: number; programada: string }>;
            for (const x of tomas) await marcarToma(x, estado);
            if (estado === 'salteada') festejar(t('¡Ey! Anotado que no la tomaste… La próxima no te la saltees 😤'), 'enojada');
            else festejar(tomas.length > 1 ? t('¡Bien! Marqué {n} tomas 💊', { n: tomas.length }) : t('¡Bien! Anotado 💊'));
          })().catch((e: Error) => avisar(e.message));
        }
        if (d.persona_id && personas.some((p) => p.id === Number(d.persona_id))) elegirPersona(Number(d.persona_id));
      }),
    [personas, elegirPersona, avisar, festejar, recargar],
  );

  if (fase === 'arrancando') return <div className="centro suave">{t('Abriendo Patty…')}</div>;
  if (fase === 'error') return <div className="centro"><p className="neg">{error}</p><button className="btn" onClick={() => location.reload()}>{t('Reintentar')}</button></div>;
  if (fase === 'entrar' || fase === 'configurar') return <Entrar configurar={fase === 'configurar'} />;
  if (bienvenida) return <Bienvenida alTerminar={() => setBienvenida(false)} />;
  if (!persona) return <NuevaPersona primera />;
  if (!permisosListo && ofrecerPermisos() && (perfilListo || !ofrecerPerfil(persona))) {
    return (
      <div className="bienvenida perfil-paso">
        <Mascota cara="feliz" tamano={90} className="saluda" />
        <Permisos persona={propia ?? persona} bienvenida alTerminar={() => setPermisosListo(true)} />
      </div>
    );
  }
  if (!perfilListo && ofrecerPerfil(persona)) {
    return (
      <div className="bienvenida perfil-paso">
        <Mascota cara="feliz" tamano={90} className="saluda" />
        <Perfil persona={persona} bienvenida alTerminar={() => setPerfilListo(true)} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="barra">
        <button className="marca" onClick={() => { setPestana('hoy'); pedirSentir(); }} aria-label={t('Patty: contale cómo te sentís')}>
          {cara ? <Mascota cara={cara} tamano={34} /> : null}
          Patty
        </button>
        {personas.length > 1 ? (
          <select className="persona" value={persona.id} onChange={(e) => elegirPersona(Number(e.target.value))} aria-label={t('Persona')}>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        ) : (
          <span className="persona">{persona.nombre}</span>
        )}
        {sesion?.usuario ? (
          <button className="btn-avatar" onClick={() => setPestana('mas')} aria-label={t('Tu cuenta')}>
            <Avatar foto={sesion.usuario.foto} nombre={sesion.usuario.apodo || sesion.usuario.nombre} tamano={32} />
          </button>
        ) : null}
      </header>
      <main>
        {pestana === 'admin' && sesion?.usuario?.rol === 'admin' ? (
          <Admin alVolver={() => { setPestana('mas'); if (location.hash) history.replaceState(null, '', location.pathname); }} />
        ) : pestana === 'hoy' ? <Hoy persona={persona} cara={cara} /> : pestana === 'patrones' ? <Patrones persona={persona} progreso={progreso} /> : <Mas alAdministrar={() => setPestana('admin')} />}
      </main>
      <nav className="pestanas">
        {PESTANAS.map((p) => (
          <button key={p.id} className={pestana === p.id ? 'activa' : ''} onClick={() => setPestana(p.id)}>
            {p.id === 'hoy' ? (
              <IconoDia activo={pestana === p.id} />
            ) : p.id === 'patrones' ? (
              <IconoPatrones activo={pestana === p.id} avance={avance.avance} nivel={avance.nivel} />
            ) : (
              <IconoMas activo={pestana === p.id} />
            )}
            {p.nombre}
          </button>
        ))}
      </nav>
      {aviso ? <div className="aviso" role="status">{aviso}</div> : null}
      <Festejo />
    </div>
  );
}
