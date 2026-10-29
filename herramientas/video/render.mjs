// Renderiza los dos videos (horizontal para la home, vertical para redes) y los deja en la presentación de la web
// (apps/web/public/presentacion), con una imagen de portada de cada uno.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const destino = path.join(aqui, '../../apps/web/public/presentacion');
const remotion = (args) => execFileSync('npx', ['remotion', ...args, '--log=error'], { cwd: aqui, stdio: 'inherit' });

for (const [id, nombre] of [['Historia', 'historia'], ['HistoriaVertical', 'historia-vertical']]) {
  remotion(['render', 'src/index.ts', id, path.join(destino, `${nombre}.mp4`), '--codec=h264', '--crf=24']);
  // La portada: un momento con el teléfono a la vista (la escena de anotar).
  remotion(['still', 'src/index.ts', id, path.join(destino, `${nombre}.jpg`), '--frame=330', '--image-format=jpeg', '--jpeg-quality=80']);
  console.log(`✓ ${nombre}`);
}
