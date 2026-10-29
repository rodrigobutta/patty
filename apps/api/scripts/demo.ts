// Una persona de ejemplo ("Sofía") con unas seis semanas de datos creíbles, para las capturas y los videos de la página
// de presentación. Usa la API de verdad (en el mismo proceso) sobre una base aparte: nunca la de producción.
//   createdb patty_demo
//   DATABASE_URL=postgres://localhost/patty_demo npx tsx --conditions=source scripts/demo.ts
// Deja un usuario "sofia" (clave "patty-demo") y escribe el token de su sesión en la salida.
import { sql } from 'drizzle-orm';
import { crearApp } from '../src/app.js';
import { cerrarDb, obtenerDb, una } from '../src/db/client.js';
import { aplicarMigraciones } from '../src/db/migrar.js';
import { inicializar } from '../src/inicializar.js';
import { diaDePatty, localAInstante, sumarDias } from '../src/lib/fechas.js';

if (!/patty_(demo|e2e)/.test(process.env.DATABASE_URL ?? '')) throw new Error('Solo sobre una base de demo o de pruebas (patty_demo, patty_e2e).');
const ZONA = 'America/Argentina/Buenos_Aires';
const DIAS = 70;

// Azar repetible (así los datos salen iguales cada vez).
let semilla = 7;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
const entre = (a: number, b: number) => a + azar() * (b - a);
const r1 = (n: number) => Math.round(n * 10) / 10;

