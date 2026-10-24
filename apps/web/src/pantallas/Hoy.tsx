// El día de la persona: lo anotado, en orden, y el botón para anotar más.
import { useCallback, useEffect, useState } from 'react';
import type { Persona, Registro } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { hoyEn, horaEn, nombreDia, sumarDias } from '../lib/fechas';
import { Cargar } from './Cargar';

function detalle(r: Registro, tipo: string | undefined): string {
  if (r.intensidad !== null) return `${r.intensidad}/10`;
  if (r.valor === null || tipo === 'hora') return '';
  if (tipo === 'duracion') return `${r.valor} min`;
  return `${Number(r.valor.toFixed(2))}${r.unidad ? ' ' + r.unidad : ''}`;
}

export function Hoy({ persona }: { persona: Persona }) {
  const { categorias, avisar } = useEstado();
  const [fecha, setFecha] = useState(() => hoyEn(persona.zona_horaria));
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const hoy = hoyEn(persona.zona_horaria);

  const traer = useCallback(async () => {
    try {
      setRegistros(await api<Registro[]>('GET', `/api/registros?persona=${persona.id}&desde=${fecha}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [persona.id, fecha]);
  useEffect(() => {
    setRegistros(null);
    void traer();
  }, [traer]);

  const borrar = async (r: Registro) => {
    if (!confirm(`¿Borrar «${r.concepto}» de las ${horaEn(r.inicio, persona.zona_horaria)}?`)) return;
    await api('DELETE', `/api/registros/${r.id}`);
    avisar('Borrado');
    void traer();
  };

  const tipoDe = (r: Registro) => categorias.find((c) => c.id === r.categoria_id);

  return (
    <section className="dia">
      <div className="navdia">
        <button className="btn-icono" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior">‹</button>
        <h2>{nombreDia(fecha, persona.zona_horaria)}</h2>
        <button className="btn-icono" onClick={() => setFecha(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente">›</button>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {registros === null ? (
        <p className="suave centro">…</p>
      ) : registros.length === 0 ? (
        <div className="vacio">
          <p>Nada anotado {fecha === hoy ? 'todavía hoy' : 'este día'}.</p>
          <p className="suave">Tocá ＋ para anotar a qué hora te levantaste, qué comiste, cómo te sentiste…</p>
        </div>
      ) : (
        <ul className="lista linea">
          {registros.map((r) => {
            const cat = tipoDe(r);
            return (
              <li key={r.id} onContextMenu={(e) => { e.preventDefault(); void borrar(r); }}>
                <span className="hora">{horaEn(r.inicio, persona.zona_horaria)}</span>
                <span className="icono">{cat?.icono}</span>
                <span className="que">
                  {r.concepto}
                  {detalle(r, cat?.tipo_valor) ? <span className="valor-chip">{detalle(r, cat?.tipo_valor)}</span> : null}
                  {r.nota ? <span className="suave chico"> — {r.nota}</span> : null}
                </span>
                <button className="btn-icono chico" onClick={() => borrar(r)} aria-label={`Borrar ${r.concepto}`}>🗑</button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="fab" onClick={() => setCargando(true)} aria-label="Anotar">＋</button>
      {cargando ? (
        <>
          <div className="velo" onClick={() => setCargando(false)} />
          <Cargar persona={persona} fecha={fecha} alCerrar={() => setCargando(false)} alGuardar={() => { setCargando(false); void traer(); }} />
        </>
      ) : null}
    </section>
  );
}
