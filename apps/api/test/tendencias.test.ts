import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { diaDePatty, localAInstante, sumarDias } from '../src/lib/fechas.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

const ZONA = 'America/Argentina/Buenos_Aires';

describe('tendencias de abajo del Día', () => {
  it('trae cada día con sus valores reales, y null donde no hay dato (no cero)', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const hoy = diaDePatty(new Date(), ZONA);
    const ayer = sumarDias(hoy, -1);
    const a = (f: string, h: string) => localAInstante(f, h, ZONA).toISOString();
    const post = (b: any) => ana.post('/api/registros', { persona_id: personaId, ...b });
    await post({ concepto_nombre: 'Cómo me siento', categoria_id: categorias.animo, inicio: a(ayer, '10:00'), intensidad: 8 });
    await post({ concepto_nombre: 'Cómo me siento', categoria_id: categorias.animo, inicio: a(ayer, '18:00'), intensidad: 5 });
    await post({ concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: a(ayer, '12:00'), intensidad: 4 });
    // Se acostó la noche anterior a las 23:30 y se levantó a las 7: el sueño va con el día en que se levantó.
    await post({ concepto_nombre: 'Me acosté', categoria_id: categorias.sueno, inicio: a(sumarDias(ayer, -1), '23:30') });
    await post({ concepto_nombre: 'Me levanté', categoria_id: categorias.sueno, inicio: a(ayer, '07:00') });
    await post({ concepto_nombre: 'Pasos', categoria_id: categorias.actividad, inicio: a(ayer, '20:00'), valor: 8000, unidad: 'pasos' });
    await post({ concepto_nombre: 'Pasos', categoria_id: categorias.actividad, inicio: a(hoy, '20:00'), valor: 0, unidad: 'pasos' });

    const r = await ana.get(`/api/estadisticas/tendencias?persona=${personaId}&dias=7`);
    expect(r.status).toBe(200);
    expect(r.body.hasta).toBe(hoy);
    expect(r.body.desde).toBe(sumarDias(hoy, -6));
    expect(r.body.dias).toHaveLength(7);
    const d = r.body.dias.find((x: any) => x.fecha === ayer);
    expect(d).toMatchObject({ animo: 6.5, malestares: 1, nombres_malestares: ['Dolor de cabeza'], sueno: 7.5, pasos: 8000, pantalla: null, temperatura: null, pulso: null });
    const otro = r.body.dias.find((x: any) => x.fecha === sumarDias(hoy, -3));
    expect(otro).toMatchObject({ animo: null, sueno: null, pasos: null, malestares: null, nombres_malestares: [] });
    // Un cero de pasos es que no se midió: no cuenta como dato.
    expect(r.body.dias.find((x: any) => x.fecha === hoy).pasos).toBeNull();

    const mes = await ana.get(`/api/estadisticas/tendencias?persona=${personaId}&dias=30`);
    expect(mes.body.dias).toHaveLength(30);
    expect(mes.body.dias[29].fecha).toBe(hoy);
    // Cualquier otro número no pide de más.
    expect((await ana.get(`/api/estadisticas/tendencias?persona=${personaId}&dias=9999`)).body.dias).toHaveLength(7);
  });

  it('no deja ver los de otra persona', async () => {
    const { ana } = await conAdmin();
    const r = await ana.get('/api/estadisticas/tendencias?persona=999999&dias=7');
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
