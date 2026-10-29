import { describe, expect, it } from 'vitest';
import { encuadre, enRecuadro } from './mapaTarjeta';
import { extractoNoche } from './tarjetasDelDia';

describe('imágenes del Día para compartir', () => {
  it('de lo que dijo Patty de la noche queda lo primero, corto', () => {
    expect(extractoNoche('Dormiste 7 h 20 min, un poco más que tu semana. El profundo vino temprano. Cenaste tarde.')).toBe(
      'Dormiste 7 h 20 min, un poco más que tu semana. El profundo vino temprano.',
    );
    const larga = 'Dormiste bastante bien y de corrido, con un buen rato de sueño profundo antes de las tres de la mañana y casi nada despierto en toda la noche, mejor que el resto de tu semana. Después algo más.';
    const r = extractoNoche(larga);
    expect(r.length).toBeLessThanOrEqual(141);
    expect(r.endsWith('…')).toBe(true);
    expect(extractoNoche('   ')).toBe('');
    expect(extractoNoche('Sin punto final')).toBe('Sin punto final');
  });

  it('el mapita encuadra todo el recorrido con margen y lo agranda hasta llenar el recuadro', () => {
    const camino = [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.39 }, { lat: -34.62, lon: -58.4 }];
    const e = encuadre(camino, 800, 400, 50);
    expect(e.f).toBeGreaterThanOrEqual(0.5);
    expect(e.f).toBeLessThanOrEqual(1);
    const ps = camino.map((p) => enRecuadro(p, e));
    for (const q of ps) {
      expect(q.x).toBeGreaterThanOrEqual(49);
      expect(q.x).toBeLessThanOrEqual(751);
      expect(q.y).toBeGreaterThanOrEqual(49);
      expect(q.y).toBeLessThanOrEqual(351);
    }
    // Lo más largo (de norte a sur) toca el margen: no queda chiquito en el medio.
    expect(Math.max(...ps.map((q) => q.y)) - Math.min(...ps.map((q) => q.y))).toBeCloseTo(300, 0);
    // Un recorrido cortito no se acerca más que el zoom máximo.
    expect(encuadre([{ lat: -34.6, lon: -58.4 }, { lat: -34.6001, lon: -58.4 }], 800, 400)).toMatchObject({ z: 16, f: 1 });
  });
});
