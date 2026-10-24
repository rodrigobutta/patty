import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { usarEnvioPrueba, type Aviso } from '../src/push/firebase.js';
import { revisarDiasSinAnotar, revisarTomas } from '../src/push/recordatorios.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarEnvioPrueba(null));

/** Ana (admin) crea a Rodrigo (hijo) y a Marta (mamá), cada uno con su persona. */
async function familia() {
  const { ana } = await conAdmin();
  const enviados: Array<{ token: string; a: Aviso }> = [];
  usarEnvioPrueba(async (token, a) => {
    enviados.push({ token, a });
    return 'ok';
  });
  const entrar = async (usuario: string, nombre: string, email: string) => {
    await ana.post('/api/usuarios', { usuario, nombre, email, clave: 'secreta1', rol: 'editor' });
    const c = new Cliente();
    await c.post('/api/entrar', { usuario, clave: 'secreta1' });
    const p = await c.post('/api/personas', { nombre });
    await c.post('/api/dispositivos', { token: `tel-${usuario}`, plataforma: 'android' });
    return { c, personaId: p.body.id as number };
  };
  const hijo = await entrar('rodri', 'Rodrigo', 'rodri@x.com');
  const mama = await entrar('marta', 'Marta', 'marta@x.com');
  return { hijo, mama, enviados };
}

describe('supervisión', () => {
  it('invitar, aceptar: el supervisor ve y anota en la persona del supervisado; terminar lo corta', async () => {
    const { hijo, mama, enviados } = await familia();
    expect((await hijo.c.get(`/api/registros?persona=${mama.personaId}`)).status).toBe(404);
    expect((await hijo.c.post('/api/supervision/invitar', { quien: 'nadie' })).status).toBe(400);
    expect((await hijo.c.post('/api/supervision/invitar', { quien: 'rodri' })).status).toBe(400);
    const inv = await hijo.c.post('/api/supervision/invitar', { quien: 'MARTA@x.com' });
    expect(inv.body).toMatchObject({ ok: true, nombre: 'Marta' });
    expect(enviados.at(-1)).toMatchObject({ token: 'tel-marta', a: { datos: { tipo: 'supervision' } } });

    const deMarta = (await mama.c.get('/api/supervision')).body;
    expect(deMarta.te_supervisan).toMatchObject([{ estado: 'pendiente', otro: { nombre: 'Rodrigo' } }]);
    // Solo la invitada contesta
    expect((await hijo.c.post(`/api/supervision/${deMarta.te_supervisan[0].id}/responder`, { aceptar: true })).status).toBe(403);
    // Pendiente: todavía no ve nada
    expect((await hijo.c.get(`/api/registros?persona=${mama.personaId}`)).status).toBe(404);
    await mama.c.post(`/api/supervision/${deMarta.te_supervisan[0].id}/responder`, { aceptar: true });
    expect(enviados.at(-1)).toMatchObject({ token: 'tel-rodri' });

    const personas = (await hijo.c.get('/api/personas')).body;
    expect(personas.find((p: any) => p.id === mama.personaId)).toMatchObject({ supervisada: true, propia: false });
    expect(personas.find((p: any) => p.id === hijo.personaId)).toMatchObject({ supervisada: false, propia: true });
    expect((await hijo.c.post('/api/registros', { persona_id: mama.personaId, concepto_nombre: 'Agua', categoria_id: 3, valor: 1 })).status).toBe(201);

    // Avisarle
    const av = await hijo.c.post(`/api/supervision/${deMarta.te_supervisan[0].id}/avisar`, { texto: 'Acordate del remedio' });
    expect(av.body.enviados).toBe(1);
    expect(enviados.at(-1)).toMatchObject({ token: 'tel-marta', a: { titulo: '📣 Rodrigo', cuerpo: 'Acordate del remedio' } });
    expect((await mama.c.post(`/api/supervision/${deMarta.te_supervisan[0].id}/avisar`, { texto: 'x' })).status).toBe(403);

    // Marta lo termina
    await mama.c.del(`/api/supervision/${deMarta.te_supervisan[0].id}`);
    expect((await hijo.c.get(`/api/registros?persona=${mama.personaId}`)).status).toBe(404);
  });

  it('a quien supervisa le llega la toma sin marcar (no los recordatorios), y el día sin anotar', async () => {
    const { hijo, mama, enviados } = await familia();
    await hijo.c.post('/api/supervision/invitar', { quien: 'marta' });
    const id = (await mama.c.get('/api/supervision')).body.te_supervisan[0].id;
    await mama.c.post(`/api/supervision/${id}/responder`, { aceptar: true });
    await mama.c.post('/api/tratamientos', {
      persona_id: mama.personaId, concepto_nombre: 'Enalapril', dosis: 10, unidad: 'mg', horarios: ['09:00'], inicio: '2026-10-01T03:00:00.000Z',
    });
    const db = obtenerDb();
    enviados.length = 0;
    // 9:00 Buenos Aires = 12:00 UTC: el recordatorio va solo a Marta
    await revisarTomas(db, new Date('2026-10-08T12:01:00.000Z'));
    expect(enviados.map((e) => e.token)).toEqual(['tel-marta']);
    // a la hora sin marcar: a Rodrigo
    enviados.length = 0;
    await revisarTomas(db, new Date('2026-10-08T13:01:00.000Z'));
    expect(enviados).toMatchObject([{ token: 'tel-rodri', a: { titulo: '💊 Marta no marcó Enalapril', datos: { persona_id: String(mama.personaId) } } }]);

    // 21:00 sin nada anotado ese día: a Rodrigo, una vez
    enviados.length = 0;
    expect(await revisarDiasSinAnotar(db, new Date('2026-10-09T00:02:00.000Z'))).toBe(1);
    expect(await revisarDiasSinAnotar(db, new Date('2026-10-09T00:04:00.000Z'))).toBe(0);
    expect(enviados[0]).toMatchObject({ token: 'tel-rodri', a: { titulo: '📝 Marta no anotó nada hoy' } });
    // con algo anotado, no
    await mama.c.post('/api/registros', { persona_id: mama.personaId, concepto_nombre: 'Agua', categoria_id: 3, inicio: '2026-10-09T15:00:00.000Z' });
    expect(await revisarDiasSinAnotar(db, new Date('2026-10-10T00:02:00.000Z'))).toBe(1 - 1);
  });
});

