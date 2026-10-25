// Guardar "cómo me siento" (o "cómo me sentí en el día") y los síntomas que vengan con eso, todo junto.
import { useEffect } from 'react';
import { COMO_ME_SENTI, COMO_ME_SIENTO, type Categoria, type EstadoAnimo, type Persona } from 'shared';
import { api } from '../api';
import { anotarClima } from './clima';
import { hoyEn, instanteDelDia } from './fechas';
import { t } from './idioma';

export type Momento = 'ahora' | 'dia';

export async function guardarSentir(o: {
  persona: Persona;
  categorias: Categoria[];
  momento: Momento;
  estado: EstadoAnimo;
  fecha: string;
  sintomas?: Array<{ nombre: string; intensidad: number }>;
  nota?: string;
}): Promise<void> {
  const animo = o.categorias.find((c) => c.clave === 'animo');
  const sintoma = o.categorias.find((c) => c.clave === 'sintoma');
  if (!animo || !sintoma) throw new Error(t('Faltan las categorías de ánimo y síntomas.'));
  // Hoy, a esta hora; si se contesta tarde la encuesta de otro día, a la noche de ese día.
  const inicio = o.fecha === hoyEn(o.persona.zona_horaria) ? new Date().toISOString() : instanteDelDia(o.fecha, '22:00', o.persona.zona_horaria);
  await api('POST', '/api/registros/varios', {
    registros: [
      {
        persona_id: o.persona.id,
        concepto_nombre: o.momento === 'dia' ? COMO_ME_SENTI : COMO_ME_SIENTO,
        categoria_id: animo.id,
        inicio,
        intensidad: o.estado.intensidad,
        nota: o.nota?.trim() || null,
      },
      ...(o.sintomas ?? []).map((s) => ({ persona_id: o.persona.id, concepto_nombre: s.nombre, categoria_id: sintoma.id, inicio, intensidad: s.intensidad })),
    ],
  });
  void anotarClima(o.persona.id, [inicio]);
}

const EVENTO = 'patty-sentir';
/** Abrir "¿Cómo te sentís?" desde cualquier lado (tocando la mascota de arriba). */
export const pedirSentir = () => window.dispatchEvent(new Event(EVENTO));
export function useAlPedirSentir(abrir: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, [abrir]);
}
