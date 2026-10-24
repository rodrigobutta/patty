// Desarrollo con la app nativa: levanta Vite y abre la app en el emulador o el teléfono apuntando a él, con recarga
// en vivo. Los cambios de la web se ven al guardar; solo hay que volver a correr esto si cambia algo nativo.
//   node movil/dev.mjs android          emulador o teléfono por cable (usa "adb reverse": el teléfono ve localhost)
//   node movil/dev.mjs ios              simulador de iPhone
//   node movil/dev.mjs android --wifi   teléfono en la misma red que la Mac (sin cable)
// Vite usa el puerto 5173 (o PUERTO_WEB) y manda /api a API_PROXY, como `pnpm dev:web`.
import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const PUERTO = Number(process.env.PUERTO_WEB) || 5173;
const [plataforma = 'android', ...resto] = process.argv.slice(2);
const porWifi = resto.includes('--wifi');
const extra = resto.filter((a) => a !== '--wifi');

function ipDeLaRed() {
  for (const lista of Object.values(networkInterfaces()))
    for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  throw new Error('No encontré la IP de la Mac en la red.');
}

// "localhost" es un origen seguro (la ubicación y el service worker lo piden); por wifi no queda otra que la IP.
const host = porWifi ? ipDeLaRed() : 'localhost';
const correr = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } });

const vite = correr('pnpm', ['exec', 'vite', '--host', '--port', String(PUERTO), '--strictPort']);
const terminar = () => {
  vite.kill();
  process.exit();
};
process.on('SIGINT', terminar);

// Espera a que Vite conteste antes de abrir la app.
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`http://localhost:${PUERTO}/`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const args = ['exec', 'cap', 'run', plataforma, '--live-reload', '--host', host, '--port', String(PUERTO), ...extra];
if (plataforma === 'android' && !porWifi) args.push('--forwardPorts', `${PUERTO}:${PUERTO}`);
correr('pnpm', args).on('exit', (codigo) => {
  if (codigo) terminar();
  // Por las dudas, el "adb reverse" a mano en cada dispositivo conectado (si adb se reinició, Capacitor no lo deja).
  if (plataforma === 'android' && !porWifi) {
    const adb = process.env.ANDROID_HOME ? `${process.env.ANDROID_HOME}/platform-tools/adb` : 'adb';
    spawnSync(adb, ['reverse', `tcp:${PUERTO}`, `tcp:${PUERTO}`]);
    const lista = spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout.split('\n').slice(1);
    for (const l of lista) {
      const [id, estado] = l.trim().split(/\s+/);
      if (estado === 'device') spawnSync(adb, ['-s', id, 'reverse', `tcp:${PUERTO}`, `tcp:${PUERTO}`]);
    }
  }
  console.log(`\nPatty abierta en ${plataforma} contra http://${host}:${PUERTO}. Ctrl+C para cortar.`);
});
