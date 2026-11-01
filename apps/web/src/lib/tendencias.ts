// Las cuentas de los gráficos de "Cómo venís" (abajo de los widgets del Día). Cada cosa se mide distinto (horas, pasos,
// grados): para dibujarlas juntas se llevan a 0–1, pero eso es solo para dibujar; lo que se lee siempre es el valor real
// con su unidad.
import { estadoDe, type TendenciaDia } from 'shared';
import { locale, t } from './idioma';

export type ClaveMetrica = 'animo' | 'sueno' | 'pasos' | 'ejercicio' | 'pantalla' | 'temperatura' | 'pulso' | 'malestares';

export interface Metrica {
  clave: ClaveMetrica;
  nombre: string;
  /** Cómo se dibuja sola: línea lo que es un estado del día, barras desde cero lo que se acumula. */
  forma: 'linea' | 'barras';
  /** La escala fija, si la tiene; si no, se usa de lo más bajo a lo más alto del período. */
  dominio?: [number, number];
  /** Lo que se resume mejor contando días que promediando (promediar solo los días que hubo engañaría). */
  contarDias?: boolean;
}

/** En este orden se dibujan, y a cada una le toca siempre su color (ver .tendencias en estilos.css). */
export const METRICAS: Metrica[] = [
  { clave: 'animo', nombre: t('Ánimo'), forma: 'linea', dominio: [1, 10] },
  { clave: 'sueno', nombre: t('Sueño'), forma: 'linea' },
  { clave: 'pasos', nombre: t('Pasos'), forma: 'barras' },
  { clave: 'ejercicio', nombre: t('Ejercicio'), forma: 'barras', contarDias: true },
  { clave: 'pantalla', nombre: t('Pantalla'), forma: 'barras' },
  { clave: 'temperatura', nombre: t('Temperatura'), forma: 'linea' },
  { clave: 'pulso', nombre: t('Pulso'), forma: 'linea' },
  { clave: 'malestares', nombre: t('Malestares'), forma: 'barras', contarDias: true },
];

/** Cuántos días con dato hacen falta para que una cosa se dibuje: con menos no hay ninguna tendencia que ver. */
export const minimoDias = (periodo: number) => (periodo >= 30 ? 4 : 2);

export const valoresDe = (dias: TendenciaDia[], clave: ClaveMetrica): Array<number | null> => dias.map((d) => d[clave]);

/** Las cosas con datos reales suficientes en el período, en su orden. */
export function metricasConDatos(dias: TendenciaDia[]): Metrica[] {
  const minimo = minimoDias(dias.length);
  return METRICAS.filter((m) => valoresDe(dias, m.clave).filter((v) => v !== null).length >= minimo);
}

/** Lleva a 0–1 para dibujar; lo que no hay sigue sin haber. Si todo vale lo mismo, queda al medio. */
export function normalizar(valores: Array<number | null>, dominio?: [number, number]): Array<number | null> {
  const hay = valores.filter((v): v is number => v !== null);
  const min = dominio ? dominio[0] : Math.min(...hay);
  const max = dominio ? dominio[1] : Math.max(...hay);
  return valores.map((v) => (v === null ? null : max === min ? 0.5 : Math.min(1, Math.max(0, (v - min) / (max - min)))));
}

const numero = (v: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(v);
const horas = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

/** El valor real, con su unidad. */
export function textoValor(clave: ClaveMetrica, v: number): string {
  switch (clave) {
    case 'animo':
      return `${numero(v)} /10`;
    case 'sueno':
      return horas(v);
    case 'pasos':
      return t('{n} pasos', { n: numero(Math.round(v)) });
    case 'ejercicio':
      return `${numero(Math.round(v))} min`;
    case 'pantalla':
      return horas(v / 60);
    case 'temperatura':
      return `${numero(v)} °C`;
    case 'pulso':
      return `${numero(Math.round(v))} lpm`;
    case 'malestares':
      return t(v === 1 ? '{n} malestar' : '{n} malestares', { n: v });
  }
}

/** Lo que dice un día: el valor con su unidad y, si suma, en palabras (cómo se sintió, qué le dolió). */
export function textoDelDia(clave: ClaveMetrica, dia: TendenciaDia): string | null {
  const v = dia[clave];
  if (v === null) return null;
  if (clave === 'animo') return `${textoValor(clave, v)} · ${t(estadoDe(Math.round(v)).nombre)}`;
  if (clave === 'malestares' && dia.nombres_malestares.length) return dia.nombres_malestares.join(', ');
  return textoValor(clave, v);
}

/** Cómo vino en todo el período: el promedio con su unidad (lo de "promedio" lo aclara la pantalla), o en cuántos días pasó. */
export function resumenDe(m: Metrica, dias: TendenciaDia[]): string {
  const hay = valoresDe(dias, m.clave).filter((v): v is number => v !== null);
  if (m.contarDias) return t(hay.length === 1 ? 'en {n} día' : 'en {n} días', { n: hay.length });
  const prom = hay.reduce((s, v) => s + v, 0) / hay.length;
  return textoValor(m.clave, prom);
}

/**
 * El dibujo de una hebra: curvas suaves que unen días seguidos con dato. Donde falta un día se corta en vez de inventar
 * el medio, y un día suelto queda como punto. Las curvas salen y llegan horizontales, así nunca pasan del valor real.
 */
export function hebra(puntos: Array<{ x: number; y: number } | null>): { caminos: string[]; sueltos: Array<{ x: number; y: number }> } {
  const caminos: string[] = [];
  const sueltos: Array<{ x: number; y: number }> = [];
  let tramo: Array<{ x: number; y: number }> = [];
  const cerrar = () => {
    if (tramo.length === 1) sueltos.push(tramo[0]);
    else if (tramo.length > 1) {
      caminos.push(
        tramo
          .map((p, i) => {
            if (!i) return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            const a = tramo[i - 1];
            const medio = ((a.x + p.x) / 2).toFixed(1);
            return `C${medio} ${a.y.toFixed(1)} ${medio} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          })
          .join(' '),
      );
    }
    tramo = [];
  };
  for (const p of puntos) {
    if (p) tramo.push(p);
    else cerrar();
  }
  cerrar();
  return { caminos, sueltos };
}
