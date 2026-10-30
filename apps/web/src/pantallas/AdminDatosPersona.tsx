// Admin → Datos → Persona 360: qué llegó de cada fuente día por día (para ver los huecos de sincronización) y todo lo
// que hay de un día, crudo, con cada fila abrible en el editor.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { locale, t } from '../lib/idioma';
import { Grilla, hace, useEditor, usePersonas, type Fila, type PedidoTabla } from './AdminDatos';

interface Cobertura { hoy: string; dias: Array<Record<string, number | string> & { fecha: string }> }
interface Dia {
  persona: { id: number; nombre: string; zona_horaria: string };
  fecha: string;
  registros: Fila[];
  mediciones: Fila[];
  sueno: Fila[];
  resumen_noche: Fila | null;
  escuchas: Fila[];
  puntos: Fila[];
  tomas: Fila[];
  comentarios: Fila[];
  fuera: Fila[];
  paseos: Fila[];
  contextos: Fila[];
  avisos: Fila[];
}

/** Las filas del mapa de cobertura: qué se cuenta y cómo se llama. */
const FUENTES: Array<[string, string]> = [
  ['manual', '✍️ Anotado a mano'],
  ['ia', '🦉 Contado a Patty'],
  ['telefono', '📱 Teléfono'],
  ['reloj', '⌚ Reloj / salud'],
  ['clima', '🌤️ Clima'],
  ['lugares', '📍 Lugares'],
  ['puntos', '🛰️ Puntos GPS'],
  ['sueno', '😴 Etapas de sueño'],
  ['resumen_noche', '🌙 Resumen de la noche'],
  ['escuchas', '🎧 Escuchas'],
  ['comentarios', '💬 Comentarios de Patty'],
];

const sumarDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaCorto = (fecha: string) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));

