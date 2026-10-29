// El video: cada escena con el búho, el título, una o dos pantallas de la app en un teléfono (con un zoom lento) y
// los subtítulos que van apareciendo palabra por palabra al ritmo de la voz. Horizontal para la home y vertical
// para redes: el mismo video, acomodado.
import { loadFont } from '@remotion/google-fonts/Nunito';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Loop,
} from 'remotion';
import { svgMascota } from '../../../apps/web/src/mascota/dibujo';
import { ESCENAS, FPS, duraciones, type Escena, type Pantalla } from './guion';

const { fontFamily } = loadFont('normal', { weights: ['600', '800', '900'] });

const VIOLETA = '#6b4fbb';
const TINTA = '#2a2440';
const FONDO = 'linear-gradient(160deg, #f6f1ff 0%, #ece4ff 45%, #ffe9dc 100%)';

export type Props = {
  /** Segundos de voz de cada escena (de public/voz/duraciones.json), o null si todavía no hay voz. */
  voz: Record<string, number> | null;
};

export function largoTotal(voz: Props['voz']): number {
  return Math.round(duraciones(voz).reduce((a, b) => a + b, 0) * FPS);
}

export function Historia({ voz }: Props) {
  const durs = duraciones(voz);
  let desde = 0;
  return (
    <AbsoluteFill style={{ background: FONDO, fontFamily, color: TINTA }}>
      <Burbujas />
      {ESCENAS.map((e, i) => {
        const largo = Math.round(durs[i] * FPS);
        const s = (
          <Sequence key={e.clave} from={desde} durationInFrames={largo} name={e.clave}>
            <EscenaVista escena={e} largo={largo} />
            {voz?.[e.clave] ? <Audio src={staticFile(`voz/${e.clave}.mp3`)} /> : null}
          </Sequence>
        );
        desde += largo;
        return s;
      })}
    </AbsoluteFill>
  );
}

/** Unos círculos suaves que se mueven lento en el fondo. */
function Burbujas() {
  const f = useCurrentFrame();
  const b = [
    { x: 12, y: 18, r: 220, c: '#d9ccff', v: 0.004 },
    { x: 82, y: 78, r: 280, c: '#ffd6bf', v: 0.003 },
    { x: 88, y: 14, r: 160, c: '#e7dcff', v: 0.005 },
  ];
  return (
    <AbsoluteFill>
      {b.map((x, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${x.x + Math.sin(f * x.v + i) * 3}%`,
            top: `${x.y + Math.cos(f * x.v + i) * 3}%`,
            width: x.r * 2,
            height: x.r * 2,
            marginLeft: -x.r,
            marginTop: -x.r,
            borderRadius: '50%',
            background: x.c,
            filter: 'blur(40px)',
            opacity: 0.7,
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

function EscenaVista({ escena, largo }: { escena: Escena; largo: number }) {
  const f = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const vertical = height > width;
  const entra = spring({ frame: f, fps, config: { damping: 16 } });
  const sale = interpolate(f, [largo - 10, largo], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sinPantallas = escena.pantallas.length === 0;
  const ancho = vertical ? width * 0.9 : width * 0.42;

  const texto = (
    <div style={{ width: sinPantallas ? width * 0.8 : ancho, textAlign: vertical || sinPantallas ? 'center' : 'left', display: 'flex', flexDirection: 'column', alignItems: vertical || sinPantallas ? 'center' : 'flex-start', gap: 28 }}>
      <Buho cara={escena.cara} tamano={sinPantallas ? 260 : 150} />
      {escena.titulo ? (
        <div style={{ fontSize: sinPantallas ? 96 : vertical ? 74 : 72, fontWeight: 900, lineHeight: 1.05, color: escena.clave === 'final' ? VIOLETA : TINTA, transform: `translateY(${(1 - entra) * 30}px)` }}>
          {escena.titulo}
        </div>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill style={{ opacity: Math.min(entra, sale) }}>
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: vertical || sinPantallas ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: vertical ? 50 : 90,
          padding: vertical ? '120px 60px 400px' : '50px 120px 210px',
        }}
      >
        {texto}
        {sinPantallas ? null : (
          <div style={{ display: 'flex', gap: 36, transform: `translateY(${(1 - entra) * 80}px)` }}>
            {escena.pantallas.map((p, i) => (
              <Telefono key={p.img} pantalla={p} alto={vertical ? (escena.pantallas.length > 1 ? 820 : 980) : 700} retraso={i * 6} largo={largo} />
            ))}
          </div>
        )}
      </AbsoluteFill>
      <Subtitulos texto={escena.texto} largo={largo} vertical={vertical} />
    </AbsoluteFill>
  );
}

function Buho({ cara, tamano }: { cara: Escena['cara']; tamano: number }) {
  const f = useCurrentFrame();
  const salto = Math.sin(f / 9) * 6;
  return (
    <div
      style={{ width: tamano, height: tamano, transform: `translateY(${salto}px)` }}
      dangerouslySetInnerHTML={{ __html: svgMascota(cara, { lado: tamano }) }}
    />
  );
}

/** Un teléfono con la pantalla de la app (el video corre en loop) y un zoom lento hacia adentro. */
function Telefono({ pantalla, alto, retraso, largo }: { pantalla: Pantalla; alto: number; retraso: number; largo: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f - retraso, fps, config: { damping: 14 } });
  const zoom = interpolate(f, [0, largo], [1, 1.06]);
  const ancho = alto * (390 / 844);
  return (
    <div
      style={{
        width: ancho,
        height: alto,
        boxSizing: 'content-box',
        border: '14px solid #1d1a26',
        borderRadius: 64,
        background: '#1d1a26',
        boxShadow: '0 40px 80px rgb(60 30 120 / 0.28)',
        transform: `scale(${0.9 + entra * 0.1 * zoom}) rotate(${(1 - entra) * 4}deg)`,
        opacity: entra,
      }}
    >
      <div style={{ width: ancho, height: alto, borderRadius: 50, overflow: 'hidden', background: '#fff' }}>
        {pantalla.video ? (
          <Loop durationInFrames={Math.round(5 * fps)}>
            <OffthreadVideo src={staticFile(`app/${pantalla.video}`)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Loop>
        ) : (
          <Img src={staticFile(`app/${pantalla.img}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        )}
      </div>
    </div>
  );
}

/** Los subtítulos: aparecen palabra por palabra, repartidas en el tiempo de la voz. */
function Subtitulos({ texto, largo, vertical }: { texto: string; largo: number; vertical: boolean }) {
  const f = useCurrentFrame();
  const palabras = texto.split(' ');
  const hablado = largo - 15;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: vertical ? 170 : 70 }}>
      <div
        style={{
          maxWidth: vertical ? '88%' : '74%',
          padding: '22px 36px',
          borderRadius: 32,
          background: 'rgb(255 255 255 / 0.82)',
          boxShadow: '0 12px 30px rgb(60 30 120 / 0.12)',
          fontSize: vertical ? 52 : 46,
          fontWeight: 800,
          lineHeight: 1.25,
          textAlign: 'center',
        }}
      >
        {palabras.map((p, i) => {
          const cuando = (i / palabras.length) * hablado;
          const o = interpolate(f, [cuando, cuando + 6], [0.18, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={i} style={{ opacity: o }}>
              {p}{' '}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
