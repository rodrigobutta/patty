// Publica la app de Android de una sola vez, para que no queden versiones a medias: compila, la instala en el teléfono
// conectado (si hay uno) y sube el APK firmado a GitHub Releases, de donde la bajan todos (patty.today/descargar/android);
// el servidor lo detecta solo y les avisa a quienes tienen una más vieja. Correr después de subir un cambio nativo:
//   pnpm --filter web movil:publicar
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(web, 'android');
const { version } = JSON.parse(readFileSync(path.join(web, 'package.json'), 'utf8'));
const correr = (cmd, args, cwd = web) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const salida = (cmd, args) => spawnSync(cmd, args, { cwd: web, encoding: 'utf8' });

console.log(`Patty ${version}: compilando…`);
correr('npx', ['cap', 'sync', 'android']);
correr('./gradlew', ['-q', 'assembleDebug', 'assembleRelease'], android);

// Por USB va la de debug, firmada con la misma llave que la de la web (una se instala encima de la otra).
const conectado = (salida('adb', ['devices']).stdout ?? '').split('\n').slice(1).some((l) => /\tdevice$/.test(l));
if (conectado) {
  const r = salida('adb', ['install', '-r', path.join(android, 'app/build/outputs/apk/debug/app-debug.apk')]);
  if (r.status === 0) console.log('✓ Instalada en el teléfono conectado');
  else if (/UPDATE_INCOMPATIBLE/.test(`${r.stdout}${r.stderr}`)) console.log('⚠️  El teléfono tiene una app firmada con otra llave: NO se instaló. Hay que desinstalarla una vez y volver a instalar.');
  else console.log(`⚠️  NO se instaló: ${r.stdout}${r.stderr}`);
} else {
  console.log('⚠️  No hay ningún teléfono conectado: NO se instaló. Enchufalo y volvé a correr esto (o bajala de la web).');
}

const etiqueta = `v${version}`;
if (salida('gh', ['release', 'view', etiqueta]).status === 0) {
  console.log(`✓ ${etiqueta} ya estaba publicada en GitHub`);
} else {
  const carpeta = mkdtempSync(path.join(tmpdir(), 'patty-apk-'));
  const apk = path.join(carpeta, 'patty.apk');
  copyFileSync(path.join(android, 'app/build/outputs/apk/release/app-release.apk'), apk);
  correr('gh', ['release', 'create', etiqueta, apk, '--title', `Patty ${version} para Android`, '--notes', `La app de Android de la versión ${version}.`]);
  rmSync(carpeta, { recursive: true, force: true });
  console.log(`✓ ${etiqueta} publicada: patty.today/descargar/android`);
}
