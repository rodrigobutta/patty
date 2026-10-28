import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb, una } from '../src/db/client.js';
import { diaDePatty, localAInstante, sumarDias } from '../src/lib/fechas.js';
import { revisarFueraDeLoNormal } from '../src/patrones/noche.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { obtenerOCrearConcepto } from '../src/routes/conceptos.js';
import { conAdmin } from './ayudas.js';

const ZONA = 'America/Argentina/Buenos_Aires';
afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('fuera de lo normal', () => {
  it('nota 3 noches durmiendo menos y una molestia que se repite; avisa una vez y se ve en el Día', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const db = obtenerDb();
    // Las 11 de hoy en Buenos Aires.
    const hoy = diaDePatty(new Date(), ZONA);
    const ahora = localAInstante(hoy, '11:05', ZONA);
    const fuente = (await una<{ id: number }>(db, sql`INSERT INTO fuentes (persona_id, tipo, nombre, token_hash) VALUES (${personaId}, 'otro', 'Reloj', 'x') RETURNING id`))!;
    const cat = (await una<{ id: number }>(db, sql`SELECT id FROM categorias WHERE clave = 'sueno'`))!;
    const { concepto } = await db.transaction((tx) => obtenerOCrearConcepto(tx, { nombre: 'Horas de sueño', categoriaId: cat.id, tipoValor: 'medida', unidad: 'h' }));
    for (let k = 30; k >= 0; k--) {
      const fecha = sumarDias(hoy, -k);
      await db.execute(sql`INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fecha, valor) VALUES (${personaId}, ${concepto.id}, ${fuente.id}, ${`${fecha}T10:00:00Z`}, ${fecha}, ${k <= 2 ? 5.5 : 7.5})`);
    }
    // Dolor de cabeza: uno hace 4 semanas, y 3 días esta semana (y algo anotado hace 5 semanas, para tener con qué comparar).
    const anotar = (dias: number, nombre: string, categoria_id: number) =>
      ana.post('/api/registros', { persona_id: personaId, concepto_nombre: nombre, categoria_id, intensidad: 5, inicio: localAInstante(sumarDias(hoy, -dias), '15:00', ZONA).toISOString() });
    await anotar(35, 'Café', categorias.bebida);
    for (const d of [28, 1, 3, 5]) await anotar(d, 'Dolor de cabeza', categorias.sintoma);

    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    expect(await revisarFueraDeLoNormal(db, localAInstante(hoy, '09:05', ZONA))).toBe(0); // todavía no
    expect(await revisarFueraDeLoNormal(db, ahora)).toBe(2);
    expect(await revisarFueraDeLoNormal(db, new Date(ahora.getTime() + 20 * 60000))).toBe(0); // una vez por día
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ titulo: '🦉 Algo distinto estos días', datos: { tipo: 'fuera' } });
    expect(enviados[0].cuerpo).toContain('Hace 3 noches que dormís menos de lo habitual: 2 h menos');

    const l = (await ana.get(`/api/fuera-de-lo-normal?persona=${personaId}`)).body;
    expect(l.map((x: any) => x.emoji).sort()).toEqual(['😴', '🤕']);
    expect(l.find((x: any) => x.emoji === '🤕').texto).toContain('dolor de cabeza 3 días');
    expect((await ana.put(`/api/fuera-de-lo-normal/${l[0].id}`, { estado: 'visto' })).status).toBe(200);
  });
});