describe('supervisión con código', () => {
  it('el supervisado muestra un código y el supervisor lo escribe: queda aceptada, una sola vez', async () => {
    const { hijo, mama, enviados } = await familia();
    const k = await mama.c.post('/api/supervision/codigo');
    expect(k.body.codigo).toMatch(/^[A-Z2-9]{6}$/);
    expect((await mama.c.post('/api/supervision/con-codigo', { codigo: k.body.codigo })).status).toBe(400);
    expect((await hijo.c.post('/api/supervision/con-codigo', { codigo: 'ZZZZZZ' })).status).toBe(400);
    const r = await hijo.c.post('/api/supervision/con-codigo', { codigo: ` ${k.body.codigo.toLowerCase().slice(0, 3)}-${k.body.codigo.slice(3)} ` });
    expect(r.body).toMatchObject({ ok: true, nombre: 'Marta' });
    expect(enviados.at(-1)).toMatchObject({ token: 'tel-marta' });
    expect((await hijo.c.get(`/api/registros?persona=${mama.personaId}`)).status).toBe(200);
    expect((await hijo.c.post('/api/supervision/con-codigo', { codigo: k.body.codigo })).status).toBe(400);
  });
});

describe('perfil de la persona', () => {
  it('guarda los datos opcionales, los valida y los devuelve', async () => {
    const { ana, personaId } = await conAdmin();
    const r = await ana.put(`/api/personas/${personaId}`, { nacimiento: '1958-03-10', sexo: 'femenino', altura_cm: '160', peso_kg: '70,5', condiciones: ['Hipertensión', 'Hipertensión', 'Celiaquía'] });
    expect(r.status).toBe(200);
    const p = (await ana.get('/api/personas')).body.find((x: any) => x.id === personaId);
    expect(p).toMatchObject({ nacimiento: '1958-03-10', sexo: 'femenino', altura_cm: 160, peso_kg: 70.5, condiciones: ['Hipertensión', 'Celiaquía'] });
    expect((await ana.put(`/api/personas/${personaId}`, { altura_cm: 1.6 })).status).toBe(400);
    expect((await ana.put(`/api/personas/${personaId}`, { sexo: 'x' })).status).toBe(400);
    const { perfilTexto } = await import('shared');
    expect(perfilTexto(p, new Date('2026-10-24T12:00:00Z'))).toBe('mujer, 68 años, 1,60 m, 70,5 kg; condiciones: hipertensión, celiaquía');
  });
});
