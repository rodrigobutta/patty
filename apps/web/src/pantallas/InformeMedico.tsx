// El informe para llevar al médico: se elige el período y Patty arma un PDF (en la API) con los malestares, los
// remedios, el sueño, el ánimo, el ciclo y los patrones. Se abre con un enlace que dura unos minutos (ver lib/afuera.ts:
// en la app de Android, en el navegador del teléfono, donde se puede guardar y compartir).
import { useState } from 'react';
import type { Persona } from 'shared';
import { api, API_BASE } from '../api';
import { abrirAfuera, pestanaPrevia, type Abierto } from '../lib/afuera';
import { medir } from '../lib/analytics';
import { t } from '../lib/idioma';

const PERIODOS = [
  { dias: 7, nombre: 'Última semana' },
  { dias: 30, nombre: 'Último mes' },
  { dias: 90, nombre: 'Últimos 3 meses' },
] as const;

export function InformeMedico({ persona }: { persona: Persona }) {
  const [dias, setDias] = useState<number>(30);
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<{ como: Abierto; url: string } | null>(null);

  const armar = async () => {
    setError('');
    setResultado(null);
    const pestana = pestanaPrevia();
    setArmando(true);
    try {
      const r = await api<{ url: string }>('POST', '/api/informe/enlace', { persona_id: persona.id, dias });
      const url = `${API_BASE || location.origin}${r.url}`;
      const como = await abrirAfuera(url, pestana);
      setResultado({ como, url });
      medir('informe_medico', { dias, como });
    } catch (e) {
      pestana?.close();
      setError((e as Error).message);
    } finally {
      setArmando(false);
    }
  };

  return (
    <div className="tarjeta informe-medico">
      <p>{t('Un PDF prolijo con lo que anotaste, para llevar a la consulta: malestares y dolores (cuántas veces, qué tan fuertes y cuánto duraron), remedios y para qué los tomaste, sueño, ánimo, el ciclo si lo anotás y lo que encontró Patty.')}</p>
      <div className="segmentos ancho" role="group" aria-label={t('Período del informe')}>
        {PERIODOS.map((p) => (
          <button key={p.dias} className={dias === p.dias ? 'activa' : ''} onClick={() => setDias(p.dias)}>{t(p.nombre)}</button>
        ))}
      </div>
      <button className="btn primario ancho" onClick={armar} disabled={armando}>
        {armando ? t('Armando el PDF…') : t('📄 Armar el PDF')}
      </button>
      {error ? <p className="error">{error}</p> : null}
      {resultado?.como === 'abierto' ? <p className="suave chico">{t('Listo: se abrió el PDF. Desde ahí lo podés guardar o compartir.')}</p> : null}
      {resultado && resultado.como !== 'abierto' ? (
        <div className="nota-ia">
          <p>
            {resultado.como === 'copiado'
              ? t('Copié el enlace: pegalo en el navegador del teléfono para abrir el PDF. Con la versión nueva de la app se abre solo.')
              : t('Abrí este enlace en el navegador del teléfono para ver el PDF:')}
          </p>
          <code className="token">{resultado.url}</code>
        </div>
      ) : null}
      <p className="suave chico">{t('El enlace sirve por 15 minutos. Patty no diagnostica: el informe resume lo que anotaste para ayudarte a contarlo.')}</p>
    </div>
  );
}
