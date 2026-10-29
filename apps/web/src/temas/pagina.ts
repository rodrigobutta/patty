// Arma el HTML estático de cada página de tema, el sitemap y la lista de rutas. Lo usa el plugin de vite.config.ts al
// compilar: cada tema queda en dist/<slug>/index.html, con todo el contenido en el HTML (sin React) para que Google lo
// lea. Mismos colores, letra y búho que la presentación, con tema claro/oscuro.
import { svgMascota } from '../mascota/dibujo';
import { SITIO, TEMAS, type Tema } from './temas';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON dentro de <script>: que un "</" del texto no cierre la etiqueta. */
const jsonEnScript = (dato: unknown) => JSON.stringify(dato).replace(/</g, '\\u003c');

export const urlDe = (t: Tema) => `${SITIO}/${t.slug}`;
const IMAGEN = `${SITIO}/presentacion/historia.jpg`;
const ANDROID = '/descargar/android';

const ESTILOS = `
:root { --fondo:#f6f4fb; --panel:#fff; --texto:#1f1d26; --suave:#6b6878; --borde:#e4e0ef; --acento:#6b4fbb; --acento-suave:#ece7fa; --sobre-acento:#fff; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root:not([data-tema="claro"]) { --fondo:#15141a; --panel:#211f28; --texto:#ebe9f2; --suave:#a19dae; --borde:#34313d; --acento:#b4a0f0; --acento-suave:#2a2440; --sobre-acento:#15141a; } }
:root[data-tema="oscuro"] { --fondo:#15141a; --panel:#211f28; --texto:#ebe9f2; --suave:#a19dae; --borde:#34313d; --acento:#b4a0f0; --acento-suave:#2a2440; --sobre-acento:#15141a; color-scheme: dark; }
:root[data-tema="claro"] { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--fondo); color: var(--texto); }
body { font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--acento); }
.tema { max-width: 820px; margin: 0 auto; padding: 0 20px 40px; }
.barra { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; background: color-mix(in srgb, var(--fondo) 88%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.marca { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 20px; color: var(--acento); text-decoration: none; letter-spacing: -0.02em; }
.marca svg { position: relative; top: -4px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 10px 18px; border: 1px solid var(--borde); border-radius: 999px; background: var(--panel); color: var(--texto); font-weight: 600; text-decoration: none; }
.btn.primario { background: var(--acento); border-color: var(--acento); color: var(--sobre-acento); box-shadow: 0 10px 24px color-mix(in srgb, var(--acento) 35%, transparent); }
.btn.chico { min-height: 36px; padding: 6px 14px; font-size: 14px; box-shadow: none; }
.botones { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 8px; }
.botones .btn { padding: 13px 22px; font-size: 17px; }
.migas { font-size: 14px; color: var(--suave); margin: 18px 0 0; }
.migas a { color: var(--suave); }
h1 { font-size: clamp(30px, 5.5vw, 46px); line-height: 1.1; letter-spacing: -0.02em; margin: 12px 0 14px; }
h2 { font-size: clamp(23px, 3.6vw, 30px); line-height: 1.18; letter-spacing: -0.015em; margin: 44px 0 12px; }
h3 { font-size: 18px; line-height: 1.3; margin: 0 0 4px; }
.bajada { font-size: 19px; line-height: 1.5; color: var(--suave); margin: 0 0 6px; }
.suave { color: var(--suave); } .chico { font-size: 14px; }
.tarjetas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; list-style: none; padding: 0; margin: 16px 0 10px; }
.tarjetas li, .caja { padding: 14px 16px; border-radius: 16px; background: var(--panel); border: 1px solid var(--borde); line-height: 1.45; }
.tarjetas strong { display: block; margin-bottom: 2px; }
.tarjetas span { color: var(--suave); font-size: 15px; }
.pasos { list-style: none; counter-reset: paso; display: grid; gap: 12px; padding: 0; margin: 16px 0; }
.pasos li { counter-increment: paso; display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: start; }
.pasos li::before { content: counter(paso); display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--acento); color: var(--sobre-acento); font-weight: 700; }
.ejemplo { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; margin: 18px 0 6px; padding: 16px 18px; border-radius: 18px; background: var(--acento-suave); }
.ejemplo .emojis { font-size: 22px; white-space: nowrap; }
.ejemplo p { margin: 0; font-weight: 600; }
.lista { padding-left: 20px; } .lista li { margin: 6px 0; }
.cuidado { border-left: 4px solid var(--acento); }
.faq .caja { margin: 10px 0; } .faq p { margin: 0; color: var(--suave); }
.final { text-align: center; padding: 48px 0 12px; display: grid; justify-items: center; }
.final h2 { margin-top: 10px; }
.final .botones { justify-content: center; }
.temas { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 12px 0; }
.temas a { display: inline-block; padding: 8px 14px; border-radius: 999px; background: var(--panel); border: 1px solid var(--borde); color: var(--texto); text-decoration: none; font-size: 15px; }
.temas a:hover { border-color: var(--acento); }
.pie { margin-top: 36px; padding-top: 20px; border-top: 1px solid var(--borde); font-size: 14px; color: var(--suave); }
@media (max-width: 640px) { .tarjetas { grid-template-columns: 1fr; } .barra .btn { display: none; } .ejemplo { grid-template-columns: 1fr; } }
`;

