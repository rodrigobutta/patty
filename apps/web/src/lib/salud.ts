// Lo que mide el reloj (o el teléfono): pasos, distancia, calorías, pulso, sueño, oxígeno, peso y entrenamientos.
// Patty no habla con cada reloj: lo lee de Health Connect (Android) o Salud (iPhone), donde las apps de los relojes
// (Samsung Health, Fitbit, Google Fit, Mi Fitness, Zepp, OHealth…) dejan sus datos. Se prende en Más; al abrir Patty
// (como mucho cada 30 min) manda los últimos 7 días, un valor por día, a la ingesta de la fuente «Reloj y salud».
import { Health, type HealthDataType, type HealthSample } from '@capgo/capacitor-health';
import { useEffect } from 'react';
import { api } from '../api';
import { ingesta } from './fuenteApp';
import { esNativa } from './nativo';
import { avisarAlFondo, pedirSaludEnSegundoPlano } from './sincroFondo';

const CLAVE = 'salud';
const ULTIMA = 'salud-ultima';
const DIAS = 7;
const CADA_MS = 30 * 60000;

export const LEER: HealthDataType[] = [
  'steps', 'distance', 'calories', 'totalCalories', 'heartRate', 'restingHeartRate', 'heartRateVariability',
  'oxygenSaturation', 'respiratoryRate', 'weight', 'sleep', 'workouts',
];

export const haySalud = () => esNativa();

export function saludActivada(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return false;
  }
}

export function ponerSalud(activa: boolean): void {
  try {
    if (activa) localStorage.setItem(CLAVE, 'si');
    else localStorage.removeItem(CLAVE);
    localStorage.removeItem(ULTIMA);
  } catch {
    /* sin almacenamiento */
  }
  avisarAlFondo();
}

export interface Medicion { concepto: string; categoria: string; unidad: string | null; valor: number; inicio: string; fin: string }

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * La hora del día como número (23,5 = 23:30). Lo de la madrugada (antes de las 12) se cuenta como 24 + hora, así
 * "me dormí a la 1" queda después de "me dormí a las 23" y los patrones lo comparan bien.
 */
export function horaComoNumero(d: Date, despuesDeMedianoche: boolean): number {
  const h = d.getHours() + d.getMinutes() / 60;
  return r1(despuesDeMedianoche && h < 12 ? h + 24 : h);
}

/** El sueño de una noche, a partir de las sesiones que terminan ese día (lógica pura, para probarla). */
export function resumenDeSueno(sesiones: HealthSample[]): Array<Omit<Medicion, 'inicio' | 'fin'>> {
  if (!sesiones.length) return [];
  const orden = [...sesiones].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
  // La principal es la más larga (las siestas cortas van aparte).
  const principal = orden.reduce((a, b) => (Date.parse(b.endDate) - Date.parse(b.startDate) > Date.parse(a.endDate) - Date.parse(a.startDate) ? b : a));
  const minutosDe = (s: HealthSample, etapas: string[]) =>
    s.stages?.length ? s.stages.filter((e) => etapas.includes(e.stage)).reduce((t, e) => t + e.durationMinutes, 0) : null;
  const total = orden.reduce((t, s) => {
    const dormido = minutosDe(s, ['asleep', 'light', 'deep', 'rem']);
    return t + (dormido ?? (Date.parse(s.endDate) - Date.parse(s.startDate)) / 60000);
  }, 0);
  const r: Array<Omit<Medicion, 'inicio' | 'fin'>> = [
    { concepto: 'Horas de sueño', categoria: 'sueno', unidad: 'h', valor: r1(total / 60) },
    { concepto: 'Hora de dormir', categoria: 'sueno', unidad: 'hora', valor: horaComoNumero(new Date(principal.startDate), true) },
    { concepto: 'Hora de despertar', categoria: 'sueno', unidad: 'hora', valor: horaComoNumero(new Date(principal.endDate), false) },
  ];
  for (const [concepto, etapas] of [['Sueño profundo', ['deep']], ['Sueño REM', ['rem']], ['Despierto en la noche', ['awake']]] as const) {
    const m = orden.reduce<number | null>((t, s) => {
      const x = minutosDe(s, [...etapas]);
      return x === null ? t : (t ?? 0) + x;
    }, null);
    if (m !== null) r.push({ concepto, categoria: 'sueno', unidad: 'min', valor: Math.round(m) });
  }
  return r;
}

