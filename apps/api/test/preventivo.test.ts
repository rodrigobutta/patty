import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { diaDePatty, sumarDias } from '../src/lib/fechas.js';
import { rasgosDelDia, type ConceptoInfo, type FilaDiaria } from '../src/patrones/motor.js';
import { avisarPreventivos, preventivosDeHoy, textoPreventivo } from '../src/patrones/preventivo.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('rasgos del día', () => {
  it('dice qué está el último día: lo anotado y lo que estuvo por encima o por debajo de lo habitual', () => {
    const conceptos: ConceptoInfo[] = [
      { id: 1, nombre: 'Comida frita', tipo_valor: 'evento', rol: 'causa' },
      { id: 2, nombre: 'Temperatura máxima', tipo_valor: 'medida', rol: 'causa' },
      { id: 3, nombre: 'Helado', tipo_valor: 'evento', rol: 'causa' },
    ];
    const desde = '2026-10-01';
    const filas: FilaDiaria[] = [];
    for (let i = 0; i < 20; i++) {
      const fecha = sumarDias(desde, i);
      const t = i === 19 ? 34 : 20 + (i % 5);
      filas.push({ fecha, concepto_id: 2, veces: 1, suma: t, promedio: t, intensidad: null, primera: null });
      if (i % 4 === 0 || i === 19) filas.push({ fecha, concepto_id: 1, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${fecha}T13:00:00Z`) });
      if (i === 10) filas.push({ fecha, concepto_id: 3, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${fecha}T16:00:00Z`) });
    }
    const hoy = rasgosDelDia(filas, conceptos, desde, sumarDias(desde, 19));
    expect(hoy.has('1|presente')).toBe(true);
    expect(hoy.has('2|alto')).toBe(true);
    expect(hoy.has('2|bajo')).toBe(false);
    expect(hoy.has('3|presente')).toBe(false);
    // Otro día (el 18): no hubo comida frita.
    expect(rasgosDelDia(filas, conceptos, desde, sumarDias(desde, 18)).has('1|presente')).toBe(false);
  });

  it('el texto nombra todas las causas de la combinación y cuándo vino el efecto', () => {
    const x = {
      hallazgo_id: 1, efecto_id: 9, efecto: 'Dolor de panza', efecto_tipo: 'intensidad' as const, efecto_modo: 'presente' as const, desfase_dias: 1,
      causas: [
        { id: 1, nombre: 'Comida frita', tipo: 'evento' as const, modo: 'presente' as const },
        { id: 2, nombre: 'Temperatura máxima', tipo: 'medida' as const, modo: 'alto' as const },
        { id: 3, nombre: 'Fase menstrual', tipo: 'evento' as const, modo: 'presente' as const },
      ],
    };
    expect(textoPreventivo(x, 'es')).toEqual({
      titulo: '🦉 Ojo con mañana',
      cuerpo: 'Hoy se juntaron «Comida frita», «Día de calor» y «Fase menstrual». Otras veces que pasó, al día siguiente apareció «Dolor de panza». Si podés, cuidate un poco.',
    });
    expect(textoPreventivo({ ...x, desfase_dias: 2, causas: [x.causas[0]] }, 'en')).toEqual({
      titulo: '🦉 Heads-up for the next few days',
      cuerpo: 'Today there was «Fried food». Other times, «Stomachache» showed up 2 days later. If you can, take it easy.',
    });
  });
});

