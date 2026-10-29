// Tele, películas, música y podcasts: el detalle en datos.medio, los conceptos que entran a los patrones, las tapas de
// iTunes (con fetch de mentira), la propuesta de la IA y lo que suena en el teléfono, en sesiones.
import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { agruparEscuchas } from 'shared';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { diaDePatty } from '../src/lib/fechas.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => {
  vi.restoreAllMocks();
  usarClientePrueba(null);
});

const TAPA = 'https://is1-ssl.mzstatic.com/image/thumb/Video/v4/aa/bb/duna.jpg/100x100bb.jpg';

/** iTunes de mentira: devuelve `resultados` a cualquier búsqueda y cuenta los pedidos. */
function itunes(resultados: unknown[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.startsWith('https://itunes.apple.com/search')) return new Response(JSON.stringify({ resultCount: resultados.length, results: resultados }), { headers: { 'Content-Type': 'application/json' } });
    if (u.includes('mzstatic.com')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'Content-Type': 'image/jpeg' } });
    throw new Error(`fetch inesperado: ${u}`);
  });
}
const DUNA = { wrapperType: 'track', kind: 'feature-movie', trackId: 1586405930, trackName: 'Duna', artistName: 'Denis Villeneuve', primaryGenreName: 'Ciencia ficción', releaseDate: '2021-10-21T07:00:00Z', artworkUrl100: TAPA };

async function serie(personaId: number) {
  const l = await obtenerDb().execute(
    sql`SELECT c.nombre, s.suma FROM serie_diaria s JOIN conceptos c ON c.id = s.concepto_id WHERE s.persona_id = ${personaId} ORDER BY c.nombre`,
  );
  return Object.fromEntries([...l].map((x) => [x.nombre as string, Number(x.suma)]));
}

describe('tele y música con detalle', () => {
  it('guarda el medio y lo suma a los patrones como «Tele: Terror» y «Tele en Netflix», con los minutos', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const r = await ana.post('/api/registros', {
      persona_id: personaId,
      concepto_nombre: 'Tele',
      categoria_id: categorias.pantalla,
      inicio: '2026-10-24T01:00:00Z',
      valor: 120,
      unidad: 'min',
      medio: { tipo: 'pelicula', servicio: 'Netflix', genero: 'Terror', titulo: '  It  ', anio: 2017, tapa: 'https://malo.com/x.jpg', basura: 1 },
    });
    expect(r.status).toBe(201);
    expect(r.body.medio).toEqual({ tipo: 'pelicula', servicio: 'Netflix', genero: 'Terror', titulo: 'It', anio: 2017 });
    expect(await serie(personaId)).toMatchObject({ Tele: 120, 'Tele: Películas': 120, 'Tele: Terror': 120, 'Tele en Netflix': 120 });
    // El Día sigue mostrando un solo renglón.
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-23`)).body).toHaveLength(1);

    // Cambiar el género cambia lo que entra a los patrones.
    const p = await ana.put(`/api/registros/${r.body.id}`, { ...r.body, medio: { ...r.body.medio, genero: 'Comedia' } });
    expect(p.body.medio.genero).toBe('Comedia');
    const s = await serie(personaId);
    expect(s['Tele: Comedia']).toBe(120);
    expect(s['Tele: Terror']).toBeUndefined();

    // La música va en su categoría, que es una causa como la tele.
    const m = await ana.post('/api/registros', {
      persona_id: personaId,
      concepto_nombre: 'Escuchar música',
      categoria_id: categorias.musica,
      inicio: '2026-10-24T15:00:00Z',
      valor: 60,
      medio: { tipo: 'musica', artista: 'Soda Stereo', genero: 'Rock nacional', servicio: 'Spotify' },
    });
    expect(m.body.categoria_id).toBe(categorias.musica);
    expect((await serie(personaId))['Música: Rock nacional']).toBe(60);
    const rol = await obtenerDb().execute(sql`SELECT rol FROM categorias WHERE clave = 'musica'`);
    expect([...rol][0].rol).toBe('causa');
  });
});

describe('tapas de iTunes', () => {
  it('busca, agranda la tapa, lleva el género al de Patty y guarda la búsqueda', async () => {
    const { ana } = await conAdmin();
    const f = itunes([DUNA, { kind: 'podcast', collectionId: 9, collectionName: 'Un podcast de Duna' }]);
    const r = await ana.get('/api/medios/buscar?tipo=pelicula&q=Duna');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([
      { itunes_id: 1586405930, tipo: 'pelicula', titulo: 'Duna', artista: 'Denis Villeneuve', anio: 2021, genero: 'Ciencia ficción', tapa: TAPA.replace('100x100bb', '600x600bb') },
    ]);
    expect(String(f.mock.calls[0][0])).toContain('country=AR');
    await ana.get('/api/medios/buscar?tipo=pelicula&q=duna ');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('si iTunes no contesta, no hay tapa (y no se guarda: se vuelve a probar)', async () => {
    const { ana } = await conAdmin();
    const f = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin red'));
    expect((await ana.get('/api/medios/buscar?tipo=serie&q=Breaking Bad')).body).toEqual([]);
    expect((await ana.get('/api/medios/buscar?tipo=serie&q=Breaking Bad')).body).toEqual([]);
    expect(f.mock.calls.length).toBeGreaterThan(2);
  });

  it('trae la tapa con CORS para el canvas, solo de iTunes y sin sesión', async () => {
    await conAdmin();
    itunes([]);
    // Sin cookie ni token: directo con la app (la respuesta es una imagen, no JSON).
    const { crearApp } = await import('../src/app.js');
    const app = crearApp();
    const ok = await app.request(`/api/medios/tapa?u=${encodeURIComponent(TAPA)}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(ok.headers.get('Content-Type')).toBe('image/jpeg');
    const malo = await app.request(`/api/medios/tapa?u=${encodeURIComponent('https://evil.com/a.jpg')}`);
    expect(malo.status).toBe(400);
  });
});

