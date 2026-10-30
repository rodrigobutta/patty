import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb } from '../src/db/client.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());

/** Un usuario normal que ya entró. */
async function conEditor(ana: Cliente): Promise<Cliente> {
  await ana.post('/api/usuarios', { usuario: 'beto', nombre: 'Beto', clave: 'secreta2', rol: 'editor' });
  const beto = new Cliente();
  await beto.post('/api/entrar', { usuario: 'beto', clave: 'secreta2' });
  return beto;
}

describe('administración → datos', () => {
  it('solo la ve un administrador', async () => {
    const { ana } = await conAdmin();
    const beto = await conEditor(ana);
    for (const ruta of ['/api/admin/datos/tablas', '/api/admin/datos/calidad', '/api/admin/datos/personas', '/api/admin/datos/auditoria', '/api/admin/datos/ia']) {
      expect((await beto.get(ruta)).status).toBe(403);
      expect((await new Cliente().get(ruta)).status).toBe(401);
      expect((await ana.get(ruta)).status).toBe(200);
    }
    expect((await beto.post('/api/admin/datos/tablas/registros/borrar', { clave: { id: 1 } })).status).toBe(403);
    expect((await beto.post('/api/admin/datos/calidad/puntos_viejos/corregir')).status).toBe(403);
  });

  it('las tablas: lista con grupos, sin claves ni tokens; filtra, ordena y pagina', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const tablas = (await ana.get('/api/admin/datos/tablas')).body as Array<{ nombre: string; grupo: string; columnas: Array<{ nombre: string }>; editable: boolean; clave: string[] }>;
    const de = (n: string) => tablas.find((t) => t.nombre === n);
    expect(de('registros')).toMatchObject({ grupo: 'persona', editable: true, clave: ['id'] });
    expect(de('mediciones')?.grupo).toBe('automatico');
    expect(de('hallazgos')?.grupo).toBe('ia');
    expect(de('sesiones')).toBeUndefined();
    expect(de('usuarios')?.columnas.map((c) => c.nombre)).not.toContain('clave');
    expect(de('serie_diaria')?.editable).toBe(false);
    expect(de('auditoria_admin')?.editable).toBe(false);

    for (const [h, n] of [['2026-10-20T15:00:00Z', 2], ['2026-10-21T15:00:00Z', 5], ['2026-10-22T15:00:00Z', 7]] as const) {
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: h, intensidad: n });
    }
    const todas = (await ana.get(`/api/admin/datos/tablas/registros?persona_id=${personaId}&orden=intensidad&dir=asc`)).body;
    expect(todas.total).toBe(3);
    expect(todas.filas.map((f: any) => f.intensidad)).toEqual([2, 5, 7]);
    const pag = (await ana.get(`/api/admin/datos/tablas/registros?por=2&pagina=2&orden=intensidad&dir=asc`)).body;
    expect(pag.filas.map((f: any) => f.intensidad)).toEqual([7]);
    expect((await ana.get(`/api/admin/datos/tablas/registros?desde=2026-10-21&hasta=2026-10-21`)).body.total).toBe(1);
    expect((await ana.get(`/api/admin/datos/tablas/registros?f.intensidad=5`)).body.total).toBe(1);
    expect((await ana.get(`/api/admin/datos/tablas/usuarios?buscar=ana`)).body.filas[0]).not.toHaveProperty('clave');
    expect((await ana.get(`/api/admin/datos/tablas/registros?f.nada=1`)).status).toBe(400);
    expect((await ana.get(`/api/admin/datos/tablas/sesiones`)).status).toBe(404);
    expect((await ana.get(`/api/admin/datos/tablas/registros;drop`)).status).toBe(404);
  });

  it('editar y borrar una fila queda en la auditoría', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const r = (await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, inicio: '2026-10-20T15:00:00Z', intensidad: 4 })).body;
    const e = await ana.post('/api/admin/datos/tablas/registros/editar', { clave: { id: r.id }, cambios: { intensidad: '6', nota: 'corregido', datos: '{"lugar":"frente"}' } });
    expect(e.status).toBe(200);
    expect(e.body).toMatchObject({ intensidad: 6, nota: 'corregido', datos: { lugar: 'frente' } });
    expect((await ana.post('/api/admin/datos/tablas/registros/editar', { clave: { id: r.id }, cambios: { id: 99 } })).status).toBe(400);
    expect((await ana.post('/api/admin/datos/tablas/registros/editar', { clave: { id: r.id }, cambios: { persona_id: null } })).status).toBe(400);
    expect((await ana.post('/api/admin/datos/tablas/registros/editar', { clave: { id: r.id }, cambios: { datos: '{mal' } })).status).toBe(400);
    expect((await ana.post('/api/admin/datos/tablas/usuarios/editar', { clave: { id: 1 }, cambios: { clave: 'x' } })).status).toBe(400);
    expect((await ana.post('/api/admin/datos/tablas/auditoria_admin/borrar', { clave: { id: 1 } })).status).toBe(400);
    // Un arreglo de texto (condiciones de la persona).
    expect((await ana.post('/api/admin/datos/tablas/personas/editar', { clave: { id: personaId }, cambios: { condiciones: 'Celiaquía, Asma' } })).body.condiciones).toEqual(['Celiaquía', 'Asma']);

    expect((await ana.post('/api/admin/datos/tablas/registros/borrar', { clave: { id: r.id }, logico: true })).status).toBe(200);
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-20`)).body).toHaveLength(0);
    expect((await ana.post('/api/admin/datos/tablas/registros/borrar', { clave: { id: r.id } })).status).toBe(200);
    expect((await ana.get(`/api/admin/datos/tablas/registros?f.id=${r.id}`)).body.total).toBe(0);

    const a = (await ana.get('/api/admin/datos/auditoria')).body;
    expect(a.map((x: any) => x.accion)).toEqual(['borrar', 'borrar_logico', 'editar', 'editar']);
    expect(a.at(-1)).toMatchObject({ tabla: 'registros', clave: { id: r.id }, antes: { intensidad: 4, nota: null }, despues: { intensidad: 6, nota: 'corregido' }, usuario: 'Ana' });
    expect(a[0].antes).toMatchObject({ id: r.id, intensidad: 6 });
  });

  it('calidad: encuentra duplicados, días mal puestos y puntos viejos, y los corrige', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const db = obtenerDb();
    const base = { persona_id: personaId, concepto_nombre: 'Tomate', categoria_id: categorias.comida, inicio: '2026-10-20T15:00:00Z' };
    const r1 = (await ana.post('/api/registros', base)).body;
    await ana.post('/api/registros', base);
    await ana.post('/api/registros', base);
    const r2 = (await ana.post('/api/registros', { ...base, inicio: '2026-10-21T15:00:00Z' })).body;
    await db.execute(sql`UPDATE registros SET fecha = '2026-10-01' WHERE id = ${r2.id}`);
    await db.execute(sql`INSERT INTO puntos (persona_id, instante, fecha, lat, lon) VALUES (${personaId}, now() - interval '100 days', current_date - 100, -34.6, -58.4)`);

    const n = async () => Object.fromEntries(((await ana.get('/api/admin/datos/calidad')).body as Array<{ clave: string; n: number }>).map((c) => [c.clave, c.n]));
    let antes = await n();
    expect(antes).toMatchObject({ registros_duplicados: 2, registros_fecha: 1, puntos_viejos: 1 });
    const ej = (await ana.get('/api/admin/datos/calidad/registros_fecha')).body;
    expect(ej[0]).toMatchObject({ id: r2.id, fecha: '2026-10-01', deberia: '2026-10-21' });
    expect((await ana.get('/api/admin/datos/calidad/registros_duplicados')).body.every((x: any) => Number(x.original) === Number(r1.id))).toBe(true);

    expect((await ana.post('/api/admin/datos/calidad/registros_duplicados/corregir')).body).toEqual({ corregidas: 2 });
    expect((await ana.post('/api/admin/datos/calidad/registros_fecha/corregir')).body).toEqual({ corregidas: 1 });
    expect((await ana.post('/api/admin/datos/calidad/puntos_viejos/corregir')).body).toEqual({ corregidas: 1 });
    expect((await ana.post('/api/admin/datos/calidad/registros_futuro/corregir')).status).toBe(400);
    expect((await ana.post('/api/admin/datos/calidad/no_existe/corregir')).status).toBe(404);
    antes = await n();
    expect(antes).toMatchObject({ registros_duplicados: 0, registros_fecha: 0, puntos_viejos: 0 });
    // El original queda; las repetidas, borradas lógicamente.
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=2026-10-20&hasta=2026-10-21`)).body).toHaveLength(2);
    const a = (await ana.get('/api/admin/datos/auditoria')).body;
    expect(a.filter((x: any) => x.accion === 'corregir').map((x: any) => x.clave.chequeo)).toEqual(['puntos_viejos', 'registros_fecha', 'registros_duplicados']);
  });

  it('persona 360: cobertura por fuente y el día completo', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Tomate', categoria_id: categorias.comida, inicio: '2026-10-20T15:00:00Z' });
    const ps = (await ana.get('/api/admin/datos/personas')).body;
    expect(ps[0]).toMatchObject({ id: personaId, nombre: 'Rodrigo', duenos: 'Ana', registros: 1 });
    const cob = (await ana.get(`/api/admin/datos/personas/${personaId}/cobertura?dias=30`)).body;
    expect(cob.dias).toHaveLength(30);
    expect(cob.dias.at(-1).fecha).toBe(cob.hoy);
    const dia = (await ana.get(`/api/admin/datos/personas/${personaId}/dia?fecha=2026-10-20`)).body;
    expect(dia.registros).toHaveLength(1);
    expect(dia.registros[0]).toMatchObject({ concepto: 'Tomate', hora: '12:00', categoria: 'Comida' });
    expect(dia).toHaveProperty('mediciones');
    expect(dia).toHaveProperty('sueno');
    expect((await ana.get(`/api/admin/datos/personas/9999/dia`)).status).toBe(404);
  });

  it('IA y patrones: la línea de tiempo y los hallazgos', async () => {
    const { ana, personaId } = await conAdmin();
    const db = obtenerDb();
    await db.execute(sql`INSERT INTO comentarios (persona_id, fecha, texto) VALUES (${personaId}, current_date, '¡Qué bien!')`);
    await db.execute(sql`INSERT INTO resumen_noche (persona_id, noche, texto, calidad) VALUES (${personaId}, current_date, 'Dormiste bien', 8)`);
    const ia = (await ana.get(`/api/admin/datos/ia?persona_id=${personaId}`)).body;
    expect(ia.linea.map((x: any) => x.tipo).sort()).toEqual(['comentarios', 'resumen_noche']);
    expect(ia.linea[0].persona).toBe('Rodrigo');
    expect((await ana.get(`/api/admin/datos/ia?tipo=comentarios`)).body.linea).toHaveLength(1);
    expect((await ana.get('/api/admin/datos/hallazgos')).body).toEqual([]);
  });

  it('persona 360: cada cosa es de la persona elegida, no de otra ni de toda la app', async () => {
    const { ana, personaId: a, categorias } = await conAdmin();
    const b = (await ana.post('/api/personas', { nombre: 'Beto' })).body.id;
    const db = obtenerDb();
    // A tiene de todo; B, nada (salvo una anotación propia).
    const inicio = new Date(Date.now() - 3600e3).toISOString();
    await ana.post('/api/registros', { persona_id: a, concepto_nombre: 'Tomate', categoria_id: categorias.comida, inicio });
    await ana.post('/api/registros', { persona_id: b, concepto_nombre: 'Pera', categoria_id: categorias.comida, inicio });
    const [f] = await db.execute(sql`INSERT INTO fuentes (persona_id, tipo, nombre, token_hash, ultimo_uso) VALUES (${a}, 'telefono', 'App de Android', 'x1', now()) RETURNING id`) as unknown as Array<{ id: number }>;
    const concepto = (await ana.get('/api/conceptos/buscar?q=pasos')).body[0]?.id;
    await db.execute(sql`INSERT INTO mediciones (persona_id, concepto_id, fuente_id, inicio, fecha, valor) VALUES (${a}, ${concepto}, ${f.id}, ${inicio}, current_date, 100)`);
    await db.execute(sql`INSERT INTO puntos (persona_id, instante, fecha, lat, lon) VALUES (${a}, ${inicio}, current_date, -34.6, -58.4)`);
    await db.execute(sql`INSERT INTO sueno_etapas (persona_id, noche, inicio, fin, etapa) VALUES (${a}, current_date, ${inicio}, now(), 'ligero')`);
    await db.execute(sql`INSERT INTO comentarios (persona_id, fecha, texto) VALUES (${a}, current_date, 'hola')`);
    await db.execute(sql`INSERT INTO resumen_noche (persona_id, noche, texto, calidad) VALUES (${a}, current_date, 'bien', 8)`);

    const clave = (l: any[]) => Object.fromEntries(l.map((x) => [x.clave, x]));
    const ua = (await ana.get(`/api/admin/datos/personas/${a}/ultimos`)).body;
    const ub = (await ana.get(`/api/admin/datos/personas/${b}/ultimos`)).body;
    expect(ua.fuentes.map((x: any) => x.nombre)).toEqual(['App de Android']);
    expect(ua.fuentes[0].semana).toBe(1);
    expect(ub.fuentes).toEqual([]);
    expect(clave(ua.datos).puntos.dato).toBeTruthy();
    for (const k of ['puntos', 'sueno', 'comentarios', 'resumen_noche', 'escuchas', 'avisos_apps', 'analisis']) expect(clave(ub.datos)[k].dato).toBeNull();
    expect(clave(ub.datos).manual.semana).toBe(1);
    // Los teléfonos que se muestran son de los dueños de esa persona.
    await db.execute(sql`INSERT INTO instalaciones (id, usuario_id, plataforma, estado) VALUES ('i1', (SELECT usuario_id FROM persona_usuarios WHERE persona_id = ${a} LIMIT 1), 'android', '{}')`);
    expect((await ana.get(`/api/admin/datos/personas/${a}/ultimos`)).body.telefonos).toHaveLength(1);
    const c = await ana.post('/api/personas', { nombre: 'Sin dueño' });
    await db.execute(sql`DELETE FROM persona_usuarios WHERE persona_id = ${c.body.id}`);
    expect((await ana.get(`/api/admin/datos/personas/${c.body.id}/ultimos`)).body.telefonos).toEqual([]);

    // La cobertura y el día, igual.
    const cob = (await ana.get(`/api/admin/datos/personas/${b}/cobertura?dias=7`)).body.dias;
    expect(cob.reduce((n: number, d: any) => n + d.telefono + d.puntos + d.sueno + d.comentarios + d.resumen_noche, 0)).toBe(0);
    const hoy = (await ana.get(`/api/admin/datos/personas/${b}/dia`)).body;
    expect([hoy.mediciones, hoy.puntos, hoy.sueno, hoy.comentarios]).toEqual([[], [], [], []]);
    expect(hoy.resumen_noche).toBeNull();
    // Lo de la IA, por persona (el consumo, de sus dueños; los procesos son de toda la app).
    const ia = (await ana.get(`/api/admin/datos/ia?persona_id=${b}`)).body;
    expect(ia.linea.every((x: any) => x.persona_id === b)).toBe(true);
    expect(ia.consumo_de).toBe('dueños');
    expect((await ana.get(`/api/admin/datos/personas/9999/ultimos`)).status).toBe(404);
  });

  it('recalcular la ubicación no cuenta como que el teléfono mandó algo', async () => {
    const { ana, personaId } = await conAdmin();
    const db = obtenerDb();
    const inicio = new Date(Date.now() - 3600e3).toISOString();
    expect((await ana.post('/api/ubicacion', { persona_id: personaId, puntos: [{ lat: -34.6, lon: -58.4, instante: inicio }] })).status).toBeLessThan(300);
    const uso = async () => (await ana.get(`/api/admin/datos/personas/${personaId}/ultimos`)).body.fuentes.find((f: any) => f.tipo === 'ubicacion')?.ultimo_uso;
    const antes = await uso();
    expect(antes).toBeTruthy();
    await db.execute(sql`UPDATE fuentes SET ultimo_uso = now() - interval '3 days' WHERE persona_id = ${personaId} AND tipo = 'ubicacion'`);
    const viejo = await uso();
    const { recalcularTodo } = await import('../src/routes/ubicacion.js');
    await db.transaction((tx) => recalcularTodo(tx, { id: personaId, zona_horaria: 'America/Argentina/Buenos_Aires' }));
    expect(await uso()).toBe(viejo);
  });

  it('la cobertura separa la cámara y cada otra forma de anotar', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    const r = { persona_id: personaId, concepto_nombre: 'Tomate', categoria_id: categorias.comida, inicio: new Date(Date.now() - 3600e3).toISOString() };
    await ana.post('/api/registros', r);
    await ana.post('/api/registros/varios', { registros: [r] });
    await ana.post('/api/registros/varios', { registros: [r, r], via: 'foto' });
    await ana.post('/api/registros/varios', { registros: [r], via: 'cualquiera' });
    await obtenerDb().execute(sql`INSERT INTO registros (persona_id, concepto_id, inicio, fecha, origen) SELECT persona_id, concepto_id, inicio, fecha, 'aviso' FROM registros LIMIT 1`);
    const cob = (await ana.get(`/api/admin/datos/personas/${personaId}/cobertura?dias=7`)).body;
    expect(cob.origenes).toEqual(['aviso']);
    const suma = (k: string) => cob.dias.reduce((n: number, d: any) => n + (d[k] ?? 0), 0);
    expect([suma('manual'), suma('ia'), suma('foto'), suma('origen:aviso')]).toEqual([1, 2, 2, 1]);
    const ultimos = (await ana.get(`/api/admin/datos/personas/${personaId}/ultimos`)).body.datos.map((d: any) => d.clave);
    expect(ultimos).toEqual(expect.arrayContaining(['manual', 'ia', 'foto', 'origen:aviso']));
    const dia = (await ana.get(`/api/admin/datos/personas/${personaId}/dia?fecha=${cob.hoy}`)).body.registros;
    expect(dia.filter((x: any) => x.origen === 'cámara')).toHaveLength(2);
    // Para la app sigue siendo lo mismo que contarlo.
    expect((await ana.get(`/api/registros?persona=${personaId}&desde=${cob.hoy}`)).body.filter((x: any) => x.origen === 'ia')).toHaveLength(4);
  });

  it('versiones: cada instalación de cada usuario, con las últimas publicadas', async () => {
    const { ana } = await conAdmin();
    const beto = await conEditor(ana);
    expect((await beto.get('/api/admin/versiones')).status).toBe(403);
    const db = obtenerDb();
    await db.execute(sql`INSERT INTO ajustes (clave, valor) VALUES ('version_app', ${JSON.stringify({ version: '1.61.0', url: 'https://x' })}::jsonb)`);
    await db.execute(sql`INSERT INTO instalaciones (id, usuario_id, plataforma, estado) SELECT 'tel', id, 'android', ${JSON.stringify({ version: { web: '1.60.0', commit: 'abc', app: '1.59.0' }, permisos: { avisos: 'si' } })}::jsonb FROM usuarios WHERE usuario = 'ana'`);
    const r = (await ana.get('/api/admin/versiones')).body;
    expect(r.app).toBe('1.61.0');
    expect(r.web).toBeTruthy();
    const de = (u: string) => r.filas.filter((f: any) => f.usuario === u);
    expect(de('ana')).toHaveLength(1);
    expect(de('ana')[0]).toMatchObject({ plataforma: 'android', web: '1.60.0', app: '1.59.0', personas: 'Rodrigo', permisos: { avisos: 'si' } });
    // Quien nunca abrió la app igual aparece.
    expect(de('beto')).toHaveLength(1);
    expect(de('beto')[0].instalacion).toBeNull();
  });
});
