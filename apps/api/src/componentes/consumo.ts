// Lo que más se viene comiendo, día a día: no los platos sino lo que tienen adentro ("pan", "carne", "queso"), sacado de los ingredientes
// de la tabla de comidas (resolver.ts). Funciones puras, sin base. Sirve para ir viendo qué se repite: cuenta veces, sin metas ni juicios.
import { normalizar, traducirDato, traducir, type ConsumoDeElementos, type ElementoConsumido, type Idioma } from 'shared';
import { sumarDias } from '../lib/fechas.js';
import { claveAlimento } from './lista.js';

/** Los días que se muestran. */
export const DIAS_CONSUMO = 14;
/** Hasta cuándo se mira atrás para saber qué dejó de aparecer. */
export const DIAS_HISTORIA_CONSUMO = 60;
const MAX_ELEMENTOS = 8;
const MAX_SIN_APARECER = 3;
/** Para decir que algo "dejó de aparecer", tuvo que haber aparecido estas veces antes. */
const VECES_PARA_EXTRANAR = 3;
/** Un ingrediente es de los principales si pesa al menos esto del plato (el aceite de la fritura y un poco de huevo, no). */
const PARTE_PRINCIPAL = 0.12;
/** Con menos días desglosados que estos no hay lectura: dos días no son "cómo venís". */
export const DIAS_PARA_LEER = 3;
/** Desde cuántos días seguidos vale la pena decirlo, y desde qué parte de los días anotados "estuvo casi siempre". */
const SEGUIDOS_PARA_DECIR = 3;
const PARTE_CASI_SIEMPRE = 0.7;

export interface RegistroConIngredientes {
  fecha: string;
  /** ms. Lo anotado al mismo minuto es una sola comida. */
  hora: number | null;
  estado: 'pendiente' | 'resuelto' | 'generico' | 'no_comida' | 'fallido' | null;
  ingredientes: Array<{ nombre: string; gramos: number }> | null;
}

/** Lo que no dice nada de qué se come, por más que esté en casi todo. */
const NO_CUENTA = /^(sal|agua|hielo|pimienta|oregano|condimentos?)( |$)/;

/** Las familias: "peceto" y "bife" son carne, "muzzarella" y "ricota" son queso. Gana la primera que coincide. */
const FAMILIAS: Array<[RegExp, string]> = [
  [/^(galletitas?|dulce de leche|chocolate)/, ''], // no se confunden con pan, agua ni leche: quedan con su nombre
  [/^(pan|panes)( |$)|^tostadas?$/, 'Pan'],
  [/^(tapas? de|masas?|harinas?|tortillas? de trigo)( |$)/, 'Harina y masas'],
  [/^(fideos?|pastas?|noquis?|ravioles|sorrentinos|tallarines)( |$)/, 'Pasta'],
  [/^arroz/, 'Arroz'],
  [/^(papas?|pure de papas?)( |$)/, 'Papa'],
  [/^(carnes? de cerdo|cerdo|bondiola)/, 'Cerdo'],
  [/^(jamon|salame|panceta|chorizo|salchicha|morcilla|mortadela)/, 'Fiambres y embutidos'],
  [/^(pollo|pechuga)/, 'Pollo'],
  [/^(peceto|bife|asado|carnes?|vacio|lomo|nalga|cuadril|entrana|matambre)( |$)/, 'Carne'],
  [/^(merluza|salmon|atun|pescado|camarones)/, 'Pescado'],
  [/^huevos?( |$)/, 'Huevo'],
  [/^(quesos?|muzzarella|mozzarella|provolone|ricota)( |$)/, 'Queso'],
  [/^leche( |$)/, 'Leche'],
  [/^yogur/, 'Yogur'],
  [/^(tomates?|salsa de tomate)( |$)/, 'Tomate'],
  [/^infusion de yerba|^mate( |$)|^yerba/, 'Mate'],
  [/^(cafe|espresso)( |$)/, 'Café'],
  [/^te( |$)/, 'Té'],
  [/^gaseosas?( |$)/, 'Gaseosa'],
  [/^vinos?( |$)/, 'Vino'],
  [/^azucar( |$)/, 'Azúcar'],
];