const app = crearApp();
let cookie = '';
async function pedir(metodo: string, ruta: string, cuerpo?: unknown, token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  else if (cookie) h.Cookie = cookie;
  const r = await app.request(ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const set = r.headers.get('Set-Cookie');
  if (set && !token) cookie = set.split(';')[0];
  const texto = await r.text();
  if (r.status >= 400) throw new Error(`${metodo} ${ruta}: ${r.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const db = obtenerDb();
await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
await db.execute(sql`CREATE SCHEMA public`);
await aplicarMigraciones(db);
await inicializar(db);

await pedir('POST', '/api/configurar', { usuario: 'sofia', nombre: 'Sofía', clave: 'patty-demo' });
const persona = await pedir('POST', '/api/personas', { nombre: 'Sofía', sexo: 'femenino', nacimiento: '1991-05-14', zona_horaria: ZONA });
const P = persona.id as number;
const cats: Record<string, number> = Object.fromEntries((await pedir('GET', '/api/conceptos/categorias')).map((c: { clave: string; id: number }) => [c.clave, c.id]));

const hoy = diaDePatty(new Date(), ZONA);
/** Lo de hoy llega hasta esta hora (las capturas se sacan "a las 13:30"). */
const HORA_HOY = '13:15';
const cuando = (fecha: string, hora: string) => localAInstante(fecha, hora, ZONA).toISOString();
const hm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

const registros: unknown[] = [];
function anotar(fecha: string, hora: string, concepto: string, categoria: string, extra: Record<string, unknown> = {}) {
  if (fecha === hoy && hora > HORA_HOY) return;
  registros.push({ persona_id: P, concepto_nombre: concepto, categoria_id: cats[categoria], inicio: cuando(fecha, hora), ...extra });
}

// Fuentes automáticas.
const fuente = async (tipo: string, nombre: string) => (await pedir('POST', `/api/personas/${P}/fuentes`, { tipo, nombre })).token as string;
const reloj = await fuente('reloj', 'Health Connect');
const telefono = await fuente('telefono', 'Teléfono');
const clima = await fuente('clima', 'Clima');
const medReloj: unknown[] = [];
const medTel: unknown[] = [];
const medClima: unknown[] = [];
const caminatas: Array<{ fecha: string; caminatas: Array<{ inicio: string; fin: string; pasos: number }> }> = [];
const etapas: Array<{ noche: string; etapas: Array<{ inicio: string; fin: string; etapa: string }> }> = [];

// Tres períodos de 5 días; el número es qué día del período es (0 a 4).
const menstruacion = new Map([-69, -41, -13].flatMap((ini) => [0, 1, 2, 3, 4].map((j) => [sumarDias(hoy, ini + j), j] as const)));
// Lo de ayer, para el patrón combinado: frito + período + calor → dolor de panza al día siguiente (cada cosa sola casi no).
let ayer = { frito: false, periodo: false, calor: false };
let pantallaAyer = 220;
for (let k = -DIAS; k <= 0; k++) {
  const f = sumarDias(hoy, k);
  const dia = new Date(`${f}T12:00:00Z`).getUTCDay(); // 0 domingo
  const finde = dia === 0 || dia === 6;
  // Una noche corta si el día anterior hubo mucha pantalla, o a veces porque sí.
  // Hoy (el día de las capturas) es un buen día: durmió bien y salió a caminar.
  const corta = k === 0 ? false : pantallaAyer > 300 ? azar() < 0.9 : azar() < 0.1;
  const sueno = k === 0 ? 7.5 : corta ? entre(5.2, 6.1) : entre(6.9, 8.1);
  const despertar = finde ? entre(8.5, 9.5) : entre(6.8, 7.4);
  const dormir = despertar - sueno + 24;
  medReloj.push(
    { concepto: 'Horas de sueño', categoria: 'sueno', unidad: 'h', valor: r1(sueno), inicio: cuando(f, '00:00') },
    { concepto: 'Hora de dormir', categoria: 'sueno', unidad: 'hora', valor: r1(dormir - 24 < 0 ? dormir : dormir - 24 + (dormir >= 24 ? 0 : 0)), inicio: cuando(f, '00:00') },
    { concepto: 'Hora de despertar', categoria: 'sueno', unidad: 'hora', valor: r1(despertar), inicio: cuando(f, '00:00') },
    { concepto: 'Pulso en reposo', categoria: 'otro', unidad: 'lpm', valor: Math.round(corta ? entre(64, 70) : entre(57, 62)), inicio: cuando(f, '00:00') },
  );
  // Las etapas de las últimas noches (para el gráfico de la noche).
  if (k >= -6) {
    const lista: Array<{ inicio: string; fin: string; etapa: string }> = [];
    let t = localAInstante(sumarDias(f, -1), hm(dormir - 24 + 24 >= 24 ? dormir - 24 : dormir), ZONA).getTime();
    if (dormir < 24) t = localAInstante(sumarDias(f, -1), hm(dormir), ZONA).getTime();
    else t = localAInstante(f, hm(dormir - 24), ZONA).getTime();
    const fin = t + sueno * 3600000;
    const ciclo = ['ligero', 'profundo', 'ligero', 'rem'];
    let i = 0;
    while (t < fin) {
      const etapa = k === 0 && Math.abs(t - localAInstante(f, '04:10', ZONA).getTime()) < 15 * 60000 ? 'despierto' : ciclo[i % 4];
      const dur = (etapa === 'profundo' ? entre(25, 45) : etapa === 'rem' ? entre(15, 30) : etapa === 'despierto' ? 8 : entre(20, 40)) * 60000;
      lista.push({ inicio: new Date(t).toISOString(), fin: new Date(Math.min(fin, t + dur)).toISOString(), etapa });
      t += dur;
      i++;
    }
    etapas.push({ noche: f, etapas: lista });
  }

  // Lo del día.
  const caminata = k >= -1 ? 35 : !corta && (finde || azar() < 0.55) ? Math.round(entre(25, 50)) : azar() < 0.2 ? Math.round(entre(12, 20)) : 0;
  const pasos = Math.round((corta ? entre(3500, 6000) : entre(7000, 11000)) + caminata * 90);
  if (k < 0 || true) {
    medReloj.push(
      { concepto: 'Pasos', categoria: 'actividad', unidad: 'pasos', valor: k === 0 ? Math.round(pasos * 0.45) : pasos, inicio: cuando(f, '00:00') },
      { concepto: 'Km caminados', categoria: 'actividad', unidad: 'km', valor: r1((k === 0 ? pasos * 0.45 : pasos) * 0.00072), inicio: cuando(f, '00:00') },
    );
  }
  if (caminata && (k < 0 || caminata)) {
    const ini = localAInstante(f, k === 0 ? '08:05' : finde ? '10:30' : '19:30', ZONA).getTime();
    caminatas.push({ fecha: f, caminatas: [{ inicio: new Date(ini).toISOString(), fin: new Date(ini + caminata * 60000).toISOString(), pasos: caminata * 105 }] });
  }
  const pantalla = Math.round(azar() < 0.3 ? entre(310, 390) : entre(170, 260));
  medTel.push(
    { concepto: 'Tiempo de pantalla', categoria: 'pantalla', unidad: 'min', valor: k === 0 ? Math.round(pantalla * 0.4) : pantalla, inicio: cuando(f, '00:00') },
    { concepto: 'Llamadas', categoria: 'comunicacion', valor: Math.round(entre(1, 6)), inicio: cuando(f, '00:00') },
  );
  pantallaAyer = pantalla;
  const periodo = menstruacion.has(f);
    // En el período: calor los días 0, 1, 3 y 4, y frito los días 0, 1 y 2. Solo los días 0 y 1 se juntan las tres
  // cosas (y al día siguiente duele la panza); las otras combinaciones también pasan, sin dolor. Fuera del período, al azar.
  const jPeriodo = menstruacion.get(f);
  const max = Math.round(periodo ? ([0, 1, 3, 4].includes(jPeriodo!) ? entre(27, 31) : entre(19, 24)) : azar() < 0.4 ? entre(27, 31) : entre(18, 26));
  const lluvia = azar() < 0.18 ? r1(entre(2, 18)) : 0;
  medClima.push(
    { concepto: 'Temperatura máxima', categoria: 'clima', unidad: '°C', valor: max, inicio: cuando(f, '00:00') },
    { concepto: 'Temperatura mínima', categoria: 'clima', unidad: '°C', valor: max - Math.round(entre(5, 15)), inicio: cuando(f, '00:00') },
    { concepto: 'Lluvia del día', categoria: 'clima', unidad: 'mm', valor: lluvia, inicio: cuando(f, '00:00') },
    { concepto: 'Horas de sol', categoria: 'clima', unidad: 'h', valor: lluvia ? r1(entre(1, 4)) : r1(entre(7, 10)), inicio: cuando(f, '00:00') },
  );

  // Lo anotado.
  const levanto = hm(despertar);
  anotar(f, levanto, 'Me levanté', 'sueno', { valor: r1(despertar), unidad: 'hora' });
  anotar(f, hm(despertar + 0.3), 'Café', 'bebida', { valor: corta ? 3 : 1, unidad: 'tazas', donde: 'casa' });
  anotar(f, hm(despertar + 0.35), azar() < 0.5 ? 'Tostadas con palta' : 'Yogur con granola', 'comida', { donde: 'casa', porcion: 'mediana', tipos: ['harinas'] });
  if (menstruacion.has(f)) {
    anotar(f, hm(despertar + 0.1), 'Menstruación', 'ciclo', { intensidad: 6 });
    if (azar() < 0.7) anotar(f, '11:00', 'Cólicos', 'sintoma', { intensidad: Math.round(entre(4, 7)) });
  }
  // En el período se le antoja más lo frito.
  const frito = periodo ? jPeriodo! <= 2 : azar() < 0.35;
  const almuerzo = frito ? ['Milanesa con papas fritas', 'Empanadas fritas', 'Hamburguesa con papas fritas'][Math.floor(azar() * 3)] : ['Ensalada de quinoa', 'Wok de verduras con pollo', 'Tarta de verdura', 'Pasta con tuco'][Math.floor(azar() * 4)];
  anotar(f, '13:00', almuerzo, 'comida', finde
    ? { donde: 'casa', porcion: 'grande', tipos: frito ? ['frito', 'proteina'] : ['verdura'] }
    : { donde: 'afuera', lugar: frito ? 'La Parrilla de Juan' : 'Green Bowl', porcion: frito ? 'grande' : 'mediana', tipos: frito ? ['frito', 'proteina'] : ['verdura', 'proteina'] });
  const panza = ayer.frito && ayer.periodo && ayer.calor ? 0.97 : ayer.frito ? 0.1 : 0.03;
  if (azar() < panza) anotar(f, '11:00', 'Dolor de panza', 'sintoma', { intensidad: Math.round(entre(4, 7)) });
  ayer = { frito, periodo, calor: max >= 27 };
  if (corta ? azar() < 0.85 : azar() < 0.03) {
    anotar(f, hm(entre(15, 18)), 'Dolor de cabeza', 'sintoma', { intensidad: Math.round(entre(4, 7)) });
    anotar(f, '18:30', 'Ibuprofeno', 'medicacion', { valor: 400, unidad: 'mg' });
  }
  if (dia === 2) anotar(f, '20:00', 'Fútbol', 'actividad', { valor: 90, unidad: 'min' });
  if (dia === 6) anotar(f, '11:00', 'Yoga', 'actividad', { valor: 60, unidad: 'min' });
  if (dia === 0) anotar(f, '13:30', 'Mamá', 'gente');
  if (dia === 5) anotar(f, '21:30', 'Amigos', 'gente');
  anotar(f, '21:00', ['Sopa de calabaza', 'Pizza', 'Omelette con ensalada', 'Sushi'][Math.floor(azar() * 4)], 'comida', { donde: dia === 5 ? 'delivery' : 'casa' });
  // El ánimo: mejor con caminata, peor con dolor o noche corta.
  const base = 7 + (caminata >= 25 ? 2 : 0) - (corta ? 2.5 : 0) + entre(-1, 1);
  const estado = (v: number) => (v >= 8.5 ? 10 : v >= 6 ? 7 : v >= 3.5 ? 4 : 1);
  anotar(f, '10:30', 'Cómo me siento', 'animo', { intensidad: estado(base) });
  if (azar() < 0.6) anotar(f, '17:00', 'Cómo me siento', 'animo', { intensidad: estado(base - (corta ? 1 : 0)) });
  if (k < 0) anotar(f, '22:30', 'Cómo me sentí en el día', 'animo', { intensidad: estado(base) });
}

await pedir('POST', '/api/ingesta', { mediciones: medReloj }, reloj);
await pedir('POST', '/api/ingesta', { mediciones: medTel }, telefono);
await pedir('POST', '/api/ingesta', { mediciones: medClima }, clima);
await pedir('POST', '/api/actividad/caminatas', { persona_id: P, dias: caminatas.slice(-31) });
await pedir('POST', '/api/sueno/etapas', { persona_id: P, noches: etapas });
for (let i = 0; i < registros.length; i += 50) await pedir("POST", "/api/registros/varios", { registros: registros.slice(i, i + 50) });

// Lugares y recorridos de los últimos 10 días: casa, oficina, gimnasio y la plaza de los perros.
const CASA = { lat: -34.5889, lon: -58.4302 };
const OFICINA = { lat: -34.6011, lon: -58.3752 };
const PLAZA = { lat: -34.5815, lon: -58.4205 };
const SUPER = { lat: -34.5925, lon: -58.4265 };
for (const [nombre, l] of [['Casa', CASA], ['Oficina', OFICINA], ['Plaza Armenia', PLAZA], ['Supermercado', SUPER]] as const) {
  await pedir('POST', '/api/ubicacion/lugares', { persona_id: P, nombre, lat: l.lat, lon: l.lon, radio_m: 120 });
}
const puntos: Array<{ lat: number; lon: number; instante: string }> = [];
const tramo = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, desde: number, minutos: number) => {
  const n = Math.max(2, Math.round(Math.hypot(a.lat - b.lat, a.lon - b.lon) / 0.0014));
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    puntos.push({ lat: a.lat + (b.lat - a.lat) * x + entre(-0.0002, 0.0002), lon: a.lon + (b.lon - a.lon) * x + entre(-0.0002, 0.0002), instante: new Date(desde + x * minutos * 60000).toISOString() });
  }
};
const quieto = (l: { lat: number; lon: number }, desde: number, horas: number) => {
  for (let h = 0; h < horas; h += 0.5) puntos.push({ lat: l.lat + entre(-0.0002, 0.0002), lon: l.lon + entre(-0.0002, 0.0002), instante: new Date(desde + h * 3600000).toISOString() });
};
for (let k = -9; k <= 0; k++) {
  const f = sumarDias(hoy, k);
  const dia = new Date(`${f}T12:00:00Z`).getUTCDay();
  const t = (h: string) => localAInstante(f, h, ZONA).getTime();
  quieto(CASA, t('07:00'), 1.5);
  if (dia !== 0 && dia !== 6) {
    tramo(CASA, OFICINA, t('08:40'), 16);
    quieto(OFICINA, t('09:15'), k === 0 ? 3.5 : 8.5);
    if (k < 0) {
      tramo(OFICINA, SUPER, t('18:00'), 30);
      quieto(SUPER, t('18:35'), 0.5);
      tramo(SUPER, CASA, t('19:05'), 8);
    }
  } else {
    tramo(CASA, PLAZA, t('10:20'), 12);
    tramo(PLAZA, { lat: PLAZA.lat + 0.004, lon: PLAZA.lon + 0.003 }, t('10:35'), 20);
    tramo({ lat: PLAZA.lat + 0.004, lon: PLAZA.lon + 0.003 }, CASA, t('10:58'), 18);
    quieto(CASA, t('11:30'), 6);
  }
  if (k < 0) quieto(CASA, t('19:30'), 3);
}
for (let i = 0; i < puntos.length; i += 400) await pedir('POST', '/api/ubicacion', { persona_id: P, puntos: puntos.slice(i, i + 400) });

// Los patrones (con los textos del motor) y, encima, lo que en producción escribe la IA.
await pedir('POST', '/api/analisis', { persona_id: P });
const ex = async (causa: string, efecto: string, texto: string, estado = 'nuevo') =>
  db.execute(sql`UPDATE hallazgos h SET explicacion = ${texto}, estado = ${estado} FROM conceptos ca, conceptos ef
                 WHERE h.causa_id = ca.id AND h.efecto_id = ef.id AND h.persona_id = ${P} AND ca.nombre = ${causa} AND ef.nombre = ${efecto}`);
await ex('Horas de sueño', 'Dolor de cabeza', 'Las noches que dormís menos de 6 horas, ese día el dolor de cabeza aparece mucho más seguido: casi 9 de cada 10 veces, contra muy pocas cuando dormís bien.', 'confirmado');
await ex('Tiempo de pantalla', 'Horas de sueño', 'Los días con más de 5 horas de pantalla, esa noche dormís bastante menos. Puede valer la pena dejar el teléfono un rato antes.');
await ex('Comida frita', 'Dolor de panza', 'Cuando la comida es frita, a la tarde aparece el dolor de panza más seguido que otros días.');
// Quedan los que cuentan algo (y dos obvios ya marcados, para que se vea esa parte de Patrones); el resto se borra.
const queda = (causa: string, modo: string, efecto: string, emodo: string) => sql`(ca.nombre = ${causa} AND h.causa_modo = ${modo} AND ef.nombre = ${efecto} AND h.efecto_modo = ${emodo} AND jsonb_array_length(h.causas_extra) = 0)`;
await db.execute(sql`DELETE FROM hallazgos h USING conceptos ca, conceptos ef WHERE h.causa_id = ca.id AND h.efecto_id = ef.id AND NOT (
  ${queda('Horas de sueño', 'bajo', 'Dolor de cabeza', 'presente')} OR ${queda('Comida frita', 'presente', 'Dolor de panza', 'presente')}
  OR ${queda('Caminata', 'presente', 'Cómo me siento', 'alto')} OR ${queda('Horas de sueño', 'bajo', 'Cómo me sentí en el día', 'bajo')}
  OR ${queda('Me levanté', 'alto', 'Hora de despertar', 'alto')} OR ${queda('Menstruación', 'presente', 'Fase menstrual', 'presente')}
  OR ${queda('Tiempo de pantalla', 'alto', 'Horas de sueño', 'bajo')}
  OR (jsonb_array_length(h.causas_extra) > 0 AND ef.nombre = 'Dolor de panza'))`);
await db.execute(sql`UPDATE hallazgos h SET estado = 'obvio' FROM conceptos ca WHERE h.causa_id = ca.id AND ca.nombre IN ('Me levanté', 'Menstruación')`);
await ex('Horas de sueño', 'Cómo me sentí en el día', 'Los días después de dormir poco, a la noche contás que el día fue peor. Dormir bien es de lo que más mueve tu ánimo.');
await ex('Caminata', 'Cómo me siento', 'Los días que caminás media hora o más, tu ánimo está más arriba.');
// El combinado (lo más valioso que encuentra Patty), arriba de todo.
await db.execute(sql`UPDATE hallazgos h SET puntaje = puntaje + 1000, explicacion = ${'Cuando se juntan las tres cosas, comida frita, estar en tu período y un día de calor, al día siguiente casi siempre te duele la panza. Con una sola de ellas, pasa muy de vez en cuando.'}
  FROM conceptos ef WHERE h.efecto_id = ef.id AND h.persona_id = ${P} AND ef.nombre = 'Dolor de panza' AND jsonb_array_length(h.causas_extra) > 0`);

const insertar = async (consulta: ReturnType<typeof sql>) => db.execute(consulta);
await insertar(sql`INSERT INTO comentarios (persona_id, fecha, emoji, texto, estado, creado) VALUES
  (${P}, ${hoy}, '🚶‍♀️', 'Llevás 4 días seguidos caminando, y se nota: esos días anotaste que te sentías muy bien. ¡Seguí así!', 'nuevo', ${cuando(hoy, '06:00')}),
  (${P}, ${sumarDias(hoy, -1)}, '☕', 'Ayer tomaste 3 cafés después de una noche de 5 horas y media. A la tarde te dolió la cabeza: puede que tengan que ver.', 'visto', ${cuando(sumarDias(hoy, -1), '06:00')}),
  (${P}, ${sumarDias(hoy, -2)}, '⚽', 'El fútbol de los martes ya es fijo: 5 semanas seguidas. ¡Y esas noches dormís mejor!', 'gusta', ${cuando(sumarDias(hoy, -2), '06:00')}),
  (${P}, ${sumarDias(hoy, -3)}, '🥗', 'Esta semana comiste verdura casi todos los días en el almuerzo. ¡Buenísimo!', 'gusta', ${cuando(sumarDias(hoy, -3), '06:00')})`);
const lunesPasado = sumarDias(hoy, -((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7) - 7);
await insertar(sql`INSERT INTO resumen_semana (persona_id, semana, titulo, texto, destacados, sugerencias, numeros, creado) VALUES
  (${P}, ${lunesPasado}, 'Una semana con más pasos y mejor ánimo',
   'Caminaste más que la semana anterior (unos 8.900 pasos por día) y tu ánimo acompañó: casi todos los días anotaste que te sentías bien o muy bien. Las dos noches que dormiste poco coincidieron con días de mucha pantalla, y en una de ellas apareció el dolor de cabeza.',
   ${JSON.stringify([{ emoji: '🚶‍♀️', texto: '5 caminatas, 2 más que la semana anterior' }, { emoji: '😄', texto: 'Ánimo promedio 8 de 10' }, { emoji: '😴', texto: '2 noches de menos de 6 horas' }])}::jsonb,
   ${JSON.stringify(['Probá dejar el teléfono a las 23 las noches de semana.'])}::jsonb,
   ${JSON.stringify({ dias_anotados: 7, sueno_horas: 6.9, pasos: 8900, caminatas_min: 170, animo: 8, molestias: 2 })}::jsonb, ${cuando(sumarDias(lunesPasado, 6), '20:00')})`);
const lunes = sumarDias(lunesPasado, 7);
await insertar(sql`INSERT INTO objetivos (persona_id, semana, texto, emoji, tipo, concepto, valor, meta_dias, estado) VALUES
  (${P}, ${lunes}, 'Caminar 4 días', '🚶‍♀️', 'concepto', 'Caminata', NULL, 4, 'aceptado'),
  (${P}, ${lunes}, 'Dormir 7 horas o más 4 noches', '😴', 'sueno_min', NULL, 7, 4, 'aceptado')`);
await insertar(sql`INSERT INTO resumen_noche (persona_id, noche, texto, calidad) VALUES
  (${P}, ${hoy}, 'Dormiste 7 horas y media, un poco más que tu promedio de la semana. Tuviste dos buenos tramos de sueño profundo antes de las 3 y un despertar corto cerca de las 4, como otras noches.', 8)`);
// "¿Qué pasó antes?" del último dolor de cabeza.
const dolor = await una<{ id: number }>(db, sql`SELECT r.id FROM registros r JOIN conceptos c ON c.id = r.concepto_id WHERE r.persona_id = ${P} AND c.nombre = 'Dolor de cabeza' ORDER BY r.inicio DESC LIMIT 1`);
if (dolor) {
  await insertar(sql`INSERT INTO contexto_registro (registro_id, persona_id, texto, items) VALUES (${dolor.id}, ${P},
    'Esa noche dormiste 5 horas y media, menos que de costumbre, y a la mañana tomaste 3 cafés. El día anterior estuviste más de 5 horas con el teléfono. Puede que el cansancio tenga que ver.', '[]'::jsonb)`);
  const { armarContexto } = await import('../src/ia/contexto.js');
  // Los items (lo anotado antes) los arma el servidor, sin IA.
  const ctx = await armarContexto(db, dolor.id, ZONA, 'es');
  await insertar(sql`UPDATE contexto_registro SET texto = 'Esa noche dormiste 5 horas y media, menos que de costumbre, y a la mañana tomaste 3 cafés. El día anterior estuviste más de 5 horas con el teléfono. Puede que el cansancio tenga que ver.' WHERE registro_id = ${dolor.id}`);
  void ctx;
}

const token = 'demo-sofia';
await insertar(sql`INSERT INTO sesiones (token, usuario_id, vence) SELECT ${token}, id, now() + interval '30 days' FROM usuarios WHERE usuario = 'sofia'`);
console.log(`Listo: persona ${P}, ${registros.length} registros, ${puntos.length} puntos. Hoy ${hoy}. Token: ${token}`);
await cerrarDb();
