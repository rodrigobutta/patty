import { Composition, staticFile } from 'remotion';
import { FPS } from './guion';
import { Historia, largoTotal, type Props } from './Historia';

/** La duración de la voz de cada escena, si ya se generó (si no, null y se usa lo que lleva leerla). */
async function leerVoz(): Promise<Props['voz']> {
  try {
    const r = await fetch(staticFile('voz/duraciones.json'));
    return r.ok ? ((await r.json()) as Record<string, number>) : null;
  } catch {
    return null;
  }
}

/** Si hay música de fondo (public/voz/musica.mp3, ver voz.mjs). */
async function hayMusica(): Promise<boolean> {
  try {
    return (await fetch(staticFile('voz/musica.mp3'), { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
}

const calcular = async ({ props }: { props: Props }) => {
  const voz = props.voz ?? (await leerVoz());
  return { durationInFrames: largoTotal(voz), props: { voz, musica: props.musica ?? (await hayMusica()) } };
};

export function Raiz() {
  return (
    <>
      <Composition id="Historia" component={Historia} fps={FPS} width={1920} height={1080} durationInFrames={FPS * 40} defaultProps={{ voz: null }} calculateMetadata={calcular} />
      <Composition id="HistoriaVertical" component={Historia} fps={FPS} width={1080} height={1920} durationInFrames={FPS * 40} defaultProps={{ voz: null }} calculateMetadata={calcular} />
    </>
  );
}
