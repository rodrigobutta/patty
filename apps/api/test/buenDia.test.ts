import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarClientePrueba } from '../src/ia/cliente.js';
import { fechaLocal, localAInstante } from '../src/lib/fechas.js';
import { avisoBuenDia, duracionSueno, esperarBuenDia, mandarBuenDia } from '../src/push/buenDia.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin, type Cliente } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => {
  usarEnvioPrueba(null);
  usarClientePrueba(null);
});

const BA = 'America/Argentina/Buenos_Aires';

/** Ana con su teléfono, la fuente del reloj de Rodrigo y los avisos que se mandan. */
async function preparar() {
  const { ana, personaId } = await conAdmin();
  const enviados: Aviso[] = [];
  usarEnvioPrueba(async (_t, x) => {
    enviados.push(x);
    return 'ok';
  });
  await ana.post('/api/dispositivos', { token: 'tel-ana', plataforma: 'android' });
  const fuente = (await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'reloj', nombre: 'Reloj y salud' })).body.token as string;
  return { ana, personaId, enviados, fuente };
}

/** Lo que manda el teléfono a la mañana: el sueño de la noche que terminó `fecha`, con el día que arranca a las 0:00. */
async function mandarSueno(ana: Cliente, fuente: string, fecha: string, horas: number, zona = BA) {
  ana.headers.Authorization = `Bearer ${fuente}`;
  const inicio = localAInstante(fecha, '00:00', zona).toISOString();
  const r = await ana.post('/api/ingesta', {
    mediciones: [
      { concepto: 'Horas de sueño', categoria: 'sueno', unidad: 'h', valor: horas, inicio },
      { concepto: 'Hora de dormir', categoria: 'sueno', unidad: 'hora', valor: 23.5, inicio },
    ],
  });
  delete ana.headers.Authorization;
  expect(r.status).toBe(200);
}

const iaQueDa = (calidad: number) => {
  const crear = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ texto: 'Dormiste bien.', calidad }) }] });
  usarClientePrueba({ messages: { create: crear }, beta: { messages: { create: crear } } } as unknown as Anthropic);
};

describe('buen día', () => {
  it('el texto: las horas en horas y minutos, con la nota si la hay', () => {
    expect(duracionSueno(7.2)).toBe('7 h 12 min');
    expect(duracionSueno(8)).toBe('8 h');
    expect(duracionSueno(0.75)).toBe('45 min');
    expect(avisoBuenDia(3, '2026-03-10', 7.2, 8, 'es')).toMatchObject({
      titulo: '☀️ Buen día',
      cuerpo: 'Dormiste 7 h 12 min (nota 8). Tocá para ver tu noche.',
      datos: { tipo: 'buen_dia', persona_id: '3', fecha: '2026-03-10' },
      conApodo: true,
    });
    expect(avisoBuenDia(3, '2026-03-10', 7.2, null, 'en').cuerpo).toBe('You slept 7 h 12 min. Tap to see your night.');
  });

  it('solo a la mañana, una vez por día, con el resumen de la IA', async () => {
    const { ana, personaId, enviados, fuente } = await preparar();
    const db = obtenerDb();
    iaQueDa(8);
    // Las horas son UTC: en Buenos Aires, 3 menos.
    const a = (hora: string) => new Date(`2026-03-10T${hora}:00Z`);
    await mandarSueno(ana, fuente, '2026-03-10', 7.2);
    await esperarBuenDia();
    expect(await mandarBuenDia(db, personaId, a('07:30'))).toBe(0); // 4:30: todavía es de noche
    expect(await mandarBuenDia(db, personaId, a('16:00'))).toBe(0); // 13:00: ya pasó la mañana
    expect(enviados).toHaveLength(0);
    expect(await mandarBuenDia(db, personaId, a('11:00'))).toBe(1); // 8:00
    expect(enviados[0]).toMatchObject({
      titulo: '☀️ Buen día',
      cuerpo: 'Anita, dormiste 7 h 12 min (nota 8). Tocá para ver tu noche.',
      datos: { tipo: 'buen_dia', persona_id: String(personaId), fecha: '2026-03-10' },
    });
    // El resumen quedó guardado (lo abre el Día).
    expect((await ana.get(`/api/sueno/resumen?persona=${personaId}&fecha=2026-03-10`)).body).toMatchObject({ calidad: 8 });
    // Otra ingesta esa misma mañana: nada.
    expect(await mandarBuenDia(db, personaId, a('12:00'))).toBe(0);
    expect(enviados).toHaveLength(1);
    // Sin la noche de ese día, nada (al otro día, sin datos todavía).
    expect(await mandarBuenDia(db, personaId, new Date('2026-03-11T11:00:00Z'))).toBe(0);
  });

  it('sin IA va igual, con las horas', async () => {
    const { ana, personaId, enviados, fuente } = await preparar();
    await mandarSueno(ana, fuente, '2026-03-10', 6.5);
    await esperarBuenDia();
    expect(await mandarBuenDia(obtenerDb(), personaId, new Date('2026-03-10T10:00:00Z'))).toBe(1);
    expect(enviados[0].cuerpo).toBe('Anita, dormiste 6 h 30 min. Tocá para ver tu noche.');
  });

  it('apagado en Más → Avisos, no llega', async () => {
    const { ana, personaId, enviados, fuente } = await preparar();
    expect((await ana.put('/api/usuarios/yo/preferencias', { avisar_buen_dia: false })).body.avisar_buen_dia).toBe(false);
    await mandarSueno(ana, fuente, '2026-03-10', 8);
    await esperarBuenDia();
    expect(await mandarBuenDia(obtenerDb(), personaId, new Date('2026-03-10T10:00:00Z'))).toBe(0);
    expect(enviados).toHaveLength(0);
    // Prendido de nuevo, esa misma mañana llega.
    expect((await ana.put('/api/usuarios/yo/preferencias', { avisar_buen_dia: true })).body.avisar_buen_dia).toBe(true);
    expect(await mandarBuenDia(obtenerDb(), personaId, new Date('2026-03-10T10:00:00Z'))).toBe(1);
  });

  it('lo dispara la ingesta cuando trae el sueño de hoy y es la mañana', async () => {
    const { ana, personaId, enviados, fuente } = await preparar();
    const db = obtenerDb();
    // Una zona donde ahora son las 9 (o cerca), para que la ingesta de verdad caiga a la mañana.
    const ahora = new Date();
    let desfase = 9 - ahora.getUTCHours();
    if (desfase < -12) desfase += 24;
    const zona = desfase === 0 ? 'Etc/UTC' : `Etc/GMT${desfase > 0 ? '-' : '+'}${Math.abs(desfase)}`;
    await db.execute(sql`UPDATE personas SET zona_horaria = ${zona} WHERE id = ${personaId}`);
    const hoy = fechaLocal(ahora, zona);
    // Otra cosa que no es el sueño: nada.
    ana.headers.Authorization = `Bearer ${fuente}`;
    await ana.post('/api/ingesta', { mediciones: [{ concepto: 'Pasos', valor: 5000, inicio: localAInstante(hoy, '00:00', zona).toISOString() }] });
    delete ana.headers.Authorization;
    await esperarBuenDia();
    expect(enviados).toHaveLength(0);
    await mandarSueno(ana, fuente, hoy, 7, zona);
    await esperarBuenDia();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].cuerpo).toContain('7 h');
    // El teléfono la vuelve a mandar al rato (o la app abierta y el trabajo de segundo plano): no se repite.
    await mandarSueno(ana, fuente, hoy, 7, zona);
    await esperarBuenDia();
    expect(enviados).toHaveLength(1);
  });
});