describe('aviso preventivo', () => {
  it('a la tarde avisa una vez por día cuando se juntan todas las causas de un patrón, se ve en el Día y se puede apagar', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const db = obtenerDb();
    const concepto = async (nombre: string, cat: number) => (await ana.post('/api/conceptos', { nombre, categoria_id: cat })).body.concepto.id as number;
    const frita = await concepto('Comida frita', categorias.comida);
    const helado = await concepto('Helado', categorias.comida);
    const panza = await concepto('Dolor de panza', categorias.sintoma);
    const cabeza = await concepto('Dolor de cabeza', categorias.sintoma);
    // Ayer (así lo anotado ya pasó); a(h) es esa hora UTC, 3 menos en Buenos Aires.
    const ahora = new Date(Date.now() - 86400000);
    const hoy = diaDePatty(ahora, 'America/Argentina/Buenos_Aires');
    const a = (h: number) => new Date(`${hoy}T${String(h).padStart(2, '0')}:10:00Z`);
    for (let i = 1; i <= 10; i++) {
      await ana.post('/api/registros', { persona_id: personaId, concepto_id: i % 2 ? frita : helado, inicio: `${sumarDias(hoy, -i)}T15:00:00Z` });
    }
    const hallazgo = async (causa: number, efecto: number, extra: number[], desfase: number, estado: string, q = 0.05) =>
      db.execute(sql`INSERT INTO hallazgos (persona_id, causa_id, efecto_id, causas_extra, combo, desfase_dias, soporte, dias_causa, dias_evaluados,
                                            prob_con, prob_sin, lift, p_valor, q_valor, puntaje, estado)
                     VALUES (${personaId}, ${causa}, ${efecto}, ${JSON.stringify(extra.map((id) => ({ id, modo: 'presente' })))}::jsonb,
                             ${extra.length ? [causa, ...extra].map((id) => `${id}:presente`).sort().join('+') : ''},
                             ${desfase}, 5, 6, 40, 0.8, 0.1, 6, 0.001, ${q}, ${10 - extra.length}, ${estado})`);
    await hallazgo(frita, panza, [], 1, 'confirmado');
    await hallazgo(frita, panza, [helado], 1, 'nuevo');
    await hallazgo(frita, cabeza, [], 0, 'nuevo'); // el mismo día: ya es tarde para avisar
    await hallazgo(frita, cabeza, [], 2, 'descartado');
    await hallazgo(helado, cabeza, [], 1, 'nuevo', 0.4); // posible, todavía no firme

    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, x) => {
      enviados.push(x);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel-ana', plataforma: 'android' });

    // Hoy, solo comida frita: el patrón simple.
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: frita, inicio: `${hoy}T15:00:00Z` });
    const persona = { id: personaId, nombre: 'Rodrigo', zona_horaria: 'America/Argentina/Buenos_Aires' };
    const simple = await preventivosDeHoy(db, persona, a(20));
    expect(simple).toHaveLength(1);
    expect(simple[0]).toMatchObject({ efecto: 'Dolor de panza', desfase_dias: 1, causas: [{ nombre: 'Comida frita', modo: 'presente' }] });
    expect(await avisarPreventivos(db, a(15))).toBe(0); // las 12: todavía no

    // También helado: la combinación (que dice más) le gana al simple, y es un solo aviso para ese efecto.
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: helado, inicio: `${hoy}T16:00:00Z` });
    expect((await preventivosDeHoy(db, persona, a(20))).map((x) => x.causas.length)).toEqual([2]);
    expect(await avisarPreventivos(db, a(20))).toBe(1);
    expect(enviados[0]).toMatchObject({
      titulo: '🦉 Ojo con mañana',
      cuerpo: 'Anita, hoy se juntaron «Comida frita» y «Helado». Otras veces que pasó, al día siguiente apareció «Dolor de panza». Si podés, cuidate un poco.',
      datos: { tipo: 'preventivo', persona_id: String(personaId) },
    });
    expect(await avisarPreventivos(db, new Date(a(20).getTime() + 5 * 60000))).toBe(0); // la misma hora: no se revisa de nuevo
    expect(await avisarPreventivos(db, a(22))).toBe(0); // otra hora: ese efecto ya se avisó hoy
    expect(await avisarPreventivos(db, a(23))).toBe(0);

    // Apagado: ni aviso ni tarjeta.
    expect((await ana.put('/api/usuarios/yo/preferencias', { avisar_preventivo: false })).body.avisar_preventivo).toBe(false);
    await db.execute(sql`DELETE FROM avisos_enviados`);
    expect(await avisarPreventivos(db, a(21))).toBe(0);
    expect((await ana.get(`/api/preventivo?persona=${personaId}`)).body).toEqual([]);
  });

  it('la tarjeta del Día muestra lo que se juntó hoy', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const db = obtenerDb();
    const frita = (await ana.post('/api/conceptos', { nombre: 'Comida frita', categoria_id: categorias.comida })).body.concepto.id;
    const panza = (await ana.post('/api/conceptos', { nombre: 'Dolor de panza', categoria_id: categorias.sintoma })).body.concepto.id;
    await db.execute(sql`INSERT INTO hallazgos (persona_id, causa_id, efecto_id, desfase_dias, soporte, dias_causa, dias_evaluados,
                                                prob_con, prob_sin, lift, p_valor, q_valor, puntaje, estado)
                         VALUES (${personaId}, ${frita}, ${panza}, 1, 5, 6, 40, 0.8, 0.1, 6, 0.001, 0.05, 5, 'nuevo')`);
    expect((await ana.get(`/api/preventivo?persona=${personaId}`)).body).toEqual([]);
    await ana.post('/api/registros', { persona_id: personaId, concepto_id: frita, inicio: new Date().toISOString() });
    const r = (await ana.get(`/api/preventivo?persona=${personaId}`)).body;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ titulo: '🦉 Ojo con mañana' });
    expect(r[0].cuerpo).toContain('«Comida frita»');
  });
});
