// Administración → Persona 360: lo último que llegó de cada cosa, qué llegó de cada fuente día por día (para ver los
// huecos de sincronización) y todo lo que hay de un día, crudo, con cada fila abrible en el editor. Todo es de la persona
// elegida: al cambiarla se descarta lo anterior, y una respuesta vieja que llega tarde se ignora.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { locale, t } from '../lib/idioma';
import { Grilla, fechaHora, hace, useEditor, usePersonas, type Fila, type PedidoTabla } from './AdminDatos';

interface Cobertura { hoy: string; origenes: string[]; dias: Array<Record<string, number | string> & { fecha: string }> }
interface Ultimos {
  datos: Array<{ clave: string; dato: string | null; recibido: string | null; semana: number }>;
  fuentes: Array<{ id: number; tipo: string; nombre: string; activo: boolean; ultimo_uso: string | null; creado: string; ultimo_dato: string | null; semana: number }>;
  telefonos: Array<{ usuario: string; plataforma: string; actualizado: string; version: string | null; version_app: string | null; ultimo_telefono: string | null; ultimo_salud: string | null }>;
}
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
  ['manual', 'Anotado a mano'],
  ['ia', 'Contado a Patty'],
  ['foto', 'Con la cámara'],
  ['telefono', 'Teléfono'],
  ['reloj', 'Reloj / salud'],
  ['clima', 'Clima'],
  ['lugares', 'Lugares'],
  ['puntos', 'Puntos GPS'],
  ['sueno', 'Etapas de sueño'],
  ['resumen_noche', 'Resumen de la noche'],
  ['escuchas', 'Escuchas'],
  ['avisos_apps', 'Avisos de apps'],
  ['comentarios', 'Comentarios de Patty'],
];

const NOMBRE_DATO: Record<string, string> = {
  manual: 'Anotado a mano',
  ia: 'Contado a Patty',
  foto: 'Con la cámara',
  puntos: 'Puntos GPS',
  sueno: 'Etapas de sueño',
  escuchas: 'Escuchas',
  avisos_apps: 'Avisos de apps',
  resumen_noche: 'Resumen de la noche',
  comentarios: 'Comentarios de Patty',
  analisis: 'Análisis de patrones',
};

/** Cómo se llama cada forma de anotar que no es a mano ni contándole a Patty (otras nuevas se ven con su nombre crudo). */
const NOMBRE_ORIGEN: Record<string, string> = {
  recordatorio: 'Remedio, desde el recordatorio',
  aviso: 'Detectado en avisos de apps',
  noche: 'Encuesta de la noche',
  importado: 'Importado',
  ejemplo: 'Datos de ejemplo',
};
const nombreOrigen = (o: string) => NOMBRE_ORIGEN[o] ?? o;

const sumarDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaCorto = (fecha: string) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));
const cuando = (iso: string | null) => (iso ? `${hace(iso)} · ${fechaHora(iso)}` : t('nunca'));
/** Sin nada hace más de dos días: para marcar lo que dejó de llegar. */
const viejo = (iso: string | null) => !iso || Date.now() - Date.parse(iso.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')) > 48 * 3600e3;

/** Corre un pedido y entrega la respuesta solo si sigue siendo el último (la persona o el día no cambiaron mientras tanto). */
function useUltimoPedido() {
  const n = useRef(0);
  return useCallback(<T,>(ruta: string, listo: (x: T) => void, mal: (e: Error) => void) => {
    const este = ++n.current;
    api<T>('GET', ruta).then((x) => este === n.current && listo(x)).catch((e: Error) => este === n.current && mal(e));
  }, []);
}

export function AdminDatosPersona({ persona: pedida, fecha: fechaPedida, alCambiar, abrirTabla }: {
  persona: number | null;
  fecha: string | null;
  /** Cambió la persona o el día (queda en la dirección). */
  alCambiar(persona: number, fecha: string | null): void;
  abrirTabla(p: PedidoTabla): void;
}) {
  const gente = usePersonas();
  const [dias, setDias] = useState(60);
  const [cob, setCob] = useState<Cobertura | null>(null);
  const [ultimos, setUltimos] = useState<Ultimos | null>(null);
  const [dia, setDia] = useState<Dia | null>(null);
  const [error, setError] = useState('');
  const persona = pedida ?? gente[0]?.id ?? null;
  const fecha = fechaPedida ?? cob?.hoy ?? null;
  const pedirCob = useUltimoPedido();
  const pedirUltimos = useUltimoPedido();
  const pedirDia = useUltimoPedido();
  const mal = (e: Error) => setError(e.message);

  useEffect(() => {
    if (!persona) return;
    setCob(null);
    setUltimos(null);
    setError('');
    pedirCob<Cobertura>(`/api/admin/datos/personas/${persona}/cobertura?dias=${dias}`, setCob, mal);
    pedirUltimos<Ultimos>(`/api/admin/datos/personas/${persona}/ultimos`, setUltimos, mal);
  }, [persona, dias, pedirCob, pedirUltimos]);

  const traerDia = useCallback(() => {
    if (!persona || !fecha) return;
    pedirDia<Dia>(`/api/admin/datos/personas/${persona}/dia?fecha=${fecha}`, setDia, mal);
  }, [persona, fecha, pedirDia]);
  useEffect(() => {
    setDia(null);
    traerDia();
  }, [traerDia]);
  const { abrir, editor } = useEditor(traerDia);

  const p = gente.find((x) => x.id === persona);
  // Las filas del mapa: las fijas, con los otros orígenes que haya justo después de lo anotado por la persona.
  const filasMapa: Array<[string, string]> = [...FUENTES.slice(0, 3), ...(cob?.origenes ?? []).map((o): [string, string] => [`origen:${o}`, nombreOrigen(o)]), ...FUENTES.slice(3)];
  const cantidad = (d: Cobertura['dias'][number], k: string) => Number(d[k] ?? 0);
  const maximos = Object.fromEntries(filasMapa.map(([k]) => [k, Math.max(1, ...(cob?.dias.map((d) => cantidad(d, k)) ?? [0]))]));
  // Desde qué día manda cada fuente: lo vacío de antes no es un hueco (todavía no existía), lo de después sí.
  const desde = Object.fromEntries(filasMapa.map(([k]) => [k, cob?.dias.findIndex((d) => cantidad(d, k) > 0) ?? -1]));

  return (
    <>
      <div className="filtros-datos">
        <select value={persona ?? ''} onChange={(e) => alCambiar(Number(e.target.value), null)} aria-label={t('Persona')}>
          {gente.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.duenos ? ` (${x.duenos})` : ''}</option>)}
        </select>
        <div className="segmentos">
          {[30, 60, 120].map((n) => <button key={n} className={dias === n ? 'activa' : ''} onClick={() => setDias(n)}>{t('{n} días', { n })}</button>)}
        </div>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {p ? (
        <div className="kpis">
          <div className="tarjeta dato"><strong>{p.registros.toLocaleString(locale())}</strong><span className="suave chico">{t('anotaciones')}</span></div>
          <div className="tarjeta dato"><strong>{p.mediciones.toLocaleString(locale())}</strong><span className="suave chico">{t('datos automáticos')}</span></div>
          <div className="tarjeta dato"><strong className="kpi-texto">{p.duenos ?? '—'}</strong><span className="suave chico">{t('dueños')}</span></div>
          <div className="tarjeta dato"><strong className="kpi-texto">{p.zona_horaria}</strong><span className="suave chico">{t('zona horaria · #{id}', { id: p.id })}</span></div>
        </div>
      ) : null}

      {ultimos ? (
        <div className="columnas-iguales">
          <div className="tarjeta">
            <h3>{t('Fuentes de esta persona')}</h3>
            <p className="suave chico">{t('"Recibido" es cuándo mandó algo por última vez; "último dato", el dato más nuevo que hay.')}</p>
            {ultimos.fuentes.length ? (
              <div className="grilla-caja">
                <table className="grilla">
                  <thead><tr><th>{t('Fuente')}</th><th>{t('Tipo')}</th><th>{t('Recibido')}</th><th>{t('Último dato')}</th><th>{t('7 días')}</th></tr></thead>
                  <tbody>
                    {ultimos.fuentes.map((f) => (
                      <tr key={f.id} className={`clic ${!f.activo ? 'borrada' : ''}`} onClick={() => abrirTabla({ tabla: 'mediciones', filtros: { fuente_id: String(f.id) } })}>
                        <td>{f.nombre}{f.activo ? '' : ` (${t('apagada')})`}</td>
                        <td>{f.tipo}</td>
                        <td className={f.activo && viejo(f.ultimo_uso) ? 'neg' : undefined}>{cuando(f.ultimo_uso)}</td>
                        <td>{cuando(f.ultimo_dato)}</td>
                        <td>{f.semana}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="suave chico">{t('Sin fuentes automáticas (no conectó teléfono ni reloj).')}</p>}
            {ultimos.telefonos.length ? (
              <>
                <h3 className="sub">{t('Teléfonos de sus dueños')}</h3>
                <div className="grilla-caja">
                  <table className="grilla">
                    <thead><tr><th>{t('Usuario')}</th><th>{t('Plataforma')}</th><th>{t('Versión')}</th><th>{t('Abrió la app')}</th><th>{t('Mandó uso')}</th><th>{t('Mandó salud')}</th></tr></thead>
                    <tbody>
                      {ultimos.telefonos.map((x, i) => (
                        <tr key={i}>
                          <td>{x.usuario}</td><td>{x.plataforma}</td><td>{x.version ?? '—'}{x.version_app && x.version_app !== x.version ? ` (app ${x.version_app})` : ''}</td>
                          <td>{hace(x.actualizado)}</td><td>{x.ultimo_telefono ? hace(x.ultimo_telefono) : '—'}</td><td>{x.ultimo_salud ? hace(x.ultimo_salud) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
          <div className="tarjeta">
            <h3>{t('Lo último de cada cosa')}</h3>
            <div className="grilla-caja">
              <table className="grilla">
                <thead><tr><th>{t('Qué')}</th><th>{t('Último dato')}</th><th>{t('Recibido')}</th><th>{t('7 días')}</th></tr></thead>
                <tbody>
                  {ultimos.datos.map((d) => (
                    <tr key={d.clave}>
                      <td>{d.clave.startsWith('origen:') ? t(nombreOrigen(d.clave.slice(7))) : t(NOMBRE_DATO[d.clave] ?? d.clave)}</td>
                      <td className={d.dato ? undefined : 'vacio'}>{cuando(d.dato)}</td>
                      <td className={d.recibido ? undefined : 'vacio'}>{d.recibido ? hace(d.recibido) : '—'}</td>
                      <td>{d.semana}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {cob ? (
        <div className="tarjeta">
          <h3>{t('Qué llegó cada día')}</h3>
          <p className="suave chico">{t('Cada cuadradito es un día; más oscuro, más datos. En rojo, un día vacío de una fuente que ya venía mandando. Tocá un día para verlo entero.')}</p>
          <div className="cobertura-caja">
            <table className="cobertura">
              <tbody>
                {filasMapa.map(([k, nombre]) => (
                  <tr key={k}>
                    <th>{t(nombre)}</th>
                    {cob.dias.map((d, i) => {
                      const n = cantidad(d, k);
                      const hueco = n === 0 && desde[k] >= 0 && i > desde[k];
                      return (
                        <td
                          key={d.fecha}
                          className={`${hueco ? 'hueco' : ''} ${d.fecha === fecha ? 'elegido' : ''}`}
                          style={n ? { ['--nivel' as string]: String(0.2 + 0.8 * (n / maximos[k])) } : undefined}
                          title={`${d.fecha}: ${n}`}
                          onClick={() => persona && alCambiar(persona, d.fecha)}
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

      {fecha && persona ? (
        <div className="dia-admin">
          <div className="barra-tabla">
            <button className="btn chico-btn" onClick={() => alCambiar(persona, sumarDias(fecha, -1))}>‹</button>
            <strong>{diaCorto(fecha)}</strong>
            <button className="btn chico-btn" disabled={Boolean(cob && fecha >= cob.hoy)} onClick={() => alCambiar(persona, sumarDias(fecha, 1))}>›</button>
            <input type="date" value={fecha} onChange={(e) => e.target.value && alCambiar(persona, e.target.value)} aria-label={t('Día')} />
            <span className="espacio" />
            <button className="btn chico-btn" onClick={() => abrirTabla({ tabla: 'registros', persona_id: persona, filtros: { fecha } })}>{t('Abrir en Tablas')}</button>
          </div>
          {dia && dia.fecha === fecha && dia.persona.id === persona ? <DiaCompleto d={dia} abrir={abrir} /> : <p className="suave centro">{t('Cargando…')}</p>}
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
      <Seccion titulo={t('Anotaciones')} n={d.registros.length}>
        <Grilla
          filas={d.registros}
          columnas={['hora', 'categoria', 'concepto', 'valor', 'intensidad', 'unidad', 'nota', 'origen', 'datos', 'creado_por', 'creado', 'borrado', 'id']}
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
      <Seccion titulo={t('Datos automáticos')} n={d.mediciones.length}>
        <Grilla filas={d.mediciones} columnas={['fuente', 'hora', 'concepto', 'valor', 'unidad', 'fin', 'fuente_nombre', 'creado', 'id']} alClic={porId('mediciones')} />
      </Seccion>
      <Seccion titulo={t('Sueño de esta noche')} n={d.sueno.length + (d.resumen_noche ? 1 : 0)}>
        {d.resumen_noche ? (
          <p className="clic-texto" onClick={() => abrir('resumen_noche', { persona_id: d.persona.id, noche: d.fecha })}>
            <strong>{t('Calidad {n}/10', { n: Number(d.resumen_noche.calidad) })}</strong> · {String(d.resumen_noche.texto)}
          </p>
        ) : d.sueno.length ? (
          <p className="neg chico">{t('Hay etapas pero no hay resumen de la IA.')}</p>
        ) : null}
        {d.sueno.length ? <p className="suave chico">{t('{h} h {m} min dormido según las etapas', { h: Math.floor(minutosSueno / 60), m: minutosSueno % 60 })}</p> : null}
        <Grilla filas={d.sueno} columnas={['hora', 'etapa', 'minutos', 'fin', 'id']} alClic={porId('sueno_etapas')} />
      </Seccion>
      <Seccion titulo={t('Tomas de remedios')} n={d.tomas.length}>
        <Grilla filas={d.tomas} columnas={['hora', 'remedio', 'estado', 'registro_id', 'id']} alClic={porId('tomas')} />
      </Seccion>
      <Seccion titulo={t('Escuchas')} n={d.escuchas.length}>
        <Grilla filas={d.escuchas} columnas={['hora', 'app', 'titulo', 'artista', 'minutos', 'id']} alClic={porId('escuchas')} />
      </Seccion>
      <Seccion titulo={t('Puntos de ubicación')} n={d.puntos.length}>
        <Grilla filas={d.puntos} columnas={['hora', 'lat', 'lon', 'precision_m', 'id']} alClic={porId('puntos')} />
        {d.paseos.length ? (
          <>
            <p className="suave chico">{t('Paseos detectados')}</p>
            <Grilla filas={d.paseos} columnas={['hora', 'metros', 'estado', 'registro_id', 'id']} alClic={porId('paseos_detectados')} />
          </>
        ) : null}
      </Seccion>
      <Seccion titulo={t('Lo que Patty le dijo')} n={d.comentarios.length + d.fuera.length + d.avisos.length}>
        {d.comentarios.length ? <Grilla filas={d.comentarios} columnas={['texto', 'estado', 'creado', 'id']} alClic={porId('comentarios')} /> : null}
        {d.fuera.length ? <Grilla filas={d.fuera} columnas={['texto', 'clave', 'datos', 'estado', 'id']} alClic={porId('fuera_de_lo_normal')} /> : null}
        {d.avisos.length ? <Grilla filas={d.avisos} columnas={['hora', 'usuario', 'tipo', 'titulo', 'cuerpo', 'resultado', 'id']} alClic={porId('avisos_historial')} /> : null}
      </Seccion>
    </>
  );
}
