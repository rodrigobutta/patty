// Conexión con Claude (la misma cuenta de Anthropic que usa Quincho: ANTHROPIC_API_KEY y ANTHROPIC_WORKSPACE_ID).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { ErrorApi } from '../lib/errores.js';

export const MODELO_IA = 'claude-opus-5-5';

export const iaDisponible = (): boolean => Boolean(config.anthropicApiKey);

let clientePrueba: Anthropic | null = null;
/** Para las pruebas: un cliente falso. */
export const usarClientePrueba = (c: Anthropic | null) => {
  clientePrueba = c;
};
/** Si se le puede pedir algo a la IA (la de verdad o la de las pruebas). */
export const hayIa = (): boolean => iaDisponible() || clientePrueba !== null;

function cliente(): Anthropic {
  if (clientePrueba) return clientePrueba;
  const ws = config.anthropicWorkspaceId;
  return new Anthropic({ apiKey: config.anthropicApiKey, defaultHeaders: ws ? { 'anthropic-workspace-id': ws } : undefined });
}

/**
 * Le pide a Claude una respuesta JSON que cumple `esquema` y la devuelve ya leída.
 * Si el modelo declina, el servidor de Anthropic reintenta con el modelo recomendado (fallbacks).
 */
export async function pedirJson<T>(opciones: {
  sistema: string;
  texto: string;
  esquema: Record<string, unknown>;
  esfuerzo: 'low' | 'medium' | 'high';
  maxTokens?: number;
  /** Fotos que acompañan el texto (por ejemplo, un plato de comida), en base64. */
  imagenes?: Array<{ tipo: 'image/jpeg' | 'image/png' | 'image/webp'; datos: string }>;
}): Promise<T> {
  if (!iaDisponible() && !clientePrueba) throw new ErrorApi('La IA no está configurada en este servidor (falta ANTHROPIC_API_KEY).', 503);
  const pedido = {
    model: MODELO_IA,
    max_tokens: opciones.maxTokens ?? 16000,
    system: opciones.sistema,
    output_config: { effort: opciones.esfuerzo, format: { type: 'json_schema' as const, schema: opciones.esquema } },
    messages: [
      {
        role: 'user' as const,
        content: opciones.imagenes?.length
          ? [
              ...opciones.imagenes.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.tipo, data: i.datos } })),
              { type: 'text' as const, text: opciones.texto },
            ]
          : opciones.texto,
      },
    ],
  };
  let resp: Anthropic.Message;
  try {
    try {
      resp = (await cliente().beta.messages.create({
        ...pedido,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)) as unknown as Anthropic.Message;
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      // cuenta sin "fallbacks": sin reintento automático
      resp = await cliente().messages.create(pedido as unknown as Anthropic.MessageCreateParamsNonStreaming);
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ErrorApi('La IA está saturada en este momento. Probá de nuevo en un rato.', 503);
    if (e instanceof Anthropic.APIConnectionError) throw new ErrorApi('No se pudo conectar con la IA.', 502);
    if (e instanceof Anthropic.APIError) {
      console.error('IA: error de la API:', e.status, e.message);
      throw new ErrorApi('La IA respondió con un error ({estado}).', 502, { estado: e.status });
    }
    throw e;
  }
  if (resp.stop_reason === 'refusal') throw new ErrorApi('La IA no quiso responder este pedido.', 502);
  if (resp.stop_reason === 'max_tokens') throw new ErrorApi('La respuesta de la IA quedó cortada. Probá con menos datos.', 502);
  const t = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  try {
    return JSON.parse(t) as T;
  } catch {
    throw new ErrorApi('La IA devolvió una respuesta que no se pudo leer.', 502);
  }
}
