import { describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { datosInforme } from '../src/informe/datos.js';
import { limpiar } from '../src/informe/pdf.js';
import { obtenerDb } from '../src/db/client.js';
import { diaDePatty, localAInstante, sumarDias } from '../src/lib/fechas.js';
import { conAdmin, Cliente } from './ayudas.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const app = crearApp();

describe('informe para el médico', () => {
  it('junta malestares, remedios (y para qué), sueño, ánimo y ciclo, y arma el PDF con un enlace que anda sin sesión', async () => {
    const { ana, personaId, categorias } = await conAdmin();
    await ana.put(`/api/personas/${personaId}`, { nombre: 'Rodrigo', nacimiento: '1980-03-10', sexo: 'masculino', condiciones: ['Migraña'] });
    const hoy = diaDePatty(new Date(), ZONA);
    const en = (dias: number, hora: string) => localAInstante(sumarDias(hoy, dias), hora, ZONA).toISOString();
    for (const k of [-1, -3, -5]) {
      const dolor = await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Dolor de cabeza', categoria_id: categorias.sintoma, intensidad: k === -1 ? 7 : 5, inicio: en(k, '15:00'), fin: en(k, '17:00') });
      expect(dolor.status).toBe(201);
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Ibuprofeno', categoria_id: categorias.medicacion, valor: 400, unidad: 'mg', inicio: en(k, '15:30'), para_registro_id: dolor.body.id });
    }
    for (const k of [-2, -1]) {
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Me acosté', categoria_id: categorias.sueno, inicio: en(k - 1, '23:30') });
      await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Me levanté', categoria_id: categorias.sueno, inicio: en(k, '07:00') });
    }
    for (const [k, i] of [[-4, 10], [-3, 4], [-2, 7]]) await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Cómo me siento', categoria_id: categorias.animo, intensidad: i, inicio: en(k, '10:00') });
    // Una menstruación de hace un mes (fuera del período de 7 días, pero el ciclo igual se cuenta).
    await ana.post('/api/registros', { persona_id: personaId, concepto_nombre: 'Menstruación', categoria_id: categorias.ciclo, intensidad: 6, inicio: en(-30, '09:00') });

    const p = { id: personaId, nombre: 'Rodrigo', zona_horaria: ZONA, rol: 'dueno' as const };
    const d = await datosInforme(obtenerDb(), p, 7, 'es');
    expect(d.persona).toMatchObject({ nombre: 'Rodrigo', sexo: 'masculino', condiciones: ['Migraña'] });
    expect(d.persona.edad).toBeGreaterThanOrEqual(45);
    expect(d.malestares).toEqual([expect.objectContaining({ nombre: 'Dolor de cabeza', dias: 3, veces: 3, intensidad_max: 7, minutos_prom: 120, con_duracion: 3, franja: 'tarde' })]);
    expect(d.remedios).toEqual([expect.objectContaining({ nombre: 'Ibuprofeno', veces: 3, dosis: '400 mg', para: ['Dolor de cabeza'] })]);
    expect(d.sueno).toMatchObject({ promedio: 7.5, acoste: 23 * 60 + 30, levante: 7 * 60 });
    expect(d.animo).toMatchObject({ dias: 3, por_estado: { muy_bien: 1, bien: 1, mal: 1, muy_mal: 0 } });
    expect(d.animo!.tramos).toHaveLength(7);
    expect(d.ciclo).toMatchObject({ inicios: [] });

    // En inglés, los nombres de Patty se traducen.
    const en_ = await datosInforme(obtenerDb(), p, 7, 'en');
    expect(en_.malestares[0].nombre).toBe('Headache');

    // El enlace: se pide con la sesión y se abre sin ella.
    const enlace = await ana.post('/api/informe/enlace', { persona_id: personaId, dias: 30 });
    expect(enlace.status).toBe(200);
    expect(enlace.body.url).toMatch(/^\/api\/informe\/pdf\/[\w-]+\.pdf$/);
    const r = await app.request(enlace.body.url);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(r.headers.get('Content-Disposition')).toMatch(/filename="patty-rodrigo-\d{4}-\d{2}-\d{2}\.pdf"/);
    const pdf = Buffer.from(await r.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3000);

    // Un token inventado no sirve, y sin sesión no se pide un enlace ni el PDF directo.
    expect((await app.request('/api/informe/pdf/inventado.pdf')).status).toBe(410);
    const otro = new Cliente();
    expect((await otro.post('/api/informe/enlace', { persona_id: personaId })).status).toBe(401);
    expect((await app.request(`/api/informe?persona=${personaId}&dias=7`)).status).toBe(401);
    const directo = await app.request(`/api/informe?persona=${personaId}&dias=7`, { headers: { Cookie: ana.cookie!, 'X-Idioma': 'en' } });
    expect(directo.status).toBe(200);
    expect(directo.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('deja afuera lo que la letra del PDF no puede escribir', () => {
    expect(limpiar('Dolor de cabeza 🤕  → fuerte')).toBe('Dolor de cabeza -> fuerte');
    expect(limpiar('Ánimo, ñandú, 38,5 °C · “sí”')).toBe('Ánimo, ñandú, 38,5 °C · “sí”');
  });
});