export interface EtapaSueno {
  inicio: string;
  fin: string;
  etapa: 'despierto' | 'ligero' | 'profundo' | 'rem' | 'dormido';
}

const NOMBRE_ETAPA: Partial<Record<string, EtapaSueno['etapa']>> = { awake: 'despierto', light: 'ligero', deep: 'profundo', rem: 'rem', asleep: 'dormido' };

/** Los tramos de una noche con su hora; si el reloj no distingue etapas, cada sesión es un tramo "dormido". */
export function etapasDeLaNoche(sesiones: HealthSample[]): EtapaSueno[] {
  const r: EtapaSueno[] = [];
  for (const s of sesiones) {
    const conEtapas = (s.stages ?? []).filter((e) => NOMBRE_ETAPA[e.stage]);
    if (conEtapas.length) for (const e of conEtapas) r.push({ inicio: e.startDate, fin: e.endDate, etapa: NOMBRE_ETAPA[e.stage]! });
    else r.push({ inicio: s.startDate, fin: s.endDate, etapa: 'dormido' });
  }
  return r.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export interface Caminata {
  inicio: string;
  fin: string;
  pasos: number;
}

/** Una caminata: al menos esto seguido (minutos), a buen ritmo, con cortes cortos permitidos. */
const CAMINATA_MIN = 10;
const PASOS_POR_MIN = 60;
const CORTE_MIN = 4;

/**
 * Las caminatas de un día a partir de las muestras de pasos (cada una con su tramo de tiempo): se reparten por minuto,
 * y una caminata es un rato de al menos 10 minutos a 60 pasos por minuto o más (con cortes de hasta 4 minutos: un
 * semáforo, el perro que se para). Los paseos cortos por el barrio no dejan puntos de ubicación; así se ven igual.
 */
export function caminatasDe(muestras: Array<{ startDate: string; endDate: string; value: number }>): Caminata[] {
  const porMinuto = new Map<number, number>();
  for (const m of muestras) {
    const a = Math.floor(Date.parse(m.startDate) / 60000);
    const b = Math.max(a + 1, Math.ceil(Date.parse(m.endDate) / 60000));
    const cada = m.value / (b - a);
    for (let x = a; x < b; x++) porMinuto.set(x, (porMinuto.get(x) ?? 0) + cada);
  }
  const minutos = [...porMinuto.keys()].filter((x) => (porMinuto.get(x) ?? 0) >= PASOS_POR_MIN).sort((a, b) => a - b);
  const r: Caminata[] = [];
  let ini = -1;
  let fin = -1;
  let pasos = 0;
  const cerrar = () => {
    if (ini >= 0 && fin - ini + 1 >= CAMINATA_MIN) r.push({ inicio: new Date(ini * 60000).toISOString(), fin: new Date((fin + 1) * 60000).toISOString(), pasos: Math.round(pasos) });
  };
  for (const x of minutos) {
    if (ini >= 0 && x - fin <= CORTE_MIN) {
      for (let y = fin + 1; y <= x; y++) pasos += porMinuto.get(y) ?? 0;
      fin = x;
      continue;
    }
    cerrar();
    ini = x;
    fin = x;
    pasos = porMinuto.get(x) ?? 0;
  }
  cerrar();
  return r;
}

/** Qué se suma o promedia por día, y cómo se llama en Patty. */
const AGREGADOS: Array<{ tipo: HealthDataType; como: 'sum' | 'average' | 'min' | 'max'; concepto: string; categoria: string; unidad: string; factor?: number; decimales?: number }> = [
  { tipo: 'steps', como: 'sum', concepto: 'Pasos', categoria: 'actividad', unidad: 'pasos', decimales: 0 },
  { tipo: 'distance', como: 'sum', concepto: 'Km caminados', categoria: 'actividad', unidad: 'km', factor: 1 / 1000 },
  { tipo: 'calories', como: 'sum', concepto: 'Calorías activas', categoria: 'actividad', unidad: 'kcal', decimales: 0 },
  { tipo: 'totalCalories', como: 'sum', concepto: 'Calorías totales', categoria: 'actividad', unidad: 'kcal', decimales: 0 },
  { tipo: 'heartRate', como: 'average', concepto: 'Pulso promedio', categoria: 'otro', unidad: 'lpm', decimales: 0 },
  { tipo: 'heartRate', como: 'max', concepto: 'Pulso máximo', categoria: 'otro', unidad: 'lpm', decimales: 0 },
  { tipo: 'heartRate', como: 'min', concepto: 'Pulso mínimo', categoria: 'otro', unidad: 'lpm', decimales: 0 },
  { tipo: 'restingHeartRate', como: 'average', concepto: 'Pulso en reposo', categoria: 'otro', unidad: 'lpm', decimales: 0 },
  { tipo: 'heartRateVariability', como: 'average', concepto: 'Variabilidad del pulso', categoria: 'otro', unidad: 'ms', decimales: 0 },
  { tipo: 'oxygenSaturation', como: 'average', concepto: 'Oxígeno en sangre', categoria: 'otro', unidad: '%' },
  { tipo: 'respiratoryRate', como: 'average', concepto: 'Respiraciones por minuto', categoria: 'otro', unidad: 'rpm' },
  { tipo: 'weight', como: 'average', concepto: 'Peso', categoria: 'otro', unidad: 'kg' },
];

const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function dias(): Array<{ desde: Date; hasta: Date }> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Array.from({ length: DIAS }, (_, i) => {
    const desde = new Date(hoy);
    desde.setDate(hoy.getDate() - (DIAS - 1 - i));
    const hasta = new Date(desde);
    hasta.setDate(desde.getDate() + 1);
    return { desde, hasta };
  });
}

