// Las tomas del video, grabadas de la app de verdad (la de hoy) con la persona de ejemplo, en alta resolución
// (1170 x 2532, como un iPhone). Quedan en public/tomas. Hace falta la API de demo y un Vite apuntando a ella, igual
// que para las capturas de la presentación (ver apps/web/movil/presentacion/capturar.mjs):
//   DATABASE_URL=postgres://localhost/patty_demo ANTHROPIC_API_KEY=x PORT=8124 pnpm --filter api dev
//   API_PROXY=http://127.0.0.1:8124 npx vite --port 5181          (en apps/web)
//   node capturar.mjs [toma…]
// Las tomas que graban cosas (contar, foto, tocar) escriben en la base de demo: conviene rehacerla antes
// (apps/api/scripts/demo.ts).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, captura, espera, grabar, ir, js, prepararPagina, tocar } from '../../apps/web/movil/presentacion/cdp.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(aqui, 'public/tomas');
mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE ?? 'http://localhost:5181';
const HOY = new Date(Date.now() - 8 * 3600000).toISOString().slice(0, 10);
const AHORA = new Date(`${HOY}T13:30:00-03:00`);
const en = (hora) => new Date(`${HOY}T${hora}:00-03:00`).toISOString();
const archivo = (n) => path.join(SALIDA, n);
const ALTA = { ancho: 1170, bitrate: '5M' };

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
const DICTADO = `(() => {
  class Falso {
    start() {
      const palabras = ${JSON.stringify(FRASE)}.split(' ');
      let i = 0;
      this.t = setInterval(() => {
        i++;
        this.onresult && this.onresult({ results: [Object.assign([{ transcript: palabras.slice(0, i).join(' ') }], { isFinal: i === palabras.length })] });
        if (i >= palabras.length) { clearInterval(this.t); setTimeout(() => this.onend && this.onend(), 700); }
      }, 150);
    }
    stop() { clearInterval(this.t); this.onend && this.onend(); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = Falso; window.SpeechRecognition = Falso;
})();`;

const bajarA = (c, sel) => js(c, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 130); })()`);
/** Baja de a poco (como con el dedo) hasta `hasta` px. */
async function deslizar(c, hasta, ms = 2600) {
  const pasos = Math.round(ms / 30);
  for (let i = 1; i <= pasos; i++) {
    const t = i / pasos;
    const y = Math.round(hasta * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2));
    await js(c, `window.scrollTo(0, ${y})`);
    await espera(30);
  }
}

const TOMAS = {
  async dia(c) {
    await ir(c, BASE + '/', 6000);
    await captura(c, archivo('dia.webp'), { calidad: 90 });
    const s = await grabar(c, archivo('dia.webm'), async () => {
      await espera(700);
      await deslizar(c, 1500, 3200);
      await espera(900);
    }, ALTA);
    console.log(`dia.webm: ${s.toFixed(1)} s`);
  },
  async tocar(c) {
    await ir(c, BASE + '/', 5000);
    const s = await grabar(c, archivo('tocar.webm'), async () => {
      await espera(600);
      await tocar(c, '.boton-buho');
      await espera(1100);
      await tocar(c, '.carita.muy_bien');
      await espera(2600);
    }, ALTA);
    console.log(`tocar.webm: ${s.toFixed(1)} s`);
  },
  async voz(c) {
    await ir(c, BASE + '/', 5000);
    const s = await grabar(c, archivo('voz.webm'), async () => {
      await espera(500);
      await tocar(c, '.contale');
      await espera(FRASE.split(' ').length * 150 + 700 + 1400 + 1300);
      await tocar(c, '.btn.confirmar');
      await espera(2200);
    }, ALTA);
    console.log(`voz.webm: ${s.toFixed(1)} s`);
  },
  async foto(c) {
    await ir(c, BASE + '/', 5000);
    await c.enviar('Page.setInterceptFileChooserDialog', { enabled: true });
    c.on('Page.fileChooserOpened', async (p) => {
      await c.enviar('DOM.setFileInputFiles', { files: [path.join(aqui, '../../apps/web/movil/presentacion/plato.png')], backendNodeId: p.backendNodeId });
    });
    const s = await grabar(c, archivo('foto.webm'), async () => {
      await espera(500);
      await tocar(c, '.camara-flotante');
      await espera(900);
      await tocar(c, '.grande-foto');
      await espera(1800 + 2300);
    }, ALTA);
    console.log(`foto.webm: ${s.toFixed(1)} s`);
  },
  async widgets(c) {
    await ir(c, BASE + '/', 5000);
    await bajarA(c, '.widgets-auto');
    await espera(800);
    await captura(c, archivo('widgets.webp'), { calidad: 90 });
  },
  async mapa(c) {
    await ir(c, BASE + '/', 4000);
    await tocar(c, 'nav button', 'Descubrir');
    await espera(1500);
    await tocar(c, '.subvistas button', 'Mapa');
    await espera(4500);
    await captura(c, archivo('mapa.webp'), { calidad: 90 });
  },
  async descubrir(c) {
    await ir(c, BASE + '/', 4000);
    await tocar(c, 'nav button', 'Descubrir');
    await espera(2500);
    const s = await grabar(c, archivo('descubrir.webm'), async () => {
      await espera(500);
      await deslizar(c, 1300, 3000);
      await espera(1200);
    }, ALTA);
    // El hallazgo que cuenta la historia (comida frita → dolor de panza), arriba de todo.
    await js(c, `(() => { const h = [...document.querySelectorAll('.hallazgo')].find((x) => x.innerText.includes('frita')); if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 150); })()`);
    await espera(600);
    await captura(c, archivo('patron.webp'), { calidad: 90 });
    console.log(`descubrir.webm: ${s.toFixed(1)} s`);
  },
};

const pedidas = process.argv.slice(2);
let puerto = 9700;
for (const [nombre, toma] of Object.entries(TOMAS)) {
  if (pedidas.length && !pedidas.includes(nombre)) continue;
  const c = await abrirChrome(puerto++);
  try {
    await prepararPagina(c, { base: BASE, token: 'demo-sofia', ahora: AHORA, escala: 3, respuestas: RESPUESTAS });
    await c.enviar('Page.addScriptToEvaluateOnNewDocument', { source: DICTADO });
    await toma(c);
  } catch (e) {
    console.log(`✗ ${nombre}: ${e.message}`);
  } finally {
    c.cerrar();
  }
}
process.exit(0);