/** Los links a otros temas (los relacionados primero). */
function listaTemas(temas: Tema[]): string {
  return `<ul class="temas">${temas.map((t) => `<li><a href="/${t.slug}">${t.emoji} ${esc(t.nombre)}</a></li>`).join('')}</ul>`;
}

export function paginaTema(tema: Tema): string {
  const url = urlDe(tema);
  const relacionados = tema.relacionados.map((s) => TEMAS.find((t) => t.slug === s)).filter((t): t is Tema => !!t);
  const otros = TEMAS.filter((t) => t.slug !== tema.slug && !tema.relacionados.includes(t.slug));
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: tema.faq.map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
  };
  const migas = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Patty', item: `${SITIO}/` },
      { '@type': 'ListItem', position: 2, name: tema.nombre, item: url },
    ],
  };
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(tema.titulo)}</title>
<meta name="description" content="${esc(tema.descripcion)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#6b4fbb">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Patty">
<meta property="og:locale" content="es_AR">
<meta property="og:title" content="${esc(tema.h1)}">
<meta property="og:description" content="${esc(tema.descripcion)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${IMAGEN}">
<meta property="og:image:width" content="1920">
<meta property="og:image:height" content="1080">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/iconos/favicon-32.png" type="image/png">
<link rel="apple-touch-icon" href="/iconos/apple-touch-icon.png">
<script>try { var t = localStorage.getItem('tema'); if (t === 'claro' || t === 'oscuro') document.documentElement.dataset.tema = t; } catch (e) {}</script>
<style>${ESTILOS.trim()}</style>
<script type="application/ld+json">${jsonEnScript(faq)}</script>
<script type="application/ld+json">${jsonEnScript(migas)}</script>
</head>
<body>
<div class="tema">
<header class="barra">
<a class="marca" href="/">${svgMascota('feliz', { lado: 44 })} Patty</a>
<a class="btn primario chico" href="${ANDROID}">Descargar para Android</a>
</header>
<main>
<nav class="migas" aria-label="Estás en"><a href="/">Patty</a> › ${esc(tema.nombre)}</nav>
<h1>${esc(tema.h1)}</h1>
<p class="bajada">${esc(tema.bajada)}</p>
<div class="botones">
<a class="btn primario" href="${ANDROID}">Descargar Patty gratis</a>
<a class="btn" href="/">Conocé cómo funciona</a>
</div>
${tema.intro.map((p) => `<p>${esc(p)}</p>`).join('\n')}

<h2>Lo que mucha gente nota antes</h2>
<p>Estas son cosas que se mencionan seguido. No son causas seguras ni le pasan a todo el mundo: la idea es justamente descubrir cuáles cuentan en tu caso.</p>
<ul class="tarjetas">
${tema.disparadores.map((d) => `<li><strong>${esc(d.titulo)}</strong><span>${esc(d.texto)}</span></li>`).join('\n')}
</ul>

