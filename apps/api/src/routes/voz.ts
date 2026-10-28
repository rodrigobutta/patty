// Pasar a texto lo que se dicta: el teléfono graba y manda el audio, y acá se transcribe con OpenAI. Así anda en
// cualquier teléfono, sin depender de que tenga instalado un reconocedor de voz (ni de Google ni de nadie).
//   POST /api/voz   el audio crudo en el cuerpo (Content-Type audio/webm, audio/mp4…)  →  { texto }
import { anotarUso, controlarLimite } from '../lib/usoIa.js';
import { Hono } from 'hono';
import { config } from '../config.js';
import { ErrorApi } from '../lib/errores.js';
import type { Env } from '../lib/http.js';

/** El modelo de transcripción de OpenAI (unos US$ 0,006 por minuto). */
export const MODELO_VOZ = 'gpt-4o-transcribe';
/** Unos 5 minutos de audio comprimido: alcanza de sobra para contar el día. */
const MAXIMO_BYTES = 8 * 1024 * 1024;

export const vozDisponible = (): boolean => Boolean(config.openaiApiKey);

const EXTENSIONES: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a' };

export const rutasVoz = new Hono<Env>().post('/', async (c) => {
  if (!vozDisponible()) throw new ErrorApi('Dictar no está configurado en este servidor (falta OPENAI_API_KEY).', 503);
  const tipo = (c.req.header('Content-Type') ?? '').split(';')[0].trim();
  const extension = EXTENSIONES[tipo];
  if (!extension) throw new ErrorApi('Formato de audio no soportado.', 415);
  const audio = await c.req.arrayBuffer();
  if (!audio.byteLength) throw new ErrorApi('No llegó audio.');
  if (audio.byteLength > MAXIMO_BYTES) throw new ErrorApi('El audio es muy largo: probá de a partes.', 413);
  await controlarLimite(c.var.db, c.var.usuario, 'voz');
  // Pasar audio a texto es de OpenAI (no del cliente de la IA): se anota acá (en segundos de audio, aproximados).
  void anotarUso(Math.round(audio.byteLength / 16000), 0, 'voz');

  const datos = new FormData();
  datos.append('file', new Blob([audio], { type: tipo }), `dictado.${extension}`);
  datos.append('model', MODELO_VOZ);
  const ingles = c.var.idioma === 'en';
  datos.append('language', ingles ? 'en' : 'es');
  // Ayuda a que escriba bien las cosas típicas de lo que se anota.
  datos.append(
    'prompt',
    ingles
      ? 'Someone describes their day: meals, times, aches and pains, mood, activities.'
      : 'Alguien cuenta su día en castellano rioplatense: comidas, horarios, dolores, ánimo, actividades.',
  );
  let r: Response;
  try {
    r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
      body: datos,
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    console.error('Voz: no se pudo conectar:', e);
    throw new ErrorApi('No se pudo pasar el audio a texto. Probá de nuevo.', 502);
  }
  if (!r.ok) {
    const detalle = (await r.text()).slice(0, 500);
    console.error('Voz: OpenAI respondió', r.status, detalle);
    if (detalle.includes('insufficient_quota')) throw new ErrorApi('El servicio para pasar audio a texto se quedó sin saldo: hay que cargar crédito en OpenAI.', 503);
    if (r.status === 429) throw new ErrorApi('El servicio para pasar audio a texto está saturado. Probá de nuevo en un rato.', 503);
    throw new ErrorApi('No se pudo pasar el audio a texto ({estado}).', 502, { estado: r.status });
  }
  const { text } = (await r.json()) as { text?: string };
  // Con un audio en silencio, el modelo a veces "transcribe" la ayuda que se le pasó: eso no lo dijo nadie.
  const texto = (text ?? '').trim();
  const sinSignos = (x: string) => x.toLowerCase().replace(/[^a-záéíóúñü ]/g, '').trim();
  const ayuda = ['Someone describes their day', 'Alguien cuenta su día'].map(sinSignos);
  return c.json({ texto: ayuda.some((a) => sinSignos(texto).startsWith(a)) ? '' : texto });
});
