// Admin → Beta: los pedidos de invitación que llegan desde la página de presentación (nombre, mail y por qué les
// interesa), para invitarlos de a poco. Se marcan como invitados o descartados; el mail se copia con un toque.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { locale, t } from '../lib/idioma';

interface Solicitud {
  id: number;
  nombre: string;
  email: string;
  motivo: string | null;
  estado: 'nueva' | 'invitada' | 'descartada';
  idioma: string | null;
  creado: string;
}

const ESTADOS: Array<{ clave: Solicitud['estado']; nombre: string }> = [
  { clave: 'nueva', nombre: 'Nueva' },
  { clave: 'invitada', nombre: 'Invitada' },
  { clave: 'descartada', nombre: 'Descartada' },
];

export function AdminBeta() {
  const { avisar } = useEstado();
  const [l, setL] = useState<Solicitud[] | null>(null);
  const traer = () => api<Solicitud[]>('GET', '/api/admin/beta').then(setL).catch((e) => avisar((e as Error).message));
  useEffect(() => void traer(), []);
  const cambiar = async (s: Solicitud, estado: Solicitud['estado']) => {
    await api('PUT', `/api/admin/beta/${s.id}`, { estado });
    void traer();
  };
  const copiar = (email: string) => void navigator.clipboard?.writeText(email).then(() => avisar(t('Mail copiado')));
  if (!l) return <p className="suave">{t('Cargando…')}</p>;
  const nuevas = l.filter((s) => s.estado === 'nueva').length;
  return (
    <div className="tarjeta">
      <h3>{t('🧪 Pedidos para la beta')}</h3>
      <p className="suave chico">{t('{n} sin responder de {total}. Llegan desde la página de presentación.', { n: nuevas, total: l.length })}</p>
      {l.length ? (
        <ul className="lista">
          {l.map((s) => (
            <li key={s.id} className={`solicitud-beta${s.estado !== 'nueva' ? ' resuelta' : ''}`}>
              <span className="que">
                <strong>{s.nombre}</strong>
                <button className="enlace chico" onClick={() => copiar(s.email)}>{s.email}</button>
                {s.motivo ? <span className="chico">{s.motivo}</span> : null}
                <span className="suave chico">{new Date(s.creado).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</span>
              </span>
              <span className="chips">
                {ESTADOS.map((e) => (
                  <button key={e.clave} className={`chip${s.estado === e.clave ? ' activa' : ''}`} onClick={() => void cambiar(s, e.clave)}>{t(e.nombre)}</button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="suave">{t('Todavía no llegó ningún pedido.')}</p>
      )}
    </div>
  );
}
