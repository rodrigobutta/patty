// El widget Comida del Día y su hoja: de qué estuvo hecho lo que se comió (estimado de lo anotado), en tarjetitas como las del
// clima y con lo que más se nota primero. No es una app de dieta: sin metas, sin colores de bien o mal y sin consejos; lo único que
// se compara es contra lo habitual de la misma persona. Las cuentas están en la API (componentes/delDia.ts).
import { useEffect, useState, type ReactNode } from 'react';
import { nombreRasgo, normalizar, type Categoria, type ComidaDelDia as Datos, type ComponenteDeLaSemana, type ComponenteDelDia, type Persona, type Registro } from 'shared';
import { api } from '../api';
import { guardado } from '../lib/guardado';
import { idioma, locale, t } from '../lib/idioma';

const V = 'var(--acento)';
const trazo = { fill: 'none', stroke: V, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
    {children}
  </svg>
);

/** Cómo se dice cada componente: su nombre, en una frase ("mucha sal") y al comparar ("más sal"). */
const COMPONENTE: Record<string, { nombre: string; mucho: string; poco: string; lo: string; bebida?: boolean; icono: ReactNode }> = {
  calorias: { nombre: 'Calorías', mucho: 'muchas calorías', poco: 'pocas calorías', lo: 'calorías', icono: <Svg><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-6 2-9.500Z" {...trazo} /></Svg> },
  grasa: { nombre: 'Grasa', mucho: 'mucha grasa', poco: 'poca grasa', lo: 'grasa', icono: <Svg><path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11Z" {...trazo} /></Svg> },
  grasa_saturada: { nombre: 'Grasa saturada', mucho: 'mucha grasa saturada', poco: 'poca grasa saturada', lo: 'grasa saturada', icono: <Svg><path d="M4 16h13l3-5H9l-5 5Z" {...trazo} /><path d="M4 16v3h13l3-3v-5" {...trazo} /></Svg> },
  azucar: { nombre: 'Azúcar', mucho: 'mucha azúcar', poco: 'poca azúcar', lo: 'azúcar', icono: <Svg><path d="m12 3 8 4.500v9L12 21l-8-4.500v-9L12 3Z" {...trazo} /><path d="m4 7.5 8 4.5 8-4.500M12 12v9" {...trazo} /></Svg> },
  harinas: { nombre: 'Harinas', mucho: 'muchas harinas', poco: 'pocas harinas', lo: 'harinas', icono: <Svg><path d="M5 10a7 5 0 0 1 14 0c0 2-1 2-1 3v6H6v-6c0-1-1-1-1-3Z" {...trazo} /></Svg> },
  fibra: { nombre: 'Fibra', mucho: 'mucha fibra', poco: 'poca fibra', lo: 'fibra', icono: <Svg><path d="M5 19c8 0 14-6 14-14C11 5 5 10 5 19Z" {...trazo} /><path d="M5 19 13 11" {...trazo} /></Svg> },
  proteina: { nombre: 'Proteína', mucho: 'mucha proteína', poco: 'poca proteína', lo: 'proteína', icono: <Svg><path d="M12 3c3.5 0 6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 2.5-10 6-10Z" {...trazo} /></Svg> },
  sal: { nombre: 'Sal (sodio)', mucho: 'mucha sal', poco: 'poca sal', lo: 'sal', icono: <Svg><path d="M8 9h8l1.5 12h-11L8 9Z" {...trazo} /><path d="M8.5 9c0-3.5 1.5-6 3.5-6s3.5 2.5 3.5 6" {...trazo} /><path d="M11 6h.01M13 6h.01" {...trazo} /></Svg> },
  alcohol: { nombre: 'Alcohol', mucho: 'mucho alcohol', poco: 'poco alcohol', lo: 'alcohol', bebida: true, icono: <Svg><path d="M7 3h10c0 5-1 9-5 9s-5-4-5-9ZM12 12v8M8 21h8" {...trazo} /></Svg> },
  cafeina: { nombre: 'Cafeína', mucho: 'mucha cafeína', poco: 'poca cafeína', lo: 'cafeína', bebida: true, icono: <Svg><path d="M5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9ZM17 11h1.500a2.5 2.5 0 0 1 0 5H17M9 3v3M13 3v3" {...trazo} /></Svg> },
  lactosa: { nombre: 'Lactosa', mucho: 'mucha lactosa', poco: 'poca lactosa', lo: 'lactosa', icono: <Svg><path d="M8 3h8v3l2 4v11H6V10l2-4V3ZM6 10h12M8 6h8" {...trazo} /></Svg> },
  gluten: { nombre: 'Gluten', mucho: 'mucho gluten', poco: 'poco gluten', lo: 'gluten', icono: <Svg><path d="M12 21V7M12 7c-2-1-2-3 0-4 2 1 2 3 0 4ZM12 12c-1-2-3-3-5-3 0 2 2 4 5 3ZM12 12c1-2 3-3 5-3 0 2-2 4-5 3ZM12 17c-1-2-3-3-5-3 0 2 2 4 5 3ZM12 17c1-2 3-3 5-3 0 2-2 4-5 3Z" {...trazo} /></Svg> },
  fodmap: { nombre: 'FODMAP', mucho: 'muchos FODMAP', poco: 'pocos FODMAP', lo: 'FODMAP', icono: <Svg><path d="M12 3c0 3 1 4 3 6 2.5 2.5 3 8-3 12-6-4-5.5-9.5-3-12 2-2 3-3 3-6Z" {...trazo} /><path d="M12 10v8" {...trazo} /></Svg> },
  histamina: { nombre: 'Histamina', mucho: 'mucha histamina', poco: 'poca histamina', lo: 'histamina', icono: <Svg><path d="M3 14 16 5c3 2 5 5 5 9v5H3v-5Z" {...trazo} /><path d="M3 14h18M9 17h.01M15 11h.01" {...trazo} /></Svg> },
  picante: { nombre: 'Picante', mucho: 'mucho picante', poco: 'poco picante', lo: 'picante', icono: <Svg><path d="M16 7c-1 7-5 12-12 13 3-3 4-6 4-9 1-3 5-5 8-4ZM16 7c0-2 1-3 3-4" {...trazo} /></Svg> },
  ultraprocesado: { nombre: 'Ultraprocesados', mucho: 'muchos ultraprocesados', poco: 'pocos ultraprocesados', lo: 'ultraprocesados', icono: <Svg><path d="M4 8h16v12H4V8ZM7 4h10l3 4H4l3-4ZM8 13h8M8 16h5" {...trazo} /></Svg> },
};

/** La suma de los platos (cada uno de 0 a 3) como una palabra: acá un número sería una precisión de mentira. */
function palabraDe(v: number): string {
  if (v < 0.1) return t('Nada');
  if (v < 1) return t('Un poco');
  if (v < 2) return t('Algo');
  if (v < 4) return t('Bastante');
  return t('Mucho');
}

/** Un número redondo con su unidad: nadie comió 1.837 calorías exactas. */
function cantidad(v: number, unidad: string): string {
  const paso = unidad === 'kcal' ? 10 : unidad === 'mg' ? (v >= 1000 ? 50 : v >= 100 ? 10 : 5) : 1;
  const r = Math.round(v / paso) * paso;
  if (v > 0 && r === 0) return `< ${paso} ${unidad}`;
  return `${r.toLocaleString(locale())} ${unidad}`;
}

const NIVEL: Record<string, string> = { mucho: 'más que lo habitual', poco: 'menos que lo habitual', normal: 'como lo habitual' };

const esAgua = (concepto: string) => normalizar(concepto).startsWith('agua');

/** Cuántas comidas (lo anotado al mismo minuto es una sola, como en la lista del Día) y cuántas bebidas sueltas hubo, sin contar el agua. */
export function comidasAnotadas(registros: Registro[], categorias: Categoria[], fecha: string): { comidas: number; bebidas: number; firma: string } {
  const comida = categorias.find((c) => c.clave === 'comida')?.id;
  const bebida = categorias.find((c) => c.clave === 'bebida')?.id;
  const lista = registros.filter((r) => r.fecha === fecha && (r.categoria_id === comida || r.categoria_id === bebida));
  const conComida = new Set<string>();
  const soloBebida = new Set<string>();
  for (const r of lista) if (r.categoria_id === comida) conComida.add(r.inicio.slice(0, 16));
  for (const r of lista) if (r.categoria_id === bebida && !esAgua(r.concepto) && !conComida.has(r.inicio.slice(0, 16))) soloBebida.add(r.inicio.slice(0, 16));
  // Cambia si se anota, se corrige o se borra algo: hay que volver a pedir la cuenta.
  const firma = lista.map((r) => `${r.id}:${r.concepto}:${r.valor}:${r.unidad}:${r.porcion}:${(r.tipos ?? []).join()}`).join('|');
  return { comidas: conComida.size, bebidas: soloBebida.size, firma };
}

export function lineaComidas(n: { comidas: number; bebidas: number }): string {
  if (n.comidas) return n.comidas === 1 ? t('1 comida') : t('{n} comidas', { n: n.comidas });
  return n.bebidas === 1 ? t('1 bebida') : t('{n} bebidas', { n: n.bebidas });
}

/** Lo que más se nota, en palabras ("mucha sal"). Si no hay nada, nada. */
export function destacadoDe(datos: Datos | null): string | undefined {
  const d = datos?.destacado;
  const c = d && COMPONENTE[d.clave];
  return c ? t(d.nivel === 'mucho' ? c.mucho : c.poco) : undefined;
}

/** Los datos del widget: lo último guardado enseguida, y lo nuevo cuando contesta el servidor. */
export function useComidaDelDia(persona: Persona, fecha: string, activo: boolean, firma: string): Datos | null {
  const ruta = `/api/componentes/dia?persona=${persona.id}&fecha=${fecha}`;
  const [leido, setLeido] = useState<{ ruta: string; datos: Datos } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    api<Datos>('GET', ruta).then((datos) => { if (vigente) setLeido({ ruta, datos }); }).catch(() => {});
    return () => { vigente = false; };
  }, [ruta, activo, firma]);
  if (!activo) return null;
  return leido?.ruta === ruta ? leido.datos : guardado<Datos>(ruta) ?? null;
}

