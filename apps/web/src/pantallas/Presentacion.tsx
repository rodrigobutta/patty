// La página de presentación (patty.today; la app web vive en patty.today/app): qué es Patty, con
// pantallas y videos de la app de verdad (una persona de ejemplo; ver movil/presentacion/capturar.mjs). En la app
// del teléfono no se muestra: ahí se entra directo.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';
import { IconoCalendario } from '../ui/Iconos';
import { IconoClima, IconoLugares, IconoReloj, IconoTelefono } from '../ui/IconosMas';
import { IconoCategoria } from '../ui/IconosPatty';
import { useEstado } from '../estado';
import { iniciarAnalytics, medir } from '../lib/analytics';
import { t } from '../lib/idioma';
import { Mascota } from '../mascota/Mascota';

const A = (n: string) => `presentacion/${n}`;

/** Un teléfono con una captura o un video adentro (el video corre solo, sin sonido, cuando se ve en pantalla). */
function Telefono({ img, video, alt, chico = false }: { img: string; video?: string; alt: string; chico?: boolean }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = v.current;
    if (!el) return;
    let visto = false;
    const o = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return el.pause();
        void el.play().catch(() => {});
        if (!visto) medir('ver_video', { video: video ?? img });
        visto = true;
      },
      { threshold: 0.4 },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [video, img]);
  return (
    <div className={`pres-telefono${chico ? ' chico' : ''}`}>
      <div className="pres-pantalla">
        {video ? (
          <video ref={v} src={A(video)} poster={A(img)} muted loop playsInline preload="none" aria-label={alt} />
        ) : (
          <img src={A(img)} alt={alt} loading="lazy" />
        )}
      </div>
    </div>
  );
}

/**
 * El video con la historia de Sofía, con su relato (herramientas/video): horizontal en pantallas anchas y vertical en
 * el teléfono. Arranca al tocarlo, con sonido.
 */
function VideoHistoria() {
  const r = useVista('video');
  const vertical = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  const nombre = vertical ? 'historia-vertical' : 'historia';
  return (
    <section ref={r} className="pres-video">
      <h2>{t('Mirá cómo le cambió el día a Sofía')}</h2>
      <video
        className={vertical ? 'vertical' : ''}
        src={A(`${nombre}.mp4`)}
        poster={A(`${nombre}.jpg`)}
        controls
        playsInline
        preload="none"
        onPlay={() => medir('ver_video', { video: nombre })}
        onEnded={() => medir('video_completo', { video: nombre })}
      />
    </section>
  );
}

/** Lo que Patty suma solo, una vez conectado (la sección "Se conecta con lo que ya usás"). */
const CONEXIONES: Array<{ icono: ReactNode; titulo: string; detalle: string }> = [
  { icono: <IconoReloj />, titulo: 'Reloj y Health Connect', detalle: 'Sueño con sus etapas, pasos, caminatas y pulso, de tu reloj o pulsera (Samsung, Fitbit y otros) por Health Connect.' },
  { icono: <IconoLugares />, titulo: 'Ubicación', detalle: 'Tus viajes con su mapa, si hubo tráfico, y los lugares donde pasás el tiempo.' },
  { icono: <IconoTelefono />, titulo: 'Uso del teléfono', detalle: 'El tiempo de pantalla, qué apps usás más y cuánto hablás por teléfono.' },
  { icono: <IconoCalendario tamano={28} />, titulo: 'Tu calendario', detalle: 'Las reuniones de Google o Outlook, para ver si un día cargado te pega.' },
  { icono: <IconoClima />, titulo: 'Clima', detalle: 'El clima de cada hora donde estás: calor, lluvia, humedad, cambios de presión.' },
  { icono: <IconoCategoria clave="ciclo" tamano={28} />, titulo: 'Ciclo menstrual', detalle: 'La fase de cada día, para ver cómo te va en cada una.' },
];