/** La tabla viene sin tildes: las que más se ven, para mostrarlas bien. */
const TILDES: Record<string, string> = { anana: 'Ananá', brocoli: 'Brócoli', mani: 'Maní', morron: 'Morrón', limon: 'Limón', pure: 'Puré' };

/** El elemento principal al que pertenece un ingrediente; null si no cuenta. */
export function elementoDe(ingrediente: string): string | null {
  const n = normalizar(ingrediente).trim();
  if (!n || NO_CUENTA.test(n)) return null;
  for (const [patron, familia] of FAMILIAS) {
    if (!patron.test(n)) continue;
    if (familia) return familia;
    break;
  }
  const t = TILDES[n];
  if (t) return t;
  const limpio = ingrediente.trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Los elementos principales de un plato: lo que pesa, juntando la familia. Si nada llega (un plato muy repartido), lo que más pesa. */
export function elementosDelPlato(ingredientes: Array<{ nombre: string; gramos: number }>): string[] {
  const por = new Map<string, number>();
  for (const i of ingredientes) {
    const e = elementoDe(i.nombre);
    if (e && i.gramos > 0) por.set(e, (por.get(e) ?? 0) + i.gramos);
  }
  const total = [...por.values()].reduce((a, b) => a + b, 0);
  const orden = [...por].sort((a, b) => b[1] - a[1]);
  const principales = orden.filter(([, g]) => g >= total * PARTE_PRINCIPAL);
  return (principales.length ? principales : orden.slice(0, 1)).map(([e]) => e);
}

/** Para juntar plurales y mayúsculas distintas (lo que escribe la IA varía). */
const claveDe = (nombre: string) => claveAlimento(nombre) || normalizar(nombre);

/**
 * El consumo de los últimos días hasta `fecha`, inclusive. `registros`: las comidas de al menos DIAS_HISTORIA_CONSUMO días hacia atrás.
 * Una comida con varios platos cuenta una vez por elemento; lo que todavía no se sabe qué tiene no se adivina, se avisa en `sin_desglosar`.
 */
export function consumoDeElementos(registros: RegistroConIngredientes[], fecha: string): ConsumoDeElementos {
  const dias = Array.from({ length: DIAS_CONSUMO }, (_, i) => sumarDias(fecha, i - DIAS_CONSUMO + 1));
  const primerDia = dias[0];
  const indice = new Map(dias.map((d, i) => [d, i]));
  const historiaDesde = sumarDias(fecha, -DIAS_HISTORIA_CONSUMO);

  const comidas = new Map<string, { fecha: string; elementos: Map<string, string> }>();
  let sinDesglosar = 0;
  registros.forEach((r, i) => {
    if (r.fecha > fecha || r.fecha < historiaDesde || r.estado === 'no_comida') return;
    const lista = r.estado === 'resuelto' ? elementosDelPlato(r.ingredientes ?? []) : [];
    if (!lista.length) {
      // El agua sola no tiene elementos pero tampoco falta saber nada.
      if (r.estado !== 'resuelto' && r.fecha >= primerDia) sinDesglosar++;
      return;
    }
    const clave = r.hora === null ? `${r.fecha}#${i}` : `${r.fecha}#${Math.floor(r.hora / 60000)}`;
    const comida = comidas.get(clave) ?? { fecha: r.fecha, elementos: new Map<string, string>() };
    comidas.set(clave, comida);
    for (const e of lista) comida.elementos.set(claveDe(e), e);
  });

  const comidasPorDia = dias.map(() => 0);
  const por = new Map<string, { nombre: string; veces: number[]; total: number; antes: number; ultima: string }>();
  for (const c of comidas.values()) {
    const i = indice.get(c.fecha);
    if (i !== undefined) comidasPorDia[i]++;
    for (const [clave, nombre] of c.elementos) {
      const e = por.get(clave) ?? { nombre, veces: dias.map(() => 0), total: 0, antes: 0, ultima: c.fecha };
      por.set(clave, e);
      if (c.fecha > e.ultima) e.ultima = c.fecha;
      if (i === undefined) {
        e.antes++;
      } else {
        e.veces[i]++;
        e.total++;
      }
    }
  }

  const diasEntre = (desde: string) => Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000);
  const elementos: ElementoConsumido[] = [...por.values()]
    .filter((e) => e.total > 0)
    .map((e) => {
      let seguidos = 0;
      for (let i = dias.length - 1; i >= 0 && e.veces[i] > 0; i--) seguidos++;
      return { nombre: e.nombre, veces: e.veces, total: e.total, dias: e.veces.filter((v) => v > 0).length, dias_desde: diasEntre(e.ultima), seguidos };
    })
    .sort((a, b) => b.total - a.total || b.dias - a.dias || a.dias_desde - b.dias_desde || a.nombre.localeCompare(b.nombre))
    .slice(0, MAX_ELEMENTOS);

  const sinAparecer = [...por.values()]
    .filter((e) => e.total === 0 && e.antes >= VECES_PARA_EXTRANAR)
    .sort((a, b) => b.antes - a.antes || a.nombre.localeCompare(b.nombre))
    .slice(0, MAX_SIN_APARECER)
    .map((e) => ({ nombre: e.nombre, dias_desde: diasEntre(e.ultima), veces: e.antes }));

  return { dias, comidas_por_dia: comidasPorDia, elementos, sin_aparecer: sinAparecer, distintos: [...por.values()].filter((e) => e.total > 0).length, sin_desglosar: sinDesglosar };
}

