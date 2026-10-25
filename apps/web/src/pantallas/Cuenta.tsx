// Tu cuenta (en Más): vincular Google al usuario con el que entraste, para poder entrar después con Google.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { entrarConGoogleNativo, googleNativo, montarGoogle } from '../lib/google';
import { t } from '../lib/idioma';

export function Cuenta() {
  const { sesion, usuario, avisar } = useEstado();
  const [email, setEmail] = useState(usuario?.email ?? null);
  const [error, setError] = useState('');
  const boton = useRef<HTMLDivElement>(null);

  const vincular = async (credential: string) => {
    setError('');
    try {
      const r = await api<{ email: string }>('POST', '/api/usuarios/yo/google', { credential });
      setEmail(r.email);
      avisar(t('Google vinculado'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (email || !sesion?.google || googleNativo()) return;
    void montarGoogle(boton.current, sesion.google, (c) => void vincular(c));
  }, [email, sesion?.google]);

  if (!sesion?.google) return null;
  return (
    <div className="tarjeta">
      <h3>🔑 Google</h3>
      {email ? (
        <p className="chico">✅ {t('Podés entrar con Google como')} <strong>{email}</strong>.</p>
      ) : (
        <>
          <p className="suave chico">{t('Vinculá tu cuenta de Google para entrar con un toque, sin usuario y clave.')}</p>
          {googleNativo() ? (
            <button
              className="btn ancho"
              onClick={() =>
                void entrarConGoogleNativo(sesion.google!)
                  .then(vincular)
                  .catch((e: Error) => !/cancel/i.test(e.message) && setError(e.message))
              }
            >
              {t('Vincular con Google')}
            </button>
          ) : (
            <div ref={boton} className="google" />
          )}
        </>
      )}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}
