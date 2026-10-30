// En el Día, lo que llegó de los avisos de las apps (con «Lo que avisan las apps» prendido en Más → Permisos):
// - Lo que Patty pregunta: un pedido que llegó ("¿Pediste comida? ¿Qué fue?", con lo que más pedís, escrito o con una
//   foto, y queda como comida pedida) y un viaje en Uber/Cabify/DiDi que no vio la ubicación ("¿Fuiste en Uber?").
// - Cuántos avisos llegaron (por hora y por app, y los que sonaron de noche) y cuántos mensajes, al tocarlo con el detalle.
import { conApodo } from '../lib/apodo';
import { useCallback, useEffect, useState } from 'react';
import { COMO_VIAJE, type AvisoPendiente, type AvisosDelDia as Datos, type Persona } from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { borrarAvisosTelefono, EVENTO_LLEGARON } from '../lib/avisosTelefono';
import { duracion } from '../lib/automatico';
import { horaEn } from '../lib/fechas';
import { t } from '../lib/idioma';
import { IconoCamara } from '../ui/Iconos';
import { IconoAnimo, IconoCampana, IconoCategoria, IconoMensajes, IconoModo } from '../ui/IconosPatty';

export interface PistaFoto {
  texto: string;
  titulo: string;
}

/** Lo que Patty pregunta: los pedidos y los viajes en app pendientes (solo hoy). */
export function AvisosPendientes({ persona, vuelta, alAnotar, alFoto }: { persona: Persona; vuelta: number; alAnotar(): void; alFoto?(p: PistaFoto): void }) {
  const { festejar, avisar, usuario } = useEstado();
  const [datos, setDatos] = useState<{ pendientes: AvisoPendiente[]; comidas: string[] } | null>(null);
  const [que, setQue] = useState<Record<number, string>>({});
  const traer = useCallback(() => {
    api<typeof datos>('GET', `/api/avisos/pendientes?persona=${persona.id}`).then(setDatos).catch(() => {});
  }, [persona.id]);
  useEffect(() => traer(), [traer, vuelta]);
  useEffect(() => {
    window.addEventListener(EVENTO_LLEGARON, traer);
    return () => window.removeEventListener(EVENTO_LLEGARON, traer);
  }, [traer]);
  if (!datos?.pendientes.length || usuario?.rol === 'lector') return null;
  const zona = persona.zona_horaria;

  const responder = async (a: AvisoPendiente, cuerpo: { que?: string; como?: string; descartar?: boolean }) => {
    try {
      await api('POST', `/api/avisos/${a.id}`, cuerpo);
      medir('aviso_telefono', { tipo: a.tipo, respuesta: cuerpo.descartar ? 'no' : 'si' });
      setDatos((d) => d && { ...d, pendientes: d.pendientes.filter((x) => x.id !== a.id) });
      if (cuerpo.que) festejar(t('¡Anotado! {que}, pedido por delivery', { que: t(cuerpo.que) }));
      else if (cuerpo.como) festejar(t('Anotado: viaje en {app}', { app: a.app }), cuerpo.como === 'pesado' ? 'espera' : 'feliz');
      if (!cuerpo.descartar) alAnotar();
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  return (
    <>
      {datos.pendientes.map((a) =>
        a.tipo === 'pedido' ? (
          <div key={a.id} className="tarjeta aviso-pendiente">
            <h3 className="con-icono">
              <IconoCategoria clave="comida" tamano={26} /> {conApodo(t('¿Pediste comida? ¿Qué fue?'))}
            </h3>
            <p className="suave chico">{t('Llegó tu pedido de {app} a las {hora}.', { app: a.app, hora: horaEn(a.inicio, zona) })}</p>
            {datos.comidas.length ? (
              <div className="chips envolver">
                {datos.comidas.map((c) => (
                  <button key={c} className="chip" onClick={() => void responder(a, { que: c })}>{t(c)}</button>
                ))}
              </div>
            ) : null}
            <form className="otro-puntual" onSubmit={(e) => { e.preventDefault(); if (que[a.id]?.trim()) void responder(a, { que: que[a.id].trim() }); }}>
              <input value={que[a.id] ?? ''} onChange={(e) => setQue({ ...que, [a.id]: e.target.value })} placeholder={t('Ej: pizza, sushi, empanadas')} />
              <button className="btn" disabled={!que[a.id]?.trim()}>{t('Anotar')}</button>
            </form>
            <div className="botones-aviso">
              {alFoto ? <button
                className="btn chico"
                onClick={() =>
                  alFoto({
                    texto: `comida pedida por delivery (${a.app}) que llegó a las ${horaEn(a.inicio, zona)}: donde = delivery, a esa hora`,
                    titulo: t('Mandale una foto de lo que pediste'),
                  })
                }
              >
                <IconoCamara tamano={20} /> {t('Con una foto')}
              </button> : null}
              <button className="enlace chico" onClick={() => void responder(a, { descartar: true })}>{t('No era para mí')}</button>
            </div>
          </div>
        ) : (
          <div key={a.id} className="tarjeta aviso-pendiente">
            <h3 className="con-icono">
              <IconoModo modo="taxi" tamano={26} /> {t('¿Fuiste en {app}?', { app: a.app })}
            </h3>
            <p className="suave chico">
              {a.fin ? `${horaEn(a.inicio, zona)} → ${horaEn(a.fin, zona)} · ${duracion(a.minutos ?? 0)}` : t('A las {hora}', { hora: horaEn(a.inicio, zona) })}
            </p>
            <span className="rotulo-campo">{t('Sí: ¿cómo fue?')}</span>
            <span className="botones-como">
              {COMO_VIAJE.map((c) => (
                <button key={c.clave} className="btn chico" onClick={() => void responder(a, { como: c.clave })}>
                  <IconoAnimo clave={c.clave === 'pesado' ? 'mal' : c.clave} tamano={22} /> {t(c.nombre)}
                </button>
              ))}
            </span>
            <div className="botones-aviso">
              <button className="enlace chico" onClick={() => void responder(a, { descartar: true })}>{t('No fui yo')}</button>
            </div>
          </div>
        ),
      )}
    </>
  );
}

/**
 * Lo que avisó el teléfono, adentro del detalle del widget de uso del teléfono: cuántas notificaciones llegaron, por
 * hora (las de noche en otro color), qué apps avisaron más, las de anoche y los mensajes recibidos (solo cuántos).
 */
export function AvisosDelTelefono({ persona, fecha }: { persona: Persona; fecha: string }) {
  const { avisar, usuario } = useEstado();
  const [d, setD] = useState<Datos | null>(null);
  const traer = useCallback(() => {
    api<Datos>('GET', `/api/avisos/dia?persona=${persona.id}&fecha=${fecha}`).then(setD).catch(() => setD(null));
  }, [persona.id, fecha]);
  useEffect(() => traer(), [traer]);
  useEffect(() => {
    window.addEventListener(EVENTO_LLEGARON, traer);
    return () => window.removeEventListener(EVENTO_LLEGARON, traer);
  }, [traer]);
  if (!d || (!d.notificaciones && !d.mensajes)) return null;
  const n = d.notificaciones;
  const m = d.mensajes;
  const maximo = n ? Math.max(1, ...n.por_hora) : 1;

  const borrar = async () => {
    if (!confirm(t('¿Borrar todo lo que Patty contó de los avisos del teléfono? Lo que ya se anotó (comidas, viajes, ejercicio) queda. No se puede deshacer.'))) return;
    try {
      await borrarAvisosTelefono(persona.id);
      setD(null);
      avisar(t('Borrado'));
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  return (
    <div className="avisos-telefono">
      <div className="avisos-cifras">
        {n ? (
          <div className="avisos-cifra">
            <span className="icono"><IconoCampana /></span>
            <strong>{n.total}</strong>
            <span className="suave chico">{n.total === 1 ? t('notificación') : t('notificaciones')}</span>
          </div>
        ) : null}
        {n?.noche ? (
          <div className="avisos-cifra">
            <span className="icono"><IconoCampana /></span>
            <strong>{n.noche.sonoras}</strong>
            <span className="suave chico">{n.noche.sonoras === 1 ? t('sonó de noche') : t('sonaron de noche')}</span>
          </div>
        ) : null}
        {m ? (
          <div className="avisos-cifra">
            <span className="icono"><IconoMensajes /></span>
            <strong>{m.total}</strong>
            <span className="suave chico">{m.total === 1 ? t('mensaje recibido') : t('mensajes recibidos')}</span>
          </div>
        ) : null}
      </div>
      {n ? (
        <>
          <h4>{t('Notificaciones por hora')}</h4>
          <div className="barras-hora" role="img" aria-label={t('Notificaciones por hora')}>
            {n.por_hora.map((x, h) => (
              <div key={h} className={`hora-barra${h >= 23 || h < 7 ? ' de-noche' : ''}${x ? '' : ' vacia'}`} style={{ height: x ? `${Math.max(6, Math.round((x / maximo) * 100))}%` : undefined }} title={`${h} h: ${x}`} />
            ))}
          </div>
          <div className="horas-barras suave chico">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          <h4>{t('Las apps que más avisaron')}</h4>
          <ul className="apps-avisos">
            {n.apps.map((a) => (
              <li key={a.app}>
                <span>{a.app}</span>
                <span className="valor-chip">{a.n}</span>
              </li>
            ))}
          </ul>
          {n.noche ? (
            <p className="suave chico">
              {t('Anoche (de 23 a 7) llegaron {n}: {s} sonaron y {a} con la pantalla apagada.', { n: n.noche.total, s: n.noche.sonoras, a: n.noche.apagada })}
            </p>
          ) : null}
        </>
      ) : null}
      {m?.apps.length ? (
        <>
          <h4>{t('Mensajes por app')}</h4>
          <ul className="apps-avisos">
            {m.apps.map((a) => (
              <li key={a.app}>
                <span>{a.app}</span>
                <span className="valor-chip">{a.n}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {usuario?.rol !== 'lector' ? <button className="enlace chico" onClick={() => void borrar()}>{t('Borrar todo lo de los avisos')}</button> : null}
    </div>
  );
}
