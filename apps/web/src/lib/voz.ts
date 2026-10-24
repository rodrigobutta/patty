// Dictar en vez de escribir. Si el servidor transcribe (OpenAI, `sesion.voz`), Patty graba el audio y lo manda: anda en
// cualquier teléfono sin instalar nada. Si no, usa el reconocedor del teléfono (plugin de Capgo) o el del navegador
// (Web Speech), con el texto apareciendo mientras se habla. Se escucha hasta que la persona toca de nuevo el micrófono.
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { API_BASE } from '../api';
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

const puedeGrabar = () => typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** `servidor`: si el servidor transcribe audio (ver `Sesion.voz`). */
export const hayVoz = (servidor = false): boolean => (servidor && puedeGrabar()) || esNativa() || reconocimientoWeb() !== null;

/** Graba hasta que se pide parar y manda el audio al servidor para pasarlo a texto. */
async function grabar(alTexto: (t: string) => void, alTerminar: (error?: string) => void, alTranscribir: () => void): Promise<Escucha> {
  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alTerminar('Patty no tiene permiso para usar el micrófono: habilitalo en los ajustes del teléfono.');
    return { parar: () => {} };
  }
  const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
  const grabador = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
  const partes: Blob[] = [];
  grabador.ondataavailable = (e) => e.data.size && partes.push(e.data);
  grabador.onstop = async () => {
    flujo.getTracks().forEach((t) => t.stop());
    const audio = new Blob(partes, { type: grabador.mimeType || tipo || 'audio/webm' });
    if (!audio.size) return alTerminar('No se grabó nada.');
    alTranscribir();
    try {
      const r = await fetch(`${API_BASE}/api/voz`, { method: 'POST', headers: { 'Content-Type': audio.type }, body: audio, credentials: 'same-origin' });
      const d = (await r.json().catch(() => null)) as { texto?: string; error?: string } | null;
      if (!r.ok) return alTerminar(d?.error ?? 'No se pudo pasar el audio a texto.');
      if (!d?.texto) return alTerminar('No se entendió nada. Probá de nuevo, más cerca del micrófono.');
      alTexto(d.texto);
      alTerminar();
    } catch {
      alTerminar('No hay conexión para pasar el audio a texto.');
    }
  };
  grabador.start(1000); // de a un segundo: algunos WebView no entregan nada si se pide todo junto al final
  return { parar: () => grabador.state !== 'inactive' && grabador.stop() };
}

export interface Escucha {
  parar(): void;
}

/**
 * Empieza a escuchar. `alTexto` recibe el texto dictado hasta ahora (se reemplaza, no se suma); `alTerminar` se llama
 * una vez, cuando se deja de escuchar (con el error si lo hubo).
 */
export async function escuchar(
  alTexto: (t: string) => void,
  alTerminar: (error?: string) => void,
  opciones: { servidor?: boolean; alTranscribir?: () => void } = {},
): Promise<Escucha> {
  if (opciones.servidor && puedeGrabar()) return grabar(alTexto, alTerminar, opciones.alTranscribir ?? (() => {}));
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
