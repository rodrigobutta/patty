// Ubicación y lugares (en Más): prender el seguimiento en este teléfono, ver los viajes y lugares de hoy, y nombrar
// lugares (Casa, lo de mamá, Supermercado) para que entren en los patrones.
import { useCallback, useEffect, useState } from 'react';
import type { DiaUbicacion, Lugar, Persona } from 'shared';
import { api, API_BASE } from '../api';
import { useEstado } from '../estado';
import { horaEn } from '../lib/fechas';
import { ubicacion } from '../lib/clima';
import { esNativa, plataforma } from '../lib/nativo';
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
      if (!u) setError('El teléfono no dio la ubicación: revisá el permiso del navegador para Patty.');
      else if (await mandarPunto(persona.id, u)) void traer();
    }
  };

  const guardarAca = async () => {
    const u = await ubicacion();
    if (!u) return setError('No pude saber dónde estás: revisá el permiso de ubicación.');
    const nombre = prompt('¿Cómo se llama este lugar? (Casa, Lo de mamá, Supermercado…)')?.trim();
    if (!nombre) return;
    await hacer(() => api('POST', '/api/ubicacion/lugares', { persona_id: persona.id, nombre, lat: u.latitude, lon: u.longitude }), `Guardado «${nombre}»`);
    if (activo) void mandarPunto(persona.id, u);
  };

  const renombrar = (l: Lugar) => {
    const nombre = prompt('Nuevo nombre', l.nombre)?.trim();
    if (nombre && nombre !== l.nombre) void hacer(() => api('PUT', `/api/ubicacion/lugares/${l.id}`, { nombre }), 'Cambiado');
  };
  const moverAca = async (l: Lugar) => {
    const u = await ubicacion();
    if (!u) return setError('No pude saber dónde estás.');
    if (confirm(`¿«${l.nombre}» es donde estás ahora?`)) void hacer(() => api('PUT', `/api/ubicacion/lugares/${l.id}`, { lat: u.latitude, lon: u.longitude }), 'Movido');
  };
  const borrar = (l: Lugar) => {
    if (confirm(`¿Borrar «${l.nombre}»? Lo que ya se calculó de hace más de 90 días queda.`)) void hacer(() => api('DELETE', `/api/ubicacion/lugares/${l.id}`), 'Borrado');
  };
  const borrarHistorial = () => {
    if (confirm('¿Borrar todo el historial de ubicación (puntos, viajes y estadías)? Los lugares quedan.')) {
      void hacer(() => api('DELETE', `/api/ubicacion?persona=${persona.id}`), 'Historial borrado');
    }
  };

  return (
    <div className="tarjeta">
      <h3>Ubicación y lugares</h3>
      <label className="opcion">
        <input type="checkbox" checked={activo} onChange={(e) => void prender(e.target.checked)} />
        <span>Contar viajes y lugares con la ubicación de este teléfono.</span>
      </label>
      {esNativa() ? (
        <p className="suave chico">
          Se guarda un punto cuando te movés más de 1 km o entrás o salís de un lugar con nombre, también con Patty
          cerrada{plataforma() === 'android' ? ' (Android muestra una notificación fija mientras tanto)' : ''}. Para que no
          se corte, dale a Patty el permiso de ubicación «Permitir todo el tiempo». Los puntos se borran solos a los 90
          días; quedan los viajes y las estadías.
        </p>
      ) : (
        <p className="suave chico">
          Se guarda un punto cuando te movés más de 1 km o entrás o salís de un lugar con nombre. Solo funciona con Patty
          abierta: el navegador no deja seguir la ubicación con la app cerrada (para eso, la app de Android o iPhone, o el
          atajo de abajo). Los puntos se borran solos a los 90 días; quedan los viajes y las estadías.
        </p>
      )}

      {dia && dia.puntos > 0 ? (
        <div className="nota-ia">
          <p>
            Hoy: <strong>{dia.viajes}</strong> {dia.viajes === 1 ? 'viaje' : 'viajes'}, {dia.km} km.
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
                <button className="btn-icono chico" onClick={() => renombrar(l)} aria-label={`Renombrar ${l.nombre}`}>✏️</button>
                <button className="btn-icono chico" onClick={() => void moverAca(l)} aria-label={`Mover ${l.nombre} a donde estoy`}>🎯</button>
                <button className="btn-icono chico" onClick={() => borrar(l)} aria-label={`Borrar ${l.nombre}`}>🗑</button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {puedeEscribir ? (
        <div className="fila">
          <button className="btn" onClick={() => void guardarAca()}>📍 Guardar dónde estoy</button>
          <button className="btn" onClick={borrarHistorial}>Borrar historial</button>
        </div>
      ) : null}
      {esNativa() ? null : <p className="suave chico">
        Con la app cerrada: en el iPhone, Atajos → Automatización → «Al llegar» o «Al salir» de un lugar → «Obtener
        ubicación actual» y «Obtener contenido de URL» con POST a <code>{(API_BASE || location.origin) + '/api/ingesta/ubicacion'}</code>,
        JSON <code>{'{"lat": …, "lon": …}'}</code> y el token de una fuente «Teléfono» de arriba.
      </p>}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
