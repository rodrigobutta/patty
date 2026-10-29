// Un Chrome sin ventana manejado por el protocolo de DevTools (sin dependencias: WebSocket de Node), para sacar las
// capturas y grabar los videos de la página de presentación. Ver capturar.mjs.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';

export const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
export const FFMPEG = path.join(homedir(), 'Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function abrirChrome(puerto = 9444) {
  const dir = mkdtempSync(path.join(tmpdir(), 'patty-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${puerto}`, `--user-data-dir=${dir}`, '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', '--lang=es-AR', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${puerto}/json/version`);
      break;
    } catch {
      await espera(200);
    }
  }
  const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
  const pagina = lista.find((x) => x.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pendientes = new Map();
  const oyentes = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendientes.has(m.id)) {
      const { ok, mal } = pendientes.get(m.id);
      pendientes.delete(m.id);
      m.error ? mal(new Error(`${m.error.message} ${m.error.data ?? ''}`)) : ok(m.result);
    } else if (m.method) for (const f of oyentes.get(m.method) ?? []) f(m.params);
  });
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      const n = ++id;
      pendientes.set(n, { ok, mal });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const on = (evento, f) => oyentes.set(evento, [...(oyentes.get(evento) ?? []), f]);
  await enviar('Page.enable');
  await enviar('Runtime.enable');
  await enviar('Network.enable');
  return { enviar, on, cerrar: () => { ws.close(); proc.kill(); } };
}

/** Una página de Patty en tamaño teléfono, con la sesión, la hora fija y respuestas de la IA de mentira. */
export async function prepararPagina(c, { base, token, ahora, escala = 3, oscuro = false, respuestas = {}, guardados = {} }) {
  const url = new URL(base);
  await c.enviar('Network.setCookie', { name: 'sesion', value: token, domain: url.hostname, path: '/' });
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: escala, mobile: true });
  await c.enviar('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await c.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: oscuro ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await c.enviar('Emulation.setTimezoneOverride', { timezoneId: 'America/Argentina/Buenos_Aires' });
  await c.enviar('Emulation.setLocaleOverride', { locale: 'es-AR' });
  // La hora del teléfono: corre normal, pero empezando en `ahora`.
  await c.enviar('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const D = Date, off = ${ahora.getTime()} - D.now();
      class F extends D { constructor(...a) { if (a.length === 0) super(D.now() + off); else super(...a); } static now() { return D.now() + off; } }
      F.parse = D.parse; F.UTC = D.UTC; window.Date = F;
      try {
        const fijos = { 'bienvenida-vista': 'si', 'tour-visto': 'si', idioma: 'es', 'permisos-ofrecidos': 'si', 'version-cerrada': '99', 'semana-vista': '', ...${JSON.stringify(guardados)} };
        for (const [k, v] of Object.entries(fijos)) if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
      } catch {}
    })();`,
  });
  // Lo que en producción contesta la IA (contar, foto): respuestas fijas.
  const rutas = Object.keys(respuestas);
  if (rutas.length) {
    await c.enviar('Fetch.enable', { patterns: rutas.map((r) => ({ urlPattern: `*${r}*`, requestStage: 'Request' })) });
    c.on('Fetch.requestPaused', async (p) => {
      const r = rutas.find((x) => p.request.url.includes(x));
      const cuerpo = typeof respuestas[r] === 'function' ? respuestas[r](p.request) : respuestas[r];
      await espera(cuerpo?.__demora ?? 900);
      // Una lista va tal cual; un objeto, sin la demora.
      const { __demora, ...resto } = Array.isArray(cuerpo) ? { __demora: 0 } : (cuerpo ?? {});
      await c.enviar('Fetch.fulfillRequest', {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(Array.isArray(cuerpo) ? cuerpo : resto)).toString('base64'),
      });
    });
  }
}

export async function ir(c, url, ms = 2500) {
  await c.enviar('Page.navigate', { url });
  await espera(ms);
}

export async function js(c, expresion) {
  const r = await c.enviar('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'error en la página');
  return r.result.value;
}

/** Toca el primer elemento que coincide (selector CSS, y si se pasa, que contenga ese texto). */
export async function tocar(c, selector, texto) {
  const pos = await js(c, `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => ${texto ? `e.textContent.includes(${JSON.stringify(texto)})` : 'true'});
    const e = els.find((x) => x.getBoundingClientRect().height > 0);
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!pos) throw new Error(`No encontré ${selector} ${texto ?? ''}`);
  await espera(250);
  for (const type of ['mousePressed', 'mouseReleased']) await c.enviar('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
}

export async function escribir(c, texto, msPorLetra = 45) {
  for (const ch of texto) {
    await c.enviar('Input.insertText', { text: ch });
    await espera(msPorLetra);
  }
}

export async function captura(c, archivo, { calidad = 82 } = {}) {
  const r = await c.enviar('Page.captureScreenshot', { format: 'webp', quality: calidad });
  writeFileSync(archivo, Buffer.from(r.data, 'base64'));
}

/** Graba lo que pasa mientras corre `hacer()` y lo guarda como WebM (VP8), a 25 cuadros por segundo (`ancho` en píxeles reales). */
export async function grabar(c, archivo, hacer, { ancho = 780, bitrate = '1M' } = {}) {
  const cuadros = [];
  const alCuadro = async (p) => {
    cuadros.push({ t: p.metadata.timestamp, datos: Buffer.from(p.data, 'base64') });
    await c.enviar('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  };
  c.on('Page.screencastFrame', alCuadro);
  await c.enviar('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: ancho, maxHeight: ancho * 3, everyNthFrame: 1 });
  const inicio = Date.now() / 1000;
  await hacer();
  await espera(400);
  await c.enviar('Page.stopScreencast');
  const fin = Date.now() / 1000;
  // A 25 cuadros por segundo: en cada instante, el último cuadro que llegó.
  const fps = 25;
  const salida = [];
  let i = 0;
  const t0 = cuadros[0]?.t ?? inicio;
  for (let t = t0; t <= Math.max(fin, t0 + 0.5); t += 1 / fps) {
    while (i + 1 < cuadros.length && cuadros[i + 1].t <= t) i++;
    if (cuadros[i]) salida.push(cuadros[i].datos);
  }
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'vp8', '-qmin', '0', '-qmax', '40', '-crf', '10', '-b:v', bitrate, '-deadline', 'good', '-cpu-used', '2', archivo], { stdio: ['pipe', 'ignore', 'pipe'] });
  let error = '';
  ff.stderr.on('data', (d) => (error += d));
  for (const b of salida) if (!ff.stdin.write(b)) await new Promise((r) => ff.stdin.once('drain', r));
  ff.stdin.end();
  const codigo = await new Promise((r) => ff.on('close', r));
  if (codigo !== 0) throw new Error(`ffmpeg: ${error.slice(-500)}`);
  return salida.length / fps;
}

export { espera };
