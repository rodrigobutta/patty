import { sql } from 'drizzle-orm';
import { conPosiciones, mejorRacha, METRICAS, METRICAS_COMPETENCIA, nombreCompetenciaPermitido, totalConTope } from 'shared';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb, una } from '../src/db/client.js';
import { diaDePatty, localAInstante, sumarDias } from '../src/lib/fechas.js';
import { obtenerOCrearConcepto } from '../src/routes/conceptos.js';
import { Cliente, conAdmin } from './ayudas.js';

const ZONA = 'America/Argentina/Buenos_Aires';
afterAll(() => cerrarDb());

/** Ana (con su persona) y otros usuarios, cada uno con la suya. */
async function grupo() {
  const { ana, personaId, categorias } = await conAdmin();
  const entrar = async (usuario: string, nombre: string) => {
    await ana.post('/api/usuarios', { usuario, nombre, email: `${usuario}@x.com`, clave: 'secreta1', rol: 'editor' });
    const c = new Cliente();
    await c.post('/api/entrar', { usuario, clave: 'secreta1' });
    const p = await c.post('/api/personas', { nombre });
    return { c, personaId: p.body.id as number };
  };
  return { ana, personaId, categorias, beto: await entrar('beto', 'Beto Pérez'), caro: await entrar('caro', 'Caro Gómez'), dani: await entrar('dani', 'Dani Ruiz') };
}

/** Lo que manda un reloj: un valor de un concepto en un día. */
async function medir(personaId: number, nombre: string, categoria: string, fecha: string, valor: number, fuenteNombre = 'Reloj') {
  const db = obtenerDb();
  const fuente =
    (await una<{ id: number }>(db, sql`SELECT id FROM fuentes WHERE persona_id = ${personaId} AND nombre = ${fuenteNombre}`)) ??
    (await una<{ id: number }>(db, sql`INSERT INTO fuentes (persona_id, tipo, nombre, token_hash) VALUES (${personaId}, 'otro', ${fuenteNombre}, ${`t-${personaId}-${fuenteNombre}`}) RETURNING id`))!;
  const cat = (await una<{ id: number }>(db, sql`SELECT id FROM categorias WHERE clave = ${categoria}`))!;
  const { concepto } = await db.transaction((tx) => obtenerOCrearConcepto(tx, { nombre, categoriaId: cat.id, tipoValor: 'medida', unidad: null }));
  await db.execute(sql`INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fecha, valor) VALUES (${personaId}, ${concepto.id}, ${fuente!.id}, ${`${fecha}T12:00:00Z`}, ${fecha}, ${valor})`);
}

const nueva = async (c: Cliente, metrica = 'pasos', duracion = 'semana') => {
  const r = await c.post('/api/competencias', { metrica, duracion, acepto: true });
  expect(r.status).toBe(201);
  return r.body as { id: number; codigo: string };
};
const aceptar = (c: Cliente, codigo: string) => c.post(`/api/competencias/invitacion/${codigo}/aceptar`, { acepto: true });

describe('cómo se cuenta una competencia', () => {
  it('solo hábitos, cada día con un tope razonable', () => {
    expect([...METRICAS_COMPETENCIA].sort()).toEqual(['dias', 'km', 'pasos', 'racha', 'sueno']);
    expect(METRICAS.pasos.tope).toBe(15000);
    expect(METRICAS.sueno.tope).toBe(8);
    expect(METRICAS.km.tope).toBe(12);
    expect(totalConTope('pasos', [20000, 5000])).toBe(20000);
    expect(totalConTope('sueno', [12, 7.5])).toBe(15.5);
    expect(totalConTope('km', [30])).toBe(12);
  });

  it('sin dato es null, no cero; un cero medido sí es un número', () => {
    expect(totalConTope('pasos', [])).toBeNull();
    expect(totalConTope('pasos', [0])).toBe(0);
    expect(mejorRacha([0, 0], 50)).toBeNull();
    expect(mejorRacha([10, 0], 50)).toBe(0);
    expect(mejorRacha([60, 60, 10, 60], 50)).toBe(2);
  });

  it('los empatados comparten puesto y sin dato va al final, sin puesto', () => {
    const l = conPosiciones([
      { apodo: 'Sin', valor: null },
      { apodo: 'Uno', valor: 5 },
      { apodo: 'Dos', valor: 9 },
      { apodo: 'Tres', valor: 9 },
    ]);
    expect(l.map((f) => [f.apodo, f.posicion])).toEqual([['Dos', 1], ['Tres', 1], ['Uno', 3], ['Sin', null]]);
  });

  it('el nombre no puede ser de peso, comer menos ni ayuno', () => {
    for (const n of ['Quién baja más de peso', 'Kilos menos', 'Ayuno 16/8', 'La DIETA', 'Calorías', 'Comer menos']) expect(nombreCompetenciaPermitido(n)).toBe(false);
    for (const n of ['Los primos', 'Desayuno de campeones', 'Caminata de la oficina']) expect(nombreCompetenciaPermitido(n)).toBe(true);
  });
});

