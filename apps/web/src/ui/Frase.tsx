// Lo anotado como una frase corta y natural ("3 porciones de pizza", "Me siento bien", "Con un poco de sueño"), con lo
// que Patty entendió resaltado (la cantidad en un color, lo que fue en otro) en vez de varias etiquetas sueltas.
import type { ReactNode } from 'react';
import { COMO_ME_SENTI, COMO_ME_SIENTO, COMO_VIAJE, conUnidad, CUANTO, ESTADOS_PUNTUALES, estadoDe, VIAJE_PESADO, type Registro } from 'shared';
import { duracion } from '../lib/automatico';
import { idioma, t } from '../lib/idioma';

/** Lo que tiene en femenino "mucha" (mucha hambre, mucha energía); el resto, "mucho". */
const FEMENINOS = new Set(['energía', 'hambre', 'pesadez', 'ansiedad', 'calma']);

const C = ({ children }: { children: ReactNode }) => <span className="frase-cant">{children}</span>;
const Q = ({ children }: { children: ReactNode }) => <span className="frase-que">{children}</span>;

/** "Pizza" → "pizza" dentro de la frase; los nombres en mayúsculas (C5N) o propios de una palabra quedan igual. */
function enFrase(nombre: string): string {
  if (nombre.length > 1 && nombre[1] === nombre[1].toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(nombre[1])) return nombre;
  return nombre.charAt(0).toLowerCase() + nombre.slice(1);
}

const cuantoDe = (i: number) => CUANTO.reduce((a, b) => (Math.abs(b.intensidad - i) < Math.abs(a.intensidad - i) ? b : a)).nombre;
const fuerza = (i: number) => (i <= 3 ? t('leve') : i <= 6 ? t('medio') : t('fuerte'));

export function Frase({ r, tipo, categoria }: { r: Registro; tipo?: string; categoria?: string }): ReactNode {
  const nombre = t(r.concepto);
  const en = idioma() === 'en';
  // Cómo me siento: "Me siento bien" / "Me sentí mal en el día".
  if (r.intensidad !== null && (r.concepto === COMO_ME_SIENTO || r.concepto === COMO_ME_SENTI)) {
    const e = t(estadoDe(r.intensidad).nombre).toLowerCase();
    return r.concepto === COMO_ME_SENTI ? <>{t('Me sentí')} <C>{e}</C> {t('en el día')}</> : <>{t('Me siento')} <C>{e}</C></>;
  }
  // "Con sueño" y compañía, con poco, bastante o mucho: "Con un poco de sueño", "Con mucha hambre".
  if (r.intensidad !== null && ESTADOS_PUNTUALES.some((x) => x.nombre === r.concepto)) {
    const c = cuantoDe(r.intensidad);
    if (en) return <><Q>{nombre}</Q> <C>({t(c).toLowerCase()})</C></>;
    const m = /^Con (.+)$/.exec(r.concepto);
    if (!m) return <><Q>{r.concepto}</Q> <C>({c.toLowerCase()})</C></>;
    const que = m[1];
    const cuanto = c === 'Poco' ? 'un poco de' : c === 'Bastante' ? 'bastante' : FEMENINOS.has(que) ? 'mucha' : 'mucho';
    return <>Con <C>{cuanto}</C> <Q>{que}</Q></>;
  }
  // Viajes: "45 min de viaje en auto (pesado)".
  if (categoria === 'viaje') {
    if (r.concepto === VIAJE_PESADO) return <Q>{nombre}</Q>;
    const como = r.intensidad === null ? null : COMO_VIAJE.reduce((a, b) => (Math.abs(b.intensidad - r.intensidad!) < Math.abs(a.intensidad - r.intensidad!) ? b : a));
    return (
      <>
        {r.valor !== null ? <><C>{duracion(r.valor)}</C> {en ? 'of' : 'de'} </> : null}
        <Q>{enFrase(nombre)}</Q>
        {como ? <> <C>({t(como.nombre).toLowerCase()})</C></> : null}
      </>
    );
  }
  // Dolores y molestias: "Dolor de cabeza fuerte".
  if (r.intensidad !== null) return <><Q>{nombre}</Q> <C>{fuerza(r.intensidad)}</C></>;
  // La hora de algo ("Me levanté a las 7:30"): la hora ya está a la izquierda.
  if (r.valor === null || tipo === 'hora') return <Q>{nombre}</Q>;
  // Con cantidad o duración: "3 porciones de pizza", "1 h de tele en C5N".
  const cant = tipo === 'duracion' || r.unidad === 'min' ? duracion(r.valor) : conUnidad(r.valor, r.unidad, 2, idioma());
  if (!r.unidad && tipo !== 'duracion' && categoria !== 'comida' && categoria !== 'bebida') return <><Q>{nombre}</Q> <C>{cant}</C></>;
  return <><C>{cant}</C> {en ? 'of' : 'de'} <Q>{enFrase(nombre)}</Q></>;
}
