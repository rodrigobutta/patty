// Ubicación y lugares (en Más): prender el seguimiento en este teléfono, ver los viajes y lugares de hoy, y nombrar
// lugares (Casa, lo de mamá, Supermercado) para que entren en los patrones.
import { useCallback, useEffect, useState } from 'react';
import { distanciaMetros, lugarDe, type DiaUbicacion, type Lugar, type Persona } from 'shared';
import { api, API_BASE } from '../api';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { ubicacion } from '../lib/clima';
import { esNativa, plataforma } from '../lib/nativo';
import { t } from '../lib/idioma';
import { mandarPunto, ponerLugares, ponerSeguimiento, seguimientoActivado, seguirNativo } from '../lib/ubicacion';
import { Mapa } from '../ui/Mapa';

export function Lugares({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const { avisar } = useEstado();
  const [activo, setActivo] = useState(seguimientoActivado());
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [dia, setDia] = useState<DiaUbicacion | null>(null);
  const [error, setError] = useState('');
  /** El lugar con nombre donde está ahora (si está en uno): ahí no tiene sentido ofrecer "Guardar dónde estoy". */
  const [aca, setAca] = useState<Lugar | null>(null);
  /** El lugar cuyo mapita está abierto (tocando el nombre). */
  const [viendo, setViendo] = useState<number | null>(null);

  const traer = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([
        api<Lugar[]>('GET', `/api/ubicacion/lugares?persona=${persona.id}`),
        api<DiaUbicacion>('GET', `/api/ubicacion/dia?persona=${persona.id}`),
      ]);
      setLugares(l);
      ponerLugares(l);
      setDia(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [persona.id]);
  useEffect(() => void traer(), [traer]);
  useEffect(() => {
    if (!activo || !lugares.length) return setAca(null);
    let vivo = true;
    void ubicacion().then((u) => {
      if (vivo) setAca(u ? (lugarDe({ lat: u.latitude, lon: u.longitude }, lugares) as Lugar | null) ?? null : null);
    });
    return () => {
      vivo = false;
    };
  }, [activo, lugares]);

  // Lugares que se pisan (guardados dos veces en el mismo sitio, con nombres distintos): se ofrece unirlos.
  const [descartados, setDescartados] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lugares-no-unir') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const parDe = (a: Lugar, b: Lugar) => [a.id, b.id].sort((x, y) => x - y).join('-');
  const parecidos: Array<[Lugar, Lugar]> = [];
  for (const [i, a] of lugares.entries()) {
    for (const b of lugares.slice(i + 1)) {
      if (distanciaMetros(a, b) < a.radio_m + b.radio_m && !descartados.includes(parDe(a, b))) parecidos.push([a, b]);
    }
  }
  const noUnir = (a: Lugar, b: Lugar) => {
    const l = [...descartados, parDe(a, b)];
    setDescartados(l);
    try {
      localStorage.setItem('lugares-no-unir', JSON.stringify(l));
    } catch {
      /* sin almacenamiento */
    }
  };
  /** Une `a` en `b`: lo de `a` pasa a `b` y `a` se borra. */
  const unir = (a: Lugar, b: Lugar) =>
    void hacer(() => api('POST', `/api/ubicacion/lugares/${a.id}/unir`, { en: b.id }), t('Listo: «{a}» ahora es parte de «{b}»', { a: a.nombre, b: b.nombre }));
  /** El lugar con el selector de "Unir con…" abierto. */
  const [uniendo, setUniendo] = useState<number | null>(null);

  const hacer = async (f: () => Promise<unknown>, aviso: string) => {
    setError('');
    try {
      await f();
      avisar(aviso);
      await traer();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const prender = async (si: boolean) => {
    ponerSeguimiento(si);
    setActivo(si);
    if (si && esNativa()) await seguirNativo(persona.id, setError); // pide los permisos y arranca en segundo plano
    else if (si) {
      const u = await ubicacion(); // que el teléfono pida el permiso ahora
      if (!u) setError(t('El teléfono no dio la ubicación: revisá el permiso del navegador para Patty.'));
      else if (await mandarPunto(persona.id, u)) void traer();
    }
  };

  const guardarAca = async () => {
    const u = await ubicacion();
    if (!u) return setError(t('No pude saber dónde estás: revisá el permiso de ubicación.'));
    const nombre = prompt(t('¿Cómo se llama este lugar? (Casa, Lo de mamá, Supermercado…)'))?.trim();
    if (!nombre) return;
    await hacer(() => api('POST', '/api/ubicacion/lugares', { persona_id: persona.id, nombre, lat: u.latitude, lon: u.longitude }), t('Guardado «{nombre}»', { nombre }));
    if (activo) void mandarPunto(persona.id, u);
  };

  const renombrar = (l: Lugar) => {
    const nombre = prompt(t('Nuevo nombre'), l.nombre)?.trim();
    if (nombre && nombre !== l.nombre) void hacer(() => api('PUT', `/api/ubicacion/lugares/${l.id}`, { nombre }), t('Cambiado'));
  };
  const moverAca = async (l: Lugar) => {
    const u = await ubicacion();
    if (!u) return setError(t('No pude saber dónde estás.'));
    if (confirm(t('¿«{nombre}» es donde estás ahora?', { nombre: l.nombre }))) void hacer(() => api('PUT', `/api/ubicacion/lugares/${l.id}`, { lat: u.latitude, lon: u.longitude }), t('Movido'));
  };
  const borrar = (l: Lugar) => {
    if (confirm(t('¿Borrar «{nombre}»? Lo que ya se calculó de hace más de 90 días queda.', { nombre: l.nombre }))) void hacer(() => api('DELETE', `/api/ubicacion/lugares/${l.id}`), t('Borrado'));
  };
  const borrarHistorial = () => {
    if (confirm(t('¿Borrar todo el historial de ubicación (puntos, viajes y estadías)? Los lugares quedan.'))) {
      void hacer(() => api('DELETE', `/api/ubicacion?persona=${persona.id}`), t('Historial borrado'));
    }
  };

  return (
    <div className="tarjeta">
      <h3>{t('📍 Ubicación y lugares')}</h3>
      <p className="chico ejemplo-permiso">{t('💡 Patty puede descubrir cosas como «los días que vas a la oficina dormís peor», y cruzar el calor, la humedad o la presión con tus dolores.')}</p>
      <label className="opcion">
        <input type="checkbox" checked={activo} onChange={(e) => void prender(e.target.checked)} />
        <span>{t('Contar viajes y lugares con la ubicación de este teléfono.')}</span>
      </label>
      {esNativa() ? (
        <p className="suave chico">
          {t('Guarda un punto al moverte más de 1 km o al entrar o salir de un lugar con nombre, también con Patty cerrada')}
          {plataforma() === 'android' ? t(' (Android muestra una notificación fija mientras tanto)') : ''}.{' '}
          {t('Para que no se corte, dale el permiso «Permitir todo el tiempo». Los puntos se borran a los 90 días.')}
        </p>
      ) : (
        <p className="suave chico">
          {t('Guarda un punto al moverte más de 1 km o al entrar o salir de un lugar con nombre. En el navegador solo funciona con Patty abierta. Los puntos se borran a los 90 días.')}
        </p>
      )}

      {dia && dia.puntos > 0 ? (
        <div className="nota-ia">
          <p>
            {t('Hoy')}: <strong>{dia.viajes}</strong> {dia.viajes === 1 ? t('viaje') : t('viajes')}, {dia.km} km.
          </p>
          {dia.estadias.length ? (
            <p className="chico">
              {dia.estadias.map((e) => `${e.lugar} ${horaEn(e.llegada, persona.zona_horaria)}${e.minutos ? ` (${e.minutos} min)` : ''}`).join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {puedeEscribir
        ? parecidos.map(([a, b]) => (
            <div key={parDe(a, b)} className="tarjeta nota-ia lugares-parecidos">
              <p>{t('📍 «{a}» y «{b}» parecen el mismo lugar. ¿Los unimos?', { a: a.nombre, b: b.nombre })}</p>
              <div className="fila">
                <button className="btn chico primario" onClick={() => unir(a, b)}>{t('Dejar «{n}»', { n: b.nombre })}</button>
                <button className="btn chico primario" onClick={() => unir(b, a)}>{t('Dejar «{n}»', { n: a.nombre })}</button>
                <button className="btn chico" onClick={() => noUnir(a, b)}>{t('Son distintos')}</button>
              </div>
            </div>
          ))
        : null}
      <ul className="lista">
        {lugares.map((l) => (
          <li key={l.id} className={viendo === l.id ? 'con-mapa' : ''}>
            <span className="icono">📍</span>
            <button className="que boton-lugar" onClick={() => setViendo(viendo === l.id ? null : l.id)} aria-expanded={viendo === l.id}>
              {l.nombre}
              <span className="suave chico"> · {l.radio_m} m · {viendo === l.id ? t('ocultar') : t('🗺️ ver')}</span>
            </button>
            {puedeEscribir ? (
              <>
                <button className="btn-icono chico" onClick={() => renombrar(l)} aria-label={t('Renombrar {nombre}', { nombre: l.nombre })}>✏️</button>
                <button className="btn-icono chico" onClick={() => void moverAca(l)} aria-label={t('Mover {nombre} a donde estoy', { nombre: l.nombre })}>🎯</button>
                {lugares.length > 1 ? (
                  <button className="btn-icono chico" onClick={() => setUniendo(uniendo === l.id ? null : l.id)} aria-label={t('Unir {nombre} con otro lugar', { nombre: l.nombre })}>🔗</button>
                ) : null}
                <button className="btn-icono chico" onClick={() => borrar(l)} aria-label={t('Borrar {nombre}', { nombre: l.nombre })}>🗑</button>
              </>
            ) : null}
            {uniendo === l.id ? (
              <span className="fila unir-lugar">
                <span className="suave chico">{t('Es el mismo lugar que:')}</span>
                <select defaultValue="" onChange={(e) => { const b = lugares.find((x) => x.id === Number(e.target.value)); setUniendo(null); if (b) unir(l, b); }}>
                  <option value="" disabled>{t('Elegí…')}</option>
                  {lugares.filter((x) => x.id !== l.id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </span>
            ) : null}
            {viendo === l.id ? <Mapa puntos={[{ lat: l.lat, lon: l.lon, radio: l.radio_m, etiqueta: l.nombre }]} alto={170} className="mapa-lugar" /> : null}
          </li>
        ))}
      </ul>
      {puedeEscribir ? (
        <div className="columna">
          {aca ? (
            <p className="suave chico centro">{t('📍 Estás en {lugar}', { lugar: aca.nombre })}</p>
          ) : (
            <button className="btn" onClick={() => void guardarAca()}>{t('📍 Guardar dónde estoy')}</button>
          )}
          <button className="btn suave-btn" onClick={borrarHistorial}>{t('Borrar historial de ubicación')}</button>
        </div>
      ) : null}
      {esNativa() ? null : <details className="ayuda"><summary>{t('¿Y con la app cerrada, sin instalar la app?')}</summary><p className="suave chico">
        {t('En el iPhone, Atajos → Automatización → «Al llegar» o «Al salir» de un lugar → «Obtener ubicación actual» y «Obtener contenido de URL» con POST a')}{' '}
        <code>{(API_BASE || location.origin) + '/api/ingesta/ubicacion'}</code>,
        JSON <code>{'{"lat": …, "lon": …}'}</code> {t('y un token de «Avanzado», abajo de todo en Más.')}
      </p></details>}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
