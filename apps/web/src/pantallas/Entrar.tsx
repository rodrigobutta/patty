import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { montarGoogle } from '../lib/google';

export function Entrar({ configurar }: { configurar: boolean }) {
  const { sesion, entro } = useEstado();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const google = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sesion?.google) return;
    void montarGoogle(google.current, sesion.google, async (credential) => {
      try {
        const r = await api<{ token: string }>('POST', '/api/entrar-google', { credential });
        await entro(r.token);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }, [sesion?.google, entro]);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError('');
    try {
      const datos = Object.fromEntries(new FormData(e.currentTarget).entries());
      const r = await api<{ token: string }>('POST', configurar ? '/api/configurar' : '/api/entrar', datos);
      await entro(r.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="entrar">
      <h1 className="marca grande">Patty</h1>
      <p className="suave">Anotá tu día. Patty busca qué cosas se relacionan.</p>
      <form className="tarjeta" onSubmit={enviar}>
        <h2>{configurar ? 'Crear el primer usuario' : 'Entrar'}</h2>
        {configurar ? (
          <label>Tu nombre<input name="nombre" required autoComplete="name" autoFocus /></label>
        ) : null}
        <label>Usuario<input name="usuario" required autoCapitalize="none" autoComplete="username" autoFocus={!configurar} /></label>
        <label>Clave<input name="clave" type="password" required minLength={6} autoComplete={configurar ? 'new-password' : 'current-password'} /></label>
        <button className="btn primario ancho" disabled={enviando}>{configurar ? 'Crear y entrar' : 'Entrar'}</button>
        {error ? <p className="neg">{error}</p> : null}
        {sesion?.google ? <><div className="sep-o"><span>o</span></div><div ref={google} className="google" /></> : null}
      </form>
    </div>
  );
}
