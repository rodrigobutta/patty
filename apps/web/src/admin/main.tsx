// La administración (patty.today/admin): una página aparte, con su propio código, para que nada de esto viaje en la
// app que usa todo el mundo. Usa la misma sesión que la app; si no hay o no es de un administrador, lo dice.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EstadoProvider, useEstado } from '../estado';
import '../estilos.css';
import { escucharErrores } from '../lib/errores';
import { t } from '../lib/idioma';
import { Admin } from '../pantallas/Admin';

escucharErrores();

function AppAdmin() {
  const { fase, error, usuario, aviso } = useEstado();
  const aLaApp = () => location.assign('/app/');
  if (fase === 'arrancando') return <p className="suave centro">{t('Cargando…')}</p>;
  if (fase !== 'listo' || usuario?.rol !== 'admin') {
    return (
      <main className="admin-sin-acceso">
        <h2>🛠️ {t('Administración')}</h2>
        <p className="suave">{fase === 'error' ? error : fase === 'listo' ? t('Solo los administradores pueden entrar acá.') : t('Entrá a Patty con tu usuario de administrador y volvé.')}</p>
        <button className="btn primario" onClick={() => location.assign('/app/#entrar')}>{t('Ir a Patty')}</button>
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EstadoProvider>
      <AppAdmin />
    </EstadoProvider>
  </StrictMode>,
);
