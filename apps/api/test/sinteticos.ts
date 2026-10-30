// Datos armados para las pruebas de toda la historia: azar repetible, sin base de datos.
import { sumarDias } from '../src/lib/fechas.js';
import { rasgosDeComidas, type ComidaDia } from '../src/componentes/niveles.js';
import type { ConceptoInfo, FilaDiaria } from '../src/patrones/motor.js';

export const azar = (semilla: number) => {
  let s = semilla;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

export const DESDE = '2021-01-04';

const fila = (fecha: string, concepto_id: number, extra: Partial<FilaDiaria> = {}): FilaDiaria => ({ fecha, concepto_id, veces: 1, suma: null, promedio: null, intensidad: null, primera: Date.parse(`${fecha}T12:00:00Z`), ...extra });

/** `dias` días con cosas al azar (todas independientes), más lo que agregue `mas`. */
export function historia(dias: number, conceptos: number, semilla = 42) {
  const r = azar(semilla);
  const lista: ConceptoInfo[] = [];
  const filas: FilaDiaria[] = [];
  for (let c = 1; c <= conceptos; c++) {
    const sintoma = c % 7 === 0;
    const medida = c % 11 === 0;
    lista.push({ id: c, nombre: `Concepto ${c}`, tipo_valor: medida ? 'medida' : sintoma ? 'intensidad' : c % 3 === 0 ? 'cantidad' : 'evento', rol: sintoma ? 'efecto' : medida ? 'ambos' : 'causa', categoria: sintoma ? 'sintoma' : medida ? 'actividad' : 'comida' });
    const prob = medida ? 0.9 : 0.03 + r() * r() * 0.5;
    const inicio = r() < 0.3 ? Math.floor(r() * dias * 0.7) : 0;
    for (let d = inicio; d < dias; d++) {
      if (r() > prob) continue;
      const fecha = sumarDias(DESDE, d);
      const v = medida ? 20 + r() * 10 : c % 3 === 0 ? 1 + Math.floor(r() * 4) : null;
      filas.push(fila(fecha, c, { suma: v, promedio: v, intensidad: sintoma ? 1 + Math.floor(r() * 5) : null, primera: medida ? null : Date.parse(`${fecha}T12:00:00Z`) + r() * 3e7 }));
    }
  }
  return { filas, conceptos: lista, desde: DESDE, hasta: sumarDias(DESDE, dias - 1), dias };
}

/**
 * Una persona con un cambio plantado: desde el día `corte` empieza el mate (1) y baja el dolor de cabeza (2). El café (3) y la
 * pizza (4) van al azar todo el tiempo.
 */
export function conCambio(dias: number, corte: number, semilla = 7, antes = 0.5, despues = 0.1) {
  const r = azar(semilla);
  const conceptos: ConceptoInfo[] = [
    { id: 1, nombre: 'Mate', tipo_valor: 'evento', rol: 'causa', categoria: 'bebida' },
    { id: 2, nombre: 'Dolor de cabeza', tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' },
    { id: 3, nombre: 'Café', tipo_valor: 'evento', rol: 'causa', categoria: 'bebida' },
    { id: 4, nombre: 'Pizza', tipo_valor: 'evento', rol: 'causa', categoria: 'comida' },
  ];
  const filas: FilaDiaria[] = [];
  for (let d = 0; d < dias; d++) {
    const f = sumarDias(DESDE, d);
    if (d >= corte && r() < 0.8) filas.push(fila(f, 1));
    if (r() < (d >= corte ? despues : antes)) filas.push(fila(f, 2, { intensidad: 3 }));
    if (r() < 0.6) filas.push(fila(f, 3));
    if (r() < 0.3) filas.push(fila(f, 4));
  }
  return { filas, conceptos, desde: DESDE, hasta: sumarDias(DESDE, dias - 1), fecha: sumarDias(DESDE, corte) };
}

/** Otro generador: los de `azar` son todos tramos de una misma secuencia, y a veces dos semillas se parecen demasiado. */
const otroAzar = (semilla: number) => {
  let s = semilla;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Datos al azar más una combinación plantada: comida frita + fase menstrual + calor → dolor de panza al día siguiente, con
 * cada cosa sola casi sin efecto. Los ids plantados son `base` + 1 a 3 (causas) y `base` + 10 (efecto). `racha`: esas cosas van
 * juntas solo en esos días (una temporada rara) y el resto del tiempo no se dan más que por azar.
 */
export function conCombinada(dias: number, conceptos: number, semilla = 42, opciones: { base?: number; racha?: [number, number] } = {}) {
  const { base = 1000, racha } = opciones;
  const h = historia(dias, conceptos, semilla);
  const r = otroAzar(semilla + base);
  const lista: ConceptoInfo[] = [
    ...h.conceptos,
    { id: base + 1, nombre: `Comida frita ${base}`, tipo_valor: 'evento', rol: 'causa', categoria: 'comida' },
    { id: base + 2, nombre: `Fase menstrual ${base}`, tipo_valor: 'evento', rol: 'causa', categoria: 'ciclo' },
    { id: base + 3, nombre: `Temperatura máxima ${base}`, tipo_valor: 'medida', rol: 'causa', categoria: 'clima' },
    { id: base + 10, nombre: `Dolor de panza ${base}`, tipo_valor: 'intensidad', rol: 'efecto', categoria: 'sintoma' },
  ];
  const filas = [...h.filas];
  let ayer = false;
  for (let d = 0; d < dias; d++) {
    const fecha = sumarDias(DESDE, d);
    const t = Date.parse(`${fecha}T12:00:00Z`);
    const enRacha = racha ? d >= racha[0] && d < racha[1] : true;
    const periodo = racha ? r() < (enRacha ? 0.7 : 0.15) : d % 29 < 5;
    const calor = r() < 0.5;
    const frito = r() < (racha ? (enRacha ? 0.7 : 0.15) : periodo ? 0.6 : 0.3);
    if (frito) filas.push(fila(fecha, base + 1, { primera: t + 3600000 }));
    if (periodo) filas.push(fila(fecha, base + 2, { primera: t - 3600000 }));
    filas.push(fila(fecha, base + 3, { promedio: calor ? 28 + r() * 3 : 18 + r() * 6, primera: null }));
    if (r() < (ayer ? 0.95 : 0.06)) filas.push(fila(fecha, base + 10, { intensidad: 4, primera: t - 7200000 }));
    ayer = frito && periodo && calor && enRacha;
  }
  return { ...h, filas, conceptos: lista };
}

/** Una comida armada a mano para probar componentes: suma lo que se le diga, con la hora del día. */
export const comidaDePrueba = (fecha: string, nombre: string, componentes: ComidaDia['componentes'], extra: Partial<ComidaDia> = {}): ComidaDia => ({
  fecha,
  hora: Date.parse(`${fecha}T13:00:00Z`),
  nombre,
  gramos: 300,
  peso: 1,
  conocidos: null,
  componentes,
  ...extra,
});

/**
 * A datos al azar (`historia`) les agrega los componentes: a cada comida le toca una composición de la lista, y con eso se arman los
 * rasgos de cada día igual que en producción. Causas y efectos siguen siendo independientes: lo que salga es falso. `dispareja`: unos
 * días se anota mucho más que otros, y eso sube a la vez las comidas y los malestares anotados (la trampa de sumar por día).
 */
export function conComponentes(dias: number, conceptos: number, semilla: number, composiciones: Array<ComidaDia['componentes']>, o: { dispareja?: boolean } = {}) {
  const h = historia(dias, conceptos, semilla);
  const r = otroAzar(semilla + 77);
  let filas = h.filas;
  if (o.dispareja) {
    const ganas = new Map<string, number>();
    for (let d = 0; d < dias; d++) ganas.set(sumarDias(DESDE, d), r() < 0.5 ? 1 : 0.35);
    filas = filas.filter((f) => f.primera === null || r() < ganas.get(f.fecha)!);
  }
  const lista = [...h.conceptos];
  const composicionDe = new Map(lista.filter((c) => c.categoria === 'comida').map((c) => [c.id, composiciones[Math.floor(r() * composiciones.length)]]));
  const nombre = new Map(lista.map((c) => [c.id, c.nombre]));
  const comidas: ComidaDia[] = [];
  for (const f of filas) {
    const comp = composicionDe.get(f.concepto_id);
    if (comp) comidas.push(comidaDePrueba(f.fecha, nombre.get(f.concepto_id)!, comp, { hora: f.primera }));
  }
  const extra: ConceptoInfo[] = [];
  const mas: FilaDiaria[] = [];
  rasgosDeComidas(comidas).forEach((x, i) => {
    const id = 50000 + i;
    extra.push({ id, nombre: x.concepto, tipo_valor: 'evento', rol: 'causa', categoria: 'componente', universo: x.universo, componente: { clave: x.clave, nivel: x.nivel, alimentos: x.alimentos } });
    for (const d of x.dias) mas.push({ fecha: d.fecha, concepto_id: id, veces: 1, suma: null, promedio: null, intensidad: null, primera: d.primera, automatica: true });
  });
  return { ...h, filas, sinComponentes: lista, conceptos: [...lista, ...extra], conFilas: [...filas, ...mas] };
}