/**
 * Para los de iPhone (Android ya se baja directo): dejan su nombre, su mail y qué les interesa, y les avisamos cuando
 * esté. El campo "web" está escondido: si viene lleno, es un bot.
 */
function FormBeta() {
  const [datos, setDatos] = useState({ nombre: '', email: '', motivo: '', web: '' });
  const [estado, setEstado] = useState<'listo' | 'mandando' | 'enviado'>('listo');
  const [error, setError] = useState('');
  const mandar = async (e: FormEvent) => {
    e.preventDefault();
    setEstado('mandando');
    setError('');
    try {
      await api('POST', '/api/beta', datos);
      medir('beta_enviado');
      setEstado('enviado');
    } catch (x) {
      setError((x as Error).message);
      setEstado('listo');
    }
  };
  return (
    <div id="beta" className="pres-beta-caja">
      <h2>{t('¿Tenés iPhone?')}</h2>
      <p className="pres-bajada">
        {t('La app de iPhone viene pronto. Dejanos tus datos y te avisamos cuando esté.')}
      </p>
      {estado === 'enviado' ? (
        <p className="pres-beta-gracias">{t('¡Listo! Te vamos a escribir a {email} cuando esté la de iPhone. 💜', { email: datos.email })}</p>
      ) : (
        <form className="pres-form" onSubmit={(e) => void mandar(e)}>
          <label>{t('Nombre')}<input required maxLength={80} value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} autoComplete="name" /></label>
          <label>{t('Mail')}<input required type="email" maxLength={120} value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} autoComplete="email" /></label>
          <label>{t('¿Por qué te interesa?')}<textarea maxLength={1000} rows={3} value={datos.motivo} onChange={(e) => setDatos({ ...datos, motivo: e.target.value })} placeholder={t('Ej: tengo migrañas seguido y quiero entender qué las dispara')} /></label>
          <input className="pres-trampa" tabIndex={-1} autoComplete="off" aria-hidden value={datos.web} onChange={(e) => setDatos({ ...datos, web: e.target.value })} name="web" />
          {error ? <p className="error chico">{error}</p> : null}
          <button className="btn primario pres-cta" disabled={estado === 'mandando'}>{estado === 'mandando' ? t('Mandando…') : t('Avisame')}</button>
        </form>
      )}
    </div>
  );
}

/** Avisa (una vez) cuando una sección se ve: así se sabe hasta dónde baja la gente. */
function useVista(nombre: string) {
  const r = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = r.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      medir('ver_seccion', { seccion: nombre });
      o.disconnect();
    }, { threshold: 0.3 });
    o.observe(el);
    return () => o.disconnect();
  }, [nombre]);
  return r;
}

function Seccion({ id, titulo, bajada, children, invertida = false, telefono }: {
  id?: string;
  titulo: string;
  bajada: string;
  children?: ReactNode;
  invertida?: boolean;
  telefono?: ReactNode;
}) {
  const r = useVista(id ?? titulo);
  return (
    <section ref={r} id={id} className={`pres-seccion${invertida ? ' invertida' : ''}`}>
      <div className="pres-texto">
        <h2>{titulo}</h2>
        <p className="pres-bajada">{bajada}</p>
        {children}
      </div>
      {telefono ? <div className="pres-telefonos">{telefono}</div> : null}
    </section>
  );
}

