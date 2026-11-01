// Las competencias entre personas: la lista de las tuyas, crear una (qué se mide y por cuánto), la tabla de posiciones
// con lo que dice el búho, invitar con el link, la placa para compartir y salir. Lo que se comparte se dice antes de
// entrar (LoQueSeComparte) y lo decide el servidor: acá llega solo el apodo, el puesto y el número de cada uno.
import { useCallback, useEffect, useState } from 'react';
import { apodoDe, METRICAS, METRICAS_COMPETENCIA, type DuracionCompetencia, type MetricaCompetencia } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { compartirTexto } from '../lib/compartir';
import {
  codigoDeTexto,
  comoVas,
  EVENTO_COMPETENCIAS,
  linkCompetencia,
  nombreDe,
  placaDe,
  tomarCompetenciaPedida,
  valorTexto,
  type DetalleCompetencia,
  type ResumenCompetencia,
} from '../lib/competencias';
import { t } from '../lib/idioma';
import { Mascota } from '../mascota/Mascota';
import { Avatar } from '../ui/Avatar';
import { BotonCompartir } from '../ui/HojaCompartir';
import { InvitacionCompetencia, LoQueSeComparte } from './InvitacionCompetencia';

const MEDALLAS = ['🥇', '🥈', '🥉'];