function Tarjeta({ c }: { c: ComponenteDelDia }) {
  const info = COMPONENTE[c.clave];
  if (!info || c.valor === null) return null;
  const seNota = c.nivel === 'mucho' || c.nivel === 'poco';
  return (
    <div className={`clima-tarjeta${seNota ? ' se-nota' : ''}`}>
      {info.icono}
      <span className="titulo">{t(info.nombre)}</span>
      <strong>{c.de === 'ia' ? palabraDe(c.valor) : cantidad(c.valor, c.unidad ?? '')}</strong>
      {c.nivel ? <span className="sub">{t(NIVEL[c.nivel])}</span> : null}
    </div>
  );
}

/** Siete rayitas, de hace una semana a hoy, en el mismo color siempre: subir o bajar no es ni bueno ni malo. */
function Barras({ c }: { c: ComponenteDeLaSemana }) {
  const max = Math.max(...c.valores.map((v) => v ?? 0), 1e-6);
  return (
    <span className="comida-barras" aria-hidden>
      {c.valores.map((v, i) => (
        <i key={i} className={v === null ? 'sin-dato' : ''} style={{ height: v === null ? undefined : `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </span>
  );
}

function frase(c: ComponenteDeLaSemana): string {
  const i = COMPONENTE[c.clave];
  const v = { c: t(i.lo) };
  if (c.cambio === 'mas') return i.bebida ? t('Esta semana tomaste más {c} que la anterior.', v) : t('Esta semana comiste con más {c} que la anterior.', v);
  return i.bebida ? t('Esta semana tomaste menos {c} que la anterior.', v) : t('Esta semana comiste con menos {c} que la anterior.', v);
}

function TuSemana({ datos }: { datos: Datos }) {
  const lista = datos.semana.componentes;
  const relativo = (c: ComponenteDeLaSemana) => Math.abs((c.promedio ?? 0) - (c.promedio_anterior ?? 0)) / Math.max(c.promedio ?? 0, c.promedio_anterior ?? 0, 1e-6);
  // Lo que más cambió primero; las calorías al final, para que no sean lo primero que se lee.
  const cambios = lista
    .filter((c) => (c.cambio === 'mas' || c.cambio === 'menos') && COMPONENTE[c.clave])
    .sort((a, b) => Number(a.clave === 'calorias') - Number(b.clave === 'calorias') || relativo(b) - relativo(a))
    .slice(0, 4);
  const comparable = lista.some((c) => c.cambio !== null);
  return (
    <div className="clima-notas">
      <h4>{t('Tu semana')}</h4>
      {cambios.length ? (
        <ul className="comida-semana">
          {cambios.map((c) => (
            <li key={c.clave}>
              <span>{frase(c)}</span>
              <Barras c={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="suave chico">{comparable ? t('Esta semana comiste parecido a la anterior.') : t('Cuando tengas dos semanas anotadas, te cuento qué cambió.')}</p>
      )}
    </div>
  );
}

/** Lo que va en la hoja, debajo del ícono grande. */
export function ComidaDelDiaHoja({ datos }: { datos: Datos | null }) {
  if (!datos) return <p className="suave chico comida-estimacion">{t('Mirando lo que comiste…')}</p>;
  const { pendientes, sin_dato } = datos.cobertura;
  const conValor = datos.componentes.filter((c) => c.valor !== null);
  const sinHistoria = conValor.length > 0 && conValor.every((c) => c.nivel === null) && !datos.en_curso;
  // En el orden de las tarjetas, pero las calorías no abren la lista si no se notan.
  const seNota = (c: ComponenteDelDia) => c.nivel === 'mucho' || c.nivel === 'poco';
  const aportes = datos.componentes
    .filter((c) => c.alimentos.length && c.valor && COMPONENTE[c.clave])
    .sort((a, b) => Number(a.clave === 'calorias' && !seNota(a)) - Number(b.clave === 'calorias' && !seNota(b)))
    .slice(0, 5);
  const cuando = (d: number) => (d === 0 ? t('el mismo día') : d === 1 ? t('al día siguiente') : t('{n} días después', { n: d }));
  return (
    <div className="clima-del-dia">
      <p className="suave chico comida-estimacion">
        {datos.en_curso ? t('Es una estimación a partir de lo que anotaste hasta ahora.') : t('Es una estimación a partir de lo que anotaste.')}
        {pendientes ? ` ${pendientes === 1 ? t('Todavía estoy calculando 1 comida.') : t('Todavía estoy calculando {n} comidas.', { n: pendientes })}` : ''}
        {sin_dato ? ` ${sin_dato === 1 ? t('No cuenta 1 comida que no sé qué tenía.') : t('No cuentan {n} comidas que no sé qué tenían.', { n: sin_dato })}` : ''}
        {sinHistoria ? ` ${t('Con más días anotados voy a poder decirte qué es lo habitual para vos.')}` : ''}
      </p>
      {conValor.length ? (
        <div className="clima-tarjetas">
          {conValor.map((c) => <Tarjeta key={c.clave} c={c} />)}
        </div>
      ) : null}
      {aportes.length ? (
        <div className="clima-notas">
          <h4>{t('Lo que más aportó')}</h4>
          <ul>
            {aportes.map((c) => (
              <li key={c.clave}>
                <strong>{t(COMPONENTE[c.clave].nombre)}:</strong> {c.alimentos.map((a) => t(a)).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <TuSemana datos={datos} />
      {datos.patrones.length ? (
        <div className="clima-notas">
          <h4>{t('Lo que encontré en lo que comés')}</h4>
          <ul>
            {datos.patrones.map((h) => (
              <li key={h.id}>
                <strong>
                  {[{ nombre: h.causa, tipo: h.causa_tipo, modo: h.causa_modo }, ...(h.causas_extra ?? [])].map((c) => nombreRasgo(c.nombre, c.tipo, c.modo, idioma())).join(' + ')}
                  {' → '}
                  {nombreRasgo(h.efecto, h.efecto_tipo, h.efecto_modo, idioma())}
                </strong>{' '}
                <span className="suave chico">{cuando(h.desfase_dias)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
