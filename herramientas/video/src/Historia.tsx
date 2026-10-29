// El video: cada escena con el búho, un título que entra palabra por palabra, una o dos pantallas de la app en un
// teléfono (que entra girando y flota), globitos que van apareciendo con lo que anota o junta Patty, y los subtítulos
// al ritmo de la voz. Entre escena y escena, una transición (deslizar o barrido). Horizontal para la home y vertical
// para redes: el mismo video, acomodado.
import { loadFont } from '@remotion/google-fonts/Nunito';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { fade } from '@remotion/transitions/fade';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import { svgMascota } from '../../../apps/web/src/mascota/dibujo';
import { ESCENAS, FPS, TRANSICION, duraciones, type Escena, type Pantalla, type Ritmo } from './guion';
import { ESCENAS_CORTA, RITMO_CORTA } from './guion-corta';
import { ESCENAS_MARTIN } from './guion-martin';

const { fontFamily } = loadFont('normal', { weights: ['600', '800', '900'] });

const VIOLETA = '#6b4fbb';
const TINTA = '#2a2440';
const FONDO = 'linear-gradient(160deg, #f6f1ff 0%, #ece4ff 45%, #ffe9dc 100%)';
const COLORES = ['#8f78d6', '#f2a33a', '#e58bb4', '#4fb38a'];
/** Las pantallas grabadas son de 1170 x 2532 (un iPhone a 3x). */
const PROPORCION = 1170 / 2532;

/** Las historias: cada una con sus escenas y la carpeta de su voz (en public). */
export const HISTORIAS = {
  sofia: { escenas: ESCENAS, voz: 'voz' },
  /** La misma de Sofía con otra voz, para comparar. */
  sofia2: { escenas: ESCENAS, voz: 'voz/sofia2' },
  martin: { escenas: ESCENAS_MARTIN, voz: 'voz/martin' },
  /** La corta para TikTok, con otra voz y más rápida. */
  corta: { escenas: ESCENAS_CORTA, voz: 'voz/corta', ritmo: RITMO_CORTA },
} as const satisfies Record<string, { escenas: Escena[]; voz: string; ritmo?: Ritmo }>;
export type NombreHistoria = keyof typeof HISTORIAS;

export type Props = {
  historia?: NombreHistoria;
  /** Segundos de voz de cada escena (de public/voz/duraciones.json), o null si todavía no hay voz. */
  voz: Record<string, number> | null;
  /** Si hay música de fondo (public/voz/musica.mp3). */
  musica?: boolean;
};

export function largoTotal(voz: Props['voz'], historia: NombreHistoria = 'sofia'): number {
  const h: { escenas: Escena[]; ritmo?: Ritmo } = HISTORIAS[historia];
  const total = duraciones(voz, h.escenas, h.ritmo).reduce((a, b) => a + Math.round(b * FPS), 0);
  return total - TRANSICION * (h.escenas.length - 1);
}

const TRANSICIONES = [
  () => slide({ direction: 'from-right' }),
  () => wipe({ direction: 'from-left' }),
  () => slide({ direction: 'from-bottom' }),
  () => fade(),
];

export function Historia({ voz, musica, historia = 'sofia' }: Props) {
  const { escenas: ESCENAS, voz: carpeta, ritmo }: { escenas: Escena[]; voz: string; ritmo?: Ritmo } = HISTORIAS[historia];
  const durs = duraciones(voz, ESCENAS, ritmo);
  const total = largoTotal(voz, historia);
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: FONDO, fontFamily, color: TINTA }}>
      <Burbujas />
      <TransitionSeries>
        {ESCENAS.flatMap((e, i) => {
          const largo = Math.round(durs[i] * FPS);
          const partes = [
            <TransitionSeries.Sequence key={e.clave} durationInFrames={largo} name={e.clave}>
              <EscenaVista escena={e} largo={largo} />
              {voz?.[e.clave] ? <Audio src={staticFile(`${carpeta}/${e.clave}.mp3`)} /> : null}
            </TransitionSeries.Sequence>,
          ];
          if (i < ESCENAS.length - 1) {
            partes.push(
              <TransitionSeries.Transition
                key={`t-${e.clave}`}
                presentation={TRANSICIONES[i % TRANSICIONES.length]() as never}
                timing={linearTiming({ durationInFrames: TRANSICION, easing: Easing.inOut(Easing.cubic) })}
              />,
            );
          }
          return partes;
        })}
      </TransitionSeries>
      {musica ? (
        <Audio
          src={staticFile('voz/musica.mp3')}
          volume={(x) => interpolate(x, [0, fps, total - fps * 2, total], [0, 0.13, 0.13, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      ) : null}
      {/* Un brillo que cruza al final, sobre la marca. */}
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: interpolate(f, [total - 40, total - 25, total - 10], [0, 0.35, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), background: 'radial-gradient(circle at 50% 45%, #fff 0%, transparent 55%)' }} />
    </AbsoluteFill>
  );
}