describe('contarlo con la IA', () => {
  it('"miré Duna en Netflix 2 horas": Tele con el medio y la tapa de iTunes', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    itunes([DUNA]);
    const pedidos: any[] = [];
    const crear = async (p: any) => {
      pedidos.push(p);
      const medio = { tipo: 'pelicula', contenido: null, servicio: 'Netflix', genero: null, titulo: 'Duna', artista: null, deporte: null, equipo: null };
      return {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ registros: [{ categoria: 'pantalla', concepto: 'Tele', tipo_valor: 'duracion', fecha: '2026-10-24', hora: '21:00', duracion_min: 120, valor: null, unidad: 'min', intensidad: null, nota: null, donde: null, lugar: null, porcion: null, tipos: [], para_malestar: null, medio, detalles: [] }], tratamientos: [], dudas: [] }) }],
      };
    };
    usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
    const r = await ana.post('/api/registros/interpretar', { persona_id: personaId, texto: 'miré Duna en Netflix 2 horas' });
    expect(r.status).toBe(200);
    expect(pedidos[0].system ?? JSON.stringify(pedidos[0])).toContain('Tele');
    const [x] = r.body.registros;
    expect(x).toMatchObject({ categoria_id: categorias.pantalla, concepto_nombre: 'Tele', valor: 120 });
    expect(x.medio).toMatchObject({ tipo: 'pelicula', servicio: 'Netflix', titulo: 'Duna', anio: 2021, genero: 'Ciencia ficción', itunes_id: 1586405930 });
    expect(x.medio.tapa).toContain('600x600bb');
    const g = await ana.post('/api/registros/varios', { registros: r.body.registros });
    expect(g.body[0].medio.tapa).toContain('600x600bb');
    expect(await serie(personaId)).toMatchObject({ 'Tele: Ciencia ficción': 120, 'Tele en Netflix': 120 });
  });
});

