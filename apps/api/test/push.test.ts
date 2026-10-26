import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { revisarTomas } from '../src/push/recordatorios.js';
import { conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

describe('avisos push de remedios', () => {
  it('con varias tomas sin marcar manda un solo aviso que las junta, con la misma etiqueta para reemplazar al anterior', async () => {
    const { ana, personaId } = await conAdmin();
    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    // Paracetamol cada 6 horas desde las 00:03 (Buenos Aires) e ibuprofeno a las 06:03.
    await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Paracetamol', dosis: 500, unidad: 'mg', cada_horas: 6, inicio: '2026-10-25T03:03:00.000Z' });
    await ana.post('/api/tratamientos', { persona_id: personaId, concepto_nombre: 'Ibuprofeno', horarios: ['06:03'], inicio: '2026-10-25T03:00:00.000Z' });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    const db = obtenerDb();
    expect(await revisarTomas(db, new Date('2026-10-25T03:04:00.000Z'))).toBe(1);
    expect(enviados[0]).toMatchObject({ titulo: '💊 Paracetamol 500 mg', cuerpo: 'Anita, es la hora de la toma de las 00:03.', etiqueta: `remedios|${personaId}` });
    // A las 06:03 tocan dos más y la de las 00:03 sigue sin marcar: un solo aviso con las tres.
    enviados.length = 0;
    expect(await revisarTomas(db, new Date('2026-10-25T09:04:00.000Z'))).toBe(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({
      titulo: 'Anita, te estás olvidando 3 tomas',
      cuerpo: 'Paracetamol 500 mg de las 00:03 y 06:03; Ibuprofeno de las 06:03. Marcalas cuando las tomes.',
      etiqueta: `remedios|${personaId}`,
    });
    expect(JSON.parse(enviados[0].datos!.tomas)).toHaveLength(3);
  });

  it('manda la toma y el "¿la tomaste?" una sola vez, solo después de lo que el teléfono ya tiene programado', async () => {
    const { ana, personaId } = await conAdmin();
    const enviados: Array<{ token: string; a: Aviso }> = [];
    usarEnvioPrueba(async (token, a) => {
      enviados.push({ token, a });
      return token === 'viejo' ? 'invalido' : 'ok';
    });
    const t = await ana.post('/api/tratamientos', {
      persona_id: personaId, concepto_nombre: 'Vitamina D', dosis: 1, unidad: 'comprimido', horarios: ['09:00'], inicio: '2026-10-01T03:00:00.000Z',
    });
    expect(t.status).toBe(201);
    expect((await ana.post('/api/dispositivos', { token: 'tel-1', plataforma: 'android', avisos_hasta: '2026-10-05T00:00:00.000Z' })).status).toBe(200);
    await ana.post('/api/dispositivos', { token: 'viejo', plataforma: 'android' });
    const db = obtenerDb();

    // 9:00 en Buenos Aires = 12:00 UTC. El 3 el teléfono ya lo tenía: no se manda.
    expect(await revisarTomas(db, new Date('2026-10-03T12:01:00.000Z'))).toBe(0);
    expect(enviados.map((e) => e.token)).toEqual(['viejo']); // y el token que ya no sirve se olvida
    enviados.length = 0;
    expect(await revisarTomas(db, new Date('2026-10-08T12:01:00.000Z'))).toBe(1);
    expect(await revisarTomas(db, new Date('2026-10-08T12:02:00.000Z'))).toBe(0); // no se repite
    expect(enviados[0]).toMatchObject({ token: 'tel-1', a: { titulo: '💊 Vitamina D 1 comprimido', cuerpo: 'Anita, es la hora de la toma de las 09:00.', canal: 'remedios' } });
    expect(await revisarTomas(db, new Date('2026-10-08T12:31:00.000Z'))).toBe(1);
    expect(enviados[1].a.titulo).toBe('Anita, ¿tomaste Vitamina D?');

    // Marcada: no se insiste.
    await ana.post(`/api/tratamientos/${t.body.id}/tomas`, { programada: '2026-10-09T12:00:00.000Z', estado: 'tomada' });
    expect(await revisarTomas(db, new Date('2026-10-09T12:31:00.000Z'))).toBe(0);
  });
});

describe('aviso de "te extraño"', () => {
  it('a las 19 de la persona, si no anotó nada en el día, con la cara triste; una vez', async () => {
    const { revisarTeExtrano, avisoTeExtrano } = await import('../src/push/recordatorios.js');
    const { ana, personaId, categorias } = await conAdmin();
    const enviados: Array<{ token: string; a: Aviso }> = [];
    usarEnvioPrueba(async (token, a) => {
      enviados.push({ token, a });
      return 'ok';
    });
    await ana.post('/api/dispositivos', { token: 'tel-ana', plataforma: 'android' });
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Agua', categoria_id: categorias.bebida, inicio: '2026-10-20T15:00:00.000Z' });
    const db = obtenerDb();
    // 19:00 en Buenos Aires = 22:00 UTC. El 22 no anotó nada: hace 2 días.
    expect(await revisarTeExtrano(db, new Date('2026-10-22T22:01:00.000Z'))).toBe(1);
    expect(await revisarTeExtrano(db, new Date('2026-10-22T22:03:00.000Z'))).toBe(0);
    expect(enviados[0].a).toMatchObject({ titulo: '😢 Hace 2 días que no sé de vos', datos: { tipo: 'te_extrano', cara: 'triste' } });
    // fuera de hora, nada
    expect(await revisarTeExtrano(db, new Date('2026-10-23T15:00:00.000Z'))).toBe(0);
    // si anotó ese día, nada
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Agua', categoria_id: categorias.bebida, inicio: '2026-10-23T15:00:00.000Z' });
    expect(await revisarTeExtrano(db, new Date('2026-10-23T22:01:00.000Z'))).toBe(0);
    // apagado: nada
    expect((await ana.put('/api/usuarios/yo/preferencias', { avisar_sin_anotar: false })).body).toEqual({ avisar_sin_anotar: false, apodo: null, ranking: true });
    expect(await revisarTeExtrano(db, new Date('2026-10-25T22:01:00.000Z'))).toBe(0);
    expect(avisoTeExtrano('Rodrigo Butta', 1).titulo).toBe('😢 Hoy no me contaste nada');
    expect(avisoTeExtrano('Rodrigo', 9).titulo).toBe('😢 Te extraño');
  });
});

describe('avisos de permisos que faltan', () => {
  it('a las 12, uno por día, con el permiso que falta; cada uno como mucho 3 veces', async () => {
    const { ana } = await conAdmin();
    const enviados: Aviso[] = [];
    usarEnvioPrueba(async (_t, a) => {
      enviados.push(a);
      return 'ok';
    });
    await ana.post('/api/personas', { nombre: 'Ana' });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    await ana.post('/api/dispositivos/estado', {
      instalacion: 'abcdef0123', plataforma: 'android', push_token: 'tel',
      permisos: { avisos: 'si', ubicacion: 'en_uso', uso_apps: 'no', llamadas: 'si', salud: 3 },
    });
    const { revisarPermisos } = await import('../src/push/recordatorios.js');
    const db = obtenerDb();
    expect(await revisarPermisos(db, new Date())).toBeGreaterThanOrEqual(0); // fuera de hora no importa
    enviados.length = 0;
    // 12:01 en Buenos Aires = 15:01 UTC
    expect(await revisarPermisos(db, new Date('2026-10-26T15:01:00.000Z'))).toBe(1);
    expect(await revisarPermisos(db, new Date('2026-10-26T15:02:00.000Z'))).toBe(0); // uno por día
    expect(enviados[0]).toMatchObject({ titulo: '📍 Activá la ubicación «siempre»', datos: { tipo: 'permiso', permiso: 'ubicacion' } });
    // Al otro día, el siguiente (la ubicación espera 3 días)
    expect(await revisarPermisos(db, new Date('2026-10-27T15:01:00.000Z'))).toBe(1);
    expect(enviados[1].datos?.permiso).toBe('telefono');
  });
});
