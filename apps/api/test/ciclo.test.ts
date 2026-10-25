import { describe, expect, it } from 'vitest';
import { diaDePatty, localAInstante, sumarDias } from '../src/lib/fechas.js';
import { conAdmin } from './ayudas.js';

const ZONA = 'America/Argentina/Buenos_Aires';

describe('ciclo menstrual', () => {
  it('con las menstruaciones anotadas calcula el ciclo, lo pinta en el calendario y suma las fases a los patrones', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const hoy = diaDePatty(new Date(), ZONA);
    // Tres períodos de 4 días, cada 28 días; el último empezó hace 3 días.
    for (const inicio of [-59, -31, -3]) {
      for (let k = 0; k < 4; k++) {
        const fecha = sumarDias(hoy, inicio + k);
        const r = await ana.post('/api/registros', {
          persona_id: personaId,
          concepto_nombre: 'Menstruación',
          categoria_id: categorias.ciclo,
          intensidad: 6,
          inicio: localAInstante(fecha, '12:00', ZONA).toISOString(),
        });
        expect(r.status).toBe(201);
      }
    }
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Cólicos', categoria_id: categorias.sintoma, intensidad: 5, inicio: localAInstante(sumarDias(hoy, -31), '15:00', ZONA).toISOString() });

    const c = (await ana.get(`/api/ciclo?persona=${personaId}`)).body;
    expect(c).toMatchObject({ duracion_ciclo: 28, duracion_periodo: 4, ciclos: 2, regular: true, dia: 4, fase: 'menstrual', en_periodo: true, proxima: sumarDias(hoy, 25), faltan: 25 });
    expect(c.periodos).toHaveLength(3);
    expect(c.por_fase.menstrual).toEqual([{ concepto: 'Cólicos', dias: 1 }]);

    const cal = (await ana.get(`/api/estadisticas/calendario?persona=${personaId}&capa=ciclo&desde=${sumarDias(hoy, -10)}&hasta=${sumarDias(hoy, 40)}`)).body;
    const emoji = (f: string) => cal.dias.find((d: any) => d.fecha === f)?.emoji;
    expect(emoji(hoy)).toBe('🩸');
    expect(emoji(sumarDias(hoy, 11))).toBe('🥚');
    expect(emoji(sumarDias(hoy, 25))).toBe('🔮');
    expect(cal.dias.filter((d: any) => d.emoji === '🌱')).toHaveLength(6);

    const a = await ana.post('/api/analisis', { persona_id: personaId });
    expect(a.status).toBe(200);
    const { obtenerDb } = await import('../src/db/client.js');
    const { sql } = await import('drizzle-orm');
    const nombres = [...(await obtenerDb().execute(sql`SELECT c.nombre FROM conceptos c JOIN categorias k ON k.id = c.categoria_id WHERE k.clave IN ('ciclo', 'clima')`))].map((x: any) => x.nombre);
    expect(nombres).toEqual(expect.arrayContaining(['Fase menstrual', 'Fase folicular', 'Fase lútea', 'Días premenstruales']));
  });
});
