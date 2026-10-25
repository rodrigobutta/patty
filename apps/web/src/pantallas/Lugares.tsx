// Ubicación y lugares (en Más): prender el seguimiento en este teléfono, ver los viajes y lugares de hoy, y nombrar
// lugares (Casa, lo de mamá, Supermercado) para que entren en los patrones.
import { useCallback, useEffect, useState } from 'react';
import type { DiaUbicacion, Lugar, Persona } from 'shared';
import { api, API_BASE } from '../api';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { ubicacion } from '../lib/clima';
import { esNativa, plataforma } from '../lib/nativo';
import { t } from '../lib/idioma';
import { mandarPunto, ponerLugares, ponerSeguimiento, seguimientoActivado, seguirNativo } from '../lib/ubicacion';

export function Lugares({ persona, puedeEscribir }: { persona: Persona; puedeEscribir: boolean }) {
  const { avisar } = useEstado();
  const [activo, setActivo] = useState(seguimientoActivado());
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [dia, setDia] = useState<DiaUbicacion | null>(null);
  const [error, setError] = useState('');

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
      <label className="opcion">
        <input type="checkbox" checked={activo} onChange={(e) => void prender(e.target.checked)} />
        <span>{t('Contar viajes y lugares con la ubicación de este teléfono.')}</span>
      </label>
      {esNativa() ? (
        <p className="suave chico">
          {t('Se guarda un punto cuando te movés más de 1 km o entrás o salís de un lugar con nombre, también con Patty cerrada')}
          {plataforma() === 'android' ? t(' (Android muestra una notificación fija mientras tanto)') : ''}.{' '}
          {t('Para que no se corte, dale a Patty el permiso de ubicación «Permitir todo el tiempo». Los puntos se borran solos a los 90 días; quedan los viajes y las estadías.')}
        </p>
      ) : (
        <p className="suave chico">
          {t('Se guarda un punto cuando te movés más de 1 km o entrás o salís de un lugar con nombre. Solo funciona con Patty abierta: el navegador no deja seguir la ubicación con la app cerrada (para eso, la app de Android o iPhone, o el atajo de abajo). Los puntos se borran solos a los 90 días; quedan los viajes y las estadías.')}
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

      <ul className="lista">
        {lugares.map((l) => (
          <li key={l.id}>
            <span className="icono">📍</span>
            <span className="que">
              {l.nombre}
              <span className="suave chico"> · {l.radio_m} m</span>
            </span>
            {puedeEscribir ? (
              <>
                <button className="btn-icono chico" onClick={() => renombrar(l)} aria-label={t('Renombrar {nombre}', { nombre: l.nombre })}>✏️</button>
                <button className="btn-icono chico" onClick={() => void moverAca(l)} aria-label={t('Mover {nombre} a donde estoy', { nombre: l.nombre })}>🎯</button>
                <button className="btn-icono chico" onClick={() => borrar(l)} aria-label={t('Borrar {nombre}', { nombre: l.nombre })}>🗑</button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {puedeEscribir ? (
        <div className="columna">
          <button className="btn" onClick={() => void guardarAca()}>{t('📍 Guardar dónde estoy')}</button>
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
