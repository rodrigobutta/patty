// La beta: mientras Patty se prueba, se entra por invitación. Desde la página de presentación (sin cuenta) se puede
// pedir una: nombre, mail y por qué le interesa. Queda guardado para verlo en la administración, y a los admins les
// llega un aviso al teléfono. Con un límite por dirección y un campo trampa, para que no lo llenen bots.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { esIdioma, traducir, type Idioma } from 'shared';
import { filas, una } from '../db/client.js';
import { ErrorApi } from '../lib/errores.js';
import { cuerpo, texto, type Env } from '../lib/http.js';
import { hayEnvio } from '../push/firebase.js';
import { avisarUnaVez } from '../push/recordatorios.js';

const POR_HORA = 5;
const cuenta = new Map<string, { n: number; desde: number }>();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const rutasBeta = new Hono<Env>().post('/beta', async (c) => {
  const quien = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const ahora = Date.now();
  const k = cuenta.get(quien);
  if (k && ahora - k.desde < 3600000 && k.n >= POR_HORA) throw new ErrorApi('Ya recibimos tu pedido. Probá de nuevo en un rato.', 429);
  cuenta.set(quien, k && ahora - k.desde < 3600000 ? { n: k.n + 1, desde: k.desde } : { n: 1, desde: ahora });
  const d = await cuerpo(c);
  // El campo trampa: una persona no lo ve ni lo llena; un bot, sí. Se responde bien igual, para no darle pistas.
  if (texto(d.web)) return c.json({ ok: true }, 201);
  const nombre = texto(d.nombre).slice(0, 80);
  const email = texto(d.email).toLowerCase().slice(0, 120);
  const motivo = texto(d.motivo).slice(0, 1000) || null;
  if (!nombre) throw new ErrorApi('Contanos tu nombre.');
  if (!EMAIL.test(email)) throw new ErrorApi('Revisá el mail: no parece válido.');
  const ya = await una<{ id: number }>(c.var.db, sql`SELECT id FROM solicitudes_beta WHERE email = ${email} AND creado > now() - interval '30 days'`);
  if (!ya) {
    await c.var.db.execute(sql`INSERT INTO solicitudes_beta (nombre, email, motivo, idioma) VALUES (${nombre}, ${email}, ${motivo}, ${c.var.idioma})`);
    await avisarAdmins(c.var.db, nombre, motivo);
  }
  return c.json({ ok: true }, 201);
});

async function avisarAdmins(db: Env['Variables']['db'], nombre: string, motivo: string | null): Promise<void> {
  if (!hayEnvio()) return;
  const dispositivos = await filas<{ id: number; token: string; avisos_hasta: string | null; idioma: string | null }>(
    db,
    sql`SELECT d.id, d.token, d.avisos_hasta, u.idioma FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id WHERE u.activo AND u.rol = 'admin'`,
  );
  for (const d of dispositivos) {
    const i: Idioma = esIdioma(d.idioma) ? d.idioma : 'es';
    await avisarUnaVez(db, { ...d, idioma: d.idioma ?? undefined }, `beta|${nombre}|${Date.now()}`, {
      titulo: traducir(i, '🦉 {nombre} quiere probar Patty', { nombre }),
      cuerpo: (motivo ?? traducir(i, 'Pidió una invitación a la beta.')).slice(0, 200),
      datos: { tipo: 'beta' },
      etiqueta: 'beta',
    }).catch(() => {});
  }
}
