import { conceptosDelMedio, limpiarMedio, tapaGrande, tipoDeEscucha, type Registro } from 'shared';
import { describe, expect, it } from 'vitest';
import { cuandoLoVi, detalleDelMedio, tapaParaCanvas, tarjetaDeMedio } from './medios';

const base: Registro = {
  id: 1, persona_id: 1, concepto_id: 1, categoria_id: 9, concepto: 'Tele', inicio: '2026-10-29T23:00:00Z', fin: null, fecha: '2026-10-29',
  valor: 155, intensidad: null, unidad: 'min', nota: null, origen: 'manual',
};

describe('tele, películas y música', () => {
  it('arma los conceptos para los patrones: tipo, género, deporte, equipo y canal', () => {
    expect(conceptosDelMedio({ tipo: 'pelicula', genero: 'Terror', servicio: 'Netflix', titulo: 'It' })).toEqual(['Tele: Películas', 'Tele: Terror', 'Tele en Netflix']);
    expect(conceptosDelMedio({ tipo: 'deporte', deporte: 'Fútbol', equipo: 'River' })).toEqual(['Tele: Deportes', 'Tele: Fútbol', 'Tele: River']);
    expect(conceptosDelMedio({ tipo: 'tele', contenido: 'Chimentos', servicio: 'América' })).toEqual(['Tele: Chimentos', 'Tele en América']);
    expect(conceptosDelMedio({ tipo: 'musica', genero: 'Rock', artista: 'Soda Stereo' })).toEqual(['Música: Rock']);
    expect(conceptosDelMedio({ tipo: 'podcast', titulo: 'X' })).toEqual([]);
  });

  it('solo guarda tapas de iTunes y las agranda', () => {
    expect(limpiarMedio({ tipo: 'pelicula', tapa: 'https://evil.com/a.jpg' })).toEqual({ tipo: 'pelicula' });
    expect(limpiarMedio({ tipo: 'otra' })).toBeNull();
    expect(tapaGrande('https://is1-ssl.mzstatic.com/x/y.jpg/100x100bb.jpg')).toBe('https://is1-ssl.mzstatic.com/x/y.jpg/600x600bb.jpg');
    expect(tapaParaCanvas('https://is1-ssl.mzstatic.com/a.jpg')).toBe('/api/medios/tapa?u=https%3A%2F%2Fis1-ssl.mzstatic.com%2Fa.jpg');
  });

  it('sabe si lo que suena es música, un podcast o un video', () => {
    expect(tipoDeEscucha('com.spotify.music', 'Spotify')).toBe('musica');
    expect(tipoDeEscucha('com.netflix.mediaclient', 'Netflix')).toBe('video');
    expect(tipoDeEscucha('com.google.android.apps.youtube.music', 'YouTube Music')).toBe('musica');
    expect(tipoDeEscucha('au.com.shiftyjelly.pocketcasts', 'Pocket Casts')).toBe('podcast');
  });

  it('la tarjeta para compartir: tapa por la API, título, género y "Lo vi hoy · 2 h 35 min"', () => {
    const tapa = 'https://is1-ssl.mzstatic.com/duna/600x600bb.jpg';
    const r = { ...base, medio: { tipo: 'pelicula' as const, titulo: 'Duna', genero: 'Ciencia ficción', servicio: 'Netflix', anio: 2021, tapa } };
    expect(tarjetaDeMedio(r, '2026-10-29')).toMatchObject({
      tipo: 'medio',
      tapa: tapaParaCanvas(tapa),
      forma: 'poster',
      titulo: 'Duna',
      subtitulo: 'Ciencia ficción · Netflix · 2021',
      cuando: 'Lo vi hoy · 2 h 35 min',
    });
    const musica = { ...base, concepto: 'Escuchar música', valor: 60, medio: { tipo: 'musica' as const, artista: 'Soda Stereo', genero: 'Rock' } };
    expect(tarjetaDeMedio(musica, '2026-10-30')).toMatchObject({ tapa: null, forma: 'cuadrada', icono: 'musica', titulo: 'Soda Stereo', cuando: 'Lo escuché ayer · 1 h' });
    expect(detalleDelMedio({ tipo: 'musica', titulo: 'Signos', artista: 'Soda Stereo' })).toEqual(['Signos', 'Soda Stereo']);
    expect(cuandoLoVi({ tipo: 'serie' }, '2026-10-24', '2026-10-29')).toBe('Lo vi el sábado');
  });
});
