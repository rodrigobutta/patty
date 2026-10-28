// Las capturas y los videos de la página de presentación, sacados de la app de verdad con la persona de ejemplo
// (apps/api/scripts/demo.ts). Hace falta la API de demo y un Vite apuntando a ella:
//   DATABASE_URL=postgres://localhost/patty_demo ANTHROPIC_API_KEY=x PORT=8124 pnpm --filter api dev
//   API_PROXY=http://127.0.0.1:8124 npx vite --port 5181          (en apps/web)
//   node movil/presentacion/capturar.mjs [escena…]
// Lo que en producción contesta la IA (contar, foto) se contesta acá con respuestas fijas, y el dictado se simula.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, captura, escribir, espera, grabar, ir, js, prepararPagina, tocar } from './cdp.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(aqui, '../../public/presentacion');
mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE ?? 'http://localhost:5181';
const HOY = process.env.HOY ?? new Date(Date.now() - 5 * 3600000 - 3 * 3600000).toISOString().slice(0, 10);
const AHORA = new Date(`${HOY}T13:30:00-03:00`);
const en = (hora) => new Date(`${HOY}T${hora}:00-03:00`).toISOString();
const archivo = (n) => path.join(SALIDA, n);

const FRASE = 'Desayuné café con tostadas, al mediodía comí una ensalada con pollo y a la tarde salí a caminar media hora';
const propuesta = (r) => ({ concepto_id: null, nuevo: false, fin: null, valor: null, unidad: null, intensidad: null, nota: null, donde: null, lugar: null, ...r });
const RESPUESTAS = {
  '/api/registros/interpretar': {
    registros: [
      propuesta({ categoria_id: 3, concepto_nombre: 'Café', inicio: en('08:00'), valor: 1, unidad: 'taza', donde: 'casa' }),
      propuesta({ categoria_id: 2, concepto_nombre: 'Tostadas', inicio: en('08:00'), donde: 'casa', porcion: 'mediana', tipos: ['harinas'] }),
      propuesta({ categoria_id: 2, concepto_nombre: 'Ensalada con pollo', inicio: en('13:00'), porcion: 'mediana', tipos: ['verdura', 'proteina'] }),
      propuesta({ categoria_id: 7, concepto_nombre: 'Caminata', inicio: en('18:00'), valor: 30, unidad: 'min' }),
    ],
    tratamientos: [],
    dudas: [],
    __demora: 1400,
  },
  '/api/registros/foto': {
    registros: [
      propuesta({ categoria_id: 2, concepto_nombre: 'Milanesa con papas fritas', inicio: en('13:30'), porcion: 'grande', tipos: ['frito', 'proteina', 'harinas'] }),
      propuesta({ categoria_id: 2, concepto_nombre: 'Ensalada de lechuga y tomate', inicio: en('13:30'), porcion: 'chica', tipos: ['verdura'] }),
    ],
    tratamientos: [],
    dudas: [],
    __demora: 1800,
  },
};

// El dictado del navegador, de mentira: va "escuchando" la frase de a poco y termina solo.
const DICTADO = `(() => {
  class Falso {
    constructor() { this.onresult = null; this.onend = null; this.onerror = null; }
    start() {
      const palabras = ${JSON.stringify(FRASE)}.split(' ');
      let i = 0;
      this.t = setInterval(() => {
        i++;
        const dicho = palabras.slice(0, i).join(' ');
        this.onresult && this.onresult({ results: [Object.assign([{ transcript: dicho }], { isFinal: i === palabras.length })] });
        if (i >= palabras.length) { clearInterval(this.t); setTimeout(() => this.onend && this.onend(), 700); }
      }, 190);
    }
    stop() { clearInterval(this.t); this.onend && this.onend(); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = Falso; window.SpeechRecognition = Falso;
})();`;