/** Unos círculos suaves que se mueven lento en el fondo. */
function Burbujas() {
  const f = useCurrentFrame();
  const b = [
    { x: 12, y: 18, r: 220, c: '#d9ccff', v: 0.012 },
    { x: 82, y: 78, r: 280, c: '#ffd6bf', v: 0.009 },
    { x: 88, y: 14, r: 160, c: '#e7dcff', v: 0.015 },
    { x: 30, y: 85, r: 180, c: '#ffe4f0', v: 0.011 },
  ];
  return (
    <AbsoluteFill>
      {b.map((x, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${x.x + Math.sin(f * x.v + i) * 5}%`,
            top: `${x.y + Math.cos(f * x.v + i * 2) * 5}%`,
            width: x.r * 2,
            height: x.r * 2,
            marginLeft: -x.r,
            marginTop: -x.r,
            borderRadius: '50%',
            background: x.c,
            filter: 'blur(40px)',
            opacity: 0.75,
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

function EscenaVista({ escena, largo }: { escena: Escena; largo: number }) {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const sinPantallas = escena.pantallas.length === 0;
  const dos = escena.pantallas.length > 1;
  const altoTel = vertical ? (dos ? 800 : 960) : dos ? 700 : 760;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: vertical || sinPantallas ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: vertical ? 40 : 100,
          padding: vertical ? '110px 50px 380px' : '40px 110px 200px',
        }}
      >
        <div
          style={{
            width: sinPantallas ? width * 0.8 : vertical ? width * 0.9 : width * 0.38,
            display: 'flex',
            flexDirection: 'column',
            alignItems: vertical || sinPantallas ? 'center' : 'flex-start',
            textAlign: vertical || sinPantallas ? 'center' : 'left',
            gap: 22,
          }}
        >
          <Buho cara={escena.cara} tamano={sinPantallas ? 280 : vertical ? 130 : 150} />
          <Titulo texto={escena.titulo} grande={sinPantallas} vertical={vertical} final={escena.clave === 'final'} />
          {(sinPantallas || escena.globitosAlTitulo) && escena.globitos ? <Globitos lista={escena.globitos} largo={largo} enFila alIzquierda={!sinPantallas && !vertical} /> : null}
        </div>
        {sinPantallas ? null : (
          <div style={{ position: 'relative', display: 'flex', gap: 40 }}>
            {escena.pantallas.map((p, i) => (
              <Telefono key={i} pantalla={p} alto={altoTel} retraso={i * 8} largo={largo} zoom={escena.zoom} />
            ))}
            {escena.globitos && !escena.globitosAlTitulo ? <Globitos lista={escena.globitos} largo={largo} desde={Math.round((escena.globitosDesde ?? 0) * FPS)} hasta={escena.globitosHasta ? Math.round(escena.globitosHasta * FPS) : undefined} /> : null}
          </div>
        )}
      </AbsoluteFill>
      <Subtitulos texto={escena.texto} largo={largo} vertical={vertical} />
    </AbsoluteFill>
  );
}

/** El título: cada palabra entra con un saltito, una atrás de la otra. */
function Titulo({ texto, grande, vertical, final }: { texto: string; grande: boolean; vertical: boolean; final: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontSize: grande ? 108 : vertical ? 80 : 88, fontWeight: 900, lineHeight: 1.04, color: final ? VIOLETA : TINTA, letterSpacing: -1 }}>
      {texto.split(' ').map((p, i) => {
        const s = spring({ frame: f - 6 - i * 4, fps, config: { damping: 11, stiffness: 140 } });
        return (
          <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - s) * 50}px) scale(${0.7 + s * 0.3})`, opacity: s, marginRight: '0.25em' }}>
            {p}
          </span>
        );
      })}
    </div>
  );
}

function Buho({ cara, tamano }: { cara: Escena['cara']; tamano: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f, fps, config: { damping: 9, stiffness: 120 } });
  const salto = Math.sin(f / 7) * 7;
  const gira = Math.sin(f / 13) * 5;
  return (
    <div
      style={{ width: tamano, height: tamano, transform: `translateY(${salto}px) rotate(${gira}deg) scale(${entra})` }}
      dangerouslySetInnerHTML={{ __html: svgMascota(cara, { lado: tamano }) }}
    />
  );
}

/**
 * Un teléfono con una pantalla de la app: entra girando de costado, flota un poco y, si la escena lo pide, la cámara
 * se acerca a una parte de la pantalla a la mitad.
 */
