// Pruebas de punta a punta: la app de verdad (API + web) con la persona de ejemplo (apps/api/scripts/demo.ts) en un
// Chrome sin ventana, tocando como una persona. Lo que contesta la IA va con respuestas fijas. Uso:
//   createdb patty_e2e   (una vez)
//   pnpm --filter web e2e                       (o: node e2e/correr.mjs [nombre de prueba…])
// Variables: E2E_DB (postgres://localhost/patty_e2e), CHROME_PATH (si Chrome no está donde lo deja Playwright).
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, captura, espera, ir, js, prepararPagina, tocar } from '../movil/presentacion/cdp.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const API = path.join(aqui, '../../api');
const WEB = path.join(aqui, '..');
const DB = process.env.E2E_DB ?? 'postgres://localhost/patty_e2e';
const PUERTO_API = 8130;
const PUERTO_WEB = 5190;
const BASE = `http://localhost:${PUERTO_WEB}`;
const HOY = new Date(Date.now() - 8 * 3600000).toISOString().slice(0, 10); // el día de Patty en Buenos Aires
const en = (hora) => new Date(`${HOY}T${hora}:00-03:00`).toISOString();

const procesos = [];
const arrancar = (cmd, args, cwd, env) => {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: process.env.E2E_VERBOSO ? 'inherit' : 'ignore', detached: true });
  procesos.push(p);
  return p;
};
const terminar = () => {
  for (const p of procesos) {
    try {
      process.kill(-p.pid);
    } catch {
      /* ya terminó */
    }
  }
};
process.on('exit', terminar);
process.on('SIGINT', () => process.exit(130));

async function esperarA(url, ms = 60000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* todavía no */
    }
    await espera(500);
  }
  throw new Error(`No responde ${url}`);
}

const propuesta = (r) => ({ concepto_id: null, nuevo: false, fin: null, valor: null, unidad: null, intensidad: null, nota: null, donde: null, lugar: null, ...r });
const RESPUESTAS = {
  '/api/registros/interpretar': {
    registros: [propuesta({ categoria_id: 2, concepto_nombre: 'Ensalada con pollo', inicio: en('13:00'), porcion: 'mediana', tipos: ['verdura', 'proteina'] })],
    tratamientos: [],
    dudas: [],
    __demora: 300,
  },
};
// El dictado del navegador, de mentira: dice una frase y termina.
const DICTADO = `(() => {
  class Falso { start() { setTimeout(() => { this.onresult && this.onresult({ results: [Object.assign([{ transcript: 'almorcé una ensalada con pollo' }], { isFinal: true })] }); setTimeout(() => this.onend && this.onend(), 200); }, 200); } stop() { this.onend && this.onend(); } abort() {} }
  window.webkitSpeechRecognition = Falso; window.SpeechRecognition = Falso;
})();`;

const texto = (c) => js(c, 'document.body.innerText');
async function hasta(c, condicion, que, ms = 8000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await js(c, condicion)) return;
    await espera(250);
  }
  throw new Error(`No pasó: ${que}`);
}
const contiene = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`;

const foto = async (c, n) => {
  if (process.env.E2E_FOTOS) await captura(c, path.join(process.env.E2E_FOTOS, `${n}.jpg`));
};
/** Lleva a la pantalla un elemento y devuelve su centro, para tocarlo con el dedo. */
const centro = async (c, sel) => {
  await hasta(c, `!!document.querySelector('${sel}')`, sel);
  await js(c, `document.querySelector('${sel}').scrollIntoView({ block: 'center' })`);
  await espera(500);
  return js(c, `(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
};

