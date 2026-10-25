// En el Día: el ciclo menstrual. Plegado muestra el día del ciclo, la fase y cuánto falta para la próxima; abierto,
// "Me vino hoy", cuánto (mientras dura), síntomas típicos con un toque, y lo estimado (próxima, días fértiles,
// ovulación) con lo que se suele anotar en esta fase. Solo para el día de hoy y si la persona no dijo ser varón.
import { useCallback, useEffect, useState } from 'react';
import { FASES_CICLO, FLUJO, MENSTRUACION, SINTOMAS_CICLO, type FaseCiclo, type Persona, type Registro, type ResumenCiclo } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { locale, t } from '../lib/idioma';

const CLAVE_ABIERTO = 'ciclo-abierto';

type Ciclo = ResumenCiclo & { por_fase: Record<FaseCiclo | 'premenstrual', Array<{ concepto: string; dias: number }>> };

const corta = (fecha: string) =>
  new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(fecha + 'T12:00:00Z'));
const rango = (a: string, b: string) => {
  const f = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'short' });
  return `${f.format(new Date(a + 'T12:00:00Z'))} – ${f.format(new Date(b + 'T12:00:00Z'))}`;
};

export function CicloDelDia({ persona, registros, vuelta, alCambiar }: {
  persona: Persona;
  /** Lo anotado hoy (para marcar lo que ya se tocó). */
  registros: Registro[];
  vuelta: number;
  alCambiar(): void;
}) {
  const { categorias, festejar, avisar, usuario } = useEstado();
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_ABIERTO) === 'si';
    } catch {
      return false;
    }
  });
  const puede = usuario?.rol !== 'lector';
  const catCiclo = categorias.find((c) => c.clave === 'ciclo');
  const catSintoma = categorias.find((c) => c.clave === 'sintoma');

  const traer = useCallback(() => {
    api<Ciclo>('GET', `/api/ciclo?persona=${persona.id}`).then(setCiclo).catch(() => {});
  }, [persona.id]);
  useEffect(() => traer(), [traer, vuelta]);

  if (!ciclo || !catCiclo || (persona.sexo === 'masculino' && !ciclo.periodos.length)) return null;

  const hoyMenstruacion = registros.find((r) => r.categoria_id === catCiclo.id && r.concepto === MENSTRUACION);
  const sintomasHoy = new Set(registros.filter((r) => r.categoria_id === catSintoma?.id).map((r) => r.concepto));
  const enPeriodo = ciclo.en_periodo || Boolean(hoyMenstruacion);

  const hacer = async (f: () => Promise<unknown>, mensaje: string) => {
    setOcupado(true);
    try {
      await f();
      festejar(mensaje);
      alCambiar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const flujo = (intensidad: number) =>
    hacer(
      () =>
        hoyMenstruacion
          ? api('PUT', `/api/registros/${hoyMenstruacion.id}`, { persona_id: persona.id, concepto_id: hoyMenstruacion.concepto_id, inicio: hoyMenstruacion.inicio, intensidad, nota: hoyMenstruacion.nota })
          : api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: MENSTRUACION, categoria_id: catCiclo.id, intensidad, inicio: new Date().toISOString() }),
      t('¡Anotado! 🩸'),
    );
  const sintoma = (nombre: string) =>
    catSintoma &&
    hacer(
      () => api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: nombre, categoria_id: catSintoma.id, intensidad: 5, inicio: new Date().toISOString() }),
      t('¡Anotado! {que}', { que: t(nombre) }),
    );

  const cambiarAbierto = () => {
    setAbierto(!abierto);
    try {
      localStorage.setItem(CLAVE_ABIERTO, abierto ? 'no' : 'si');
    } catch {
      /* sin almacenamiento */
    }
  };

  const fase = enPeriodo ? 'menstrual' : ciclo.fase;
  const resumen = !ciclo.periodos.length
    ? t('anotá cuando te venga')
    : [
        ciclo.dia && ciclo.dia <= 60 ? t('día {n}', { n: ciclo.dia }) : null,
        fase ? t('fase {fase}', { fase: t(FASES_CICLO[fase].nombre) }) : null,
        enPeriodo || ciclo.faltan === null ? null : ciclo.faltan > 0 ? t('próxima en ~{n} días', { n: ciclo.faltan }) : ciclo.faltan === 0 ? t('podría venir hoy') : t('{n} días de atraso', { n: -ciclo.faltan }),
      ].filter(Boolean).join(' · ');
  const suele = fase ? [...(ciclo.dia && ciclo.faltan !== null && ciclo.faltan <= 5 && ciclo.faltan >= 0 ? ciclo.por_fase.premenstrual : []), ...ciclo.por_fase[fase]] : [];
  const sueleNombres = [...new Set(suele.map((x) => x.concepto))].slice(0, 4);

  return (
    <div className={`tarjeta remedios-dia ciclo-dia${abierto ? ' abierto' : ''}`}>
      <button className="cabeza-plegable" onClick={cambiarAbierto} aria-expanded={abierto}>
        <span className="titulo-plegable">{t('🩸 Ciclo')}</span>
        <span className="suave chico resumen-plegable">{resumen}</span>
        <span className="suave" aria-hidden>{abierto ? '▴' : '▾'}</span>
      </button>
      {abierto ? (
        <>
          {puede ? (
            enPeriodo ? (
              <>
                <p className="chico pregunta-ciclo">{t('¿Cuánto hoy?')}</p>
                <div className="chips envolver">
                  {FLUJO.map((f) => (
                    <button key={f.nombre} className={`chip${hoyMenstruacion?.intensidad === f.intensidad ? ' activa' : ''}`} disabled={ocupado} onClick={() => void flujo(f.intensidad)}>
                      {t(f.nombre)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button className="btn primario ancho" disabled={ocupado} onClick={() => void flujo(6)}>{t('🩸 Me vino hoy')}</button>
            )
          ) : null}
          {puede && catSintoma ? (
            <>
              <p className="chico pregunta-ciclo">{t('¿Algo más?')}</p>
              <div className="chips envolver">
                {SINTOMAS_CICLO.map((s) => (
                  <button key={s} className={`chip${sintomasHoy.has(s) ? ' activa' : ''}`} disabled={ocupado || sintomasHoy.has(s)} onClick={() => void sintoma(s)}>
                    {sintomasHoy.has(s) ? '✓ ' : ''}{t(s)}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {ciclo.periodos.length ? (
            <ul className="datos-ciclo">
              {ciclo.proxima && !enPeriodo ? <li>🔮 {t('Próxima: alrededor del {fecha}', { fecha: corta(ciclo.proxima) })}</li> : null}
              {ciclo.fertil_desde && ciclo.fertil_hasta && ciclo.fertil_hasta >= hoyDelCiclo(ciclo) ? (
                <li>🌱 {t('Días fértiles: {rango}', { rango: rango(ciclo.fertil_desde, ciclo.fertil_hasta) })} · 🥚 {t('ovulación ~{fecha}', { fecha: corta(ciclo.ovulacion!) })}</li>
              ) : null}
              <li>
                🔁 {ciclo.ciclos ? t('Tus ciclos duran ~{n} días', { n: ciclo.duracion_ciclo }) : t('Con un ciclo más anotado calculo cuánto duran los tuyos (por ahora, 28 días).')}
                {ciclo.regular === true ? ` · ${t('regulares')}` : ciclo.regular === false ? ` · ${t('irregulares')}` : ''}
                {ciclo.ciclos ? ` · ${t('la menstruación, ~{n} días', { n: ciclo.duracion_periodo })}` : ''}
              </li>
              {sueleNombres.length ? <li>📝 {t('En esta parte del ciclo solés anotar: {lista}', { lista: sueleNombres.map((x) => t(x)).join(', ') })}</li> : null}
            </ul>
          ) : (
            <p className="suave chico">{t('Con cada menstruación que anotes calculo en qué día y fase del ciclo estás, cuándo viene la próxima y los días fértiles, y busco qué cambia en cada fase.')}</p>
          )}
          <p className="suave chico">{t('Son estimaciones según lo anotado: no sirven como método anticonceptivo.')}</p>
        </>
      ) : null}
    </div>
  );
}

/** El día de hoy según el ciclo (para no mostrar días fértiles que ya pasaron). */
function hoyDelCiclo(c: ResumenCiclo): string {
  const ultimo = c.periodos.at(-1);
  if (!ultimo || c.dia === null) return '';
  const d = new Date(ultimo.inicio + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + c.dia - 1);
  return d.toISOString().slice(0, 10);
}
