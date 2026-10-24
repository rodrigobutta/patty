// Dictar en vez de escribir: en la app nativa con el reconocimiento de voz del teléfono (plugin de Capgo), en el
// navegador con el de Chrome (Web Speech). Se escucha hasta que la persona toca de nuevo el micrófono o se calla;
// mientras habla, el texto va apareciendo.
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { esNativa } from './nativo';

const IDIOMA = 'es-AR';
const SIN_RECONOCEDOR =
  'No llegó nada del micrófono. Si pasa siempre, al teléfono le falta el reconocimiento de voz de Google: instalá «Servicios de voz de Google» (Speech Services by Google) desde Play Store y probá de nuevo. Mientras tanto podés usar el micrófono del teclado.';

interface ReconocimientoWeb {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function reconocimientoWeb(): (new () => ReconocimientoWeb) | null {
  const w = window as unknown as { SpeechRecognition?: new () => ReconocimientoWeb; webkitSpeechRecognition?: new () => ReconocimientoWeb };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const hayVoz = (): boolean => esNativa() || reconocimientoWeb() !== null;

export interface Escucha {
  parar(): void;
}

/**
 * Empieza a escuchar. `alTexto` recibe el texto dictado hasta ahora (se reemplaza, no se suma); `alTerminar` se llama
 * una vez, cuando se deja de escuchar (con el error si lo hubo).
 */
export async function escuchar(alTexto: (t: string) => void, alTerminar: (error?: string) => void): Promise<Escucha> {
  if (esNativa()) {
    const p = await SpeechRecognition.requestPermissions();
    if (p.speechRecognition !== 'granted') {
      alTerminar('Patty no tiene permiso para usar el micrófono: habilitalo en los ajustes del teléfono.');
      return { parar: () => {} };
    }
    let terminado = false;
    let algo = false;
    const fin = (error?: string) => {
      if (terminado) return;
      terminado = true;
      void parcial.then((h) => h.remove());
      void estado.then((h) => h.remove());
      void fallo.then((h) => h.remove());
      // Si se cortó sin que llegara nada, casi siempre es que el teléfono no tiene un reconocedor de voz que ande
      // (pasa en teléfonos sin los servicios de voz de Google: el que queda por defecto no transcribe).
      alTerminar(error ?? (algo ? undefined : SIN_RECONOCEDOR));
    };
    const parcial = SpeechRecognition.addListener('partialResults', (e) => {
      const t = e.accumulatedText ?? e.matches?.[0];
      if (t) {
        algo = true;
        alTexto(t);
      }
    });
    const estado = SpeechRecognition.addListener('listeningState', (e) => {
      if (e.state === 'stopped') fin();
    });
    const fallo = SpeechRecognition.addListener('error', () => fin('No se entendió. Probá de nuevo, más cerca del micrófono.'));
    await SpeechRecognition.start({ language: IDIOMA, partialResults: true, popup: false }).catch((e: Error) => fin(e.message));
    return { parar: () => void SpeechRecognition.stop().catch(() => fin()) };
  }

  const Clase = reconocimientoWeb();
  if (!Clase) {
    alTerminar('Este navegador no deja dictar.');
    return { parar: () => {} };
  }
  const r = new Clase();
  r.lang = IDIOMA;
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    alTexto(t.trim());
  };
  let error: string | undefined;
  r.onerror = (e) => {
    error = e.error === 'not-allowed' ? 'El navegador no dio permiso para el micrófono.' : e.error === 'no-speech' ? undefined : 'No se pudo dictar.';
  };
  r.onend = () => alTerminar(error);
  r.start();
  return { parar: () => r.stop() };
}