/** Los días con algo desglosado. */
export const diasConDatos = (c: ConsumoDeElementos) => c.comidas_por_dia.filter((n) => n > 0).length;

/** "pan, carne y queso". */
function enumerar(lista: string[], idioma: Idioma): string {
  if (lista.length < 2) return lista.join('');
  return traducir(idioma, '{lista} y {ultimo}', { lista: lista.slice(0, -1).join(', '), ultimo: lista[lista.length - 1] });
}

/** La lectura sin IA: las mismas cuentas dichas en dos o tres frases. Null si todavía no hay días suficientes. */
export function lecturaSinIa(c: ConsumoDeElementos, idioma: Idioma): string | null {
  const conDatos = diasConDatos(c);
  if (conDatos < DIAS_PARA_LEER || !c.elementos.length) return null;
  const nombre = (n: string) => traducirDato(n, idioma).toLowerCase();
  const veces = (n: number) => (n === 1 ? traducir(idioma, '1 vez') : traducir(idioma, '{n} veces', { n }));
  const frases = [
    traducir(idioma, 'En los últimos {d} días, lo que más se repite es {lista}.', {
      d: c.dias.length,
      lista: enumerar(c.elementos.slice(0, 3).map((e) => `${nombre(e.nombre)} (${veces(e.total)})`), idioma),
    }),
  ];
  const seguidos = [...c.elementos].sort((a, b) => b.seguidos - a.seguidos)[0];
  const casiSiempre = c.elementos.find((e) => e.dias >= conDatos * PARTE_CASI_SIEMPRE);
  if (seguidos.seguidos >= SEGUIDOS_PARA_DECIR) frases.push(traducir(idioma, 'Ya van {n} días seguidos con {x}.', { n: seguidos.seguidos, x: nombre(seguidos.nombre) }));
  else if (casiSiempre) frases.push(traducir(idioma, 'Hubo {x} en {n} de los {d} días anotados.', { x: nombre(casiSiempre.nombre), n: casiSiempre.dias, d: conDatos }));
  const falta = c.sin_aparecer[0];
  if (falta) frases.push(traducir(idioma, 'La última vez de {x} fue hace {n} días, por si querés variar.', { n: falta.dias_desde, x: nombre(falta.nombre) }));
  else frases.push(traducir(idioma, 'En total aparecieron {n} cosas distintas.', { n: c.distintos }));
  return frases.join(' ');
}