export function AdminDatosPersona({ abrirTabla }: { abrirTabla(p: PedidoTabla): void }) {
  const gente = usePersonas();
  const [persona, setPersona] = useState<number | null>(null);
  const [dias, setDias] = useState(60);
  const [cob, setCob] = useState<Cobertura | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [dia, setDia] = useState<Dia | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (persona === null && gente.length) setPersona(gente[0].id);
  }, [gente, persona]);

  useEffect(() => {
    if (!persona) return;
    setCob(null);
    api<Cobertura>('GET', `/api/admin/datos/personas/${persona}/cobertura?dias=${dias}`)
      .then((c) => {
        setCob(c);
        setFecha((f) => f ?? c.hoy);
      })
      .catch((e: Error) => setError(e.message));
  }, [persona, dias]);

  const traerDia = useCallback(() => {
    if (!persona || !fecha) return;
    api<Dia>('GET', `/api/admin/datos/personas/${persona}/dia?fecha=${fecha}`).then(setDia).catch((e: Error) => setError(e.message));
  }, [persona, fecha]);
  useEffect(() => traerDia(), [traerDia]);
  const { abrir, editor } = useEditor(traerDia);

  const p = gente.find((x) => x.id === persona);
  const maximos = Object.fromEntries(FUENTES.map(([k]) => [k, Math.max(1, ...(cob?.dias.map((d) => Number(d[k])) ?? [0]))]));
  // Una fuente que mandó algo en el período: sus días en cero se marcan como hueco.
  const activa = Object.fromEntries(FUENTES.map(([k]) => [k, Boolean(cob?.dias.some((d) => Number(d[k]) > 0))]));

  return (
    <>
      <div className="filtros-datos">
        <select value={persona ?? ''} onChange={(e) => { setPersona(Number(e.target.value)); setFecha(null); setDia(null); }} aria-label={t('Persona')}>
          {gente.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.duenos ? ` (${x.duenos})` : ''}</option>)}
        </select>
        <div className="segmentos">
          {[30, 60, 120].map((n) => <button key={n} className={dias === n ? 'activa' : ''} onClick={() => setDias(n)}>{t('{n} días', { n })}</button>)}
        </div>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {p ? (
        <div className="tarjeta">
          <h3>🧍 {p.nombre} <span className="suave chico">#{p.id} · {p.zona_horaria}</span></h3>
          <p className="suave chico">
            {t('Dueños: {d}', { d: p.duenos ?? '—' })} · {t('{n} anotaciones', { n: p.registros })} · {t('{n} datos automáticos', { n: p.mediciones })} ·{' '}
            {t('última anotación {cuando}', { cuando: hace(p.ultimo_registro) })} · {t('último dato automático {cuando}', { cuando: hace(p.ultima_medicion) })}
          </p>
          {p.fuentes?.length ? (
            <div className="chips envolver">
              {p.fuentes.map((f) => {
                const viejo = !f.ultimo_uso || Date.now() - Date.parse(f.ultimo_uso) > 48 * 3600e3;
                return (
                  <button key={f.id} className={`chip ${!f.activo ? 'apagado' : viejo ? 'alerta' : 'ok'}`} onClick={() => abrirTabla({ tabla: 'mediciones', filtros: { fuente_id: String(f.id) } })}>
                    {f.tipo} · {f.nombre} · {f.activo ? hace(f.ultimo_uso) : t('apagada')}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="suave chico">{t('Sin fuentes automáticas (no conectó teléfono ni reloj).')}</p>
          )}
        </div>
      ) : null}

      {cob ? (
        <div className="tarjeta">
          <h3>{t('Qué llegó cada día')}</h3>
          <p className="suave chico">{t('Cada cuadradito es un día; más oscuro, más datos. En rojo, un día vacío de una fuente que sí manda. Tocá un día para verlo entero.')}</p>
          <div className="cobertura-caja">
            <table className="cobertura">
              <tbody>
                {FUENTES.map(([k, nombre]) => (
                  <tr key={k}>
                    <th>{t(nombre)}</th>
                    {cob.dias.map((d) => {
                      const n = Number(d[k]);
                      const hueco = n === 0 && activa[k];
                      return (
                        <td
                          key={d.fecha}
                          className={`${hueco ? 'hueco' : ''} ${d.fecha === fecha ? 'elegido' : ''}`}
                          style={n ? { ['--nivel' as string]: String(0.2 + 0.8 * (n / maximos[k])) } : undefined}
                          title={`${d.fecha}: ${n}`}
                          onClick={() => setFecha(d.fecha)}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="suave chico eje"><span>{diaCorto(cob.dias[0].fecha)}</span><span>{t('hoy')}</span></p>
        </div>
      ) : persona ? <p className="suave centro">{t('Cargando…')}</p> : null}

      {fecha ? (
        <div className="dia-admin">
          <div className="barra-tabla">
            <button className="btn chico-btn" onClick={() => setFecha(sumarDias(fecha, -1))}>‹</button>
            <strong>{diaCorto(fecha)}</strong>
            <button className="btn chico-btn" disabled={Boolean(cob && fecha >= cob.hoy)} onClick={() => setFecha(sumarDias(fecha, 1))}>›</button>
            <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label={t('Día')} />
            <span className="espacio" />
            <button className="btn chico-btn" onClick={() => persona && abrirTabla({ tabla: 'registros', persona_id: persona, filtros: { fecha } })}>{t('Abrir en Tablas')}</button>
          </div>
          {dia && dia.fecha === fecha ? <DiaCompleto d={dia} abrir={abrir} /> : <p className="suave centro">{t('Cargando…')}</p>}
        </div>
      ) : null}
      {editor}
    </>
  );
}

function Seccion({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  return (
    <details className="tarjeta seccion-dia" open={n > 0}>
      <summary><strong>{titulo}</strong> <span className="suave chico">({n})</span></summary>
      {children}
    </details>
  );
}

function DiaCompleto({ d, abrir }: { d: Dia; abrir(tabla: string, clave: Record<string, unknown>): void }) {
  const porId = (tabla: string) => (f: Fila) => abrir(tabla, { id: f.id });
  const minutosSueno = d.sueno.filter((s) => s.etapa !== 'despierto').reduce((a, s) => a + Number(s.minutos), 0);
  return (
    <>
      <Seccion titulo={t('📝 Anotaciones')} n={d.registros.length}>
        <Grilla
          filas={d.registros}
          columnas={['hora', 'icono', 'concepto', 'valor', 'intensidad', 'unidad', 'nota', 'origen', 'datos', 'creado_por', 'creado', 'borrado', 'id']}
          marcar={(f) => (f.borrado ? 'borrada' : undefined)}
          alClic={porId('registros')}
        />
        {d.contextos.length ? (
          <>
            <p className="suave chico">{t('"¿Qué pasó antes?" armado por la IA')}</p>
            <Grilla filas={d.contextos} columnas={['registro_id', 'texto', 'items', 'creado']} alClic={(f) => abrir('contexto_registro', { registro_id: f.registro_id })} />
          </>
        ) : null}
      </Seccion>
      <Seccion titulo={t('📡 Datos automáticos')} n={d.mediciones.length}>
        <Grilla filas={d.mediciones} columnas={['fuente', 'hora', 'icono', 'concepto', 'valor', 'unidad', 'fin', 'fuente_nombre', 'creado', 'id']} alClic={porId('mediciones')} />
      </Seccion>
      <Seccion titulo={t('😴 Sueño de esta noche')} n={d.sueno.length + (d.resumen_noche ? 1 : 0)}>
        {d.resumen_noche ? (
          <p className="clic-texto" onClick={() => abrir('resumen_noche', { persona_id: d.persona.id, noche: d.fecha })}>
            🌙 <strong>{t('Calidad {n}/10', { n: Number(d.resumen_noche.calidad) })}</strong> · {String(d.resumen_noche.texto)}
          </p>
        ) : d.sueno.length ? (
          <p className="neg chico">{t('Hay etapas pero no hay resumen de la IA.')}</p>
        ) : null}
        {d.sueno.length ? <p className="suave chico">{t('{h} h {m} min dormido según las etapas', { h: Math.floor(minutosSueno / 60), m: minutosSueno % 60 })}</p> : null}
        <Grilla filas={d.sueno} columnas={['hora', 'etapa', 'minutos', 'fin', 'id']} alClic={porId('sueno_etapas')} />
      </Seccion>
      <Seccion titulo={t('💊 Tomas de remedios')} n={d.tomas.length}>
        <Grilla filas={d.tomas} columnas={['hora', 'remedio', 'estado', 'registro_id', 'id']} alClic={porId('tomas')} />
      </Seccion>
      <Seccion titulo={t('🎧 Escuchas')} n={d.escuchas.length}>
        <Grilla filas={d.escuchas} columnas={['hora', 'app', 'titulo', 'artista', 'minutos', 'id']} alClic={porId('escuchas')} />
      </Seccion>
      <Seccion titulo={t('🛰️ Puntos de ubicación')} n={d.puntos.length}>
        <Grilla filas={d.puntos} columnas={['hora', 'lat', 'lon', 'precision_m', 'id']} alClic={porId('puntos')} />
        {d.paseos.length ? (
          <>
            <p className="suave chico">{t('Paseos detectados')}</p>
            <Grilla filas={d.paseos} columnas={['hora', 'metros', 'estado', 'registro_id', 'id']} alClic={porId('paseos_detectados')} />
          </>
        ) : null}
      </Seccion>
      <Seccion titulo={t('🦉 Lo que Patty le dijo')} n={d.comentarios.length + d.fuera.length + d.avisos.length}>
        {d.comentarios.length ? <Grilla filas={d.comentarios} columnas={['emoji', 'texto', 'estado', 'creado', 'id']} alClic={porId('comentarios')} /> : null}
        {d.fuera.length ? <Grilla filas={d.fuera} columnas={['emoji', 'texto', 'clave', 'datos', 'estado', 'id']} alClic={porId('fuera_de_lo_normal')} /> : null}
        {d.avisos.length ? <Grilla filas={d.avisos} columnas={['hora', 'usuario', 'tipo', 'titulo', 'cuerpo', 'resultado', 'id']} alClic={porId('avisos_historial')} /> : null}
      </Seccion>
    </>
  );
}