function Telefono({ pantalla, alto, retraso, largo, zoom }: { pantalla: Pantalla; alto: number; retraso: number; largo: number; zoom?: Escena['zoom'] }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f - retraso, fps, config: { damping: 13, stiffness: 90 } });
  const flota = Math.sin((f + retraso * 3) / 18) * 8;
  const ancho = alto * PROPORCION;
  const z = zoom ? interpolate(f, [largo * 0.35, largo * 0.55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) }) : 0;
  const escala = 1 + z * ((zoom?.escala ?? 1) - 1);
  const borde = 16;
  const radio = 58;
  return (
    <div
      style={{
        width: ancho + borde * 2,
        height: alto + borde * 2,
        padding: borde,
        boxSizing: 'border-box',
        borderRadius: radio + borde,
        background: 'linear-gradient(145deg, #2c2838, #15131c)',
        boxShadow: '0 50px 90px rgb(60 30 120 / 0.32), inset 0 0 0 2px #4a4560',
        transform: `perspective(1600px) rotateY(${(1 - entra) * -38}deg) rotateZ(${(1 - entra) * 6}deg) translateY(${flota + (1 - entra) * 120}px) scale(${0.85 + entra * 0.15})`,
        opacity: Math.min(1, entra * 1.6),
      }}
    >
      {/* clip-path recorta también el video (overflow con border-radius no siempre lo hace). */}
      <div style={{ width: ancho, height: alto, clipPath: `inset(0 round ${radio}px)`, background: '#f4f1fb', position: 'relative' }}>
        <div style={{ width: '100%', height: '100%', transform: `scale(${escala})`, transformOrigin: `${(zoom?.x ?? 0.5) * 100}% ${(zoom?.y ?? 0.5) * 100}%` }}>
          {pantalla.video ? (
            <OffthreadVideo src={staticFile(`tomas/${pantalla.video}`)} startFrom={Math.round((pantalla.desde ?? 0) * fps)} playbackRate={pantalla.velocidad ?? 1} muted style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
          ) : (
            <Img src={staticFile(`tomas/${pantalla.img}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Globitos que aparecen de a uno (alrededor del teléfono, o en fila debajo del título). */
function Globitos({ lista, largo, enFila = false, alIzquierda = false, desde = 0, hasta }: { lista: string[]; largo: number; enFila?: boolean; alIzquierda?: boolean; desde?: number; hasta?: number }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const vertical = height > width;
  // Sobre el teléfono, corridos a un lado y al otro del centro (así no tapan el título), de arriba hacia abajo.
  const lugares = [
    { x: -0.18, top: 0.14 },
    { x: 0.2, top: 0.36 },
    { x: -0.16, top: 0.58 },
    { x: 0.18, top: 0.8 },
  ];
  // Con un final marcado, salen enseguida uno atrás del otro; si no, repartidos en la escena.
  const tramo = hasta ? 9 : ((largo - desde) * 0.7) / lista.length;
  const sale = hasta ? interpolate(f, [hasta - 6, hasta], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return (
    <div style={enFila ? { display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: alIzquierda ? 'flex-start' : 'center', marginTop: 20 } : { position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {lista.map((g, i) => {
        const s = spring({ frame: f - 14 - desde - i * tramo, fps, config: { damping: 10, stiffness: 160 } });
        const lugar = lugares[i % lugares.length];
        const meneo = Math.sin((f + i * 20) / 15) * 5;
        const estilo = enFila
          ? { transform: `scale(${s}) translateY(${meneo}px)` }
          : { position: 'absolute' as const, left: `${50 + lugar.x * 100}%`, top: `${lugar.top * 100}%`, transform: `translate(-50%, ${meneo}px) scale(${s})` };
        return (
          <div
            key={g}
            style={{
              ...estilo,
              opacity: Math.min(1, s * 1.5) * sale,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              whiteSpace: 'nowrap',
              padding: vertical ? '16px 26px' : '18px 30px',
              borderRadius: 999,
              background: '#fff',
              boxShadow: '0 16px 36px rgb(60 30 120 / 0.18)',
              fontSize: vertical ? 34 : 38,
              fontWeight: 800,
              color: TINTA,
            }}
          >
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: COLORES[i % COLORES.length], flex: 'none' }} />
            {g}
          </div>
        );
      })}
    </div>
  );
}

/** Los subtítulos: aparecen palabra por palabra, repartidas en el tiempo de la voz. */
function Subtitulos({ texto, largo, vertical }: { texto: string; largo: number; vertical: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palabras = texto.split(' ');
  const hablado = largo - TRANSICION - 10;
  const entra = spring({ frame: f - 4, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: vertical ? 160 : 60 }}>
      <div
        style={{
          maxWidth: vertical ? '90%' : '76%',
          padding: '20px 36px',
          borderRadius: 32,
          background: 'rgb(255 255 255 / 0.88)',
          boxShadow: '0 12px 30px rgb(60 30 120 / 0.14)',
          fontSize: vertical ? 50 : 44,
          fontWeight: 800,
          lineHeight: 1.25,
          textAlign: 'center',
          transform: `translateY(${(1 - entra) * 40}px)`,
          opacity: entra,
        }}
      >
        {palabras.map((p, i) => {
          const cuando = (i / palabras.length) * hablado;
          const o = interpolate(f, [cuando, cuando + 5], [0.2, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const pop = interpolate(f, [cuando, cuando + 4, cuando + 9], [1, 1.12, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={i} style={{ display: 'inline-block', opacity: o, transform: `scale(${pop})`, marginRight: '0.24em', color: o > 0.99 && f < cuando + 12 ? VIOLETA : TINTA }}>
              {p}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
