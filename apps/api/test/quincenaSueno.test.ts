import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { diaDePatty, localAInstante, sumarDias } from '../src/lib/fechas.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
const ZONA = 'America/Argentina/Buenos_Aires';

describe('el resumen de las últimas dos semanas de sueño', () => {
  it('cada noche con sus horas (o sin dato), el promedio contra las dos semanas de antes y la hora de dormir', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const hoy = diaDePatty(new Date(), ZONA);
    const a = (fecha: string, hora: string) => localAInstante(fecha, hora, ZONA).toISOString();
    const dormir = async (dia: string, acoste: string, levante: string) => {
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Me acosté', categoria_id: categorias.sueno, inicio: a(dia, acoste) });
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Me levanté', categoria_id: categorias.sueno, inicio: a(dia, levante) });
    };
    // Estas dos semanas: tres noches de 7 h, acostándose a las 0:30 (por el día de 5 a 5, es la noche anterior). Las de antes, de 6 h.
    for (const d of [1, 2, 3]) await dormir(sumarDias(hoy, -d), '00:30', '07:30');
    for (const d of [16, 17, 18]) await dormir(sumarDias(hoy, -d), '01:00', '07:00');
    const r = await ana.get(`/api/sueno/quincena?persona=${personaId}&fecha=${hoy}`);
    expect(r.status).toBe(200);
    expect(r.body.noches).toHaveLength(15);
    expect(r.body.noches.at(-1)).toEqual({ fecha: hoy, horas: null, calidad: null });
    expect(r.body.noches.at(-2)).toMatchObject({ fecha: sumarDias(hoy, -1), horas: 7 });
    expect(r.body.horas).toBe(7);
    expect(r.body.antes).toBe(6);
    expect(r.body.acostarse).toBe(24 * 60 + 30);
  });

  it('sin datos no inventa nada', async () => {
    const { ana, personaId } = await conAdmin();
    const r = await ana.get(`/api/sueno/quincena?persona=${personaId}&fecha=${diaDePatty(new Date(), ZONA)}`);
    expect(r.body).toMatchObject({ horas: null, antes: null, calidad: null, acostarse: null });
  });
});