function Tabla({ d }: { d: DetalleCompetencia }) {
  const max = Math.max(1, ...d.posiciones.map((f) => f.valor ?? 0));
  return (
    <ul className="lista tablero-lista">
      {d.posiciones.map((f, i) => (
        <li key={`${f.apodo}-${i}`} className={f.yo ? 'yo' : ''} style={{ ['--i' as string]: i }}>
          <span className="puesto">{f.posicion === null ? '–' : (MEDALLAS[f.posicion - 1] ?? `${f.posicion}°`)}</span>
          <Avatar nombre={f.apodo} tamano={34} />
          <span className="que">
            <strong>{f.apodo}{f.yo ? ` (${t('vos')})` : ''}</strong>
            {f.valor !== null ? <span className="barra-ranking"><span style={{ width: `${(f.valor / max) * 100}%` }} /></span> : null}
          </span>
          <span className="cifra">
            {f.valor === null ? <span className="sin-dato">{t('sin dato')}</span> : <strong>{valorTexto(d.metrica, f.valor)}</strong>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Detalle({ id, alVolver, alRevancha }: { id: number; alVolver(): void; alRevancha(m: MetricaCompetencia, d: DuracionCompetencia): void }) {
  const { avisar, usuario } = useEstado();
  const [d, setD] = useState<DetalleCompetencia | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<DetalleCompetencia>('GET', `/api/competencias/${id}`).then(setD).catch((e: Error) => setError(e.message));
  }, [id]);

  const invitar = async () => {
    if (!d) return;
    const como = await compartirTexto(t('Te desafío a «{nombre}» en Patty. ¿Te animás? Sumate acá:', { nombre: nombreDe(d) }), linkCompetencia(d.codigo));
    medir('competencia_invitar', { metrica: d.metrica, como });
    if (como === 'copiado') avisar(t('Copié el link: pegalo donde quieras.'));
  };
  const salir = async () => {
    if (!confirm(t('¿Salir de esta competencia? Tu número deja de compartirse.'))) return;
    try {
      await api('DELETE', `/api/competencias/${id}/participacion`);
      avisar(t('Listo, saliste. Tu número ya no se comparte.'));
      alVolver();
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  if (error) {
    return (
      <>
        <p className="neg">{error}</p>
        <button className="btn ancho" onClick={alVolver}>{t('Volver')}</button>
      </>
    );
  }
  if (!d) return <p className="suave centro">{t('Cargando…')}</p>;
  const m = METRICAS[d.metrica];
  const dice = comoVas(d);
  const placa = placaDe(d);
  const puedeJugar = usuario?.rol !== 'lector';
  return (
    <>
      <div className="competencia-cabeza">
        <button className="enlace" onClick={alVolver}>{t('‹ Competencias')}</button>
        <h3>{m.icono} {nombreDe(d)}</h3>
        <span className="suave chico">
          {d.estado === 'terminada' ? t('Terminó') : d.dias_restantes === 1 ? t('Hoy es el último día') : t('Quedan {n} días', { n: d.dias_restantes })}
        </span>
      </div>
      <div className="competencia-buho">
        <Mascota cara={dice.cara} tamano={64} />
        <p>{dice.frase}</p>
      </div>
      <Tabla d={d} />
      <p className="suave chico">{t(m.comoCuenta)}</p>
      <div className="competencia-botones">
        {placa ? <BotonCompartir armar={() => placa} className="btn primario ancho" /> : null}
        {d.estado === 'en_curso' ? <button className={`btn ancho${placa ? '' : ' primario'}`} onClick={() => void invitar()}>{t('💌 Invitar con el link')}</button> : null}
        {d.estado === 'terminada' && puedeJugar ? <button className="btn ancho" onClick={() => alRevancha(d.metrica, d.duracion)}>{t('🔁 Armar la revancha')}</button> : null}
        <button className="btn ancho" onClick={() => void salir()}>{t('Salir de la competencia')}</button>
      </div>
      <p className="suave chico centro">{t('Es un juego: si hoy no da, no da. Cuidarte vale más que ganar.')}</p>
    </>
  );
}

function Nueva({ inicial, alCrear, alCancelar }: { inicial: { metrica: MetricaCompetencia; duracion: DuracionCompetencia }; alCrear(id: number): void; alCancelar(): void }) {
  const { usuario } = useEstado();
  const [metrica, setMetrica] = useState(inicial.metrica);
  const [duracion, setDuracion] = useState(inicial.duracion);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const crear = async () => {
    setEnviando(true);
    setError('');
    try {
      const r = await api<{ id: number }>('POST', '/api/competencias', { metrica, duracion, nombre, acepto: true });
      medir('competencia_crear', { metrica, duracion });
      alCrear(r.id);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };
  return (
    <>
      <div className="competencia-cabeza">
        <button className="enlace" onClick={alCancelar}>{t('‹ Competencias')}</button>
        <h3>{t('Nueva competencia')}</h3>
      </div>
      <p className="rotulo-campo">{t('¿Qué se mide?')}</p>
      <div className="competencia-metricas">
        {METRICAS_COMPETENCIA.map((k) => (
          <button key={k} className={metrica === k ? 'activa' : ''} aria-pressed={metrica === k} onClick={() => setMetrica(k)}>
            <span aria-hidden>{METRICAS[k].icono}</span>
            <span className="que">
              <strong>{t(METRICAS[k].nombre)}</strong>
              <span className="suave chico">{t(METRICAS[k].comoCuenta)}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="rotulo-campo">{t('¿Por cuánto?')}</p>
      <div className="segmentos ancho">
        <button className={duracion === 'semana' ? 'activa' : ''} onClick={() => setDuracion('semana')}>{t('Una semana')}</button>
        <button className={duracion === 'mes' ? 'activa' : ''} onClick={() => setDuracion('mes')}>{t('Un mes')}</button>
      </div>
      <label className="campo">
        <span className="rotulo-campo">{t('Nombre (si querés)')}</span>
        <input value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} placeholder={nombreDe({ nombre: null, metrica, duracion })} />
      </label>
      <LoQueSeComparte metrica={metrica} apodo={usuario ? apodoDe(usuario.nombre, usuario.apodo) : ''} />
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" onClick={() => void crear()} disabled={enviando}>{t('Aceptar y crear')}</button>
    </>
  );
}

export function Competencias() {
  const { usuario } = useEstado();
  const [lista, setLista] = useState<ResumenCompetencia[] | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [nueva, setNueva] = useState<{ metrica: MetricaCompetencia; duracion: DuracionCompetencia } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [invitacion, setInvitacion] = useState<string | null>(null);
  const [errorCodigo, setErrorCodigo] = useState(false);
  const traer = useCallback(() => void api<ResumenCompetencia[]>('GET', '/api/competencias').then(setLista).catch(() => setLista((l) => l ?? [])), []);
  useEffect(traer, [traer]);
  // Al aceptar una invitación, se abre esa.
  useEffect(() => {
    const f = () => {
      const id = tomarCompetenciaPedida();
      if (id) {
        setNueva(null);
        setVer(id);
      }
    };
    f();
    window.addEventListener(EVENTO_COMPETENCIAS, f);
    return () => window.removeEventListener(EVENTO_COMPETENCIAS, f);
  }, []);

  if (nueva) {
    return <Nueva inicial={nueva} alCancelar={() => setNueva(null)} alCrear={(id) => { setNueva(null); setVer(id); traer(); }} />;
  }
  if (ver !== null) {
    return <Detalle key={ver} id={ver} alVolver={() => { setVer(null); traer(); }} alRevancha={(metrica, duracion) => { setVer(null); setNueva({ metrica, duracion }); }} />;
  }
  const abrirCodigo = () => {
    const c = codigoDeTexto(codigo);
    setErrorCodigo(!c);
    if (c) setInvitacion(c);
  };
  return (
    <>
      <div className="competencia-buho">
        <Mascota cara="feliz" tamano={64} />
        <p>{t('¿Quién viene mejor? Armá una competencia con quien quieras: se ve solo un número, nada de lo que anotás.')}</p>
      </div>
      {usuario?.rol !== 'lector' ? <button className="btn primario ancho" onClick={() => setNueva({ metrica: 'pasos', duracion: 'semana' })}>{t('🏆 Crear una competencia')}</button> : null}
      <div style={{ height: 12 }} />
      {!lista ? (
        <p className="suave centro">{t('Cargando…')}</p>
      ) : (
        lista.map((c) => (
          <button key={c.id} className="competencia-fila" onClick={() => setVer(c.id)}>
            <span aria-hidden>{METRICAS[c.metrica].icono}</span>
            <span className="que">
              <strong>{nombreDe(c)}</strong>
              <span className="suave chico">
                {c.estado === 'terminada' ? t('Terminó') : c.dias_restantes === 1 ? t('Hoy es el último día') : t('Quedan {n} días', { n: c.dias_restantes })} · {valorTexto(c.metrica, c.mi_valor)}
              </span>
            </span>
            <strong>{c.mi_posicion === null ? '–' : (MEDALLAS[c.mi_posicion - 1] ?? `${c.mi_posicion}°`)}</strong>
          </button>
        ))
      )}
      {lista && !lista.length ? <p className="suave chico centro">{t('Todavía no estás en ninguna.')}</p> : null}
      <div className="competencia-codigo">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder={t('¿Te pasaron un link? Pegalo acá')} autoCapitalize="none" aria-label={t('¿Te pasaron un link? Pegalo acá')} onKeyDown={(e) => e.key === 'Enter' && abrirCodigo()} />
        <button className="btn" onClick={abrirCodigo} disabled={!codigo.trim()}>{t('Ver')}</button>
      </div>
      {errorCodigo ? <p className="neg chico">{t('Eso no parece un link de competencia.')}</p> : null}
      {invitacion ? <InvitacionCompetencia codigo={invitacion} alCerrar={() => { setInvitacion(null); setCodigo(''); traer(); }} /> : null}
    </>
  );
}
