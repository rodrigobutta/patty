import { calcularPuntos } from 'shared';
import { describe, expect, it } from 'vitest';
import { diaDePatty, localAInstante } from '../src/lib/fechas.js';
import { Cliente, conAdmin } from './ayudas.js';

const ZONA = 'America/Argentina/Buenos_Aires';

describe('puntos del día', () => {
  it('suman más las comidas, cómo te sentís y el sueño; sin remedios, «algo más» vale el doble', () => {
    const p = calcularPuntos({
      fecha: '2026-10-25',
      registros: [
        { categoria: 'comida', minutos: 8 * 60 },
        { categoria: 'comida', minutos: 13 * 60 },
        { categoria: 'comida', minutos: 21 * 60 },
        { categoria: 'animo', minutos: 10 * 60 },
        { categoria: 'sintoma', minutos: 11 * 60 },
      ],
      medidas: ['sueno'],
      tomas: { total: 0, marcadas: 0 },
    });
    expect(p.puntos).toBe(30 + 15 + 15 + 2);
    expect(p.items.find((i) => i.clave === 'merienda')).toMatchObject({ puntos: 0, maximo: 10 });
    expect(p.items.find((i) => i.clave === 'extras')).toMatchObject({ puntos: 2, maximo: 20 });
    expect(p.items.some((i) => i.clave === 'remedios')).toBe(false);
  });

  it('el día de hoy, la racha y el tablero de la familia', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const hoy = diaDePatty(new Date(), ZONA);
    const a = (h: string) => localAInstante(hoy, h, ZONA).toISOString();
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.comida, inicio: a('08:00') });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Cómo me siento', categoria_id: categorias.animo, inicio: a('09:00'), intensidad: 8 });
    const r = (await ana.get(`/api/puntos?persona=${personaId}`)).body;
    expect(r.hoy.puntos).toBe(25);
    expect(r.semana).toHaveLength(7);
    expect(r.racha).toBe(0);

    // Otro usuario, sin relación: está en el general pero no en la familia.
    const r2 = await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Roberto', clave: 'secreta1' });
    expect(r2.status).toBe(201);
    const beto = new Cliente();
    await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta1' });
    await beto.post('/api/personas', { nombre: 'Roberto' });
    const t = (await ana.get('/api/puntos/tablero')).body;
    expect(t.familia.map((x: any) => x.apodo)).toEqual(['Anita']);
    expect(t.general.total).toBe(2);
    expect(t.general.posicion).toBe(1);
    expect(t.general.top[1]).toMatchObject({ apodo: 'Beto', semana: 0 });
    // Beto no quiere aparecer en el general
    await beto.put('/api/usuarios/yo/preferencias', { ranking: false });
    expect((await ana.get('/api/puntos/tablero')).body.general.total).toBe(1);
  });
});
