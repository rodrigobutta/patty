import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb } from '../src/db/client.js';
import { despertarRepetido, type EtapaNoche } from '../src/patrones/despertares.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

/** Una noche de 23:00 a 7:00 con un despertar a `desp` (minutos desde las 0 del día anterior) de `dura` minutos. */
const noche = (fecha: string, desp: number | null, dura = 15): EtapaNoche[] => {
  const inicio = 23 * 60;
  const fin = 31 * 60;
  if (desp === null) return [{ noche: fecha, desde: inicio, minutos: fin - inicio, etapa: 'ligero' }];
  return [
    { noche: fecha, desde: inicio, minutos: desp - inicio, etapa: 'profundo' },
    { noche: fecha, desde: desp, minutos: dura, etapa: 'despierto' },
    { noche: fecha, desde: desp + dura, minutos: fin - desp - dura, etapa: 'ligero' },
  ];
};

describe('despertares que se repiten', () => {
  it('3 noches cerca de las 4 → pregunta; 2 o despertares cortos → no', () => {
    const r = despertarRepetido([...noche('2026-10-20', 28 * 60 + 5), ...noche('2026-10-21', 28 * 60 + 20), ...noche('2026-10-22', 27 * 60 + 55), ...noche('2026-10-23', null)]);
    expect(r).toEqual({ hora: '04:05', noches: 3, miradas: 4 });
    expect(despertarRepetido([...noche('2026-10-20', 28 * 60), ...noche('2026-10-21', 28 * 60)])).toBeNull();
    expect(despertarRepetido([...noche('2026-10-20', 28 * 60, 2), ...noche('2026-10-21', 28 * 60, 2), ...noche('2026-10-22', 28 * 60, 2)])).toBeNull();
  });

  it('las etapas de cada noche se guardan (reemplazando la noche) y se leen', async () => {
    const { ana, personaId } = await conAdmin();
    const etapas = [
      { inicio: '2026-10-26T02:00:00Z', fin: '2026-10-26T05:00:00Z', etapa: 'profundo' },
      { inicio: '2026-10-26T05:00:00Z', fin: '2026-10-26T05:20:00Z', etapa: 'despierto' },
      { inicio: '2026-10-26T05:20:00Z', fin: '2026-10-26T10:00:00Z', etapa: 'ligero' },
      { inicio: 'x', fin: 'y', etapa: 'profundo' },
    ];
    expect((await ana.post('/api/sueno/etapas', { persona_id: personaId, noches: [{ noche: '2026-10-26', etapas }] })).body).toEqual({ ok: true, etapas: 3 });
    await ana.post('/api/sueno/etapas', { persona_id: personaId, noches: [{ noche: '2026-10-26', etapas: etapas.slice(0, 2) }] });
    const r = (await ana.get(`/api/sueno/noche?persona=${personaId}&fecha=2026-10-26`)).body;
    expect(r.map((x: any) => x.etapa)).toEqual(['profundo', 'despierto']);
  });
});