export async function pedirPermisoSalud(): Promise<{ disponible: boolean; motivo?: string; permitidos: HealthDataType[] }> {
  const a = await Health.isAvailable();
  if (!a.available) return { disponible: false, motivo: a.reason, permitidos: [] };
  const r = await Health.requestAuthorization({ read: LEER });
  // Y, si el teléfono lo deja, leer con Patty cerrada: así el sueño llega a la mañana sin abrir la app.
  if (r.readAuthorized.length) await pedirSaludEnSegundoPlano();
  avisarAlFondo();
  return { disponible: true, permitidos: r.readAuthorized };
}

export async function permisosSalud(): Promise<HealthDataType[]> {
  try {
    if (!(await Health.isAvailable()).available) return [];
    return (await Health.checkAuthorization({ read: LEER })).readAuthorized;
  } catch {
    return [];
  }
}

/** Lee los últimos días y los manda. Devuelve cuántos datos mandó. */
export async function sincronizarSalud(personaId: number): Promise<number> {
  const permitidos = new Set(await permisosSalud());
  if (!permitidos.size) return 0;
  const lista: Medicion[] = [];
  const noches: Array<{ noche: string; etapas: EtapaSueno[] }> = [];
  const periodo = dias();
  const desde = periodo[0].desde.toISOString();
  const hasta = periodo[periodo.length - 1].hasta.toISOString();
  const delDia = (d: Date) => periodo.find((p) => d >= p.desde && d < p.hasta);
  const poner = (p: { desde: Date; hasta: Date }, m: Omit<Medicion, 'inicio' | 'fin'>) =>
    lista.push({ ...m, inicio: p.desde.toISOString(), fin: p.hasta.toISOString() });

  for (const a of AGREGADOS) {
    if (!permitidos.has(a.tipo)) continue;
    try {
      const r = await Health.queryAggregated({ dataType: a.tipo, startDate: desde, endDate: hasta, bucket: 'day', aggregation: a.como });
      for (const s of r.samples) {
        const v = s.values[a.como] ?? s.value;
        const p = delDia(new Date(s.startDate));
        if (!p || !Number.isFinite(v) || (a.como === 'sum' && v === 0)) continue;
        poner(p, { concepto: a.concepto, categoria: a.categoria, unidad: a.unidad, valor: redondear(v * (a.factor ?? 1), a.decimales ?? 1) });
      }
    } catch {
      /* ese dato no está en este teléfono: se sigue con los demás */
    }
  }

  // El sueño de cada noche va al día en que uno se despierta.
  if (permitidos.has('sleep')) {
    try {
      const desdeNoche = new Date(periodo[0].desde.getTime() - 12 * 3600000).toISOString();
      const { samples } = await Health.readSamples({ dataType: 'sleep', startDate: desdeNoche, endDate: hasta, limit: 500, ascending: true });
      for (const p of periodo) {
        const noche = samples.filter((s) => {
          const fin = new Date(s.endDate);
          return fin >= p.desde && fin < p.hasta;
        });
        for (const m of resumenDeSueno(noche)) poner(p, m);
        if (noche.length) noches.push({ noche: p.desde.toLocaleDateString('en-CA'), etapas: etapasDeLaNoche(noche) });
      }
    } catch {
      /* sin sueño */
    }
  }

  if (permitidos.has('workouts')) {
    try {
      const { workouts } = await Health.queryWorkouts({ startDate: desde, endDate: hasta, limit: 200 });
      for (const p of periodo) {
        const delDiaW = workouts.filter((w) => {
          const i = new Date(w.startDate);
          return i >= p.desde && i < p.hasta;
        });
        if (!delDiaW.length) continue;
        const minutos = delDiaW.reduce((t, w) => t + (Date.parse(w.endDate) - Date.parse(w.startDate)) / 60000, 0);
        poner(p, { concepto: 'Minutos de ejercicio', categoria: 'actividad', unidad: 'min', valor: Math.round(minutos) });
        poner(p, { concepto: 'Entrenamientos', categoria: 'actividad', unidad: null, valor: delDiaW.length });
      }
    } catch {
      /* sin entrenamientos */
    }
  }

  // Las etapas con su hora (para el gráfico de la noche y los despertares que se repiten), antes que el sueño: al
  // llegar la noche, el servidor arma el resumen (y el buen día) con ellas.
  if (noches.length) await api('POST', '/api/sueno/etapas', { persona_id: personaId, noches }).catch(() => {});
  if (lista.length) await ingesta(personaId, '', { mediciones: lista }, 'salud');
  // Las caminatas de cada día (de las muestras de pasos, con su hora).
  if (permitidos.has('steps')) {
    try {
      const { samples } = await Health.readSamples({ dataType: 'steps', startDate: desde, endDate: hasta, limit: 5000, ascending: true });
      const dias = periodo.map((p) => ({
        fecha: p.desde.toLocaleDateString('en-CA'),
        caminatas: caminatasDe(samples.filter((m) => new Date(m.startDate) >= p.desde && new Date(m.startDate) < p.hasta)),
      }));
      await api('POST', '/api/actividad/caminatas', { persona_id: personaId, dias }).catch(() => {});
    } catch {
      /* sin muestras de pasos */
    }
  }
  try {
    localStorage.setItem(ULTIMA, String(Date.now()));
  } catch {
    /* se volverá a mandar */
  }
  return lista.length;
}

/** Hace cuánto se mandó la salud por última vez (ms; Infinity si nunca). */
export function haceCuantoSalud(): number {
  try {
    const u = Number(localStorage.getItem(ULTIMA) ?? 0);
    return u ? Date.now() - u : Infinity;
  } catch {
    return Infinity;
  }
}

/** Con la salud prendida, la manda al abrir o volver a Patty (como mucho cada media hora). */
export function useSalud(personaId: number | undefined): void {
  useEffect(() => {
    if (!haySalud() || !personaId) return;
    const quizas = () => {
      if (document.visibilityState !== 'visible' || !saludActivada()) return;
      const ultima = Number(localStorage.getItem(ULTIMA) ?? 0);
      if (Date.now() - ultima > CADA_MS) void sincronizarSalud(personaId).catch(() => {});
    };
    quizas();
    document.addEventListener('visibilitychange', quizas);
    return () => document.removeEventListener('visibilitychange', quizas);
  }, [personaId]);
}
