import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { diaDePatty, localAInstante } from '../src/lib/fechas.js';
import { avisarSeguimientos } from '../src/patrones/seguimientos.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { conAdmin } from './ayudas.js';

const ZONA = 'America/Argentina/Buenos_Aires';
afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('seguimientos', () => {
  it('se activa una plantilla por unos días; a la hora elegida Patty pregunta lo que falta de hoy; se puede terminar', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const plantilla = { nombre: 'Estoy enfermo/a', emoji: '🤒', items: ['sentir', 'temperatura', 'desayuno', 'cena', 'vomitos', 'inventado'], horarios: ['14:00', '9:00', '20:30'], dias: 5 };
    expect((await ana.post('/api/seguimientos', { persona_id: personaId, plantilla: { ...plantilla, items: [] } })).status).toBe(400);
    expect((await ana.post('/api/seguimientos', { persona_id: personaId, plantilla })).status).toBe(201);
    const l = (await ana.get(`/api/seguimientos?persona=${personaId}`)).body;
    expect(l.activos).toMatchObject([{ nombre: 'Estoy enfermo/a', items: ['sentir', 'temperatura', 'desayuno', 'cena', 'vomitos'], horarios: ['14:00', '20:30'], dias: 5, activado_por: 'Ana' }]);

    const hoy = diaDePatty(new Date(), ZONA);
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Tostadas', categoria_id: categorias.comida, inicio: localAInstante(hoy, '08:30', ZONA).toISOString() });
    const tt = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Temperatura corporal', categoria_id: categorias.sintoma, valor: 38.2, unidad: '°C', inicio: localAInstante(hoy, '09:00', ZONA).toISOString() });
    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    const db = obtenerDb();
    // Como si se hubiera activado a la mañana (si no, la prueba depende de la hora en que corre).
    await db.execute(sql`UPDATE seguimientos SET desde = ${localAInstante(hoy, '06:00', ZONA).toISOString()} WHERE persona_id = ${personaId}`);
    expect(await avisarSeguimientos(db, localAInstante(hoy, '13:59', ZONA))).toBe(0);
    expect(await avisarSeguimientos(db, localAInstante(hoy, '14:00', ZONA))).toBe(1);
    expect(await avisarSeguimientos(db, localAInstante(hoy, '14:00', ZONA))).toBe(0); // una vez
    // Falta cómo se siente; la cena todavía no; los vómitos son opcionales.
    expect(enviados[0]).toMatchObject({ titulo: '🤒 ¿Cómo seguís?', cuerpo: 'Contame cómo te sentís. Te falta anotar: cómo me siento.', datos: { tipo: 'seguimiento' } });
    // A las 20:30, lo de cada vez (cómo me siento, la temperatura) se vuelve a pedir; el desayuno (una vez al día), no;
    // la cena todavía no.
    expect(await avisarSeguimientos(db, localAInstante(hoy, '20:30', ZONA))).toBe(1);
    expect(enviados[1].cuerpo).toBe('Contame cómo te sentís. Te falta anotar: cómo me siento, temperatura corporal y cena.');

    expect((await ana.del(`/api/seguimientos/${l.activos[0].id}`)).status).toBe(200);
    expect((await ana.get(`/api/seguimientos?persona=${personaId}`)).body.activos).toEqual([]);

    // Hasta que se desactive.
    expect((await ana.post('/api/seguimientos', { persona_id: personaId, plantilla: { ...plantilla, dias: 0 } })).status).toBe(201);
    const sin = (await ana.get(`/api/seguimientos?persona=${personaId}`)).body.activos[0];
    expect(Date.parse(sin.hasta) - Date.now()).toBeGreaterThan(50 * 365 * 86400000);

    // Plantillas propias.
    const p = await ana.post('/api/seguimientos/plantillas', { persona_id: personaId, nombre: 'Muelas', items: ['sentir', 'dientes'], horarios: ['21:00'], dias: 3 });
    expect(p.status).toBe(201);
    expect((await ana.get(`/api/seguimientos?persona=${personaId}`)).body.plantillas).toMatchObject([{ nombre: 'Muelas', items: ['sentir', 'dientes'] }]);
  });
});
