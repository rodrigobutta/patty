// Supervisión (en Más): pedir supervisar a alguien, contestar las invitaciones, ver a quién supervisás y quién te
// supervisa, mandarle un aviso y terminarla. Aceptada, quien supervisa ve el día del otro (aparece en la lista de
// personas), recibe avisos si se olvida una toma o pasa el día sin anotar, y le puede mandar avisos al teléfono.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AVISOS_RAPIDOS, type MisSupervisiones, type Supervision as Sup } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';

export function Supervision() {
  const { avisar, recargar } = useEstado();
  const [datos, setDatos] = useState<MisSupervisiones | null>(null);
  const [quien, setQuien] = useState('');
  /** El código que muestro para que me supervisen, y hasta cuándo sirve. */
  const [miCodigo, setMiCodigo] = useState<{ codigo: string; vence: number } | null>(null);
  const [avisando, setAvisando] = useState<Sup | null>(null);
  const [error, setError] = useState('');

  const traer = useCallback(async () => {
    try {
      setDatos(await api<MisSupervisiones>('GET', '/api/supervision'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void traer(), [traer]);
  // Si se contestó desde el aviso del teléfono, se actualiza.
  useEffect(() => {
    const f = () => void traer();
    window.addEventListener('patty-supervision', f);
    return () => window.removeEventListener('patty-supervision', f);
  }, [traer]);

  const hacer = async (f: () => Promise<unknown>, aviso: string, recargarPersonas = false) => {
    setError('');
    try {
      await f();
      avisar(aviso);
      await traer();
      if (recargarPersonas) await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Lo que se escribe es un usuario, un mail o el código de 6 que le muestra la otra persona.
  const esCodigo = (q: string) => /^[A-Za-z0-9]{3}[- ]?[A-Za-z0-9]{3}$/.test(q) && /\d/.test(q) && !q.includes('@');
  const invitar = () => {
    const q = quien.trim();
    if (esCodigo(q)) {
      return hacer(async () => {
        try {
          await api('POST', '/api/supervision/con-codigo', { codigo: q });
        } catch (e) {
          // Puede ser un usuario que parece un código ("marta1"): se prueba como invitación.
          const r = await api<{ nombre: string }>('POST', '/api/supervision/invitar', { quien: q }).catch(() => null);
          if (!r) throw e;
        }
        setQuien('');
      }, t('Listo'), true);
    }
    return hacer(async () => {
      await api('POST', '/api/supervision/invitar', { quien: q });
      setQuien('');
    }, t('Invitación enviada: cuando acepte, vas a ver su día'));
  };

  const pedirCodigo = async () => {
    setError('');
    try {
      const r = await api<{ codigo: string; minutos: number }>('POST', '/api/supervision/codigo');
      setMiCodigo({ codigo: r.codigo, vence: Date.now() + r.minutos * 60000 });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // Mientras se muestra el código, se revisa cada tanto si ya lo usaron (para mostrar quién te supervisa).
  useEffect(() => {
    if (!miCodigo) return;
    const iv = setInterval(() => {
      if (Date.now() > miCodigo.vence) setMiCodigo(null);
      void traer();
    }, 5000);
    return () => clearInterval(iv);
  }, [miCodigo, traer]);
  const cuantosMeSupervisan = datos?.te_supervisan.filter((s) => s.estado === 'aceptada').length ?? 0;
  const antes = useRef(cuantosMeSupervisan);
  useEffect(() => {
    if (miCodigo && cuantosMeSupervisan > antes.current) {
      setMiCodigo(null);
      avisar(t('¡Listo! Ya son familia en Patty'));
    }
    antes.current = cuantosMeSupervisan;
  }, [cuantosMeSupervisan, miCodigo, avisar]);

  const terminar = (s: Sup, supervisor: boolean) => {
    const pregunta = s.estado === 'pendiente'
      ? supervisor ? t('¿Cancelar la invitación a {nombre}?', { nombre: s.otro.nombre }) : t('¿Rechazar a {nombre}?', { nombre: s.otro.nombre })
      : supervisor ? t('¿Sacar a {nombre} de tu familia?', { nombre: s.otro.nombre }) : t('¿Que {nombre} deje de acompañarte?', { nombre: s.otro.nombre });
    if (!confirm(pregunta)) return;
    void hacer(() => api('DELETE', `/api/supervision/${s.id}`), t('Listo'), true);
  };

  const invitaciones = datos?.te_supervisan.filter((s) => s.estado === 'pendiente') ?? [];
  const meSupervisan = datos?.te_supervisan.filter((s) => s.estado === 'aceptada') ?? [];

  return (
    <div className="tarjeta supervision">
      <h3>{t('👨‍👩‍👧 Familia')}</h3>
      {invitaciones.map((s) => (
        <div key={s.id} className="nota-ia invitacion">
          <p><strong>{s.otro.nombre}</strong> {t('te quiere sumar a su familia en Patty: ver tu día, tus remedios y avisarte si te olvidás algo.')}</p>
          <div className="fila">
            <button className="btn" onClick={() => void hacer(() => api('POST', `/api/supervision/${s.id}/responder`, { aceptar: false }), t('Rechazada'))}>{t('No')}</button>
            <button className="btn primario" onClick={() => void hacer(() => api('POST', `/api/supervision/${s.id}/responder`, { aceptar: true }), t('{nombre} ya te puede acompañar', { nombre: s.otro.nombre }))}>{t('Aceptar')}</button>
          </div>
        </div>
      ))}
      <p className="suave chico">
        {t('Acompañá a alguien: ves su día y sus remedios, te aviso si se olvida una toma y le podés mandar avisos. Usá el código de su Patty o invitalo con su usuario o mail.')}
      </p>
      {datos?.supervisas.length ? (
        <ul className="lista">
          {datos.supervisas.map((s) => (
            <li key={s.id} className="tratamiento">
              <span className="que">
                <strong>{s.otro.nombre}</strong>
                <span className="suave chico renglon-sub">{s.estado === 'pendiente' ? t('esperando que acepte') : t('en tu familia')}</span>
              </span>
              <span className="columna-chica">
                {s.estado === 'aceptada' ? <button className="btn chico" onClick={() => setAvisando(s)}>{t('📣 Avisarle')}</button> : null}
                <button className="enlace chico" onClick={() => terminar(s, true)}>{s.estado === 'pendiente' ? t('Cancelar') : t('Dejar')}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {meSupervisan.length ? (
        <>
          <p className="suave chico">{meSupervisan.length > 1 ? t('Te acompañan:') : t('Te acompaña:')}</p>
          <ul className="lista">
            {meSupervisan.map((s) => (
              <li key={s.id} className="tratamiento">
                <span className="que"><strong>{s.otro.nombre}</strong></span>
                <button className="enlace chico" onClick={() => terminar(s, false)}>{t('Quitar')}</button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <label>
        {t('Sumar a alguien de tu familia')}
        <span className="fila">
          <input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder={t('su código, usuario o mail')} autoCapitalize="none" onKeyDown={(e) => e.key === 'Enter' && quien.trim() && void invitar()} />
          <button className="btn" disabled={!quien.trim()} onClick={() => void invitar()}>{esCodigo(quien.trim()) ? t('Usar código') : t('Invitar')}</button>
        </span>
      </label>
      <div className="que-me-supervisen">
        {miCodigo ? (
          <div className="nota-ia codigo-supervision">
            <p className="suave chico">{t('Mostrale este código a tu familiar. Lo escribe en su Patty y listo:')}</p>
            <p className="codigo" aria-label={miCodigo.codigo.split('').join(' ')}>{miCodigo.codigo.slice(0, 3)} {miCodigo.codigo.slice(3)}</p>
            <p className="suave chico">{t('Sirve una vez, por 15 minutos.')}</p>
          </div>
        ) : (
          <button className="btn ancho" onClick={() => void pedirCodigo()}>{t('🔢 Sumarme a la familia de alguien: mostrar un código')}</button>
        )}
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {avisando ? (
        <>
          <div className="velo" onClick={() => setAvisando(null)} />
          <Avisarle nombre={avisando.otro.nombre} ruta={`/api/supervision/${avisando.id}/avisar`} alCerrar={() => setAvisando(null)} />
        </>
      ) : null}
    </div>
  );
}

/** La hoja para mandarle un aviso al teléfono de quien se supervisa: uno rápido o escrito. */
export function Avisarle({ nombre, ruta, cuerpoExtra, alCerrar }: { nombre: string; ruta: string; cuerpoExtra?: Record<string, unknown>; alCerrar(): void }) {
  const { avisar } = useEstado();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const mandar = async (msg: string) => {
    setEnviando(true);
    setError('');
    try {
      const r = await api<{ enviados: number }>('POST', ruta, { ...cuerpoExtra, texto: msg });
      avisar(r.enviados ? t('Le llegó a {nombre} 📣', { nombre }) : t('{nombre} no tiene la app con avisos: lo va a ver cuando entre', { nombre }));
      alCerrar();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };
  return (
    <div className="hoja" role="dialog" aria-label={t('Avisarle a {nombre}', { nombre })}>
      <div className="hoja-cabeza">
        <h3>{t('📣 Avisarle a {nombre}', { nombre })}</h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>
      <div className="columna">
        {AVISOS_RAPIDOS.map((a) => <button key={a} className="btn" disabled={enviando} onClick={() => void mandar(a)}>{t(a)}</button>)}
      </div>
      <label>
        {t('O escribile')}
        <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder={t('Tomate la pastilla de la presión, ma 😘')} />
      </label>
      {error ? <p className="neg">{error}</p> : null}
      <button className="btn primario ancho" disabled={enviando || !texto.trim()} onClick={() => void mandar(texto.trim())}>{enviando ? t('Mandando…') : t('Mandar')}</button>
    </div>
  );
}
