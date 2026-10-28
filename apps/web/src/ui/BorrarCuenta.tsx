// En Más → Tu cuenta, al final: borrar la cuenta para siempre (con sus personas y todo lo anotado). Se confirma
// escribiendo el nombre de usuario.
import { useState } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';

export function BorrarCuenta() {
  const { usuario, salir, avisar } = useEstado();
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState('');
  const [borrando, setBorrando] = useState(false);
  if (!usuario) return null;
  const borrar = async () => {
    setBorrando(true);
    try {
      await api('DELETE', '/api/cuenta', { usuario: escrito.trim() });
      await salir();
    } catch (e) {
      avisar((e as Error).message);
      setBorrando(false);
    }
  };
  return (
    <div className="tarjeta borrar-cuenta">
      <h3>{t('🗑️ Borrar mi cuenta')}</h3>
      {!abierto ? (
        <>
          <p className="suave chico">{t('Borra tu cuenta y todo lo que anotaste, para siempre. Si acompañás a alguien de tu familia, sus datos quedan con esa persona.')}</p>
          <button className="btn peligro" onClick={() => setAbierto(true)}>{t('Borrar mi cuenta…')}</button>
        </>
      ) : (
        <>
          <p className="chico"><strong>{t('Esto no se puede deshacer.')}</strong> {t('Se borran tu cuenta, tus personas y todo lo anotado.')}</p>
          <label>
            {t('Para confirmar, escribí tu usuario: {u}', { u: usuario.usuario })}
            <input value={escrito} onChange={(e) => setEscrito(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          </label>
          <div className="fila">
            <button className="btn peligro" disabled={borrando || escrito.trim().toLowerCase() !== usuario.usuario.toLowerCase()} onClick={() => void borrar()}>
              {borrando ? t('Borrando…') : t('Borrar para siempre')}
            </button>
            <button className="btn" onClick={() => { setAbierto(false); setEscrito(''); }}>{t('Cancelar')}</button>
          </div>
        </>
      )}
    </div>
  );
}
