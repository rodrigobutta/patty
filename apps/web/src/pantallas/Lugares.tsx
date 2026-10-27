// Ubicación y lugares (en Más): prender el seguimiento en este teléfono, ver los viajes y lugares de hoy, y nombrar
// lugares (Casa, lo de mamá, Supermercado) para que entren en los patrones.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { distanciaMetros, lugarDe, type DiaUbicacion, type Lugar, type Persona } from 'shared';
import { api, API_BASE } from '../api';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { ubicacion } from '../lib/clima';
import { esNativa, plataforma } from '../lib/nativo';
import { t } from '../lib/idioma';
import { mandarPunto, ponerLugares, ponerSeguimiento, seguimientoActivado, seguirNativo } from '../lib/ubicacion';
import { Mapa } from '../ui/Mapa';
import { IconoLugar } from '../ui/IconosWidget';

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
  /** Las hojas: las opciones de un lugar, y elegir con cuál unirlo. */
  const [acciones, setAcciones] = useState<Lugar | null>(null);
  const [uniendo, setUniendo] = useState<Lugar | null>(null);

  // Mandar ahora dónde está (y traer de nuevo el día): por si el seguimiento se cortó un rato.
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizarAca = async () => {
    setSincronizando(true);
    setError('');
    try {
      const u = await ubicacion();
      if (!u) return setError(t('No pude saber dónde estás.'));
      const nuevo = await mandarPunto(persona.id, u);
      await traer();
      avisar(nuevo ? t('Listo: ubicación al día') : t('Ya estaba al día'));
    } finally {
      setSincronizando(false);
    }
  };

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
        {/* Donde está ahora va primero y más grande. */}
        {[...lugares].sort((a, b) => Number(b.id === aca?.id) - Number(a.id === aca?.id)).map((l) => (
          <li key={l.id} className={`fila-lugar${viendo === l.id ? ' con-mapa' : ''}${l.id === aca?.id ? ' aca' : ''}`}>
            <span className="marcador-lugar" aria-hidden="true"><IconoLugar /></span>
            <button className="que boton-lugar" onClick={() => setViendo(viendo === l.id ? null : l.id)} aria-expanded={viendo === l.id}>
              {l.id === aca?.id ? <span className="etiqueta-aca">{t('Estás acá')}</span> : null}
              <span className="nombre-lugar">{l.nombre}</span>
              <span className="suave chico">{t('radio {n} m', { n: l.radio_m })} · {viendo === l.id ? t('ocultar mapa') : t('🗺️ ver mapa')}</span>
            </button>
            {puedeEscribir ? (
              <button className="btn-icono" onClick={() => setAcciones(l)} aria-label={t('Opciones de {nombre}', { nombre: l.nombre })}>⋯</button>
            ) : null}
            {viendo === l.id ? <Mapa puntos={[{ lat: l.lat, lon: l.lon, radio: l.radio_m, etiqueta: l.nombre }]} alto={170} className="mapa-lugar" /> : null}
          </li>
        ))}
      </ul>
      {puedeEscribir ? (
        <div className="columna">
          {aca ? null : <button className="btn" onClick={() => void guardarAca()}>{t('📍 Guardar dónde estoy')}</button>}
          {activo ? (
            <button className="btn primario" disabled={sincronizando} onClick={() => void sincronizarAca()}>{sincronizando ? t('Sincronizando…') : t('🔄 Sincronizar ubicación')}</button>
          ) : null}
          <button className="btn suave-btn" onClick={borrarHistorial}>{t('Borrar historial de ubicación')}</button>
        </div>
      ) : null}
      {esNativa() ? null : <details className="ayuda"><summary>{t('¿Y con la app cerrada, sin instalar la app?')}</summary><p className="suave chico">
        {t('En el iPhone, Atajos → Automatización → «Al llegar» o «Al salir» de un lugar → «Obtener ubicación actual» y «Obtener contenido de URL» con POST a')}{' '}
        <code>{(API_BASE || location.origin) + '/api/ingesta/ubicacion'}</code>,
        JSON <code>{'{"lat": …, "lon": …}'}</code> {t('y un token de «Avanzado», abajo de todo en Más.')}
      </p></details>}
      {error ? <p className="neg">{error}</p> : null}
      {acciones
        ? createPortal(
            <>
              <div className="velo" onClick={() => setAcciones(null)} />
              <div className="hoja hoja-acciones" role="dialog" aria-label={acciones.nombre}>
                <div className="hoja-cabeza">
                  <h3>📍 {acciones.nombre}</h3>
                  <button className="btn-icono" onClick={() => setAcciones(null)} aria-label={t('Cerrar')}>✕</button>
                </div>
                <button className="btn ancho" onClick={() => { const l = acciones; setAcciones(null); renombrar(l); }}>✏️ {t('Cambiar el nombre')}</button>
                <button className="btn ancho" onClick={() => { const l = acciones; setAcciones(null); void moverAca(l); }}>🎯 {t('Es donde estoy ahora')}</button>
                {lugares.length > 1 ? (
                  <button className="btn ancho" onClick={() => { setUniendo(acciones); setAcciones(null); }}>🔗 {t('Es el mismo que otro lugar')}</button>
                ) : null}
                <button className="btn ancho peligro" onClick={() => { const l = acciones; setAcciones(null); borrar(l); }}>🗑 {t('Borrar')}</button>
              </div>
            </>,
            document.body,
          )
        : null}
      {uniendo
        ? createPortal(
            <>
              <div className="velo" onClick={() => setUniendo(null)} />
              <div className="hoja hoja-unir" role="dialog" aria-label={t('Unir {nombre}', { nombre: uniendo.nombre })}>
                <div className="hoja-cabeza">
                  <h3>🔗 {t('¿Con cuál es el mismo lugar?')}</h3>
                  <button className="btn-icono" onClick={() => setUniendo(null)} aria-label={t('Cerrar')}>✕</button>
                </div>
                <p className="suave chico">{t('Todo lo de «{nombre}» (estadías y lo anotado ahí) pasa al que elijas, y «{nombre}» se borra.', { nombre: uniendo.nombre })}</p>
                <ul className="lista opciones-unir">
                  {lugares
                    .filter((x) => x.id !== uniendo.id)
                    .map((x) => ({ x, d: distanciaMetros(uniendo, x) }))
                    .sort((a, b) => a.d - b.d)
                    .map(({ x, d }) => (
                      <li key={x.id}>
                        <button className="opcion-unir" onClick={() => { const a = uniendo; setUniendo(null); unir(a, x); }}>
                          <span>📍 <strong>{x.nombre}</strong></span>
                          <span className="suave chico">{d < 1000 ? t('a {n} m', { n: Math.round(d) }) : t('a {n} km', { n: (d / 1000).toFixed(1) })}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