const PRUEBAS = {
  async 'el Día abre con lo anotado'(c) {
    await hasta(c, contiene('Hoy'), 'se ve "Hoy"');
    await hasta(c, `!!document.querySelector('li.tocable')`, 'hay registros en la lista');
  },
  async 'los viajes muestran su mapa'(c) {
    await hasta(c, `!!document.querySelector('.viaje .mapa-viaje.leaflet-container, .viaje .mapa-viaje .leaflet-container')`, 'el mapita del viaje');
    await hasta(c, `!/\\d{3,} km\\/h/.test(document.querySelector('.tarjeta.viajes')?.innerText ?? '')`, 'velocidad posible');
    if (process.env.E2E_FOTOS) {
      await js(c, `document.querySelector('.tarjeta.viajes').scrollIntoView()`);
      await espera(1500);
      await captura(c, path.join(process.env.E2E_FOTOS, 'viajes.jpg'));
    }
  },
  async 'cómo te sentís: muy bien'(c) {
    await tocar(c, '.boton-buho');
    await espera(500);
    await tocar(c, '.carita.muy_bien');
    await hasta(c, contiene('Anotado: muy bien'), 'el festejo');
    await hasta(c, contiene('Me siento muy bien') + ` || [...document.querySelectorAll('li.tocable')].some((l) => l.innerText.includes('muy bien'))`, 'queda en la lista');
  },
  async 'atajo de un toque: agua'(c) {
    await tocar(c, '.fab');
    await espera(500);
    await tocar(c, '.atajo', 'Agua');
    await hasta(c, contiene('Anotado'), 'el festejo');
    await hasta(c, `[...document.querySelectorAll('li.tocable')].some((l) => /agua/i.test(l.innerText))`, 'queda en la lista');
  },
  async 'contarle a Patty (respuesta fija de la IA)'(c) {
    await tocar(c, '.contale');
    await hasta(c, `!!document.querySelector('.btn.confirmar')`, 'la propuesta', 12000);
    await tocar(c, '.btn.confirmar');
    await hasta(c, `[...document.querySelectorAll('li.tocable')].some((l) => /ensalada con pollo/i.test(l.innerText))`, 'queda en la lista');
  },
  async 'malestar con duración: empieza y se pasa'(c) {
    await tocar(c, '.boton-buho');
    await espera(500);
    await tocar(c, '.puntuales button', 'Con dolor o malestar');
    await tocar(c, '.que-duele button', 'Muelas');
    await tocar(c, '.botones-cuanto button', 'Poco');
    await hasta(c, `[...document.querySelectorAll('.gantt-item')].some((g) => /dolor de muelas/i.test(g.innerText) && /sigue/.test(g.innerText))`, 'aparece en curso');
    await espera(2500); // el festejo tapa la pantalla un momento
    await tocar(c, '.tocable-gantt', 'muelas');
    await tocar(c, '.gantt-acciones button', 'Ya se me pasó');
    await hasta(c, `[...document.querySelectorAll('.gantt-item')].some((g) => /dolor de muelas/i.test(g.innerText) && /terminó/.test(g.innerText))`, 'queda terminado');
  },
  async 'activar un seguimiento'(c) {
    await tocar(c, 'nav button', 'Más');
    await espera(800);
    // Cada opción dice si está completa o le falta algo (Sofía tiene sus datos y lugares).
    await hasta(c, `!!document.querySelector('.menu-mas .estado-opcion')`, 'el tilde o el aviso de las opciones');
    if (process.env.E2E_FOTOS) await captura(c, path.join(process.env.E2E_FOTOS, 'mas.jpg'));
    await tocar(c, '.menu-mas li button, .menu-mas li', 'Seguimientos');
    await hasta(c, contiene('Problema de panza'), 'las plantillas');
    await tocar(c, '.plantilla-seguimiento .btn.primario');
    await espera(2800); // el festejo tapa la pantalla un momento
    await tocar(c, 'nav button', 'Día');
    await hasta(c, `!!document.querySelector('.seguimiento-dia')`, 'la tarjeta en el Día');
  },
  async 'widgets: mantener apretado abre las opciones'(c) {
    const p = await centro(c, '.widget-auto');
    await c.enviar('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await espera(600);
    await c.enviar('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await hasta(c, contiene('Ocultar'), 'las opciones del widget');
    await espera(800);
    await foto(c, 'widget-opciones');
  },
  async 'widgets: arrastrar los reordena'(c) {
    const nombres = `JSON.stringify([...document.querySelectorAll('.widget-auto')].map((w) => w.getBoundingClientRect().top + ':' + w.innerText))`;
    await hasta(c, `document.querySelectorAll('.widget-auto').length > 2`, 'varios widgets');
    const orden = async () => JSON.parse(await js(c, nombres)).sort((x, y) => parseFloat(x) - parseFloat(y)).map((x) => x.split(':').slice(1).join(':'));
    const antes = await orden();
    const p = await centro(c, '.widget-auto');
    const q = await js(c, `(() => { const r = [...document.querySelectorAll('.widget-auto')].at(-1).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await c.enviar('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await espera(600);
    for (let i = 1; i <= 8; i++) {
      await c.enviar('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + ((q.x - p.x) * i) / 8, y: p.y + ((q.y - p.y) * i) / 8 }] });
      await espera(60);
    }
    await foto(c, 'widget-arrastrando');
    await c.enviar('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await espera(700);
    const despues = await orden();
    if (JSON.stringify(antes) === JSON.stringify(despues)) throw new Error(`No cambió el orden: ${antes.join(' / ')}`);
  },
  async 'cómo venís: semana y mes'(c) {
    await hasta(c, `!!document.querySelector('.tendencias')`, 'la sección');
    await js(c, `document.querySelector('.tendencias').scrollIntoView()`);
    await espera(1500);
    await foto(c, 'tendencias-semana');
    await tocar(c, '.tendencias button', 'Mes');
    await espera(1500);
    await foto(c, 'tendencias-mes');
  },
  async 'objetivos: elegir uno y verlo en el Día'(c) {
    await tocar(c, 'nav button', 'Más');
    await espera(800);
    await tocar(c, '.menu-mas li button, .menu-mas li', 'Objetivos');
    await hasta(c, contiene('Dormir mejor'), 'las sugerencias');
    await foto(c, 'objetivos-sugerencias');
    await tocar(c, 'button', 'Dormir mejor');
    await espera(2500);
    await foto(c, 'objetivos-plan');
    await tocar(c, 'nav button', 'Día');
    await hasta(c, contiene('Dormir mejor'), 'la tarjeta del objetivo en el Día');
    await espera(1000);
    await foto(c, 'objetivos-dia');
  },
  async 'remedios: efectos y suplementos'(c) {
    await tocar(c, 'nav button', 'Más');
    await espera(800);
    await tocar(c, '.menu-mas li button, .menu-mas li', 'Remedios');
    await hasta(c, contiene('itamina'), 'la sección de vitaminas');
    await foto(c, 'remedios');
  },
  async 'competencias: crear una'(c) {
    await tocar(c, 'nav button', 'Más');
    await espera(800);
    await tocar(c, '.menu-mas li button, .menu-mas li', 'Competencias');
    await espera(1200);
    await foto(c, 'competencias');
  },
  async 'alergias: el chip y el editor'(c) {
    await tocar(c, '.boton-buho');
    await espera(500);
    await hasta(c, contiene('Con alergia'), 'el chip');
    await foto(c, 'chips-alergia');
  },
  async 'widgets: elegir cuáles ver'(c) {
    await tocar(c, 'nav button', 'Más');
    await espera(800);
    await tocar(c, '.menu-mas li button, .menu-mas li', 'Widgets del Día');
    await espera(1000);
    await foto(c, 'elegir-widgets');
  },
  async 'ciclo: el calendario'(c) {
    await hasta(c, `!!document.querySelector('.ciclo-dia [aria-expanded]')`, 'la tarjeta del ciclo');
    await js(c, `document.querySelector('.ciclo-dia').scrollIntoView({ block: 'center' })`);
    const hayBoton = `[...document.querySelectorAll('.ciclo-dia button')].some((b) => b.innerText.includes('Calendario del ciclo'))`;
    for (let i = 0; i < 4 && !(await js(c, hayBoton)); i++) {
      await espera(800);
      if (!(await js(c, hayBoton))) await js(c, `document.querySelector('.ciclo-dia [aria-expanded]').click()`);
      await espera(800);
    }
    await tocar(c, '.ciclo-dia button', 'Calendario del ciclo');
    await hasta(c, `!!document.querySelector('[role=dialog]')`, 'el calendario abierto');
    await espera(1000);
    await foto(c, 'ciclo-calendario');
  },
  async 'paseos sin anotar: una tarjeta, todos iguales'(c) {
    const DBURL = DB;
    execSync(`psql ${DBURL} -qc "INSERT INTO paseos_detectados (persona_id, inicio, fin, metros) SELECT id, now() - interval '30 hours', now() - interval '29 hours 50 minutes', 650 FROM personas LIMIT 1; INSERT INTO paseos_detectados (persona_id, inicio, fin, metros) SELECT id, now() - interval '3 hours', now() - interval '2 hours 40 minutes', 1300 FROM personas LIMIT 1;"`);
    await js(c, 'location.reload()').catch(() => {});
    await espera(4000);
    await hasta(c, `document.querySelectorAll('.paseo-item').length >= 2`, 'los paseos en una tarjeta');
    if ((await js(c, `document.querySelectorAll('.paseo-pendiente').length`)) !== 1) throw new Error('más de una tarjeta');
    await js(c, `document.querySelector('.paseo-pendiente').scrollIntoView({ block: 'center' })`);
    await espera(1200);
    await foto(c, 'paseos');
    await tocar(c, '.paseo-item .chip', 'No anotar');
    await hasta(c, `document.querySelectorAll('.paseo-item').length === 1`, 'queda uno');
  },
  async 'Descubrir muestra los patrones'(c) {
    await tocar(c, 'nav button', 'Descubrir');
    await hasta(c, `!!document.querySelector('.hallazgo')`, 'hay patrones');
  },
};

// Base limpia con la persona de ejemplo, API y web.
console.log('Armando la base de pruebas…');
execSync('npx tsx --conditions=source scripts/demo.ts', { cwd: API, env: { ...process.env, DATABASE_URL: DB, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
arrancar('npx', ['tsx', '--conditions=source', 'src/index.ts'], API, { DATABASE_URL: DB, PORT: String(PUERTO_API), ANTHROPIC_API_KEY: 'e2e' });
arrancar('npx', ['vite', '--port', String(PUERTO_WEB), '--strictPort'], WEB, { API_PROXY: `http://127.0.0.1:${PUERTO_API}` });
await esperarA(`http://localhost:${PUERTO_API}/api/sesion`);
await esperarA(BASE);

const pedidas = process.argv.slice(2);
let fallas = 0;
let puerto = 9600;
for (const [nombre, prueba] of Object.entries(PRUEBAS)) {
  if (pedidas.length && !pedidas.some((p) => nombre.includes(p))) continue;
  const c = await abrirChrome(puerto++);
  const inicio = Date.now();
  try {
    // A la noche la hora queda fija a las 20:30: más tarde el búho y el Día muestran otras cosas (cómo dormir, el resumen).
    await prepararPagina(c, { base: BASE, token: 'demo-sofia', ahora: new Date(Math.min(Date.now(), Date.parse(en('20:30')))), escala: 1, respuestas: RESPUESTAS });
    await c.enviar('Page.addScriptToEvaluateOnNewDocument', { source: DICTADO });
    await ir(c, BASE + '/#entrar', 4000);
    await prueba(c);
    console.log(`✓ ${nombre} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}: ${e.message}`);
    console.log((await texto(c).catch(() => '')).slice(0, 600).replace(/\n+/g, ' · '));
  } finally {
    c.cerrar();
  }
}
console.log(fallas ? `${fallas} prueba(s) fallaron` : 'Todo bien');
terminar();
process.exit(fallas ? 1 : 0);
