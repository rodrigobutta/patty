// Genera los íconos de Patty a partir de la mascota (src/mascota/dibujo.ts): los de la web (PWA) y los del teléfono
// Android, uno por cara (el ícono cambia de cara según lo que se anota; ver MascotaPlugin.java).
// Usa Google Chrome sin ventana para pasar los SVG a PNG. Correr desde apps/web después de cambiar el dibujo:
//   pnpm movil:iconos
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARAS, svgMascota } from '../src/mascota/dibujo';

// Las rutas de abajo son relativas a apps/web.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONDO = '#efeafc';
const RES = 'android/app/src/main/res';
const tmp = mkdtempSync(path.join(tmpdir(), 'patty-iconos-'));

function png(svg: string, lado: number, destino: string) {
  const fuente = path.join(tmp, 'icono.svg');
  writeFileSync(fuente, svg);
  mkdirSync(path.dirname(destino), { recursive: true });
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${lado},${lado}`,
    `--screenshot=${path.resolve(destino)}`,
    `file://${fuente}`,
  ], { stdio: 'ignore' });
}

// Web: la cara contenta.
png(svgMascota('feliz', { lado: 32, zona: 340 }), 32, 'public/iconos/favicon-32.png');
png(svgMascota('feliz', { lado: 180, fondo: FONDO, zona: 300 }), 180, 'public/iconos/apple-touch-icon.png');
png(svgMascota('feliz', { lado: 192, zona: 340 }), 192, 'public/iconos/icono-192.png');
png(svgMascota('feliz', { lado: 512, zona: 340 }), 512, 'public/iconos/icono-512.png');
png(svgMascota('feliz', { lado: 512, fondo: FONDO, zona: 235 }), 512, 'public/iconos/maskable-512.png');

// Android: ícono adaptable (frente de 108 dp, se ve el círculo de 66 dp del medio) y uno común para teléfonos viejos.
const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const cara of CARAS) {
  for (const [d, f] of Object.entries(DENSIDADES)) {
    png(svgMascota(cara, { lado: 108 * f, zona: 250 }), 108 * f, `${RES}/mipmap-${d}/icono_${cara}_frente.png`);
    png(svgMascota(cara, { lado: 48 * f, fondo: FONDO, zona: 320 }), 48 * f, `${RES}/mipmap-${d}/icono_${cara}.png`);
  }
  writeFileSync(
    `${RES}/mipmap-anydpi-v26/icono_${cara}.xml`,
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/icono_fondo"/>
    <foreground android:drawable="@mipmap/icono_${cara}_frente"/>
    <monochrome android:drawable="@mipmap/icono_${cara}_frente"/>
</adaptive-icon>
`,
  );
}
writeFileSync(
  `${RES}/values/icono_fondo.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="icono_fondo">${FONDO}</color>\n</resources>\n`,
);
rmSync(tmp, { recursive: true, force: true });
console.log('Íconos generados.');
