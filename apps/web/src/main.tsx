import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { EstadoProvider } from './estado';
import './estilos.css';
import { escucharErrores } from './lib/errores';

// Lo que falle sin esperarlo queda anotado en el admin (Salud).
escucharErrores();

// App instalable: al publicar una versión nueva se actualiza sola (se busca al abrir, al volver y cada 30 minutos).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const buscar = () => {
      if (navigator.onLine) reg.update().catch(() => {});
    };
    setInterval(buscar, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') buscar();
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EstadoProvider>
      <App />
    </EstadoProvider>
  </StrictMode>,
);
