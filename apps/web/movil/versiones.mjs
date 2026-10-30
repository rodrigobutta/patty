// Dónde está cada versión de Patty, para no probar sobre algo viejo sin saberlo: el repo, lo que corre en producción, el
// último APK publicado, lo que tiene el teléfono conectado y si hay cambios nativos sin publicar. Sale con error si algo
// quedó atrás (sirve para correrlo antes de decir "ya está").
//   pnpm --filter web movil:versiones
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const correr = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: web, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const repo = JSON.parse(readFileSync(path.join(web, 'package.json'), 'utf8')).version;
const sesion = await fetch('https://patty.today/api/sesion').then((r) => r.json()).catch(() => null);
const etiqueta = correr('gh', ['release', 'view', '--json', 'tagName', '-q', '.tagName']);
const telefono = /versionName=(\S+)/.exec(correr('adb', ['shell', 'dumpsys', 'package', 'ar.patty.app']) ?? '')?.[1] ?? null;
correr('git', ['fetch', '-q', '--tags', 'origin']);
const nativos = etiqueta ? (correr('git', ['diff', '--name-only', etiqueta, 'HEAD', '--', 'android', 'capacitor.config.ts']) ?? '').split('\n').filter((l) => l && !l.includes('/assets/public')) : [];
// El nativo del teléfono: el commit de su versión no se sabe, así que se compara contra el último cambio nativo.
const versionDelUltimoNativo = correr('git', ['log', '-1', '--format=%H', '--', 'android', 'capacitor.config.ts']);
const pkgEn = (c) => { try { return JSON.parse(correr('git', ['show', `${c}:./package.json`]) ?? '{}').version ?? null; } catch { return null; } };
const minimoNativo = versionDelUltimoNativo ? pkgEn(versionDelUltimoNativo) : null;

const n = (v) => (v ?? '0').split('.').map(Number);
const menor = (a, b) => { const x = n(a); const y = n(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
const problemas = [];
if (!/^\d+\.\d+\.\d+$/.test(sesion?.version ?? '')) problemas.push(`No pude saber qué corre en producción (dice «${sesion?.version ?? 'nada'}»).`);
else if (menor(sesion.version, repo)) problemas.push(`Producción (${sesion.version}) va atrás del repo (${repo}): el despliegue no terminó o falló.`);
if (nativos.length) problemas.push(`Hay ${nativos.length} cambios nativos sin publicar desde ${etiqueta}: correr movil:publicar.`);
if (telefono && minimoNativo && menor(telefono, minimoNativo)) problemas.push(`El teléfono (${telefono}) no tiene el último cambio nativo (${minimoNativo}): correr movil:publicar con el teléfono enchufado.`);

console.log(`Repo:                 ${repo}`);
console.log(`Producción (web):     ${sesion?.version ?? '?'}`);
console.log(`APK publicado:        ${etiqueta ?? '?'}  (el servidor anuncia ${sesion?.app?.version ?? '?'})`);
console.log(`Teléfono conectado:   ${telefono ?? 'ninguno'}`);
console.log(`Último cambio nativo: ${minimoNativo ?? '?'}`);
if (problemas.length) {
  console.log('\n⚠️  ' + problemas.join('\n⚠️  '));
  process.exit(1);
}
console.log('\n✓ Todo al día');
