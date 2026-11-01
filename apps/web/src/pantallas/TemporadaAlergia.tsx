// En el Día, si la persona declaró una alergia estacional y es su temporada: Patty lo dice, pregunta si hoy molesta (se
// contesta con un toque) y ofrece un recordatorio que se prende a mano. Nada se activa solo y se puede callar por la temporada.
import { useEffect, useState } from 'react';
import {
  alergiasDeTemporada,
  claveDeTemporada,
  CUANTO,
  ESTACIONES,
  normalizar,
  PLANTILLA_TEMPORADA_ALERGIA,
  type Categoria,
  type Estacion,
  type Persona,
  type Registro,
} from 'shared';
import { api } from '../api';
import { useEstado } from '../estado';
import { medir } from '../lib/analytics';
import { anotarClima } from '../lib/clima';
import { t } from '../lib/idioma';
import { activarSeguimiento, traerSeguimientos } from '../lib/seguimientos';
import { Mascota } from '../mascota/Mascota';

const ALERGIA = 'Alergia';
const FRASES: Record<Estacion, string> = {
  primavera: 'Es primavera y me contaste que tenés alergia primaveral.',
  verano: 'Es verano y me contaste que tenés alergia de verano.',
  otono: 'Es otoño y me contaste que tenés alergia de otoño.',
  invierno: 'Es invierno y me contaste que tenés alergia de invierno.',
};

const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const guardar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: se vuelve a preguntar */
  }
};

export function TemporadaAlergia({ persona, hoy, registros, categorias, alAnotar }: {
  persona: Persona;
  hoy: string;
  registros: Registro[];
  categorias: Categoria[];
  alAnotar(): void;
}) {
  const { avisar, festejar } = useEstado();
  const zona = persona.zona_horaria;
  const [temporada] = alergiasDeTemporada(persona.alergias, hoy, zona);
  const claveCallada = `alergia-temporada-callada-${persona.id}-${claveDeTemporada(hoy, zona)}`;
  const claveContestada = `alergia-temporada-contestada-${persona.id}`;
  const [callada, setCallada] = useState(() => Boolean(leer(claveCallada)));
  const [contestada, setContestada] = useState(() => leer(claveContestada) === hoy);
  /** null: todavía no se sabe si el recordatorio ya está prendido. */
  const [conRecordatorio, setConRecordatorio] = useState<boolean | null>(null);
  const ya = registros.some((r) => normalizar(r.concepto) === normalizar(ALERGIA));
  const ver = Boolean(temporada) && !callada && !contestada && !ya;

  useEffect(() => {
    if (!ver) return;
    let vivo = true;
    traerSeguimientos(persona.id)
      .then((s) => vivo && setConRecordatorio(s.activos.some((x) => x.nombre === PLANTILLA_TEMPORADA_ALERGIA.nombre)))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ver, persona.id]);

  if (!ver) return null;

  const contestar = async (intensidad: number | null) => {
    const sintoma = categorias.find((c) => c.clave === 'sintoma');
    medir('alergia_temporada', { respuesta: intensidad ?? 0 });
    try {
      if (intensidad !== null && sintoma) {
        const inicio = new Date().toISOString();
        await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: ALERGIA, categoria_id: sintoma.id, inicio, intensidad });
        void anotarClima(persona.id, [inicio]);
        festejar(t('Gracias por contarme. Que se mejore pronto 💜'), 'espera');
        alAnotar();
      }
      guardar(claveContestada, hoy);
      setContestada(true);
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const prenderRecordatorio = async () => {
    try {
      await activarSeguimiento(persona.id, PLANTILLA_TEMPORADA_ALERGIA);
      medir('alergia_temporada_recordatorio');
      setConRecordatorio(true);
      avisar(t('Listo: te pregunto a la noche, por 30 días. Lo apagás en Seguimientos.'));
    } catch (e) {
      avisar((e as Error).message);
    }
  };
  const callar = () => {
    guardar(claveCallada, 'si');
    setCallada(true);
  };

  return (
    <div className="tarjeta comentario-patty temporada-alergia">
      <span className="emoji-comentario" aria-hidden="true"><Mascota cara="espera" tamano={40} /></span>
      <div className="cuerpo-comentario">
        <p><strong>{ESTACIONES[temporada.estacion!].icono} {t(FRASES[temporada.estacion!])}</strong></p>
        <p className="suave chico">{t('¿Hoy te pica algo, estornudás o te lloran los ojos?')}</p>
        <div className="botones-cuanto">
          <button className="btn chico" onClick={() => void contestar(null)}>{t('Nada')}</button>
          {CUANTO.map((c) => (
            <button key={c.nombre} className="btn chico" onClick={() => void contestar(c.intensidad)}>{t(c.nombre)}</button>
          ))}
        </div>
        <div className="mas-temporada">
          {conRecordatorio === false ? <button className="enlace chico" onClick={() => void prenderRecordatorio()}>{t('🔔 Recordame anotarlo a la noche')}</button> : null}
          <button className="enlace chico" onClick={callar}>{t('No me preguntes más esta temporada')}</button>
        </div>
      </div>
    </div>
  );
}