export function Presentacion({ alEntrar, conSesion = false }: { alEntrar(): void; conSesion?: boolean }) {
  const { sesion } = useEstado();
  // El APK firmado, directo de la web (sin Play Store por ahora): /descargar/android lleva a la última versión.
  const android = sesion?.app?.url ?? '/descargar/android';
  useEffect(() => {
    document.title = t('Patty: contale tu día y descubrí qué se relaciona');
    window.scrollTo({ top: 0 });
  }, []);
  // Solo se mide a quien no entró (los que ya usan Patty no cuentan como visitas de la presentación).
  useEffect(() => {
    if (!conSesion) iniciarAnalytics(sesion?.analytics);
  }, [conSesion, sesion?.analytics]);
  const ir = (donde: string) => () => {
    medir(conSesion ? 'volver_a_patty' : 'empezar', { desde: donde });
    alEntrar();
  };
  // El botón principal baja la app de Android directo de acá (para volver a Patty está el botón de la barra); los de
  // iPhone dejan sus datos (abajo de todo).
  const entrar = (donde: string) => (
    <a className="btn primario pres-cta" href={android} onClick={() => medir('bajar_android', { desde: donde })}>{t('Descargar para Android')}</a>
  );
  const finalRef = useVista('final');
  const consultaRef = useVista('consultar');
  const conexionesRef = useVista('conexiones');
  const tiempoRef = useVista('tiempo');
  const comoRef = useVista('como');
  return (
    <div className="presentacion">
      <header className="pres-barra">
        <span className="pres-marca"><Mascota cara="feliz" tamano={34} /> Patty</span>
        <button className="btn chico" onClick={ir('barra')}>{t('Ver Patty en la web')}</button>
      </header>

      <section className="pres-portada">
        <div className="pres-texto">
          <Mascota cara="feliz" tamano={96} className="saluda" />
          <span className="pres-beta">{t('Beta · gratis para Android')}</span>
          <h1>{t('Contale tu día. Patty encuentra lo que se relaciona.')}</h1>
          <p className="pres-bajada">
            {t('Lo que comés, cómo dormís, cómo te sentís, si algo te dolió. Lo contás en segundos, con la voz, una foto o un toque, y Patty te muestra qué cosas van juntas en tu vida.')}
          </p>
          <div className="pres-botones">
            {entrar('portada')}
            <a className="btn" href="#como" onClick={() => medir('ver_como_funciona')}>{t('Ver cómo funciona')}</a>
          </div>
          <p className="suave chico">
            {t('¿Tenés iPhone?')} <a href="#beta" onClick={() => medir('pedir_iphone')}>{t('Avisame cuando esté')}</a>
          </p>
        </div>
        <div className="pres-telefonos">
          <Telefono img="portada.webp" alt={t('Lo que descubre Patty: dormir poco y el ánimo, la comida frita y el dolor de panza')} />
          <Telefono img="calendario.webp" alt={t('El calendario del sueño: cuánto dormiste cada noche del mes')} chico />
        </div>
      </section>

      <VideoHistoria />

      <section ref={comoRef} id="como" className="pres-seccion pres-tres">
        <div className="pres-texto centro">
          <h2>{t('Anotar es lo más fácil del mundo')}</h2>
          <p className="pres-bajada">{t('Nada de formularios. Contalo como se lo contarías a una amiga.')}</p>
        </div>
        <div className="pres-fila">
          <figure>
            <Telefono img="contar.webp" video="voz.webm" alt={t('Contarle a Patty con la voz')} chico />
            <figcaption><strong>{t('🎙️ Hablale')}</strong>{t('«Desayuné café con tostadas y a la tarde salí a caminar.» Patty lo ordena solo, con la hora de cada cosa.')}</figcaption>
          </figure>
          <figure>
            <Telefono img="foto.webp" video="foto.webm" alt={t('Mandarle una foto del plato')} chico />
            <figcaption><strong>{t('📷 Sacale una foto')}</strong>{t('Al plato: reconoce la comida, estima la porción y si es frito, con harinas o verdura.')}</figcaption>
          </figure>
          <figure>
            <Telefono img="sentir.webp" video="tocar.webm" alt={t('Contar cómo te sentís con un toque')} chico />
            <figcaption><strong>{t('👆 Un toque')}</strong>{t('El búho te pregunta cómo te sentís y contestás con una carita. También desde el widget del teléfono.')}</figcaption>
          </figure>
        </div>
      </section>

      <Seccion
        id="junta"
        titulo={t('Y mucho lo junta sola')}
        bajada={t('Conectás el reloj y el teléfono una vez, y Patty suma lo que pasa sin que tengas que anotarlo.')}
        telefono={
          <>
            <Telefono img="widgets.webp" alt={t('Los widgets del Día: ánimo, clima, viajes, pasos, teléfono y sueño')} />
            <Telefono img="sueno.webp" alt={t('Cómo fue la noche, con sus etapas')} chico />
          </>
        }
      >
        <ul className="pres-lista">
          <li>😴 {t('El sueño del reloj, con sus etapas y una nota de cómo fue la noche.')}</li>
          <li>🚶 {t('Pasos, caminatas y los viajes del día, con el mapa del recorrido.')}</li>
          <li>🌤️ {t('El clima de cada día: calor, lluvia, cambios de presión.')}</li>
          <li>📱 {t('Cuánto usaste el teléfono.')}</li>
          <li>🩸 {t('El ciclo menstrual, con su fase de cada día.')}</li>
        </ul>
      </Seccion>

      <Seccion
        invertida
        id="descubre"
        titulo={t('Lo que descubre de vos')}
        bajada={t('Con unas semanas de datos, Patty busca qué cosas aparecen juntas y te lo cuenta en palabras simples.')}
        telefono={<Telefono img="patrones.webp" video="descubrir.webm" alt={t('Los patrones que encontró Patty')} />}
      >
        <div className="pres-ejemplos">
          <div className="pres-ejemplo"><span>😴 → 🤕</span>{t('Después de dormir menos de 6 horas, ese día el dolor de cabeza aparece casi siempre.')}</div>
          <div className="pres-ejemplo"><span>🍟 + 🩸 + ☀️ → 😣</span>{t('Cuando se juntan comida frita, el período y un día de calor, al otro día duele la panza. Una sola de esas cosas, casi nunca.')}</div>
          <div className="pres-ejemplo"><span>🚶 → 😄</span>{t('Los días que caminás media hora, tu ánimo está más arriba.')}</div>
          <div className="pres-ejemplo"><span>📱 → 😴</span>{t('Con mucha pantalla a la noche, dormís menos.')}</div>
        </div>
        <p className="suave chico">{t('Vos le decís si te sirvió, si ya lo sabías o si no tiene sentido, y Patty aprende qué mostrarte.')}</p>
      </Seccion>

      <section ref={consultaRef} id="consultar" className="pres-seccion pres-tres">
        <div className="pres-texto centro">
          <h2>{t('Y todo lo tuyo, a mano')}</h2>
          <p className="pres-bajada">{t('No son solo patrones: todo lo que anotás y lo que junta Patty se puede mirar, buscar y preguntar.')}</p>
        </div>
        <div className="pres-fila cuatro">
          <figure>
            <Telefono img="preguntar.webp" alt={t('Preguntarle a Patty cómo venís durmiendo')} chico />
            <figcaption><strong>{t('🦉 Preguntale')}</strong>{t('«¿Cómo vengo durmiendo?», «¿cuándo comí huevos?»: Patty te contesta con tus datos.')}</figcaption>
          </figure>
          <figure>
            <Telefono img="numeros.webp" alt={t('Los números del mes')} chico />
            <figcaption><strong>{t('📊 Tus números')}</strong>{t('Qué anotaste más, cuántos días, cuántas tazas de café en el mes.')}</figcaption>
          </figure>
          <figure>
            <Telefono img="calendario.webp" alt={t('El calendario del sueño')} chico />
            <figcaption><strong>{t('📅 El calendario')}</strong>{t('El sueño, el ánimo o los dolores de cada día del mes, de un vistazo.')}</figcaption>
          </figure>
          <figure>
            <Telefono img="mapa.webp" alt={t('El mapa de dónde pasaste tu tiempo')} chico />
            <figcaption><strong>{t('🗺️ El mapa')}</strong>{t('Dónde pasaste tu tiempo y por dónde anduviste.')}</figcaption>
          </figure>
        </div>
      </section>

      <section ref={conexionesRef} id="conexiones" className="pres-conexiones">
        <h2>{t('Se conecta con lo que ya usás')}</h2>
        <p className="pres-bajada">{t('Lo activás una vez y Patty lo suma solo, sin que tengas que anotar nada.')}</p>
        <div className="pres-conexiones-grilla">
          {CONEXIONES.map((x) => (
            <div key={x.titulo} className="pres-conexion">
              <span className="pres-conexion-icono" aria-hidden>{x.icono}</span>
              <strong>{t(x.titulo)}</strong>
              <span className="suave chico">{t(x.detalle)}</span>
            </div>
          ))}
        </div>
        <p className="suave chico">{t('Cada conexión se prende y se apaga cuando quieras, y lo de Android funciona con la app instalada.')}</p>
      </section>

      <Seccion
        id="antes"
        titulo={t('¿Qué pasó antes?')}
        bajada={t('Cuando anotás un dolor o un mal momento, Patty mira las horas anteriores: qué comiste, cómo dormiste, el clima, cuánto te moviste. Así es más fácil darte cuenta.')}
        telefono={<Telefono img="antes.webp" alt={t('Lo que pasó antes de un dolor de cabeza')} />}
      />

      <Seccion
        invertida
        id="acompana"
        titulo={t('Te acompaña, sin exigirte')}
        bajada={t('Patty no es un formulario: es un búho que nota cosas y te las cuenta.')}
        telefono={
          <>
            <Telefono img="semana.webp" alt={t('El resumen de la semana')} />
            <Telefono img="ciclo.webp" alt={t('Cómo te va en cada fase del ciclo')} chico />
          </>
        }
      >
        <ul className="pres-lista">
          <li>🦉 {t('Comentarios del día: «Llevás 4 días seguidos caminando, y se nota».')}</li>
          <li>📅 {t('El resumen de la semana, el domingo a la noche, comparado con la anterior.')}</li>
          <li>🎯 {t('Objetivos suaves para la semana que viene, y cómo te fue.')}</li>
          <li>🔔 {t('Un aviso cuando algo se sale de lo normal: varias noches durmiendo menos, una molestia que se repite.')}</li>
          <li>👨‍👩‍👧 {t('Y si querés, acompañar a alguien de tu familia y ver cómo anda.')}</li>
        </ul>
      </Seccion>

      <section ref={tiempoRef} className="pres-seccion pres-tiempo">
        <div className="pres-texto centro">
          <h2>{t('Cuanto más le contás, más te conoce')}</h2>
        </div>
        <ol className="pres-pasos">
          <li><strong>{t('Desde el primer día')}</strong>{t('Tu día ordenado en un lugar, y lo que llega solo del reloj y el teléfono.')}</li>
          <li><strong>{t('La primera semana')}</strong>{t('Patty empieza a comentarte lo que nota y te arma el resumen del domingo.')}</li>
          <li><strong>{t('A las dos semanas')}</strong>{t('Aparecen los primeros patrones: qué va con qué.')}</li>
          <li><strong>{t('Al mes')}</strong>{t('Patrones más firmes, y ya sabés qué te hace bien y qué no.')}</li>
        </ol>
      </section>

      <section ref={finalRef} className="pres-final">
        <Mascota cara="feliz" tamano={80} className="saluda" />
        <h2>{t('Descargala gratis para Android')}</h2>
        <div className="pres-botones">{entrar('final')}</div>
        <p className="suave chico">{t('Android te va a preguntar si dejás instalar una app que no viene del Play Store: es normal, decile que sí.')}</p>
        <FormBeta />
        <p className="suave chico"><a href="privacidad.html">{t('Privacidad')}</a> · {t('Las pantallas son de una persona de ejemplo.')}</p>
      </section>
    </div>
  );
}