async function pagina(c, guardados = {}) {
  await prepararPagina(c, { base: BASE, token: 'demo-sofia', ahora: AHORA, escala: 2, respuestas: RESPUESTAS, guardados });
  await c.enviar('Page.addScriptToEvaluateOnNewDocument', { source: DICTADO });
}
const arriba = (c) => js(c, 'window.scrollTo(0, 0)');
const bajarA = (c, sel) => js(c, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 130); })()`);

const ESCENAS = {
  async dia(c) {
    await ir(c, BASE + '/', 6500);
    await captura(c, archivo('dia.webp'));
  },
  async widgets(c) {
    await ir(c, BASE + '/', 5000);
    await bajarA(c, '.widgets-auto');
    await espera(800);
    await captura(c, archivo('widgets.webp'));
  },
  async sueno(c) {
    await ir(c, BASE + '/', 5000);
    await tocar(c, '.widget-auto', 'a dormir');
    await espera(2500);
    await captura(c, archivo('sueno.webp'));
  },
  async sentir(c) {
    await ir(c, BASE + '/', 5000);
    await tocar(c, '.boton-buho');
    await espera(1200);
    await captura(c, archivo('sentir.webp'));
  },
  async semana(c) {
    await ir(c, BASE + '/', 5000);
    await tocar(c, 'button, a', 'Ver el resumen');
    await espera(1500);
    await captura(c, archivo('semana.webp'));
  },
  async objetivos(c) {
    await ir(c, BASE + '/', 5000);
    await bajarA(c, '.objetivos-semana');
    await espera(600);
    await captura(c, archivo('objetivos.webp'));
  },
  async patrones(c) {
    await ir(c, BASE + '/', 4000);
    await tocar(c, 'nav button', 'Descubrir');
    await espera(3000);
    await bajarA(c, '.hallazgo');
    await espera(600);
    await captura(c, archivo('patrones.webp'));
  },
  async mapa(c) {
    await ir(c, BASE + '/', 4000);
    await tocar(c, 'nav button', 'Descubrir');
    await espera(1500);
    await tocar(c, '.subvistas button', 'Mapa');
    await espera(4500);
    await captura(c, archivo('mapa.webp'));
  },
  async ciclo(c) {
    await ir(c, BASE + '/', 5000);
    await tocar(c, '.ciclo-dia .cabeza-plegable');
    await espera(800);
    await bajarA(c, '.cruce-fases');
    await espera(500);
    await captura(c, archivo('ciclo.webp'));
  },
  async antes(c) {
    // El último dolor de cabeza: se va a ese día y se abre.
    await ir(c, BASE + '/', 5000);
    const fecha = execSync(`psql ${process.env.DEMO_DB ?? 'postgres://localhost/patty_demo'} -Atc "SELECT max(r.fecha) FROM registros r JOIN conceptos c ON c.id = r.concepto_id WHERE c.nombre = 'Dolor de cabeza' AND r.fecha < '${HOY}'"`).toString().trim();
    const dias = Math.round((Date.parse(HOY) - Date.parse(fecha)) / 86400000);
    for (let i = 0; i < dias; i++) {
      await tocar(c, 'button[aria-label="Día anterior"]');
      await espera(700);
    }
    await espera(1500);
    await tocar(c, 'li.tocable', 'Dolor de cabeza');
    await espera(2500);
    await captura(c, archivo('antes.webp'));
  },
  // Videos (al final: guardan cosas en la base de demo).
  async voz(c) {
    await ir(c, BASE + '/', 5000);
    const s = await grabar(c, archivo('voz.webm'), async () => {
      await espera(600);
      await tocar(c, '.contale');
      await espera(FRASE.split(' ').length * 190 + 800 + 1400 + 1500);
      await captura(c, archivo('contar.webp'));
      await tocar(c, '.btn.confirmar');
      await espera(2500);
    });
    console.log(`voz.webm: ${s.toFixed(1)} s`);
  },
  async foto(c) {
    await ir(c, BASE + '/', 5000);
    await c.enviar('Page.setInterceptFileChooserDialog', { enabled: true });
    c.on('Page.fileChooserOpened', async (p) => {
      await c.enviar('DOM.setFileInputFiles', { files: [path.join(aqui, 'plato.png')], backendNodeId: p.backendNodeId });
    });
    const s = await grabar(c, archivo('foto.webm'), async () => {
      await espera(600);
      await tocar(c, '.camara-flotante');
      await espera(1000);
      await tocar(c, '.grande-foto');
      await espera(1800 + 2500);
      await captura(c, archivo('foto.webp'));
      await tocar(c, '.btn.confirmar');
      await espera(2500);
    });
    console.log(`foto.webm: ${s.toFixed(1)} s`);
  },
  async tocar(c) {
    await ir(c, BASE + '/', 5000);
    const s = await grabar(c, archivo('tocar.webm'), async () => {
      await espera(800);
      await tocar(c, '.boton-buho');
      await espera(1300);
      await tocar(c, '.carita.muy_bien');
      await espera(2800);
    });
    console.log(`tocar.webm: ${s.toFixed(1)} s`);
  },
  async descubrir(c) {
    await ir(c, BASE + '/', 4000);
    await tocar(c, 'nav button', 'Descubrir');
    await espera(2500);
    const s = await grabar(c, archivo('descubrir.webm'), async () => {
      for (let y = 0; y < 1400; y += 14) {
        await js(c, `window.scrollTo(0, ${y})`);
        await espera(28);
      }
      await espera(1200);
    });
    console.log(`descubrir.webm: ${s.toFixed(1)} s`);
  },
};

// El plato dibujado, como PNG (para "sacar la foto").
async function dibujarPlato(c) {
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
  await ir(c, 'file://' + path.join(aqui, 'plato.html'), 800);
  const r = await c.enviar('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(path.join(aqui, 'plato.png'), Buffer.from(r.data, 'base64'));
}

const pedidas = process.argv.slice(2);
const lista = pedidas.length ? pedidas : Object.keys(ESCENAS);
let puerto = 9450;
for (const nombre of lista) {
  const c = await abrirChrome(puerto++);
  try {
    if (nombre === 'foto') await dibujarPlato(c);
    await pagina(c);
    await ESCENAS[nombre](c);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    console.error(`✗ ${nombre}: ${e.message}`);
  } finally {
    c.cerrar();
  }
}