describe('lo que suena en el teléfono', () => {
  it('junta los temas seguidos en una sesión, separa música de video y no duplica', () => {
    const m = 60000;
    const t0 = Date.UTC(2026, 9, 24, 18);
    const tema = (i: number, extra: Partial<{ paquete: string; app: string; titulo: string }> = {}) => ({
      paquete: 'com.spotify.music', app: 'Spotify', titulo: `Tema ${i}`, artista: 'Soda Stereo', album: 'Signos', inicio: t0 + i * 4 * m, fin: t0 + i * 4 * m + 3.5 * m, ...extra,
    });
    const s = agruparEscuchas([
      tema(2), tema(0), tema(1),
      // Media hora después: otra sesión.
      tema(15),
      // Netflix, al mismo tiempo: otra cosa.
      { paquete: 'com.netflix.mediaclient', app: 'Netflix', titulo: 'Stranger Things', artista: '', album: '', inicio: t0, fin: t0 + 50 * m },
    ]);
    expect(s.map((x) => [x.tipo, x.minutos, x.pistas.length])).toEqual([
      ['musica', 10.5, 3],
      ['video', 50, 1],
      ['musica', 3.5, 1],
    ]);
  });

  it('la app manda los tramos y quedan las sesiones como mediciones; se pueden ver y borrar', async () => {
    const { ana, personaId } = await conAdmin();
    const f = await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'telefono', nombre: 'App de Android' });
    const app = new Cliente();
    app.headers.Authorization = `Bearer ${f.body.token}`;
    const m = 60000;
    const ayer = new Date(Date.now() - 86400000);
    const t0 = Date.UTC(ayer.getUTCFullYear(), ayer.getUTCMonth(), ayer.getUTCDate(), 18); // 15 h en Buenos Aires
    const tramos = [0, 1, 2].map((i) => ({ paquete: 'com.spotify.music', app: 'Spotify', titulo: `Tema ${i}`, artista: 'Soda Stereo', album: 'Signos', inicio: t0 + i * 4 * m, fin: t0 + i * 4 * m + 4 * m }));
    tramos.push({ paquete: 'com.netflix.mediaclient', app: 'Netflix', titulo: 'Duna', artista: '', album: '', inicio: t0 + 120 * m, fin: t0 + 220 * m });
    const malos = [{ paquete: '', inicio: t0, fin: t0 + m }, { paquete: 'x', inicio: t0, fin: t0 - m }];
    const r = await app.post('/api/ingesta/escuchas', { escuchas: [...tramos, ...malos] });
    expect(r.body).toMatchObject({ ok: true, guardadas: 4, sesiones: 2 });
    // Mandar de nuevo (con el último tema un poco más largo) no duplica.
    tramos[2].fin += m;
    await app.post('/api/ingesta/escuchas', { escuchas: tramos });
    const med = await obtenerDb().execute(
      sql`SELECT c.nombre, m.valor, k.clave FROM mediciones m JOIN conceptos c ON c.id = m.concepto_id JOIN categorias k ON k.id = c.categoria_id
          WHERE m.persona_id = ${personaId} ORDER BY m.inicio`,
    );
    expect([...med]).toEqual([
      { nombre: 'Música escuchada', valor: 13, clave: 'musica' },
      { nombre: 'Series y videos en el teléfono', valor: 100, clave: 'pantalla' },
    ]);
    const fecha = diaDePatty(new Date(t0), 'America/Argentina/Buenos_Aires');
    const dia = await ana.get(`/api/medios/escuchas?persona=${personaId}&fecha=${fecha}`);
    expect(dia.body.map((s: any) => [s.tipo, s.pistas.map((p: any) => p.titulo)])).toEqual([
      ['musica', ['Tema 0', 'Tema 1', 'Tema 2']],
      ['video', ['Duna']],
    ]);
    // Lo que llegó solo se ve en el Día como cualquier medición.
    const auto = await ana.get(`/api/registros/automaticos?persona=${personaId}&fecha=${fecha}`);
    expect(auto.body.map((x: any) => x.concepto)).toEqual(expect.arrayContaining(['Música escuchada']));

    expect((await ana.del(`/api/medios/escuchas?persona=${personaId}`)).status).toBe(200);
    expect((await ana.get(`/api/medios/escuchas?persona=${personaId}&fecha=${fecha}`)).body).toEqual([]);
    expect([...(await obtenerDb().execute(sql`SELECT 1 FROM mediciones WHERE persona_id = ${personaId}`))]).toHaveLength(0);
  });
});