<h2>Por qué anotarlo ayuda</h2>
<p>${esc(tema.porQue)}</p>

<h2>Cómo encuentra Patty tus propios disparadores</h2>
<p>Patty es un diario de tu día que se llena casi solo y busca qué cosas aparecen juntas en tu vida.</p>
<ol class="pasos">
<li><div><strong>Le contás tu día.</strong> Con la voz («almorcé milanesa con puré y a la tarde me dolió la cabeza»), con una foto del plato o con un toque. Patty lo ordena con la hora de cada cosa.</div></li>
<li><div><strong>Lo demás lo junta sola.</strong> Si lo conectás, suma el sueño y los pasos del reloj, el clima de cada hora donde estás, el uso del teléfono y el ciclo menstrual.</div></li>
<li><div><strong>A las pocas semanas, te cuenta lo que ve.</strong> Busca qué cosas se repiten antes de lo que te pasa, también cuando son varias juntas, y te lo explica en palabras simples.</div></li>
</ol>
<p><strong>Qué conviene contarle sobre esto:</strong></p>
<ul class="lista">
${tema.anotar.map((a) => `<li>${esc(a)}</li>`).join('\n')}
</ul>
<p>Un ejemplo de lo que te puede mostrar:</p>
<div class="ejemplo"><span class="emojis" aria-hidden="true">${tema.ejemplo.emojis}</span><p>${esc(tema.ejemplo.texto)}</p></div>
<p class="suave chico">Es un ejemplo. Lo que encuentre depende de tus datos, y vos le decís si te sirvió, si ya lo sabías o si no tiene sentido.</p>

<h2>Cuándo consultar</h2>
<div class="caja cuidado">
<p>${esc(tema.cuidado)}</p>
<p class="suave chico">Patty no diagnostica ni indica tratamientos: te ayuda a ordenar lo que te pasa y a ver relaciones en tus datos. Ante cualquier duda sobre tu salud, consultá a un profesional; llevar tu registro suele hacer que la consulta rinda más.</p>
</div>

<section class="faq">
<h2>Preguntas frecuentes</h2>
${tema.faq.map((f) => `<div class="caja"><h3>${esc(f.p)}</h3><p>${esc(f.r)}</p></div>`).join('\n')}
</section>

<section class="final">
${svgMascota('feliz', { lado: 110 })}
<h2>Empezá a conocerte hoy</h2>
<p class="bajada">Patty es gratis para Android. La de iPhone viene pronto.</p>
<div class="botones">
<a class="btn primario" href="${ANDROID}">Descargar para Android</a>
<a class="btn" href="/#beta">Tengo iPhone</a>
</div>
<p class="suave chico">Android te va a preguntar si dejás instalar una app que no viene del Play Store: es normal, decile que sí.</p>
</section>

<h2>Temas relacionados</h2>
${listaTemas(relacionados)}
</main>
<footer class="pie">
<p><strong>Otros temas</strong></p>
${listaTemas(otros)}
<p><a href="/">Patty</a> · <a href="/privacidad.html">Privacidad</a> · Lo que leés acá es información general y no reemplaza la consulta con un profesional de la salud.</p>
</footer>
</div>
</body>
</html>
`;
}

/** El sitemap: la presentación y cada tema. */
export function sitemap(fecha: string): string {
  const urls = [`${SITIO}/`, ...TEMAS.map(urlDe)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${fecha}</lastmod></url>`).join('\n')}
</urlset>
`;
}

/** Los archivos a escribir en dist: cada tema en <slug>/index.html, y el sitemap. */
export function archivosDeTemas(fecha = new Date().toISOString().slice(0, 10)): Array<{ ruta: string; contenido: string }> {
  return [...TEMAS.map((t) => ({ ruta: `${t.slug}/index.html`, contenido: paginaTema(t) })), { ruta: 'sitemap.xml', contenido: sitemap(fecha) }];
}
