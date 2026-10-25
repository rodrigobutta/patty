// Tu cuenta (en Más): tu foto y cómo querés que te diga Patty, y vincular Google al usuario con el que entraste (para
// entrar después con Google; de paso trae la foto).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { entrarConGoogleNativo, googleNativo, montarGoogle } from '../lib/google';
import { t } from '../lib/idioma';
import { apodoDe } from 'shared';
import { Avatar } from '../ui/Avatar';

export function Cuenta() {
  const { sesion, usuario, avisar, cambiarUsuario } = useEstado();
  const [apodo, setApodo] = useState(usuario?.apodo_elegido ?? '');
  const [email, setEmail] = useState(usuario?.email ?? null);
  const [error, setError] = useState('');
  const boton = useRef<HTMLDivElement>(null);

  const vincular = async (credential: string) => {
    setError('');
    try {
      const r = await api<{ email: string; foto: string | null }>('POST', '/api/usuarios/yo/google', { credential });
      setEmail(r.email);
      if (r.foto) cambiarUsuario({ foto: r.foto });
      avisar(t('Google vinculado'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (email || !sesion?.google || googleNativo()) return;
    void montarGoogle(boton.current, sesion.google, (c) => void vincular(c));
  }, [email, sesion?.google]);

  const guardarApodo = async () => {
    const nuevo = apodo.trim();
    if (nuevo === (usuario?.apodo_elegido ?? '')) return;
    try {
      await api('PUT', '/api/usuarios/yo/preferencias', { apodo: nuevo || null });
      cambiarUsuario({ apodo_elegido: nuevo || null, apodo: apodoDe(usuario?.nombre ?? '', nuevo) });
      avisar(t('¡Listo, {apodo}!', { apodo: apodoDe(usuario?.nombre ?? '', nuevo) }));
    } catch (e) {
      avisar((e as Error).message);
    }
  };

  return (
    <>
    {usuario ? (
      <div className="tarjeta cuenta-perfil">
        <Avatar foto={usuario.foto} nombre={usuario.apodo || usuario.nombre} tamano={56} />
        <div className="que">
          <strong>{usuario.nombre}</strong>
          {usuario.email ? <span className="suave chico renglon-sub">{usuario.email}</span> : null}
          <label className="chico apodo">
            {t('¿Cómo querés que te diga?')}
            <input
              value={apodo}
              placeholder={apodoDe(usuario.nombre)}
              maxLength={30}
              onChange={(e) => setApodo(e.target.value)}
              onBlur={() => void guardarApodo()}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
        </div>
      </div>
    ) : null}
    {!sesion?.google ? null : (
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
    )}
    </>
  );
}
