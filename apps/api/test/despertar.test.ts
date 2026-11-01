import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cerrarDb, obtenerDb, una } from '../src/db/client.js';
import { CADA_DE_NOCHE_MIN, INTENTOS_POR_DIA, revisarDespertar } from '../src/push/despertar.js';
import { mensajeSilencioso, usarSilenciosoPrueba } from '../src/push/firebase.js';
import { permisosFaltantes } from '../src/push/recordatorios.js';
import { Cliente, conAdmin } from './ayudas.js';

afterAll(() => cerrarDb());
afterEach(() => usarSilenciosoPrueba(null));

const INSTALACION = 'abcdef0123456789';
const MIN = 60000;

describe('despertar a un teléfono callado', () => {
  let ana: Cliente;
  let personaId: number;
  let mandados: Array<{ token: string; datos: Record<string, string> }>;
  let respuesta: 'ok' | 'invalido';
  const db = () => obtenerDb();

  const reportar = (cambios: Record<string, unknown> = {}) =>
    ana.post('/api/dispositivos/estado', {
      instalacion: INSTALACION,
      plataforma: 'android',
      push_token: 'tel',
      permisos: { ubicacion: 'siempre', bateria: 'no' },
      activos: { ubicacion: true },
      vigia: { corriendo: true, bitacora: [] },
      ...cambios,
    });
  /** La última señal y la última vez que se abrió la app, hace tantos minutos (a mediodía en Buenos Aires, salvo que se diga). */
  const callado = async (min: number, ahora: Date) => {
    const t = new Date(ahora.getTime() - min * MIN).toISOString();
    await db().execute(sql`UPDATE instalaciones SET actualizado = ${t}`);
    await db().execute(sql`UPDATE fuentes SET ultima_ubicacion = ${t}`);
  };

  beforeEach(async () => {
    ({ ana, personaId } = await conAdmin());
    mandados = [];
    respuesta = 'ok';
    usarSilenciosoPrueba(async (token, datos) => {
      mandados.push({ token, datos });
      return respuesta;
    });
    await ana.post('/api/dispositivos', { token: 'tel', plataforma: 'android' });
    await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'telefono', nombre: 'App de Android' });
    await reportar();
  });

  // 15:00 en Buenos Aires, dentro de la ventana de la instalación.
  const mediodia = () => {
    const d = new Date();
    d.setUTCHours(18, 0, 0, 0);
    return d;
  };

  it('lo despierta si está callado, y no si dio señales hace poco', async () => {
    const ahora = mediodia();
    await callado(20, ahora);
    expect(await revisarDespertar(db(), ahora)).toBe(0);
    await callado(50, ahora);
    expect(await revisarDespertar(db(), ahora)).toBe(1);
    expect(mandados).toEqual([{ token: 'tel', datos: { tipo: 'despertar' } }]);
  });

  it('no manda más de uno cada tanto, y de noche menos', async () => {
    const ahora = mediodia();
    await callado(50, ahora);
    expect(await revisarDespertar(db(), ahora)).toBe(1);
    expect(await revisarDespertar(db(), new Date(ahora.getTime() + 10 * MIN))).toBe(0);
    expect(await revisarDespertar(db(), new Date(ahora.getTime() + 46 * MIN))).toBe(1);
    // Las 2 de la mañana en Buenos Aires: 45 minutos no alcanzan.
    await db().execute(sql`DELETE FROM avisos_enviados`);
    const noche = new Date(ahora);
    noche.setUTCHours(5, 0, 0, 0);
    await callado(200, noche);
    expect(await revisarDespertar(db(), noche)).toBe(1);
    expect(await revisarDespertar(db(), new Date(noche.getTime() + 46 * MIN))).toBe(0);
    expect(await revisarDespertar(db(), new Date(noche.getTime() + (CADA_DE_NOCHE_MIN + 1) * MIN))).toBe(1);
  });

  it('deja de insistir si no contesta, y vuelve cuando da señales', async () => {
    const inicio = mediodia();
    await callado(50, inicio);
    let total = 0;
    for (let i = 0; i < INTENTOS_POR_DIA + 3; i++) total += await revisarDespertar(db(), new Date(inicio.getTime() + i * 46 * MIN));
    expect(total).toBe(INTENTOS_POR_DIA);
    const despues = new Date(inicio.getTime() + (INTENTOS_POR_DIA + 3) * 46 * MIN);
    expect(await revisarDespertar(db(), despues)).toBe(0);
    // Contestó y después se volvió a callar: se cuenta de nuevo.
    await db().execute(sql`UPDATE fuentes SET ultima_ubicacion = ${new Date(despues.getTime() - 50 * MIN + 46 * MIN).toISOString()}`);
    const luego = new Date(despues.getTime() + 46 * MIN);
    expect(await revisarDespertar(db(), luego)).toBe(1);
  });

  it('no lo despierta con el seguimiento apagado, sin permiso o con una app vieja', async () => {
    const ahora = mediodia();
    await reportar({ activos: { ubicacion: false } });
    await callado(50, ahora);
    expect(await revisarDespertar(db(), ahora)).toBe(0);
    await reportar({ permisos: { ubicacion: 'no' } });
    await callado(50, ahora);
    expect(await revisarDespertar(db(), ahora)).toBe(0);
    await reportar({ vigia: null });
    await callado(50, ahora);
    expect(await revisarDespertar(db(), ahora)).toBe(0);
    expect(mandados).toEqual([]);
  });

  it('es solo de datos, con prioridad alta, y no queda en el historial de avisos', async () => {
    const ahora = mediodia();
    await callado(50, ahora);
    await revisarDespertar(db(), ahora);
    const m = mensajeSilencioso('tel', { tipo: 'despertar' }).message as Record<string, any>;
    expect(m.notification).toBeUndefined();
    expect(m.android.notification).toBeUndefined();
    expect(m.android.priority).toBe('high');
    expect((await una<{ n: number }>(db(), sql`SELECT count(*)::int AS n FROM avisos_historial`))?.n).toBe(0);
  });

  it('olvida el teléfono si el token ya no sirve', async () => {
    const ahora = mediodia();
    respuesta = 'invalido';
    await callado(50, ahora);
    expect(await revisarDespertar(db(), ahora)).toBe(0);
    expect((await una<{ n: number }>(db(), sql`SELECT count(*)::int AS n FROM dispositivos`))?.n).toBe(0);
  });

  it('un punto o un latido del seguimiento cuentan como señal, sin guardar nada de más', async () => {
    const r = await ana.post(`/api/personas/${personaId}/fuentes`, { tipo: 'telefono', nombre: 'Otra' });
    const tel = new Cliente();
    tel.headers.Authorization = `Bearer ${r.body.token}`;
    expect((await tel.post('/api/ingesta/ubicacion', { latido: true })).status).toBe(200);
    const f = await una<{ ultima_ubicacion: string | null; puntos: number }>(db(), sql`SELECT ultima_ubicacion, (SELECT count(*)::int FROM puntos) AS puntos FROM fuentes WHERE nombre = 'Otra'`);
    expect(f?.ultima_ubicacion).not.toBeNull();
    expect(f?.puntos).toBe(0);
  });

  it('pide la excepción de batería solo con la ubicación en segundo plano', () => {
    expect(permisosFaltantes('android', { ubicacion: 'siempre', bateria: 'no' })).toEqual(['bateria']);
    expect(permisosFaltantes('android', { ubicacion: 'en_uso', bateria: 'no' })).toEqual(['ubicacion']);
    expect(permisosFaltantes('android', { ubicacion: 'siempre', bateria: 'si' })).toEqual([]);
    expect(permisosFaltantes('android', { ubicacion: 'siempre' })).toEqual([]);
  });
});
