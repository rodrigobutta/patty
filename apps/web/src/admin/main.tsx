// La administración: una página aparte, con su propio código, para que nada de esto viaje en la app que usa todo el
// mundo. Corre en su propio servidor (admin.patty.today, MODO=admin) o, si no, en patty.today/admin. Se entra con usuario
// y clave de un administrador; no carga personas ni categorías (no las usa).
import { StrictMode, useCallback, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Sesion } from 'shared';
import { api, cuandoSePierdaLaSesion } from '../api';
import { ContextoEstado, type Estado, type Fase } from '../estado';
import '../estilos.css';
import { escucharErrores } from '../lib/errores';
import { t } from '../lib/idioma';
import { Admin } from '../pantallas/Admin';

escucharErrores();

const nada = () => {};

function EstadoAdmin({ children }: { children: React.ReactNode }) {
  const [fase, setFase] = useState<Fase>('arrancando');
  const [error, setError] = useState('');
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [aviso, setAviso] = useState('');
  const avisar = useCallback((x: string) => {
    setAviso(x);
    setTimeout(() => setAviso((a) => (a === x ? '' : a)), 2500);
  }, []);
  const arrancar = useCallback(async () => {
    try {
      const s = await api<Sesion>('GET', '/api/sesion');
      setSesion(s);
      setFase(s.usuario ? 'listo' : 'entrar');
    } catch (e) {
      setError((e as Error).message);
      setFase('error');
    }
  }, []);
  useEffect(() => {
    cuandoSePierdaLaSesion(() => setFase('entrar'));
    void arrancar();
  }, [arrancar]);
  const valor: Estado = {
    fase, error, sesion, usuario: sesion?.usuario ?? null, personas: [], persona: null, categorias: [],
    elegirPersona: nada, recargar: async () => {}, cambiarUsuario: nada,
    entro: async () => arrancar(),
    salir: async () => {
      await api('POST', '/api/salir').catch(() => {});
      setFase('entrar');
    },
    aviso, avisar, festejo: null, festejar: nada, terminarFestejo: nada,
  };
  return <ContextoEstado.Provider value={valor}>{children}</ContextoEstado.Provider>;
}

function EntrarAdmin({ alEntrar }: { alEntrar(): void }) {
  const [error, setError] = useState('');
  const [entrando, setEntrando] = useState(false);
  const entrar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    setError('');
    setEntrando(true);
    try {
      await api('POST', '/api/entrar', d);
      alEntrar();
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setEntrando(false);
    }
  };
  return (
    <form className="tarjeta admin-sin-acceso" onSubmit={entrar}>
      <h2>🛠️ {t('Administración de Patty')}</h2>
      <label>{t('Usuario')}<input name="usuario" required autoCapitalize="none" autoComplete="username" /></label>
      <label>{t('Clave')}<input name="clave" type="password" required autoComplete="current-password" /></label>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" disabled={entrando}>{entrando ? t('Entrando…') : t('Entrar')}</button>
    </form>
  );
}

function AppAdmin() {
  const { fase, error, usuario, aviso, entro, salir } = useEstadoAdmin();
  // Volver a la app: si la administración está en su propio dominio, a patty.today.
  const aLaApp = () => location.assign(location.hostname.startsWith('admin.') ? 'https://patty.today/app/' : '/app/');
  if (fase === 'arrancando') return <p className="suave centro">{t('Cargando…')}</p>;
  if (fase === 'error') return <p className="neg centro">{error}</p>;
  if (fase !== 'listo') return <EntrarAdmin alEntrar={() => void entro()} />;
  if (usuario?.rol !== 'admin') {
    return (
      <main className="admin-sin-acceso">
        <h2>🛠️ {t('Administración')}</h2>
        <p className="suave">{t('Solo los administradores pueden entrar acá.')}</p>
        <button className="btn" onClick={() => void salir()}>{t('Entrar con otro usuario')}</button>
      </main>
    );
  }
  return (
    <>
      <main>
        <Admin alVolver={aLaApp} />
      </main>
      {aviso ? <div className="aviso" role="status">{aviso}</div> : null}
    </>
  );
}

function useEstadoAdmin(): Estado {
  return useContext(ContextoEstado)!;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EstadoAdmin>
      <AppAdmin />
    </EstadoAdmin>
  </StrictMode>,
);