describe('competencias', () => {
  it('crear exige aceptar y una métrica de hábitos: no hay de peso, comer menos ni ayuno', async () => {
    const { ana } = await conAdmin();
    for (const metrica of ['peso', 'comidas', 'ayuno', 'calorias', 'animo', 'dolor', 'remedios', 'ubicacion']) {
      expect((await ana.post('/api/competencias', { metrica, duracion: 'semana', acepto: true })).status).toBe(400);
    }
    expect((await ana.post('/api/competencias', { metrica: 'pasos', duracion: 'semana' })).status).toBe(400);
    expect((await ana.post('/api/competencias', { metrica: 'pasos', duracion: 'año', acepto: true })).status).toBe(400);
    expect((await ana.post('/api/competencias', { metrica: 'pasos', duracion: 'semana', acepto: true, nombre: 'A ver quién baja de peso' })).status).toBe(400);
    const hoy = diaDePatty(new Date(), ZONA);
    for (const [duracion, dias] of [['semana', 7], ['mes', 30]] as const) {
      const c = await nueva(ana, 'dias', duracion);
      expect(c.codigo).toMatch(/^[A-Z2-9]{8}$/);
      const d = (await ana.get(`/api/competencias/${c.id}`)).body;
      expect(d).toMatchObject({ desde: hoy, hasta: sumarDias(hoy, dias - 1), estado: 'en_curso', dias_restantes: dias });
    }
  });

  it('participar es por invitación y aceptación: sin aceptar no estás ni se ve tu número', async () => {
    const { ana, personaId, beto } = await grupo();
    const hoy = diaDePatty(new Date(), ZONA);
    await medir(beto.personaId, 'Pasos', 'actividad', hoy, 9000);
    await medir(personaId, 'Pasos', 'actividad', hoy, 4000);
    const { id, codigo } = await nueva(ana);

    // Con el código solo ve de qué se trata y quién invita; ni su id ni números ni quién más está.
    const inv = await beto.c.get(`/api/competencias/invitacion/${codigo.toLowerCase()}`);
    expect(inv.status).toBe(200);
    expect(Object.keys(inv.body).sort()).toEqual(['dias_restantes', 'desde', 'duracion', 'estado', 'hasta', 'id', 'invita', 'metrica', 'nombre', 'tu_apodo', 'ya_participas'].sort());
    expect(inv.body).toMatchObject({ id: null, ya_participas: false, invita: 'Anita', tu_apodo: 'Beto', metrica: 'pasos' });
    expect((await beto.c.get('/api/competencias/invitacion/NOEXISTE')).status).toBe(404);

    // Ver la invitación no suma a nadie.
    expect((await beto.c.get(`/api/competencias/${id}`)).status).toBe(404);
    expect((await ana.get(`/api/competencias/${id}`)).body.posiciones).toHaveLength(1);
    // Hay que decir que sí, explícitamente.
    expect((await beto.c.post(`/api/competencias/invitacion/${codigo}/aceptar`, {})).status).toBe(400);
    expect((await beto.c.post(`/api/competencias/invitacion/${codigo}/aceptar`, { acepto: 'si' })).status).toBe(400);
    expect((await ana.get(`/api/competencias/${id}`)).body.posiciones).toHaveLength(1);

    expect((await aceptar(beto.c, codigo)).body).toEqual({ id });
    const t = (await ana.get(`/api/competencias/${id}`)).body.posiciones;
    expect(t).toEqual([
      { posicion: 1, apodo: 'Beto', valor: 9000, yo: false },
      { posicion: 2, apodo: 'Anita', valor: 4000, yo: true },
    ]);
    expect((await beto.c.get(`/api/competencias/invitacion/${codigo}`)).body).toMatchObject({ id, ya_participas: true });
  });

  it('quien no participa no ve nada', async () => {
    const { ana, beto, caro } = await grupo();
    const { id, codigo } = await nueva(ana);
    await aceptar(beto.c, codigo);
    for (const ruta of [`/api/competencias/${id}`]) {
      const r = await caro.c.get(ruta);
      expect(r.status).toBe(404);
      expect(JSON.stringify(r.body)).not.toMatch(/Anita|Beto|posiciones/);
    }
    expect((await caro.c.get('/api/competencias')).body).toEqual([]);
    expect((await caro.c.del(`/api/competencias/${id}/participacion`)).status).toBe(404);
    // Sin sesión, tampoco.
    const anonimo = new Cliente();
    expect((await anonimo.get(`/api/competencias/${id}`)).status).toBe(401);
    expect((await anonimo.get(`/api/competencias/invitacion/${codigo}`)).status).toBe(401);
    expect((await anonimo.post(`/api/competencias/invitacion/${codigo}/aceptar`, { acepto: true })).status).toBe(401);
    // Ser supervisor de alguien no da acceso a sus competencias.
    await caro.c.post('/api/supervision/invitar', { quien: 'beto' });
    const pendiente = (await beto.c.get('/api/supervision')).body.te_supervisan[0];
    await beto.c.post(`/api/supervision/${pendiente.id}/responder`, { aceptar: true });
    expect((await caro.c.get(`/api/competencias/${id}`)).status).toBe(404);
  });

  it('la respuesta solo trae el apodo, el puesto y el número: ningún otro dato', async () => {
    const { ana, personaId, categorias, beto } = await grupo();
    const hoy = diaDePatty(new Date(), ZONA);
    const a = localAInstante(hoy, '09:00', ZONA).toISOString();
    // Beto anotó de todo y tiene foto.
    for (const [nombre, categoria_id] of [['Migraña secreta', categorias.sintoma], ['Pizza secreta', categorias.comida], ['Cómo me siento', categorias.animo], ['Ibuprofeno secreto', categorias.medicacion]] as const) {
      expect((await beto.c.post('/api/registros', { persona_id: beto.personaId, concepto_nombre: nombre, categoria_id, inicio: a, intensidad: 8 })).status).toBe(201);
    }
    await obtenerDb().execute(sql`UPDATE usuarios SET foto = 'https://foto.secreta/beto.png' WHERE usuario = 'beto'`);
    await medir(beto.personaId, 'Pasos', 'actividad', hoy, 1000);
    await medir(beto.personaId, 'Peso', 'actividad', hoy, 83);
    await medir(personaId, 'Pasos', 'actividad', hoy, 1000);

    for (const metrica of ['pasos', 'dias', 'racha', 'sueno', 'km']) {
      const { id, codigo } = await nueva(ana, metrica);
      await aceptar(beto.c, codigo);
      const r = await ana.get(`/api/competencias/${id}`);
      expect(Object.keys(r.body).sort()).toEqual(['codigo', 'desde', 'dias_restantes', 'duracion', 'estado', 'hasta', 'id', 'metrica', 'nombre', 'posiciones'].sort());
      for (const f of r.body.posiciones) expect(Object.keys(f).sort()).toEqual(['apodo', 'posicion', 'valor', 'yo']);
      // El código es al azar (podría tener un 83): se mira todo lo demás.
      const crudo = JSON.stringify({ ...r.body, codigo: '' });
      for (const secreto of ['secret', 'Migraña', 'Pizza', 'Ibuprofeno', 'Pérez', 'beto@', 'foto', 'persona_id', 'usuario_id', 'intensidad', '83']) expect(crudo).not.toContain(secreto);
      const lista = await ana.get('/api/competencias');
      const fila = lista.body.find((x: { id: number }) => x.id === id);
      expect(Object.keys(fila).sort()).toEqual(['codigo', 'desde', 'dias_restantes', 'duracion', 'estado', 'hasta', 'id', 'metrica', 'mi_posicion', 'mi_valor', 'nombre', 'participantes'].sort());
    }
  });

  it('sin dato muestra null, no cero, y no le gana a nadie', async () => {
    const { ana, personaId, beto, caro } = await grupo();
    const hoy = diaDePatty(new Date(), ZONA);
    await medir(personaId, 'Km a pie', 'actividad', hoy, 3.26);
    await medir(beto.personaId, 'Km a pie', 'actividad', hoy, 0);
    const { id, codigo } = await nueva(ana, 'km');
    await aceptar(beto.c, codigo);
    await aceptar(caro.c, codigo);
    expect((await caro.c.get(`/api/competencias/${id}`)).body.posiciones).toEqual([
      { posicion: 1, apodo: 'Anita', valor: 3.3, yo: false },
      { posicion: 2, apodo: 'Beto', valor: 0, yo: false },
      { posicion: null, apodo: 'Caro', valor: null, yo: true },
    ]);
    expect((await caro.c.get('/api/competencias')).body[0]).toMatchObject({ mi_posicion: null, mi_valor: null, participantes: 3 });
  });

  it('los topes: dormir o caminar de más no da ventaja, y dos aparatos no se suman', async () => {
    const { ana, personaId, beto } = await grupo();
    const hoy = diaDePatty(new Date(), ZONA);
    await medir(personaId, 'Horas de sueño', 'sueno', hoy, 14);
    await medir(beto.personaId, 'Horas de sueño', 'sueno', hoy, 8);
    await medir(personaId, 'Pasos', 'actividad', hoy, 40000);
    await medir(personaId, 'Pasos', 'actividad', hoy, 30000, 'Teléfono');
    await medir(beto.personaId, 'Pasos', 'actividad', hoy, 9000);
    await medir(beto.personaId, 'Pasos', 'actividad', hoy, 8000, 'Teléfono');
    const sueno = await nueva(ana, 'sueno');
    await aceptar(beto.c, sueno.codigo);
    // A las dos les cuentan 8 h: empatan.
    expect((await ana.get(`/api/competencias/${sueno.id}`)).body.posiciones.map((f: { posicion: number; valor: number }) => [f.posicion, f.valor])).toEqual([[1, 8], [1, 8]]);
    const pasos = await nueva(ana, 'pasos');
    await aceptar(beto.c, pasos.codigo);
    const t = (await ana.get(`/api/competencias/${pasos.id}`)).body.posiciones;
    expect(t.map((f: { apodo: string; valor: number }) => [f.apodo, f.valor])).toEqual([['Anita', 15000], ['Beto', 9000]]);
  });

  it('solo cuenta lo que pasó dentro de la competencia, y la racha y los días anotados son solo una cantidad', async () => {
    const { ana, personaId, categorias } = await grupo();
    const hoy = diaDePatty(new Date(), ZONA);
    await medir(personaId, 'Pasos', 'actividad', sumarDias(hoy, -1), 5000);
    const a = (h: string) => localAInstante(hoy, h, ZONA).toISOString();
    const pasos = await nueva(ana, 'pasos');
    expect((await ana.get(`/api/competencias/${pasos.id}`)).body.posiciones[0].valor).toBeNull();
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Café', categoria_id: categorias.comida, inicio: a('08:00') });
    const dias = await nueva(ana, 'dias');
    expect((await ana.get(`/api/competencias/${dias.id}`)).body.posiciones[0].valor).toBe(1);
    const racha = await nueva(ana, 'racha');
    // Un café solo no llega a los puntos de la racha: hay dato, y la racha es 0.
    expect((await ana.get(`/api/competencias/${racha.id}`)).body.posiciones[0].valor).toBe(0);
  });

  it('se puede salir en cualquier momento y deja de compartirse; para volver hay que aceptar de nuevo', async () => {
    const { ana, personaId, beto, caro } = await grupo();
    const hoy = diaDePatty(new Date(), ZONA);
    await medir(beto.personaId, 'Pasos', 'actividad', hoy, 9000);
    await medir(personaId, 'Pasos', 'actividad', hoy, 4000);
    const { id, codigo } = await nueva(ana);
    await aceptar(beto.c, codigo);
    await aceptar(caro.c, codigo);
    expect((await ana.get(`/api/competencias/${id}`)).body.posiciones).toHaveLength(3);

    expect((await beto.c.del(`/api/competencias/${id}/participacion`)).status).toBe(200);
    const despues = await ana.get(`/api/competencias/${id}`);
    expect(despues.body.posiciones.map((f: { apodo: string }) => f.apodo)).toEqual(['Anita', 'Caro']);
    expect(JSON.stringify(despues.body)).not.toMatch(/Beto|9000/);
    expect((await beto.c.get(`/api/competencias/${id}`)).status).toBe(404);
    expect((await beto.c.get('/api/competencias')).body).toEqual([]);
    expect((await beto.c.get(`/api/competencias/invitacion/${codigo}`)).body).toMatchObject({ id: null, ya_participas: false });

    // Aunque se vaya quien la creó, los demás siguen; y sin nadie, se borra.
    await ana.del(`/api/competencias/${id}/participacion`);
    expect((await caro.c.get(`/api/competencias/${id}`)).status).toBe(200);
    expect((await caro.c.get(`/api/competencias/invitacion/${codigo}`)).body.invita).toBeNull();
    await caro.c.del(`/api/competencias/${id}/participacion`);
    expect((await caro.c.get(`/api/competencias/invitacion/${codigo}`)).status).toBe(404);
  });

  it('al terminar sigue la tabla final, y ya no se suma nadie; no cuenta lo de después', async () => {
    const { ana, personaId, beto, caro } = await grupo();
    const hoy = diaDePatty(new Date(), ZONA);
    const { id, codigo } = await nueva(ana);
    await aceptar(beto.c, codigo);
    const db = obtenerDb();
    await db.execute(sql`UPDATE competencias SET desde = ${sumarDias(hoy, -8)}, hasta = ${sumarDias(hoy, -2)} WHERE id = ${id}`);
    await medir(personaId, 'Pasos', 'actividad', sumarDias(hoy, -3), 8000);
    await medir(beto.personaId, 'Pasos', 'actividad', sumarDias(hoy, -3), 5000);
    await medir(beto.personaId, 'Pasos', 'actividad', hoy, 15000);
    const d = (await ana.get(`/api/competencias/${id}`)).body;
    expect(d).toMatchObject({ estado: 'terminada', dias_restantes: 0 });
    expect(d.posiciones.map((f: { apodo: string; valor: number }) => [f.apodo, f.valor])).toEqual([['Anita', 8000], ['Beto', 5000]]);
    expect((await aceptar(caro.c, codigo)).status).toBe(400);
    expect((await caro.c.get(`/api/competencias/invitacion/${codigo}`)).body.estado).toBe('terminada');
  });

  it('sin persona propia no se puede competir, y un lector no entra', async () => {
    const { ana } = await conAdmin();
    await ana.post('/api/usuarios', { usuario: 'eva', nombre: 'Eva', email: 'eva@x.com', clave: 'secreta1', rol: 'editor' });
    const eva = new Cliente();
    await eva.post('/api/entrar', { usuario: 'eva', clave: 'secreta1' });
    expect((await eva.post('/api/competencias', { metrica: 'pasos', duracion: 'semana', acepto: true })).status).toBe(400);
    const { codigo } = await nueva(ana);
    expect((await aceptar(eva, codigo)).status).toBe(400);
    await ana.post('/api/usuarios', { usuario: 'leo', nombre: 'Leo', email: 'leo@x.com', clave: 'secreta1', rol: 'lector' });
    const leo = new Cliente();
    await leo.post('/api/entrar', { usuario: 'leo', clave: 'secreta1' });
    expect((await aceptar(leo, codigo)).status).toBe(403);
  });
});
