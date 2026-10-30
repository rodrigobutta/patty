// Lo que muestra el widget Comida del Día: los componentes de un día, comparados con lo habitual de la persona, y su semana. Funciones
// puras, sin base. Las cuentas son las mismas de los patrones (niveles.ts): la misma suma por porción, el mismo peso según cuánto se
// le cree a cada comida y los mismos cortes. No es una app de dieta: acá no hay metas ni juicios, solo "más o menos que lo tuyo".
import type { ComidaDelDia, ComponenteDeLaSemana, ComponenteDelDia, NivelComponente } from 'shared';
import { sumarDias } from '../lib/fechas.js';
import { COMPONENTES, type ClaveComponente } from './lista.js';
import { COBERTURA_MIN, comidaDe, comidasMinimas, comidasPorDia, porciones, rangoHabitual, sumasDelDia, type ComidaDia, type RangoHabitual, type RegistroComida } from './niveles.js';

const DIAS_SEMANA = 7;
/** Con menos días que estos en alguna de las dos semanas, no se comparan. */
const DIAS_PARA_COMPARAR = 3;
/** Cuánto tienen que diferir las dos semanas para decirlo: los días varían mucho solos. */
const CAMBIO_MIN = 0.2;
/** Y tiene que ser algo que se note: una parte del piso de "mucho". */
const CAMBIO_PISO = 0.25;
/** Lo que aporta menos que esto del total no se nombra. */
const APORTE_MIN = 0.1;
const MAX_ALIMENTOS = 3;

const redondear = (x: number) => Math.round(x * 100) / 100;

type Comp = (typeof COMPONENTES)[number];

function nivelDe(comp: Comp, rango: RangoHabitual | null, suma: { valor: number; total: number; sabido: number } | undefined, o: { enCurso: boolean; pocasComidas: boolean }): NivelComponente {
  if (!rango || !suma || !suma.total || suma.sabido / suma.total < COBERTURA_MIN) return null;
  if (suma.valor >= rango.corteMucho) return 'mucho';
  // Si lo habitual es casi nada, tener menos no dice nada.
  const puedeSerPoco = rango.mediana >= comp.piso / 2;
  if (puedeSerPoco && suma.valor <= rango.cortePoco) return o.enCurso || o.pocasComidas ? null : 'poco'; // el día no terminó o quedó a medias: "poco" no se sabe
  return 'normal';
}

/** Qué tanto se sale de lo habitual: para ordenar lo que más se nota primero. */
function cuantoSeNota(c: ComponenteDelDia, rango: RangoHabitual | null): number {
  if (!rango || c.valor === null) return c.valor === null ? -1 : 0;
  if (c.nivel === 'mucho') return 2 + c.valor / Math.max(rango.corteMucho, 1e-6);
  if (c.nivel === 'poco') return 1 + (rango.mediana - c.valor) / Math.max(rango.mediana, 1e-6);
  return 0;
}

function aportes(comidas: ComidaDia[], clave: ClaveComponente): string[] {
  const por = new Map<string, number>();
  let total = 0;
  for (const c of comidas) {
    if (c.conocidos && !c.conocidos.has(clave)) continue;
    const v = (c.componentes[clave] ?? 0) * c.peso;
    if (v <= 0) continue;
    por.set(c.nombre, (por.get(c.nombre) ?? 0) + v);
    total += v;
  }
  return [...por]
    .filter(([, v]) => v >= total * APORTE_MIN)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ALIMENTOS)
    .map(([n]) => n);
}

function estadoDe(r: RegistroComida): ComidaDelDia['comidas'][number]['estado'] {
  if (r.estado === 'resuelto' && r.componentes) return 'resuelta';
  if (r.estado === 'pendiente' || r.estado === null) return 'pendiente';
  return r.tipos?.length ? 'aproximada' : 'sin_dato';
}

/**
 * El resumen de un día. `registros`: toda la historia de la persona (lo habitual sale de ahí, sin el día de hoy, que no terminó).
 * Lo habitual es igual al de los patrones; lo que cambia es que acá se puede hablar de un día a medias: si ya pasó el corte es
 * "mucho" aunque falte anotar, pero "poco" solo se dice de un día terminado y anotado como siempre.
 */
