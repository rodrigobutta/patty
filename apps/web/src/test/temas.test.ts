import { archivosDeTemas, paginaTema, sitemap } from '../temas/pagina';
import { TEMAS } from '../temas/temas';

const palabras = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter((p) => /\p{L}/u.test(p)).length;

describe('páginas de temas', () => {
  it('cada tema tiene ruta, título y descripción propios', () => {
    for (const campo of ['slug', 'titulo', 'descripcion', 'h1'] as const) {
      expect(new Set(TEMAS.map((t) => t[campo])).size).toBe(TEMAS.length);
    }
    for (const t of TEMAS) {
      expect(t.slug).toMatch(/^[a-z-]+$/);
      expect(t.titulo.length).toBeLessThanOrEqual(65);
      expect(t.descripcion.length).toBeLessThanOrEqual(160);
      for (const r of t.relacionados) expect(TEMAS.some((x) => x.slug === r && x.slug !== t.slug)).toBe(true);
    }
  });

  it('el HTML trae el contenido, las etiquetas para Google y las preguntas en JSON-LD', () => {
    for (const t of TEMAS) {
      const html = paginaTema(t);
      expect(html).toContain(`<link rel="canonical" href="https://patty.today/${t.slug}">`);
      expect(html).toContain('<meta property="og:title"');
      expect(html.match(/<h1>/g)).toHaveLength(1);
      expect(html).toContain('href="/descargar/android"');
      const n = palabras(html);
      expect(n, t.slug).toBeGreaterThanOrEqual(400);
      expect(n, t.slug).toBeLessThanOrEqual(1000);
      const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      const faq = ld.find((x) => x['@type'] === 'FAQPage');
      expect(faq.mainEntity).toHaveLength(t.faq.length);
    }
  });

  it('el sitemap lista la presentación y todos los temas', () => {
    const xml = sitemap('2026-10-29');
    expect(xml).toContain('<loc>https://patty.today/</loc>');
    for (const t of TEMAS) expect(xml).toContain(`<loc>https://patty.today/${t.slug}</loc>`);
    expect(archivosDeTemas().map((a) => a.ruta)).toContain('migranas/index.html');
  });
});
