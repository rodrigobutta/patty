import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EstadoProvider } from './estado';
import './estilos.css';
import { escucharErrores } from './lib/errores';
import { prepararActualizaciones } from './lib/actualizar';

// La administración es una página aparte (patty.today/admin, con su propio código): el link viejo #admin lleva ahí.
if (location.hash === '#admin') location.replace('/admin/');

// Lo que falle sin esperarlo queda anotado en el admin (Salud).
escucharErrores();

// Las versiones nuevas se buscan al abrir, al volver y cada 30 minutos, y se aplican sin cortar lo que se está haciendo.
prepararActualizaciones();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EstadoProvider>
      <App />
    </EstadoProvider>
  </StrictMode>,
);