export function resumenDelDia(registros: RegistroComida[], fecha: string, hoy: string): Omit<ComidaDelDia, 'patrones'> {
  const todas = registros.map(comidaDe).filter((c): c is ComidaDia => c !== null);
  const historia = todas.filter((c) => c.fecha !== hoy);
  const porDia = comidasPorDia(historia);
  const minComidas = comidasMinimas(porDia);
  const rangos = new Map(COMPONENTES.map((comp) => [comp.clave, rangoHabitual(historia, porDia, minComidas, comp)]));

  const delDia = todas.filter((c) => c.fecha === fecha);
  const registrosDia = registros.filter((r) => r.fecha === fecha && r.estado !== 'no_comida').sort((a, b) => (a.hora ?? 0) - (b.hora ?? 0));
  const comidas = registrosDia.map((r) => ({
    nombre: r.nombre,
    hora: r.hora === null ? null : new Date(r.hora).toISOString(),
    categoria: r.categoria,
    estado: estadoDe(r),
    porciones: redondear(r.estado === 'resuelto' ? porciones(r) : 1),
  }));
  const cuantas = (e: ComidaDelDia['comidas'][number]['estado']) => comidas.filter((c) => c.estado === e).length;

  const componentes = COMPONENTES.map((comp) => {
    const suma = sumasDelDia(delDia, comp.clave).get(fecha);
    const c: ComponenteDelDia = {
      clave: comp.clave,
      de: comp.de,
      unidad: comp.unidad,
      valor: suma && suma.sabido > 0 ? redondear(suma.valor) : null,
      nivel: nivelDe(comp, rangos.get(comp.clave) ?? null, suma, { enCurso: fecha === hoy, pocasComidas: delDia.length < minComidas }),
      alimentos: aportes(delDia, comp.clave),
    };
    return { c, nota: cuantoSeNota(c, rangos.get(comp.clave) ?? null) };
  })
    .sort((a, b) => b.nota - a.nota) // estable: lo que no se nota queda en el orden de siempre
    .map((x) => x.c);

  // Las calorías no van en la línea del Día: "muchas calorías" a primera vista es justo lo que esta app no quiere ser. Adentro sí están.
  const notable = componentes.find((c) => c.clave !== 'calorias' && (c.nivel === 'mucho' || c.nivel === 'poco'));

  return {
    fecha,
    en_curso: fecha === hoy,
    comidas,
    cobertura: { comidas: comidas.length, resueltas: cuantas('resuelta'), aproximadas: cuantas('aproximada'), sin_dato: cuantas('sin_dato'), pendientes: cuantas('pendiente') },
    componentes,
    destacado: notable ? { clave: notable.clave, nivel: notable.nivel as 'poco' | 'mucho' } : null,
    semana: semanaDe(todas, fecha, hoy, rangos, minComidas),
  };
}

/** Los últimos 7 días (hasta `fecha`) contra los 7 anteriores. Hoy se ve, pero no entra al promedio: todavía no terminó. */
function semanaDe(todas: ComidaDia[], fecha: string, hoy: string, rangos: Map<ClaveComponente, RangoHabitual | null>, minComidas: number): ComidaDelDia['semana'] {
  const dias = Array.from({ length: DIAS_SEMANA }, (_, i) => sumarDias(fecha, i - DIAS_SEMANA + 1));
  const anteriores = dias.map((d) => sumarDias(d, -DIAS_SEMANA));
  const desde = anteriores[0];
  const quince = comidasPorDia(todas.filter((c) => c.fecha >= desde && c.fecha <= fecha));
  const comidas = [...quince.values()].flat();
  const pocas = (d: string) => (quince.get(d)?.length ?? 0) < minComidas;
  const componentes: ComponenteDeLaSemana[] = COMPONENTES.map((comp) => {
    const sumas = sumasDelDia(comidas, comp.clave);
    const valorDe = (d: string) => {
      const s = sumas.get(d);
      return s && s.total && s.sabido / s.total >= COBERTURA_MIN ? s.valor : null;
    };
    const promedio = (lista: string[]) => {
      const v = lista.filter((d) => d !== hoy && !pocas(d)).map(valorDe).filter((x): x is number => x !== null);
      return { n: v.length, prom: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
    };
    const esta = promedio(dias);
    const antes = promedio(anteriores);
    let cambio: ComponenteDeLaSemana['cambio'] = null;
    if (esta.n >= DIAS_PARA_COMPARAR && antes.n >= DIAS_PARA_COMPARAR && esta.prom !== null && antes.prom !== null) {
      const dif = esta.prom - antes.prom;
      const seNota = Math.abs(dif) >= Math.max(CAMBIO_MIN * Math.max(esta.prom, antes.prom), CAMBIO_PISO * comp.piso);
      cambio = !seNota ? 'igual' : dif > 0 ? 'mas' : 'menos';
    }
    return {
      clave: comp.clave,
      valores: dias.map((d) => {
        const v = valorDe(d);
        return v === null ? null : redondear(v);
      }),
      niveles: dias.map((d) => nivelDe(comp, rangos.get(comp.clave) ?? null, sumas.get(d), { enCurso: d === hoy, pocasComidas: pocas(d) })),
      promedio: esta.prom === null ? null : redondear(esta.prom),
      promedio_anterior: antes.prom === null ? null : redondear(antes.prom),
      cambio,
    };
  });
  return { dias, componentes };
}
