// La entrada: el búho saluda, una frase de qué es Patty, y entrar con usuario y clave o con Google.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { entrarConGoogleNativo, googleNativo, montarGoogle } from '../lib/google';
import { Mascota } from '../mascota/Mascota';

/** Lo que flota de fondo: cosas que se anotan (emoji, % desde la izquierda, % desde arriba). */
const FLOTANTES: Array<[string, number, number]> = [['☕', 8, 14], ['😴', 82, 10], ['🍅', 88, 46], ['🤕', 6, 52], ['🚶', 14, 86], ['🌤️', 80, 84]];

export function Entrar({ configurar }: { configurar: boolean }) {
  const { sesion, entro } = useEstado();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const google = useRef<HTMLDivElement>(null);

  const conGoogle = async (credential: string) => {
    try {
      const r = await api<{ token: string }>('POST', '/api/entrar-google', { credential });
      await entro(r.token);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!sesion?.google || googleNativo()) return;
    void montarGoogle(google.current, sesion.google, (c) => void conGoogle(c));
  }, [sesion?.google]);

  const googleEnElTelefono = async () => {
    if (!sesion?.google) return;
    setError('');
    try {
      await conGoogle(await entrarConGoogleNativo(sesion.google));
    } catch (e) {
      const m = (e as Error).message;
      if (!/cancel/i.test(m)) setError(m);
    }
  };

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
      <div className="fondo-entrar" aria-hidden>
        <span className="burbuja b1" />
        <span className="burbuja b2" />
        <span className="burbuja b3" />
        {FLOTANTES.map(([e, x, y], i) => <span key={e} className="flota" style={{ left: `${x}%`, top: `${y}%`, ['--i' as string]: i }}>{e}</span>)}
      </div>
      <div className="saludo">
        <div className="globo">{configurar ? '¡Hola! Empecemos 👋' : '¡Hola de nuevo! 👋'}</div>
        <Mascota cara="feliz" tamano={132} className="saluda" />
      </div>
      <h1 className="marca grande">Patty</h1>
      <p className="lema">Contame tu día y te muestro qué cosas se relacionan.</p>
      <form className="tarjeta" onSubmit={enviar}>
        <h2>{configurar ? 'Crear el primer usuario' : 'Entrar'}</h2>
        {configurar ? (
          <label>Tu nombre<input name="nombre" required autoComplete="name" autoFocus /></label>
        ) : null}
        <label>Usuario<input name="usuario" required autoCapitalize="none" autoComplete="username" /></label>
        <label>Clave<input name="clave" type="password" required minLength={6} autoComplete={configurar ? 'new-password' : 'current-password'} /></label>
        <button className="btn primario ancho" disabled={enviando}>{enviando ? 'Entrando…' : configurar ? 'Crear y entrar' : 'Entrar'}</button>
        {error ? <p className="neg">{error}</p> : null}
        {sesion?.google ? (
          <>
            <div className="sep-o"><span>o</span></div>
            {googleNativo() ? (
              <button type="button" className="btn ancho boton-google" onClick={() => void googleEnElTelefono()}>
                <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                  <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
                </svg>
                Continuar con Google
              </button>
            ) : (
              <div ref={google} className="google" />
            )}
          </>
        ) : null}
      </form>
    </div>
  );
}
